/* Count-up goals: a number that grows, with an auditable history behind it.

   The load-bearing property is that the value is DERIVED from the event log,
   so undo, replay and double-tap protection all fall out of the same place
   rather than each being handled (and each being got wrong) separately. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  GOAL_PROGRESS_MODES,
  applyCountUpEvent,
  clampCountUpDelta,
  countUpHistory,
  countUpProgress,
  countUpValue,
  createCountUpMetric,
  goalProgressMode,
  isCountUpGoal,
  lastLiveCountUpEvent,
  readCountUpEvents,
  undoLastCountUpEvent,
} from "../src/lib/countUpGoal.js";
import { createGoal } from "../src/lib/model.js";

function countUpGoal(config = {}) {
  return {
    ...createGoal({ name: "Social" }),
    progressMode: GOAL_PROGRESS_MODES.COUNT_UP,
    countUp: createCountUpMetric({ name: "New connections", unit: "connections", ...config }),
    countUpEvents: [],
  };
}

// ---- modes -------------------------------------------------------------

test("an existing goal is standard, and a plain goal still works", () => {
  const goal = createGoal({ name: "Research" });
  assert.equal(goalProgressMode(goal), GOAL_PROGRESS_MODES.STANDARD);
  assert.equal(isCountUpGoal(goal), false);
  // A goal with no count-up config is inert rather than broken.
  assert.equal(countUpValue(goal), 0);
  assert.equal(countUpProgress(goal), null);
  assert.equal(applyCountUpEvent(goal, { delta: 1 }), goal);
});

test("a count-up goal carries its metric", () => {
  const goal = countUpGoal({ start: 0, target: 15, step: 1 });
  assert.equal(isCountUpGoal(goal), true);
  assert.equal(goal.countUp.name, "New connections");
  assert.equal(goal.countUp.unit, "connections");
  assert.equal(goal.countUp.target, 15);
  assert.equal(goal.countUp.step, 1);
  assert.equal(countUpValue(goal), 0);
});

// ---- adjusting ---------------------------------------------------------

test("incrementing by the default step raises the value", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { delta: goal.countUp.step });
  assert.equal(countUpValue(goal), 1);
  goal = applyCountUpEvent(goal, { delta: goal.countUp.step });
  assert.equal(countUpValue(goal), 2);
});

test("a larger default step is honoured", () => {
  let goal = countUpGoal({ step: 5, target: 50 });
  goal = applyCountUpEvent(goal, { delta: goal.countUp.step });
  assert.equal(countUpValue(goal), 5);
});

test("decrementing lowers the value", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { delta: 3 });
  goal = applyCountUpEvent(goal, { delta: -1 });
  assert.equal(countUpValue(goal), 2);
});

test("a custom adjustment with a note is recorded", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { delta: 4, note: "Met four people at the meetup" });
  assert.equal(countUpValue(goal), 4);
  const [event] = readCountUpEvents(goal);
  assert.equal(event.delta, 4);
  assert.equal(event.note, "Met four people at the meetup");
  assert.equal(event.source, "manual");
  assert.match(event.at, /^\d{4}-\d{2}-\d{2}T/);
});

test("the value cannot be driven below the configured minimum", () => {
  let goal = countUpGoal({ start: 2, min: 0, target: 15 });
  // A step that would overshoot the floor is shortened to land exactly on it.
  assert.equal(clampCountUpDelta(goal, -5), -2);
  goal = applyCountUpEvent(goal, { delta: -5 });
  assert.equal(countUpValue(goal), 0);

  // Already at the floor: refused outright, and nothing is logged.
  const atFloor = applyCountUpEvent(goal, { delta: -1 });
  assert.equal(countUpValue(atFloor), 0);
  assert.equal(readCountUpEvents(atFloor).length, readCountUpEvents(goal).length);
});

test("a null minimum allows negative values", () => {
  let goal = countUpGoal({ start: 0, min: null });
  goal = applyCountUpEvent(goal, { delta: -3 });
  assert.equal(countUpValue(goal), -3);
});

// ---- duplicates and undo -----------------------------------------------

test("the same adjustment applied twice only counts once", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { id: "tap-1", delta: 1 });
  const afterFirst = countUpValue(goal);

  // A double click, an optimistic retry, and a sync replay all look like this.
  goal = applyCountUpEvent(goal, { id: "tap-1", delta: 1 });
  goal = applyCountUpEvent(goal, { id: "tap-1", delta: 1 });

  assert.equal(countUpValue(goal), afterFirst);
  assert.equal(readCountUpEvents(goal).length, 1);
});

test("undo reverses the last adjustment but keeps it in the history", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { id: "a", delta: 1 });
  goal = applyCountUpEvent(goal, { id: "b", delta: 3 });
  assert.equal(countUpValue(goal), 4);

  goal = undoLastCountUpEvent(goal);
  assert.equal(countUpValue(goal), 1, "the +3 no longer counts");
  assert.equal(readCountUpEvents(goal).length, 2, "but it is still on record");
  assert.ok(readCountUpEvents(goal).find((e) => e.id === "b").reversedAt);
});

test("undo steps back through the log, and stops at the beginning", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { id: "a", delta: 2 });
  goal = applyCountUpEvent(goal, { id: "b", delta: 2 });

  goal = undoLastCountUpEvent(goal);
  assert.equal(lastLiveCountUpEvent(goal).id, "a");
  goal = undoLastCountUpEvent(goal);
  assert.equal(countUpValue(goal), 0);
  assert.equal(lastLiveCountUpEvent(goal), null);

  const exhausted = undoLastCountUpEvent(goal);
  assert.equal(countUpValue(exhausted), 0);
});

test("an already-reversed event is not reversed twice", () => {
  let goal = countUpGoal({});
  goal = applyCountUpEvent(goal, { id: "a", delta: 5 });
  goal = undoLastCountUpEvent(goal);
  const again = undoLastCountUpEvent(goal);
  assert.equal(countUpValue(again), 0);
});

test("history survives a serialization round trip", () => {
  let goal = countUpGoal({ target: 15 });
  goal = applyCountUpEvent(goal, { id: "a", delta: 3, note: "conference" });
  goal = applyCountUpEvent(goal, { id: "b", delta: 1 });

  // This is what a page refresh does to the blob.
  const reloaded = JSON.parse(JSON.stringify(goal));
  assert.equal(countUpValue(reloaded), 4);
  assert.equal(countUpHistory(reloaded)[0].id, "b", "newest first");
  assert.equal(countUpHistory(reloaded)[1].note, "conference");
});

// ---- progress ----------------------------------------------------------

test("progress against a target is a capped fraction", () => {
  let goal = countUpGoal({ start: 0, target: 15 });
  assert.deepEqual(
    [countUpProgress(goal).fraction, countUpProgress(goal).complete],
    [0, false]
  );

  for (let i = 0; i < 7; i += 1) goal = applyCountUpEvent(goal, { delta: 1 });
  const mid = countUpProgress(goal);
  assert.equal(mid.value, 7);
  assert.ok(Math.abs(mid.fraction - 7 / 15) < 1e-9);
  assert.equal(mid.complete, false);
});

test("passing the target caps the bar but keeps the real value", () => {
  let goal = countUpGoal({ start: 0, target: 15 });
  goal = applyCountUpEvent(goal, { delta: 20 });
  const progress = countUpProgress(goal);
  assert.equal(progress.value, 20, "the actual count is not clipped");
  assert.equal(progress.fraction, 1, "but the bar stops at full");
  assert.equal(progress.complete, true);
});

test("an open-ended count reports no percentage at all", () => {
  let goal = countUpGoal({ start: 0, target: null });
  goal = applyCountUpEvent(goal, { delta: 9 });
  const progress = countUpProgress(goal);
  assert.equal(progress.value, 9);
  assert.equal(progress.target, null);
  assert.equal(progress.fraction, null, "no misleading percentage without a target");
  assert.equal(progress.openEnded, true);
});

test("a non-zero starting value is the baseline, not part of the progress", () => {
  let goal = countUpGoal({ start: 10, target: 20 });
  assert.equal(countUpValue(goal), 10);
  assert.equal(countUpProgress(goal).fraction, 0, "starting where you started is 0%");
  goal = applyCountUpEvent(goal, { delta: 5 });
  assert.equal(countUpProgress(goal).fraction, 0.5);
});

test("a malformed event log does not break the total", () => {
  const goal = {
    ...countUpGoal({ target: 15 }),
    countUpEvents: [
      { id: "ok", delta: 3 },
      { id: "bad", delta: "not a number" },
      null,
      { delta: 5 },
    ],
  };
  assert.equal(countUpValue(goal), 3);
});
