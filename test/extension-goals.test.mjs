/* What the Chrome extension is allowed to see.

   The popup's goal picker was listing goals the user had deleted. Two faults
   stacked: App handed the bridge every goal including archived ones, and the
   bridge's own guard tested a `goal.archived` field that nothing in the app
   has ever written — archiving sets `status`. A filter that silently passes
   everything looks exactly like a filter that works, which is why this file
   exists. */
import assert from "node:assert/strict";
import test from "node:test";

import { GOAL_STATUS, GOAL_TYPES, createGoal, isActiveGoal } from "../src/lib/model.js";

/* The rule the extension applies, mirrored here so it can be asserted without
   standing up React. Kept in step with publicGoals in useExtensionBridge.js. */
const visibleToExtension = (goals) =>
  goals
    .filter((g) => g && isActiveGoal(g) && g.type !== GOAL_TYPES.RECOVERY)
    .map((g) => g.name);

test("archiving a goal is what deleting one does, and isActiveGoal knows it", () => {
  const goal = createGoal({ name: "Improve Chinese" });
  assert.equal(isActiveGoal(goal), true);
  assert.equal(isActiveGoal({ ...goal, status: GOAL_STATUS.ARCHIVED }), false);
});

test("a goal marked done is finished, not deleted, and stays visible", () => {
  assert.equal(isActiveGoal({ status: GOAL_STATUS.DONE }), true);
});

test("a goal written before status existed reads as active", () => {
  assert.equal(isActiveGoal({ id: "legacy", name: "College planning" }), true);
});

test("the extension never sees a deleted goal", () => {
  const goals = [
    { id: "a", name: "Research", status: "active" },
    { id: "b", name: "Improve Chinese", status: "archived" },
    { id: "c", name: "Side Hustles", status: "archived" },
    { id: "d", name: "College planning" },
  ];
  assert.deepEqual(visibleToExtension(goals), ["Research", "College planning"]);
});

test("the recovery tracker is never offered to a browser extension", () => {
  const goals = [
    { id: "a", name: "Research", status: "active" },
    { id: "r", name: "Recovery tracker", type: GOAL_TYPES.RECOVERY, status: "active" },
  ];
  assert.deepEqual(visibleToExtension(goals), ["Research"]);
});

test("the dead `archived` field is not what decides it", () => {
  // The old guard was `!g.archived`. Nothing sets that field, so this goal
  // would have sailed through; status is the thing that matters.
  assert.equal(isActiveGoal({ status: "archived", archived: false }), false);
  assert.equal(isActiveGoal({ archived: true }), true);
});

test("junk entries are dropped rather than crashing the picker", () => {
  assert.deepEqual(visibleToExtension([null, undefined, { id: "a", name: "Research" }]), [
    "Research",
  ]);
});
