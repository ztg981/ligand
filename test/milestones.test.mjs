/* Milestones and the goal timeline.

   The engine's job is to read live source data — count-ups, habits, tasks,
   workouts — and never keep its own copy of a number. These walk the three
   worked examples from the brief end to end, plus the ordering, archiving and
   reward rules around them. */
import assert from "node:assert/strict";
import test from "node:test";

import { createGoal, createHabit } from "../src/lib/model.js";
import { applyHabitOccurrence } from "../src/lib/habitProgress.js";
import {
  GOAL_PROGRESS_MODES,
  applyCountUpEvent,
  createCountUpMetric,
} from "../src/lib/countUpGoal.js";
import {
  MILESTONE_STATUS,
  MILESTONE_TRIGGERS,
  addMilestone,
  archiveMilestone,
  archivedMilestones,
  claimMilestoneReward,
  createMilestoneReward,
  goalTimeline,
  latchReachedMilestones,
  markMilestoneReached,
  milestoneSummary,
  milestonesEnabled,
  nextMilestone,
  removeMilestone,
  reorderMilestones,
  resolveMilestone,
  restoreMilestone,
  setMilestonesEnabled,
  undoMilestoneReached,
} from "../src/lib/milestones.js";

const REF = "2026-08-05";

function goalWithMilestones(base, specs) {
  return specs.reduce((goal, spec) => addMilestone(goal, spec), base);
}

function byTitle(timeline, title) {
  return timeline.find((milestone) => milestone.title === title);
}

// ---- opting in ---------------------------------------------------------

test("a goal without milestones has no timeline at all", () => {
  const goal = createGoal({ name: "Research" });
  assert.equal(milestonesEnabled(goal), false);
  assert.deepEqual(goalTimeline(goal, { refKey: REF }), []);
  assert.equal(nextMilestone(goal, { refKey: REF }), null);
});

test("adding a milestone enables the timeline", () => {
  const goal = addMilestone(createGoal({ name: "Project" }), { title: "Build MVP" });
  assert.equal(milestonesEnabled(goal), true);
  assert.equal(goalTimeline(goal, { refKey: REF }).length, 1);
});

test("turning milestones off hides the timeline without destroying it", () => {
  let goal = addMilestone(createGoal({ name: "Project" }), { title: "Build MVP" });
  goal = setMilestonesEnabled(goal, false);

  assert.equal(milestonesEnabled(goal), false, "the timeline is hidden");
  assert.equal(goal.milestones.length, 1, "but the milestone is still on record");

  goal = setMilestonesEnabled(goal, true);
  assert.equal(goalTimeline(goal, { refKey: REF })[0].title, "Build MVP");
});

test("only an explicit removal destroys a milestone", () => {
  let goal = addMilestone(createGoal({}), { title: "Gone" });
  const id = goal.milestones[0].id;
  goal = removeMilestone(goal, id);
  assert.equal(goal.milestones.length, 0);
});

// ---- manual milestones -------------------------------------------------

test("a manual milestone is marked by hand and can be undone deliberately", () => {
  let goal = addMilestone(createGoal({}), {
    title: "Publish project",
    trigger: { type: MILESTONE_TRIGGERS.MANUAL, config: {} },
  });
  const id = goal.milestones[0].id;

  let resolved = goalTimeline(goal, { refKey: REF })[0];
  assert.equal(resolved.automatic, false);
  assert.equal(resolved.status, MILESTONE_STATUS.UPCOMING);

  goal = markMilestoneReached(goal, id, "2026-08-05T10:00:00.000Z");
  resolved = goalTimeline(goal, { refKey: REF })[0];
  assert.equal(resolved.reached, true);
  assert.equal(resolved.status, MILESTONE_STATUS.REACHED);
  assert.equal(resolved.reachedAt, "2026-08-05T10:00:00.000Z");

  goal = undoMilestoneReached(goal, id);
  resolved = goalTimeline(goal, { refKey: REF })[0];
  assert.equal(resolved.reached, false);
  assert.equal(resolved.reachedAt, null);
});

