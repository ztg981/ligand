/* ============================================================
   Ligand data model
   ------------------------------------------------------------
   Pure data shapes + helpers. No React, no localStorage here —
   just factories and small functions the store hook builds on.

   Design notes that matter for ADHD-friendliness:
   - Habits are FORGIVING. We only ever record the days you DID
     check in. We never write a "miss", so a gap is just absence
     of data — never a failure, never shaming.
   - Streaks PAUSE instead of shattering: not opening the app today
     does not zero your streak.
   - The "What I'm proud of" count-up simply counts elapsed days
     since a start date, so nothing can reset it.
   ============================================================ */

// Simple unique id — fine for local-only, single-user data.
export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ---- constants -------------------------------------------------
export const GOAL_TYPES = { BUILT_IN: "built-in", CUSTOM: "custom", RECOVERY: "recovery", FITNESS: "fitness" };
export const GOAL_STATUS = { ACTIVE: "active", DONE: "done", ARCHIVED: "archived" };
export const TASK_LABELS = ["Today", "Urgent", "General"]; // per-goal names added at runtime
export const TASK_TERMS = { SHORT: "short", LONG: "long" };

// ---- fitness constants -----------------------------------------
export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];
// Primary training focus. "loseweight" biases toward higher reps + cardio in
// the generator; the others map to conventional rep ranges.
export const FITNESS_GOAL_TYPES = ["strength", "hypertrophy", "endurance", "loseweight", "general"];
export const WEIGHT_UNITS = ["lbs", "kg"];
// Sets per exercise suggested by experience level (used by the generator).
export const SETS_BY_LEVEL = { beginner: 3, intermediate: 4, advanced: 5 };

