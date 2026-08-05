/* ============================================================
   Workout scope — one source of truth, viewed two ways
   ------------------------------------------------------------
   The Workout tab is the workspace; a fitness goal is a filtered view of the
   SAME sessions, not a second copy of them. Both used to derive weekly counts,
   streaks, volume and personal records from their own inline code, which is
   how the two screens drifted apart.

   Everything here reads store.workouts / store.scheduledWorkouts and narrows
   them by scope. Nothing writes, and nothing invents a link: a session belongs
   to a goal only when its own goalId says so. A session logged before goals
   existed stays UNASSIGNED and is shown as such, because guessing which goal
   an old session belonged to would be putting words in the user's mouth.
   ============================================================ */

import {
  todayKey,
  weeklyWorkoutStreak,
  workoutVolume,
  workoutsThisWeek,
} from "./model.js";

// Scope sentinels. Real scopes are goal ids, so these are deliberately shaped
// so they cannot collide with one (goal ids are `goal_...`).
export const WORKOUT_SCOPE_ALL = "all";
export const WORKOUT_SCOPE_UNASSIGNED = "unassigned";

/** The goals that can own workouts: active fitness goals, in display order. */
export function fitnessGoals(goals = []) {
  return goals.filter(
    (goal) =>
      goal &&
      goal.type === "fitness" &&
      (goal.status || "active") !== "archived"
  );
}

/**
 * The options for the Workout tab's goal selector.
 *
 * "All workouts" is always offered so the global view stays reachable.
 * "Unassigned" only appears when there is actually something in it — an empty
 * bucket in a dropdown is just noise.
 */
export function workoutScopeOptions(goals = [], workouts = []) {
  const options = [{ id: WORKOUT_SCOPE_ALL, label: "All workouts", type: "all" }];
  for (const goal of fitnessGoals(goals)) {
    options.push({ id: goal.id, label: goal.name, type: "goal", color: goal.color });
  }
  if (workouts.some((workout) => !workout?.goalId)) {
    options.push({
      id: WORKOUT_SCOPE_UNASSIGNED,
      label: "Unassigned workouts",
      type: "unassigned",
    });
  }
  return options;
}

/**
 * Resolve a remembered scope against the goals that exist right now.
 *
 * A scope pointing at a goal that has since been archived or deleted falls
 * back to "all" rather than showing an empty screen with no explanation.
 */
export function resolveWorkoutScope(scope, goals = [], workouts = []) {
  if (!scope) return WORKOUT_SCOPE_ALL;
  const options = workoutScopeOptions(goals, workouts);
  return options.some((option) => option.id === scope) ? scope : WORKOUT_SCOPE_ALL;
}

/** Does this record belong to the given scope? */
export function inWorkoutScope(record, scope) {
  if (scope === WORKOUT_SCOPE_ALL || !scope) return true;
  if (scope === WORKOUT_SCOPE_UNASSIGNED) return !record?.goalId;
  return record?.goalId === scope;
}

export function scopeWorkouts(workouts = [], scope = WORKOUT_SCOPE_ALL) {
  if (scope === WORKOUT_SCOPE_ALL || !scope) return workouts;
  return workouts.filter((workout) => inWorkoutScope(workout, scope));
}

export function scopeScheduledWorkouts(scheduled = [], scope = WORKOUT_SCOPE_ALL) {
  if (scope === WORKOUT_SCOPE_ALL || !scope) return scheduled;
  return scheduled.filter((entry) => inWorkoutScope(entry, scope));
}

/** The goal id a newly created/logged/imported workout should default to. */
export function defaultGoalIdForScope(scope) {
  return scope === WORKOUT_SCOPE_ALL || scope === WORKOUT_SCOPE_UNASSIGNED || !scope
    ? null
    : scope;
}

/**
 * Heaviest completed working set per exercise, most recent first.
 *
 * Warm-up sets are excluded for the same reason workoutVolume excludes them:
 * a ramp is not a record.
 */
export function personalRecords(workouts = [], limit = 3) {
  const best = new Map();
  for (const workout of workouts) {
    for (const exercise of workout?.exercises || []) {
      if (exercise.type === "cardio" || !exercise.exerciseId) continue;
      for (const set of exercise.sets || []) {
        if (!set.done || set.warmup || set.weight == null) continue;
        const current = best.get(exercise.exerciseId);
        if (!current || set.weight > current.weight) {
          best.set(exercise.exerciseId, {
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            weight: set.weight,
            reps: set.reps,
            date: workout.date,
          });
        }
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
}

/**
 * Everything both screens display about a scope, computed once.
 *
 * `target` is the weekly session target: a fitness goal may carry its own
 * (goal.fitness.weeklyTarget), otherwise the shared profile's, and null when
 * neither is set — so the caller can offer "Set weekly target" instead of
 * rendering a hollow 0/3.
 */
export function workoutScopeSummary({
  workouts = [],
  scheduledWorkouts = [],
  goals = [],
  profile = null,
  scope = WORKOUT_SCOPE_ALL,
  refKey = todayKey(),
  recentLimit = 5,
} = {}) {
  const scoped = scopeWorkouts(workouts, scope);
  const scopedScheduled = scopeScheduledWorkouts(scheduledWorkouts, scope);
  const thisWeek = workoutsThisWeek(scoped, refKey);
  const goal = goals.find((candidate) => candidate.id === scope) || null;
  const goalTarget = goal?.fitness?.weeklyTarget;
  const profileTarget = profile?.workoutDaysPerWeek;
  const target = Number.isFinite(goalTarget)
    ? goalTarget
    : Number.isFinite(profileTarget)
      ? profileTarget
      : null;

  return {
    scope,
    goal,
    workouts: scoped,
    scheduled: scopedScheduled,
    weekCount: thisWeek.length,
    weekVolume: thisWeek.reduce((sum, workout) => sum + workoutVolume(workout), 0),
    streak: weeklyWorkoutStreak(scoped, refKey),
    target,
    recent: scoped.slice(0, recentLimit),
    upcoming: scopedScheduled
      .filter((entry) => entry.status === "planned" && entry.date >= refKey)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    personalRecords: personalRecords(scoped),
    // Drives the honest empty states: an unlinked backlog is offered to the
    // user to link, never linked for them.
    unassignedCount: workouts.filter((workout) => !workout?.goalId).length,
  };
}