test("marking an already-reached milestone keeps the original date", () => {
  let goal = addMilestone(createGoal({}), { title: "Ship" });
  const id = goal.milestones[0].id;
  goal = markMilestoneReached(goal, id, "2026-08-01T00:00:00.000Z");
  goal = markMilestoneReached(goal, id, "2026-08-09T00:00:00.000Z");
  assert.equal(goal.milestones[0].reachedAt, "2026-08-01T00:00:00.000Z");
});

// ---- example 1: the social count-up goal -------------------------------

test("a count-up milestone tracks the metric and unlocks at its threshold", () => {
  let goal = {
    ...createGoal({ name: "Social" }),
    progressMode: GOAL_PROGRESS_MODES.COUNT_UP,
    countUp: createCountUpMetric({ name: "New connections", start: 0, target: 15 }),
    countUpEvents: [],
  };
  goal = goalWithMilestones(goal, [
    { title: "Reach 5", trigger: { type: MILESTONE_TRIGGERS.COUNT_UP_THRESHOLD, config: { target: 5 } } },
    { title: "Reach 10", trigger: { type: MILESTONE_TRIGGERS.COUNT_UP_THRESHOLD, config: { target: 10 } } },
    {
      title: "Reach 15",
      trigger: { type: MILESTONE_TRIGGERS.COUNT_UP_THRESHOLD, config: { target: 15 } },
      reward: { title: "Buy a pair of shoes", budget: 100, currency: "USD" },
    },
  ]);

  // Four connections in: nothing unlocked, the first is under way.
  for (let i = 0; i < 4; i += 1) goal = applyCountUpEvent(goal, { id: `a${i}`, delta: 1 });
  let timeline = goalTimeline(goal, { refKey: REF });
  assert.equal(byTitle(timeline, "Reach 5").current, 4);
  assert.equal(byTitle(timeline, "Reach 5").status, MILESTONE_STATUS.IN_PROGRESS);
  assert.equal(byTitle(timeline, "Reach 5").reached, false);
  assert.equal(nextMilestone(goal, { refKey: REF }).title, "Reach 5");

  // The fifth crosses the line — immediately, from the same source data.
  goal = applyCountUpEvent(goal, { id: "a4", delta: 1 });
  timeline = goalTimeline(goal, { refKey: REF });
  assert.equal(byTitle(timeline, "Reach 5").reached, true);
  assert.equal(byTitle(timeline, "Reach 10").reached, false);
  assert.equal(nextMilestone(goal, { refKey: REF }).title, "Reach 10");

  // All the way to fifteen unlocks the reward.
  goal = applyCountUpEvent(goal, { id: "rest", delta: 10 });
  timeline = goalTimeline(goal, { refKey: REF });
  const final = byTitle(timeline, "Reach 15");
  assert.equal(final.reached, true);
  assert.equal(final.rewardUnlocked, true);
  assert.equal(final.rewardClaimed, false);
  assert.equal(final.reward.budget, 100);
  assert.equal(milestoneSummary(goal, { refKey: REF }).reached, 3);
  assert.equal(nextMilestone(goal, { refKey: REF }), null);
});

test("an unlocked reward can be claimed", () => {
  let goal = addMilestone(createGoal({}), {
    title: "Done",
    reward: createMilestoneReward({ title: "New shoes", budget: 100 }),
  });
  const id = goal.milestones[0].id;
  goal = markMilestoneReached(goal, id);
  assert.equal(goalTimeline(goal, { refKey: REF })[0].rewardClaimed, false);

  goal = claimMilestoneReward(goal, id, "2026-08-06T00:00:00.000Z");
  const resolved = goalTimeline(goal, { refKey: REF })[0];
  assert.equal(resolved.rewardClaimed, true);
  assert.equal(resolved.reward.claimedAt, "2026-08-06T00:00:00.000Z");
});

test("a reward stays locked until its milestone is reached", () => {
  const goal = addMilestone(createGoal({}), {
    title: "Later",
    reward: createMilestoneReward({ title: "Shoes" }),
  });
  assert.equal(goalTimeline(goal, { refKey: REF })[0].rewardUnlocked, false);
});

