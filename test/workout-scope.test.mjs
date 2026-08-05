/* Fitness goals and the Workout tab read ONE set of sessions.

   The rules these protect: a session belongs to a goal only when its own
   goalId says so, sessions logged before goals could own them stay
   unassigned rather than being swept into whichever goal is on screen, and
   the recovery tracker is never offered as a workout goal. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKOUT_SCOPE_ALL,
  WORKOUT_SCOPE_UNASSIGNED,
  defaultGoalIdForScope,
  fitnessGoals,
  personalRecords,
  resolveWorkoutScope,
  scopeScheduledWorkouts,
  scopeWorkouts,
  workoutScopeOptions,
  workoutScopeSummary,
} from "../src/lib/workoutScope.js";
import { createScheduledWorkout, createWorkout } from "../src/lib/model.js";

const GOALS = [
  { id: "bulk", name: "Bulk up", type: "fitness", status: "active", color: "#abc" },
  { id: "cardio", name: "Run a 10k", type: "fitness", status: "active" },
  { id: "shelved", name: "Old cut", type: "fitness", status: "archived" },
  { id: "recovery", name: "Recovery tracker", type: "recovery", status: "active" },
  { id: "research", name: "Research", type: "custom", status: "active" },
];

function session(date, goalId, sets = []) {
  return {
    id: `w_${date}_${goalId || "none"}`,
    date,
    goalId,
    exercises: [{ exerciseId: "squat", name: "Squat", type: "strength", sets }],
  };
}

const WORKOUTS = [
  session("2026-08-05", "bulk", [{ done: true, weight: 225, reps: 5 }]),
  session("2026-08-04", "cardio", [{ done: true, weight: 95, reps: 5 }]),
  // Logged long before fitness goals existed. Must stay unassigned.
  session("2026-08-03", null, [{ done: true, weight: 135, reps: 5 }]),
];

// ---- which goals can own workouts -------------------------------------

test("only active fitness goals can own workouts", () => {
  assert.deepEqual(
    fitnessGoals(GOALS).map((goal) => goal.id),
    ["bulk", "cardio"]
  );
});

test("the recovery tracker is never offered in the workout selector", () => {
  const labels = workoutScopeOptions(GOALS, WORKOUTS).map((option) => option.label);
  assert.equal(labels.includes("Recovery tracker"), false);
  assert.equal(labels.includes("Old cut"), false, "archived fitness goals are gone too");
  assert.equal(labels.includes("Research"), false, "non-fitness goals are not workout goals");
});

test("the selector always offers the global view, and unassigned only when it has something in it", () => {
  const withUnassigned = workoutScopeOptions(GOALS, WORKOUTS).map((option) => option.id);
  assert.deepEqual(withUnassigned, [WORKOUT_SCOPE_ALL, "bulk", "cardio", WORKOUT_SCOPE_UNASSIGNED]);

  const allTagged = workoutScopeOptions(GOALS, [session("2026-08-05", "bulk")]).map((o) => o.id);
  assert.deepEqual(allTagged, [WORKOUT_SCOPE_ALL, "bulk", "cardio"]);
});

// ---- switching + remembering -------------------------------------------

test("switching goals filters sessions to that goal only", () => {
  assert.deepEqual(
    scopeWorkouts(WORKOUTS, "bulk").map((w) => w.goalId),
    ["bulk"]
  );
  assert.deepEqual(
    scopeWorkouts(WORKOUTS, "cardio").map((w) => w.goalId),
    ["cardio"]
  );
});

test("the all-goals view returns every session, including unassigned ones", () => {
  assert.equal(scopeWorkouts(WORKOUTS, WORKOUT_SCOPE_ALL).length, 3);
});

test("the unassigned view shows only sessions with no goal", () => {
  const unassigned = scopeWorkouts(WORKOUTS, WORKOUT_SCOPE_UNASSIGNED);
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].goalId, null);
});

test("a remembered scope whose goal was archived falls back to all workouts", () => {
  assert.equal(resolveWorkoutScope("shelved", GOALS, WORKOUTS), WORKOUT_SCOPE_ALL);
  assert.equal(resolveWorkoutScope("deleted-goal", GOALS, WORKOUTS), WORKOUT_SCOPE_ALL);
  // A still-valid one is kept, which is what makes the choice persist.
  assert.equal(resolveWorkoutScope("bulk", GOALS, WORKOUTS), "bulk");
});

// ---- linking new work ---------------------------------------------------

test("a new session defaults to the selected goal, and to unassigned in a global view", () => {
  assert.equal(defaultGoalIdForScope("bulk"), "bulk");
  assert.equal(defaultGoalIdForScope(WORKOUT_SCOPE_ALL), null);
  assert.equal(defaultGoalIdForScope(WORKOUT_SCOPE_UNASSIGNED), null);
  assert.equal(defaultGoalIdForScope(undefined), null);
});

test("a planned session can carry a goal, and defaults to unassigned without one", () => {
  assert.equal(createScheduledWorkout({ goalId: "bulk" }).goalId, "bulk");
  assert.equal(createScheduledWorkout({}).goalId, null);
  assert.equal(createWorkout({}).goalId, null);
});

test("planned sessions filter by goal the same way logged ones do", () => {
  const planned = [
    { id: "s1", date: "2026-08-06", status: "planned", goalId: "bulk" },
    { id: "s2", date: "2026-08-07", status: "planned", goalId: null },
  ];
  assert.deepEqual(
    scopeScheduledWorkouts(planned, "bulk").map((s) => s.id),
    ["s1"]
  );
  assert.equal(scopeScheduledWorkouts(planned, WORKOUT_SCOPE_ALL).length, 2);
});

test("a session recorded before goals existed is never swept into a goal", () => {
  // The whole history, viewed through a goal, must not pick up the untagged
  // session — the old fallback of "show everything when nothing is tagged"
  // is exactly what mislabelled somebody's history.
  const summary = workoutScopeSummary({ workouts: WORKOUTS, goals: GOALS, scope: "bulk" });
  assert.equal(summary.workouts.length, 1);
  assert.equal(summary.workouts[0].goalId, "bulk");
  // ...but it is not hidden either: the count is surfaced so the user can
  // choose to link them.
  assert.equal(summary.unassignedCount, 1);
});

// ---- shared numbers -----------------------------------------------------

test("the goal view and the global view compute the same way over different scopes", () => {
  const ref = "2026-08-05";
  const all = workoutScopeSummary({ workouts: WORKOUTS, goals: GOALS, scope: WORKOUT_SCOPE_ALL, refKey: ref });
  const bulk = workoutScopeSummary({ workouts: WORKOUTS, goals: GOALS, scope: "bulk", refKey: ref });

  assert.equal(all.weekCount, 3);
  assert.equal(bulk.weekCount, 1);
  assert.equal(bulk.weekVolume, 225 * 5);
  assert.equal(all.weekVolume, 225 * 5 + 95 * 5 + 135 * 5);
  assert.equal(bulk.streak, 1);
  assert.equal(bulk.goal.name, "Bulk up");
});

test("a goal's own weekly target wins over the shared profile, and stays null when unset", () => {
  const goals = [{ id: "bulk", name: "Bulk up", type: "fitness", fitness: { weeklyTarget: 5 } }];
  const withGoalTarget = workoutScopeSummary({ goals, profile: { workoutDaysPerWeek: 3 }, scope: "bulk" });
  assert.equal(withGoalTarget.target, 5);

  const withProfileTarget = workoutScopeSummary({
    goals: [{ id: "bulk", name: "Bulk up", type: "fitness" }],
    profile: { workoutDaysPerWeek: 3 },
    scope: "bulk",
  });
  assert.equal(withProfileTarget.target, 3);

  // Neither set: null, so the caller can offer "Set weekly target" rather
  // than rendering a hollow 0/3.
  assert.equal(workoutScopeSummary({ goals, scope: WORKOUT_SCOPE_ALL }).target, null);
});

test("personal records ignore warm-up sets and report the heaviest working set", () => {
  const workouts = [
    session("2026-08-05", "bulk", [
      { done: true, warmup: true, weight: 500, reps: 1 },
      { done: true, weight: 225, reps: 5 },
      { done: false, weight: 315, reps: 1 },
    ]),
  ];
  assert.deepEqual(
    personalRecords(workouts).map((record) => record.weight),
    [225]
  );
});

test("an empty scope reports zeroes rather than throwing", () => {
  const summary = workoutScopeSummary({ workouts: [], goals: GOALS, scope: "cardio" });
  assert.equal(summary.weekCount, 0);
  assert.equal(summary.streak, 0);
  assert.equal(summary.weekVolume, 0);
  assert.deepEqual(summary.recent, []);
  assert.deepEqual(summary.personalRecords, []);
});