// ---- date helpers ----------------------------------------------
// Dates are stored as local "YYYY-MM-DD" strings to avoid timezone drift.
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function daysBetween(aKey, bKey) {
  const a = new Date(aKey + "T00:00:00");
  const b = new Date(bKey + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
export function shiftDay(dayKey, delta) {
  const d = new Date(dayKey + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return todayKey(d);
}

export function goalTargetDate(goal) {
  return goal?.smartFields?.timeBound || goal?.deadline || null;
}

export function isGoalOverdue(goal, refKey = todayKey()) {
  const target = goalTargetDate(goal);
  if (!target || goal?.status === GOAL_STATUS.ARCHIVED) return false;
  if (goal.overdueSnoozedUntil && goal.overdueSnoozedUntil >= refKey) return false;
  return target < refKey;
}

// ---- factories -------------------------------------------------
export function createGoal({
  name,
  type = GOAL_TYPES.CUSTOM,
  color,
  smartFields = {},
  deadline = null,
  recoveryData = null,
} = {}) {
  return {
    id: uid("goal"),
    name: name || "New goal",
    type,
    color: color || "oklch(0.62 0.10 245)",
    // Free-form SMART fields (specific / measurable / achievable / relevant / timebound)
    smartFields,
    habits: [],
    reflections: [],
    deadline,
    // Recovery goals store their private data here:
    // { startDate, label, why, milestonesReached: [days...] }
    recoveryData,
    status: GOAL_STATUS.ACTIVE,
    createdAt: todayKey(),
  };
}

export function createTask({
  text,
  label = "General",
  goalId = null,
  term = TASK_TERMS.SHORT,
  repeat = null, // null | { type: "daily" } | { type: "weekly", weekday: 0-6 }
} = {}) {
  return {
    id: uid("task"),
    text: text || "",
    label,
    goalId,
    term,
    repeat,
    done: false,
    completedOn: null, // YYYY-MM-DD a recurring task was last completed
    createdAt: todayKey(),
  };
}

// ---- recurring tasks -------------------------------------------
// A recurring task never disappears: when its next occurrence arrives it
// quietly flips back to not-done. The "anchor" is the start of the current
// occurrence (today for daily; the most recent matching weekday for weekly).
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function recurringAnchor(repeat, refKey = todayKey()) {
  if (!repeat || repeat.type === "daily") return refKey;
  if (repeat.type === "weekly") {
    const dow = new Date(refKey + "T00:00:00").getDay();
    const back = (dow - repeat.weekday + 7) % 7;
    return shiftDay(refKey, -back);
  }
  return refKey;
}

// True when a completed recurring task has rolled into a new occurrence and
// should reset to not-done.
export function recurringResetDue(task, refKey = todayKey()) {
  if (!task?.repeat || !task.done || !task.completedOn) return false;
  return task.completedOn < recurringAnchor(task.repeat, refKey);
}

export function repeatLabel(repeat) {
  if (!repeat) return null;
  if (repeat.type === "daily") return "Repeats daily";
  if (repeat.type === "weekly") return `Repeats every ${WEEKDAY_SHORT[repeat.weekday]}`;
  return null;
}

// Forgiving habit: checkIns holds only completed days. Never a "miss".
export function createHabit({ name, cadence = "daily" } = {}) {
  return {
    id: uid("habit"),
    name: name || "New habit",
    cadence, // "daily" | "weekly"
    checkIns: [], // array of "YYYY-MM-DD" strings
    createdAt: todayKey(),
  };
}

export function createReflection({ text, prompt = null, mood = null, location = null } = {}) {
  return {
    id: uid("refl"),
    text: text || "",
    prompt,
    mood,
    // Optional resolved place name (e.g. "New York, New York"). Never coords.
    location,
    createdAt: new Date().toISOString(),
  };
}

// "What I'm proud of" — counts UP from a start date, forgiving by design.
export function createCountUp({ label, startDate = todayKey() } = {}) {
  return { id: uid("count"), label: label || "Day counter", startDate };
}

// Notes — a frictionless plain-text scratchpad. No structure, no prompts;
// the first line acts as the title. createdAt/updatedAt are full ISO
// timestamps so we can sort newest-first and show a relative time.
export function createNote({ text = "" } = {}) {
  const now = new Date().toISOString();
  return { id: uid("note"), text, createdAt: now, updatedAt: now };
}

// ---- fitness / workout factories -------------------------------
// The user's training profile, set during the fitness-goal onboarding. One
// per app (there's a single lifter). null until onboarding completes.
export function createFitnessProfile({
  experienceLevel = "beginner",
  availableEquipment = ["bodyweight"],
  goalType = "general", // strength | hypertrophy | endurance | general
  workoutDaysPerWeek = 3,
  weightUnit = "lbs",
} = {}) {
  return {
    experienceLevel,
    availableEquipment,
    goalType,
    workoutDaysPerWeek,
    weightUnit,
    // Optional user-entered body stats over time: { date, weight, bodyFat? }.
    bodyStats: [],
    // Default rest between sets (seconds); cardio gets a shorter default.
    restStrengthSec: 90,
    restCardioSec: 30,
    createdAt: todayKey(),
  };
}

// A single logged set within an exercise. Strength sets carry reps + weight;
// cardio sets carry a duration. `done` flips true when ticked mid-workout.
export function createSet({ reps = null, weight = null, durationSec = null, done = false } = {}) {
  return { id: uid("set"), reps, weight, durationSec, done };
}

// One exercise inside a workout session: a snapshot of the library entry
// (so renames/removals from the library never orphan history) plus its sets.
export function createWorkoutExercise({
  exerciseId,
  name,
  muscleGroup = "other",
  type = "strength",
  sets = [],
} = {}) {
  return {
    id: uid("wex"),
    exerciseId: exerciseId || null,
    name: name || "Exercise",
    muscleGroup,
    type,
    sets: sets.length ? sets : [createSet()],
  };
}

// A logged (or in-progress) workout session.
export function createWorkout({
  date = todayKey(),
  type = "strength", // strength | cardio | mixed
  exercises = [],
  durationSec = 0,
  notes = "",
  goalId = null,
  templateId = null,
} = {}) {
  return {
    id: uid("workout"),
    date,
    type,
    exercises,
    durationSec,
    notes,
    goalId,
    templateId,
    createdAt: new Date().toISOString(),
  };
}

// A saved routine the user can start from. Its exercises are *plans*
// (target sets/reps/weight), not logged sets.
export function createWorkoutTemplate({
  name = "My routine",
  type = "strength",
  exercises = [],
  goalId = null,
} = {}) {
  return {
    id: uid("tmpl"),
    name,
    type,
    // Each: { exerciseId, name, muscleGroup, type, targetSets, targetReps, targetWeight? }
    exercises,
    goalId,
    createdAt: todayKey(),
  };
}

// ---- workout helpers -------------------------------------------
// Total volume (weight × reps summed over completed strength sets) for a
// session. Cardio sets contribute no volume. Used for the session summary,
// the "Volume King" badge, and per-exercise progress.
export function workoutVolume(workout) {
  if (!workout?.exercises) return 0;
  let total = 0;
  workout.exercises.forEach((ex) => {
    (ex.sets || []).forEach((s) => {
      if (s.done && s.weight && s.reps) total += s.weight * s.reps;
    });
  });
  return total;
}

// Count of completed sets across a session.
export function completedSetCount(workout) {
  if (!workout?.exercises) return 0;
  return workout.exercises.reduce(
    (n, ex) => n + (ex.sets || []).filter((s) => s.done).length,
    0
  );
}

// Best (heaviest) completed set weight for an exercise id across a history of
// workouts. Returns { weight, reps } or null. Basis for personal records.
export function exercisePR(workouts, exerciseId) {
  let best = null;
  (workouts || []).forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach((s) => {
        if (s.done && s.weight != null) {
          if (!best || s.weight > best.weight) best = { weight: s.weight, reps: s.reps };
        }
      });
    });
  });
  return best;
}