// ---- example 2: the hygiene habit goal ---------------------------------

test("one brushing advances occurrences but not completed days or streak", () => {
  const habit = createHabit({ name: "Brush teeth", dailyTarget: 3 });
  let goal = { ...createGoal({ name: "Hygiene" }), habits: [habit] };
  goal = goalWithMilestones(goal, [
    {
      title: "40 brushes",
      trigger: { type: MILESTONE_TRIGGERS.HABIT_OCCURRENCE_TOTAL, config: { habitId: habit.id, target: 40 } },
    },
    {
      title: "14 full days",
      trigger: { type: MILESTONE_TRIGGERS.HABIT_COMPLETED_DAYS, config: { habitId: habit.id, target: 14 } },
    },
    {
      title: "7-day streak",
      trigger: { type: MILESTONE_TRIGGERS.HABIT_STREAK, config: { habitId: habit.id, target: 7 } },
    },
  ]);

  const tick = (g, day, times) => ({
    ...g,
    habits: [
      Array.from({ length: times }).reduce((h) => applyHabitOccurrence(h, day, 1), g.habits[0]),
    ],
  });

  // One brush today.
  goal = tick(goal, REF, 1);
  let timeline = goalTimeline(goal, { refKey: REF });
  assert.equal(byTitle(timeline, "40 brushes").current, 1, "occurrence progress moves");
  assert.equal(byTitle(timeline, "14 full days").current, 0, "the day is not finished");
  assert.equal(byTitle(timeline, "7-day streak").current, 0, "and no streak yet");

  // Finish the day.
  goal = tick(goal, REF, 2);
  timeline = goalTimeline(goal, { refKey: REF });
  assert.equal(byTitle(timeline, "40 brushes").current, 3);
  assert.equal(byTitle(timeline, "14 full days").current, 1, "now it counts as a day");
  assert.equal(byTitle(timeline, "7-day streak").current, 1);
});

test("a habit streak milestone completes at the streak length", () => {
  const habit = createHabit({ name: "Brush teeth", dailyTarget: 3 });
  let goal = { ...createGoal({}), habits: [habit] };
  goal = addMilestone(goal, {
    title: "7-day streak",
    trigger: { type: MILESTONE_TRIGGERS.HABIT_STREAK, config: { habitId: habit.id, target: 7 } },
  });

  const days = ["07-30", "07-31", "08-01", "08-02", "08-03", "08-04", "08-05"].map(
    (d) => `2026-${d}`
  );
  let h = goal.habits[0];
  for (const day of days) for (let i = 0; i < 3; i += 1) h = applyHabitOccurrence(h, day, 1);
  goal = { ...goal, habits: [h] };

  const resolved = goalTimeline(goal, { refKey: REF })[0];
  assert.equal(resolved.current, 7);
  assert.equal(resolved.reached, true);
});

test("an occurrence milestone counts partial days too", () => {
  const habit = createHabit({ name: "Brush", dailyTarget: 3 });
  let h = habit;
  h = applyHabitOccurrence(h, "2026-08-04", 1);
  h = applyHabitOccurrence(h, "2026-08-04", 1); // 2/3, not a completed day
  let goal = { ...createGoal({}), habits: [h] };
  goal = addMilestone(goal, {
    title: "2 brushes",
    trigger: { type: MILESTONE_TRIGGERS.HABIT_OCCURRENCE_TOTAL, config: { habitId: habit.id, target: 2 } },
  });
  assert.equal(goalTimeline(goal, { refKey: REF })[0].reached, true);
});

// ---- example 3: the project goal, tasks --------------------------------

