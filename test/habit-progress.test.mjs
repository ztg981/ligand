/* Habits that need doing more than once a day.

   The rules worth protecting: a partial day is not a completed day, raising
   the target later must not rewrite what already happened, and habits written
   before any of this existed must keep working untouched. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_HABIT_DAILY_TARGET,
  createHabit,
  currentStreak,
  normalizeHabitDailyTarget,
} from "../src/lib/model.js";
import {
  applyHabitOccurrence,
  completedDayStreak,
  completedHabitDays,
  goalHabitStats,
  habitDayFraction,
  habitStats,
  readHabitDay,
  totalHabitOccurrences,
} from "../src/lib/habitProgress.js";

const DAY = "2026-08-05";

function tick(habit, times, dayKey = DAY) {
  let next = habit;
  for (let i = 0; i < times; i += 1) next = applyHabitOccurrence(next, dayKey, 1);
  return next;
}

// ---- migration of existing habits -------------------------------------

test("an existing habit reads as daily target 1 without being rewritten", () => {
  // Exactly the shape stored before multi-completion existed.
  const legacy = { id: "h1", name: "Floss", checkIns: ["2026-08-03", "2026-08-04"] };

  assert.equal(habitStats(legacy, "2026-08-04").dailyTarget, 1);
  assert.deepEqual(readHabitDay(legacy, "2026-08-04"), {
    count: 1,
    target: 1,
    done: true,
    at: [],
  });
  assert.equal(totalHabitOccurrences(legacy), 2);
  assert.equal(completedHabitDays(legacy), 2);
  assert.equal(completedDayStreak(legacy, "2026-08-04"), 2);
  // Nothing was written back to the record.
  assert.equal(legacy.occurrences, undefined);
  assert.equal(legacy.dailyTarget, undefined);
});

test("a new habit defaults to target 1 and behaves like a plain check-off", () => {
  const habit = createHabit({ name: "Meditate" });
  assert.equal(habit.dailyTarget, 1);

  const done = applyHabitOccurrence(habit, DAY, 1);
  assert.equal(readHabitDay(done, DAY).done, true);
  assert.deepEqual(done.checkIns, [DAY]);
  // The legacy streak helper still reads it, untouched.
  assert.equal(currentStreak(done, DAY), 1);

  const undone = applyHabitOccurrence(done, DAY, -1);
  assert.deepEqual(undone.checkIns, []);
  assert.equal(readHabitDay(undone, DAY).count, 0);
});

test("the daily target is clamped to a practical range", () => {
  assert.equal(normalizeHabitDailyTarget(3), 3);
  assert.equal(normalizeHabitDailyTarget(0), 1);
  assert.equal(normalizeHabitDailyTarget(-5), 1);
  assert.equal(normalizeHabitDailyTarget(999), MAX_HABIT_DAILY_TARGET);
  assert.equal(normalizeHabitDailyTarget("3"), 3);
  assert.equal(normalizeHabitDailyTarget(undefined), 1);
  assert.equal(createHabit({ dailyTarget: 3 }).dailyTarget, 3);
});

// ---- 0/3 → 1/3 → 2/3 → 3/3 --------------------------------------------

test("progress runs 0/3 to 3/3 and only completes at the target", () => {
  let habit = createHabit({ name: "Brush teeth", dailyTarget: 3 });

  assert.deepEqual(
    [readHabitDay(habit, DAY).count, habitDayFraction(habit, DAY), readHabitDay(habit, DAY).done],
    [0, 0, false]
  );

  habit = applyHabitOccurrence(habit, DAY, 1);
  assert.equal(readHabitDay(habit, DAY).count, 1);
  assert.ok(Math.abs(habitDayFraction(habit, DAY) - 1 / 3) < 1e-9);
  assert.equal(readHabitDay(habit, DAY).done, false, "1/3 is not complete");
  assert.deepEqual(habit.checkIns, [], "a partial day is not a completed day");

  habit = applyHabitOccurrence(habit, DAY, 1);
  assert.ok(Math.abs(habitDayFraction(habit, DAY) - 2 / 3) < 1e-9);
  assert.equal(readHabitDay(habit, DAY).done, false, "2/3 is not complete");
  assert.deepEqual(habit.checkIns, []);

  habit = applyHabitOccurrence(habit, DAY, 1);
  assert.equal(readHabitDay(habit, DAY).count, 3);
  assert.equal(habitDayFraction(habit, DAY), 1);
  assert.equal(readHabitDay(habit, DAY).done, true, "3/3 completes the day");
  assert.deepEqual(habit.checkIns, [DAY]);
});

test("an accidental tap can be taken back, and completion is withdrawn with it", () => {
  let habit = tick(createHabit({ dailyTarget: 3 }), 3);
  assert.deepEqual(habit.checkIns, [DAY]);

  habit = applyHabitOccurrence(habit, DAY, -1);
  assert.equal(readHabitDay(habit, DAY).count, 2);
  assert.deepEqual(habit.checkIns, [], "no longer a completed day");
});

test("counts cannot run past the target or below zero", () => {
  let habit = tick(createHabit({ dailyTarget: 3 }), 6);
  assert.equal(readHabitDay(habit, DAY).count, 3, "extra taps are ignored");
  assert.equal(habitDayFraction(habit, DAY), 1);

  for (let i = 0; i < 6; i += 1) habit = applyHabitOccurrence(habit, DAY, -1);
  assert.equal(readHabitDay(habit, DAY).count, 0);
});

test("a no-op tick returns the same habit rather than a fresh object", () => {
  const habit = tick(createHabit({ dailyTarget: 2 }), 2);
  assert.equal(applyHabitOccurrence(habit, DAY, 1), habit);
});

test("occurrence timestamps are recorded and unwound", () => {
  let habit = createHabit({ dailyTarget: 3 });
  habit = applyHabitOccurrence(habit, DAY, 1, "2026-08-05T08:00:00.000Z");
  habit = applyHabitOccurrence(habit, DAY, 1, "2026-08-05T13:00:00.000Z");
  assert.deepEqual(readHabitDay(habit, DAY).at, [
    "2026-08-05T08:00:00.000Z",
    "2026-08-05T13:00:00.000Z",
  ]);

  habit = applyHabitOccurrence(habit, DAY, -1);
  assert.deepEqual(readHabitDay(habit, DAY).at, ["2026-08-05T08:00:00.000Z"]);
});

// ---- history is never rewritten ---------------------------------------

test("raising the daily target later leaves finished days finished", () => {
  let habit = tick(createHabit({ name: "Brush teeth", dailyTarget: 2 }), 2, "2026-08-04");
  assert.deepEqual(habit.checkIns, ["2026-08-04"]);

  // The user decides three a day from now on.
  habit = { ...habit, dailyTarget: 3 };

  const past = readHabitDay(habit, "2026-08-04");
  assert.equal(past.target, 2, "the old day keeps the target it was kept under");
  assert.equal(past.done, true, "and stays complete");
  assert.deepEqual(habit.checkIns, ["2026-08-04"]);

  // Only new days use the new target.
  assert.equal(readHabitDay(habit, DAY).target, 3);
  const partial = applyHabitOccurrence(habit, DAY, 1);
  assert.equal(readHabitDay(partial, DAY).done, false);
});

test("lowering the target does not retroactively complete an unfinished day", () => {
  let habit = tick(createHabit({ dailyTarget: 3 }), 1, "2026-08-04");
  habit = { ...habit, dailyTarget: 1 };
  assert.equal(readHabitDay(habit, "2026-08-04").done, false);
  assert.deepEqual(habit.checkIns, []);
});

// ---- the three totals are distinct ------------------------------------

test("occurrences, completed days and streak are counted separately", () => {
  let habit = createHabit({ dailyTarget: 3 });
  habit = tick(habit, 3, "2026-08-03"); // complete
  habit = tick(habit, 3, "2026-08-04"); // complete
  habit = tick(habit, 2, "2026-08-05"); // partial

  const stats = habitStats(habit, "2026-08-05");
  assert.equal(stats.totalOccurrences, 8, "partial days still contribute occurrences");
  assert.equal(stats.completedDays, 2, "only full days count as completed");
  assert.equal(
    stats.completedDayStreak,
    2,
    "an unfinished today pauses rather than breaks the streak"
  );
});

test("a streak advances only when the day is fully met", () => {
  let habit = createHabit({ dailyTarget: 3 });
  habit = tick(habit, 3, "2026-08-03");
  habit = tick(habit, 2, "2026-08-04"); // fell short
  habit = tick(habit, 3, "2026-08-05");

  // The 4th broke the run, so only the 5th counts.
  assert.equal(completedDayStreak(habit, "2026-08-05"), 1);
  assert.equal(totalHabitOccurrences(habit), 8);
});

test("a target-1 habit's streak is unchanged from before", () => {
  let habit = createHabit({ dailyTarget: 1 });
  for (const day of ["2026-08-03", "2026-08-04", "2026-08-05"]) {
    habit = applyHabitOccurrence(habit, day, 1);
  }
  assert.equal(completedDayStreak(habit, "2026-08-05"), 3);
  assert.equal(currentStreak(habit, "2026-08-05"), 3, "the legacy helper agrees");
});

test("occurrences from before the log began are still counted once", () => {
  // A habit that has legacy checkIns AND newer occurrence records.
  let habit = { ...createHabit({ dailyTarget: 2 }), checkIns: ["2026-08-01", "2026-08-02"] };
  habit = tick(habit, 2, "2026-08-05");

  assert.equal(totalHabitOccurrences(habit), 4, "2 legacy + 2 logged");
  assert.equal(completedHabitDays(habit), 3);
});

test("goal-level totals sum across every habit", () => {
  const goal = {
    habits: [
      tick(createHabit({ dailyTarget: 3 }), 3, "2026-08-05"),
      tick(createHabit({ dailyTarget: 1 }), 1, "2026-08-05"),
    ],
  };
  const stats = goalHabitStats(goal, "2026-08-05");
  assert.equal(stats.totalOccurrences, 4);
  assert.equal(stats.completedDays, 2);
  assert.equal(stats.bestStreak, 1);
});

test("a goal with no habits reports zeroes rather than throwing", () => {
  assert.deepEqual(goalHabitStats({}, DAY), {
    totalOccurrences: 0,
    completedDays: 0,
    bestStreak: 0,
  });
  assert.equal(totalHabitOccurrences(undefined), 0);
  assert.equal(completedDayStreak(null, DAY), 0);
});