// How many distinct calendar weeks (Mon-anchored ISO-ish) had >=1 workout,
// counting consecutively backward from the current week — a workout streak
// in weeks. Used for the "Streak Builder" badge and the fitness tab.
export function weeklyWorkoutStreak(workouts, refKey = todayKey()) {
  if (!workouts?.length) return 0;
  const weekStart = (key) => {
    const d = new Date(key + "T00:00:00");
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    return todayKey(d);
  };
  const weeksWithWorkout = new Set(workouts.map((w) => weekStart(w.date)));
  let streak = 0;
  let cursor = weekStart(refKey);
  while (weeksWithWorkout.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -7);
  }
  return streak;
}

// Workouts falling in the current rolling 7-day window (incl. today).
export function workoutsThisWeek(workouts, refKey = todayKey()) {
  const cutoff = shiftDay(refKey, -6);
  return (workouts || []).filter((w) => w.date >= cutoff && w.date <= refKey);
}

// ---- habit helpers (forgiving) ---------------------------------
export function isCheckedOn(habit, dayKey = todayKey()) {
  return habit?.checkIns?.includes(dayKey) ?? false;
}

// Toggle a day's check-in on/off. Removing a check-in is allowed
// (a correction), but we never auto-write a missed day.
export function toggleCheckIn(habit, dayKey = todayKey()) {
  const has = isCheckedOn(habit, dayKey);
  const checkIns = has
    ? habit.checkIns.filter((d) => d !== dayKey)
    : [...habit.checkIns, dayKey].sort();
  return { ...habit, checkIns };
}

// Streak that PAUSES rather than shatters. We count consecutive recorded
// days ending today; if today isn't checked yet we look back from
// yesterday, so an un-opened "today" never zeroes the streak.
export function currentStreak(habit, refKey = todayKey()) {
  if (!habit?.checkIns?.length) return 0;
  const set = new Set(habit.checkIns);
  let streak = 0;
  let cursor = set.has(refKey) ? refKey : shiftDay(refKey, -1);
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

// ---- count-up helper -------------------------------------------
export function daysSince(startDate, refKey = todayKey()) {
  return Math.max(0, daysBetween(startDate, refKey));
}

// ---- entry timestamp formatting --------------------------------
// Full, legible date + time for journal/reflection entries, e.g.
// "Jun 14, 2026 · 9:42 AM". Falls back gracefully on bad input.
export function formatEntryDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

// ---- seed ------------------------------------------------------
// First-run data: the built-in Productivity goal plus two starter goals.
// Stable ids keep the nav goal-pills consistent across reloads.
// Exposed so the sync layer can tell pristine sample goals apart from
// goals the user actually created (see hasMeaningfulLocalData).
export const SEED_GOAL_IDS = ["productivity", "side-hustles", "college"];
export function seedData() {
  const productivity = {
    ...createGoal({
      name: "Productivity",
      type: GOAL_TYPES.BUILT_IN,
      color: "oklch(0.62 0.10 245)",
    }),
    id: "productivity",
  };
  const side = {
    ...createGoal({ name: "Side Hustles", color: "oklch(0.7 0.12 165)" }),
    id: "side-hustles",
  };
  const college = {
    ...createGoal({ name: "College Planning", color: "oklch(0.62 0.10 290)" }),
    id: "college",
  };
  return {
    version: 1,
    goals: [productivity, side, college],
    tasks: [],
    // No seeded count-up: "Days showing up" is now a real distinct-active-days
    // metric (ligand.activeDays), not an elapsed-days count-up. Users can still
    // add their own count-ups ("No gaming", etc.) from the goal-tab widget.
    countUps: [],
    journal: [], // app-wide reflections (per-goal reflections live on each goal)
    notes: [], // frictionless plain-text scratchpad (see Notes tab)
    // Fitness / workout system. All start empty; a fitnessProfile is created
    // when the user makes their first Fitness goal and finishes onboarding.
    workouts: [], // logged sessions
    workoutTemplates: [], // saved routines
    fitnessProfile: null,
  };
}