test("a task-count milestone counts completed tasks linked to this goal", () => {
  const goal = addMilestone(createGoal({ name: "Portfolio" }), {
    title: "Finish 5 tasks",
    trigger: { type: MILESTONE_TRIGGERS.GOAL_TASK_COUNT, config: { target: 5 } },
  });
  const tasks = [
    { id: "t1", goalId: goal.id, done: true },
    { id: "t2", goalId: goal.id, done: true },
    { id: "t3", goalId: goal.id, done: false },
    { id: "t4", goalId: "other-goal", done: true }, // another goal's work
  ];

  const resolved = goalTimeline(goal, { tasks, refKey: REF })[0];
  assert.equal(resolved.current, 2, "only this goal's completed tasks count");
  assert.equal(resolved.target, 5);
  assert.equal(resolved.reached, false);
});

test("a specific-tasks milestone completes when every named task is done", () => {
  const goal = addMilestone(createGoal({}), {
    title: "Portfolio, résumé, LinkedIn",
    trigger: {
      type: MILESTONE_TRIGGERS.SPECIFIC_TASKS,
      config: { taskIds: ["portfolio", "resume", "linkedin"] },
    },
  });

  const partly = [
    { id: "portfolio", goalId: goal.id, done: true },
    { id: "resume", goalId: goal.id, done: true },
    { id: "linkedin", goalId: goal.id, done: false },
  ];
  let resolved = goalTimeline(goal, { tasks: partly, refKey: REF })[0];
  assert.deepEqual([resolved.current, resolved.target, resolved.reached], [2, 3, false]);

  const all = partly.map((task) => ({ ...task, done: true }));
  resolved = goalTimeline(goal, { tasks: all, refKey: REF })[0];
  assert.equal(resolved.reached, true);
});

// ---- workouts ----------------------------------------------------------

test("a workout-session milestone counts sessions linked to the goal", () => {
  const goal = addMilestone(
    { ...createGoal({ name: "Bulk up" }), id: "bulk", type: "fitness" },
    { title: "20 sessions", trigger: { type: MILESTONE_TRIGGERS.WORKOUT_SESSIONS, config: { target: 20 } } }
  );
  const workouts = [
    { id: "w1", date: "2026-08-04", goalId: "bulk", exercises: [] },
    { id: "w2", date: "2026-08-05", goalId: "bulk", exercises: [] },
    { id: "w3", date: "2026-08-05", goalId: null, exercises: [] }, // unassigned
  ];
  const resolved = goalTimeline(goal, { workouts, refKey: REF })[0];
  assert.equal(resolved.current, 2, "unassigned sessions are not swept in");
});

// ---- latching and recalculation ----------------------------------------

test("an automatic milestone latches once reached and survives recalculation", () => {
  const habit = createHabit({ name: "Brush", dailyTarget: 1 });
  let h = habit;
  for (const day of ["2026-08-03", "2026-08-04", "2026-08-05"]) {
    h = applyHabitOccurrence(h, day, 1);
  }
  let goal = { ...createGoal({}), habits: [h] };
  goal = addMilestone(goal, {
    title: "3-day streak",
    trigger: { type: MILESTONE_TRIGGERS.HABIT_STREAK, config: { habitId: habit.id, target: 3 } },
  });

  goal = latchReachedMilestones(goal, { refKey: REF }, "2026-08-05T12:00:00.000Z");
  assert.equal(goal.milestones[0].reachedAt, "2026-08-05T12:00:00.000Z");

  // Days later the streak has lapsed, but the achievement stands.
  const later = goalTimeline(goal, { refKey: "2026-08-20" })[0];
  assert.equal(later.current, 0, "the streak itself is gone");
  assert.equal(later.reached, true, "what was earned is not taken away");

  // Recalculating is idempotent: no second stamp, no version churn.
  const again = latchReachedMilestones(goal, { refKey: REF });
  assert.equal(again, goal);
});

test("latching leaves manual and unreached milestones alone", () => {
  let goal = goalWithMilestones(createGoal({}), [
    { title: "Manual", trigger: { type: MILESTONE_TRIGGERS.MANUAL, config: {} } },
    { title: "Far off", trigger: { type: MILESTONE_TRIGGERS.GOAL_TASK_COUNT, config: { target: 99 } } },
  ]);
  assert.equal(latchReachedMilestones(goal, { tasks: [], refKey: REF }), goal);
});

// ---- ordering, dates, archiving ----------------------------------------

