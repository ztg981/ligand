/* ============================================================
   Intelligent workout generation
   ------------------------------------------------------------
   Pure functions (no React) that build a session plan from the
   user's fitness profile + their logged history:
     - equipment/level/goal from the profile
     - muscle recovery: avoid groups trained in the last ~2 days
     - progressive overload: nudge weight/reps past last session
     - volume by experience level (beginner 3 sets → advanced 5)
   Returns an array of exercise *plans* (same shape templates use):
     { exerciseId, name, muscleGroup, type, targetSets, targetReps,
       targetWeight? }
   ============================================================ */

import { EXERCISES, MUSCLE_GROUPS, availableTags, exerciseAvailable } from "./exercises.js";
import { SETS_BY_LEVEL, todayKey, daysBetween } from "./model.js";

// Target rep count per primary goal.
const REPS_BY_GOAL = {
  strength: 5,
  hypertrophy: 10,
  endurance: 16,
  loseweight: 12,
  general: 10,
};

const STRENGTH_GROUPS = MUSCLE_GROUPS.filter((g) => g !== "cardio");

// How many days ago was this muscle group last trained (a completed set)?
// 999 if never.
function daysSinceGroupTrained(workouts, group, today) {
  let best = null;
  (workouts || []).forEach((w) => {
    const trained = (w.exercises || []).some(
      (e) => e.muscleGroup === group && (e.sets || []).some((s) => s.done)
    );
    if (trained) {
      const d = daysBetween(w.date, today);
      if (best == null || d < best) best = d;
    }
  });
  return best == null ? 999 : best;
}

// The most recent completed top set for an exercise (for progressive overload).
// Returns { weight, reps } or null.
function lastPerformance(workouts, exerciseId) {
  // workouts are newest-first, but don't assume — sort by date desc.
  const sorted = [...(workouts || [])].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      if (ex.exerciseId !== exerciseId) continue;
      let best = null;
      (ex.sets || []).forEach((s) => {
        if (s.done && s.weight != null && (!best || s.weight > best.weight)) {
          best = { weight: s.weight, reps: s.reps };
        }
      });
      if (best) return best;
    }
  }
  return null;
}

// Other exercises for the same muscle group the user can perform (for swaps).
export function alternativesFor(exercise, profile, excludeIds = []) {
  const tags = availableTags(profile?.availableEquipment || []);
  return EXERCISES.filter(
    (e) =>
      e.muscleGroup === exercise.muscleGroup &&
      e.id !== exercise.exerciseId &&
      !excludeIds.includes(e.id) &&
      exerciseAvailable(e, tags)
  );
}

// Build one exercise plan from a library entry, applying overload + volume.
function planFor(libEx, { workouts, sets, reps, unit }) {
  const plan = {
    exerciseId: libEx.id,
    name: libEx.name,
    muscleGroup: libEx.muscleGroup,
    type: libEx.type,
    targetSets: sets,
    targetReps: libEx.type === "cardio" ? null : reps,
  };
  if (libEx.type === "cardio") {
    plan.targetMinutes = 15;
    return plan;
  }
  const last = lastPerformance(workouts, libEx.id);
  if (last && last.weight) {
    // Progressive overload: nudge the weight up a small increment; if they
    // already beat the target rep count last time, bump weight, else keep it.
    const incr = unit === "kg" ? 2.5 : 5;
    plan.targetWeight = Math.round((last.weight + incr) * 2) / 2;
  } else {
    plan.targetWeight = null; // no history — the user fills it in
  }
  return plan;
}

export function generateWorkout({ profile, workouts = [], today = todayKey() } = {}) {
  const level = profile?.experienceLevel || "beginner";
  const goalType = profile?.goalType || "general";
  const unit = profile?.weightUnit || "lbs";
  const sets = SETS_BY_LEVEL[level] || 3;
  const reps = REPS_BY_GOAL[goalType] || 10;

  const tags = availableTags(profile?.availableEquipment || []);

  // How many exercises to include, scaled by experience.
  const exCount = level === "beginner" ? 4 : level === "advanced" ? 6 : 5;

  // Order muscle groups by "most due" (days since trained), so recovery is
  // respected: groups hit in the last 2 days sink to the bottom of the pool.
  const due = {};
  STRENGTH_GROUPS.forEach((g) => (due[g] = daysSinceGroupTrained(workouts, g, today)));
  const fresh = STRENGTH_GROUPS.filter((g) => due[g] >= 2).sort((a, b) => due[b] - due[a]);
  const recentlyHit = STRENGTH_GROUPS.filter((g) => due[g] < 2).sort((a, b) => due[b] - due[a]);
  const groupPool = [...fresh, ...recentlyHit];

  // Pool of available exercises per group (shuffled a little for variety).
  const byGroup = {};
  STRENGTH_GROUPS.forEach((g) => {
    byGroup[g] = EXERCISES.filter(
      (e) => e.muscleGroup === g && exerciseAvailable(e, tags)
    );
    // Light shuffle so repeated generations vary.
    byGroup[g] = byGroup[g].sort(() => Math.random() - 0.5);
  });

  const chosen = [];
  const usedIds = new Set();
  let slot = 0;
  // Cycle through the group pool, taking one unused exercise per visit, until
  // we hit the target count or run dry.
  let guard = 0;
  while (chosen.length < exCount && guard < exCount * 6) {
    guard += 1;
    const group = groupPool[slot % groupPool.length];
    slot += 1;
    const pool = byGroup[group] || [];
    const pick = pool.find((e) => !usedIds.has(e.id));
    if (pick) {
      usedIds.add(pick.id);
      chosen.push(planFor(pick, { workouts, sets, reps, unit }));
    }
  }

  // Endurance / weight-loss goals get a cardio finisher if equipment allows.
  if ((goalType === "endurance" || goalType === "loseweight")) {
    const cardio = EXERCISES.filter(
      (e) => e.muscleGroup === "cardio" && exerciseAvailable(e, tags)
    );
    if (cardio.length) {
      const pick = cardio[Math.floor(Math.random() * cardio.length)];
      chosen.push(planFor(pick, { workouts, sets, reps, unit }));
    }
  }

  return chosen;
}