test("the timeline follows explicit order, not dates", () => {
  let goal = goalWithMilestones(createGoal({}), [
    { title: "Choose idea" },
    { title: "Build MVP" },
    { title: "Publish" },
  ]);
  assert.deepEqual(
    goalTimeline(goal, { refKey: REF }).map((m) => m.title),
    ["Choose idea", "Build MVP", "Publish"]
  );

  const ids = goal.milestones.map((m) => m.id);
  goal = reorderMilestones(goal, [ids[2], ids[0], ids[1]]);
  assert.deepEqual(
    goalTimeline(goal, { refKey: REF }).map((m) => m.title),
    ["Publish", "Choose idea", "Build MVP"]
  );
  assert.deepEqual(goal.milestones.map((m) => m.order), [10, 20, 30]);
});

test("a dated milestone does not jump the queue, and undated ones keep their place", () => {
  const goal = goalWithMilestones(createGoal({}), [
    { title: "First", targetDate: "2026-12-01" },
    { title: "Second" }, // no date, and none is invented
    { title: "Third", targetDate: "2026-09-01" },
  ]);
  assert.deepEqual(
    goalTimeline(goal, { refKey: REF }).map((m) => m.title),
    ["First", "Second", "Third"]
  );
  assert.equal(goalTimeline(goal, { refKey: REF })[1].targetDate, null);
});

test("a past target date reads as overdue, and stops once reached", () => {
  let goal = addMilestone(createGoal({}), { title: "Late", targetDate: "2026-08-01" });
  assert.equal(goalTimeline(goal, { refKey: REF })[0].overdue, true);

  goal = markMilestoneReached(goal, goal.milestones[0].id);
  assert.equal(goalTimeline(goal, { refKey: REF })[0].overdue, false);
});

test("archived milestones leave the timeline but stay in history", () => {
  let goal = goalWithMilestones(createGoal({}), [{ title: "Keep" }, { title: "Shelve" }]);
  const shelvedId = goal.milestones[1].id;
  goal = archiveMilestone(goal, shelvedId);

  assert.deepEqual(goalTimeline(goal, { refKey: REF }).map((m) => m.title), ["Keep"]);
  assert.deepEqual(archivedMilestones(goal, { refKey: REF }).map((m) => m.title), ["Shelve"]);
  assert.equal(goal.milestones.length, 2, "still on record");

  goal = restoreMilestone(goal, shelvedId);
  assert.equal(goalTimeline(goal, { refKey: REF }).length, 2);
});

test("mobile and desktop read the same ordered list", () => {
  // The vertical phone timeline is the same array; only the layout differs,
  // so ordering can be asserted once here.
  const goal = goalWithMilestones(createGoal({}), [
    { title: "One" },
    { title: "Two" },
    { title: "Three" },
  ]);
  const order = goalTimeline(goal, { refKey: REF }).map((m) => m.title);
  assert.deepEqual(order, ["One", "Two", "Three"]);
});

test("a milestone with a broken trigger config degrades instead of throwing", () => {
  const goal = {
    ...createGoal({}),
    milestonesEnabled: true,
    milestones: [
      { id: "m1", title: "No trigger" },
      { id: "m2", title: "Unknown type", trigger: { type: "fromTheFuture", config: {} } },
      { id: "m3", title: "No target", trigger: { type: MILESTONE_TRIGGERS.GOAL_TASK_COUNT, config: {} } },
    ],
  };
  const timeline = goalTimeline(goal, { tasks: [], refKey: REF });
  assert.equal(timeline.length, 3);
  for (const milestone of timeline) {
    assert.equal(milestone.reached, false);
    assert.ok(Number.isFinite(milestone.current));
  }
});

test("resolving a milestone never mutates the stored record", () => {
  const goal = addMilestone(createGoal({}), { title: "Immutable" });
  const before = JSON.stringify(goal.milestones[0]);
  resolveMilestone(goal.milestones[0], { goal, refKey: REF });
  assert.equal(JSON.stringify(goal.milestones[0]), before);
});
