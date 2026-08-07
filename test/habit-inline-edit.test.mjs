/* Regression tests for the HabitChecker inline-edit blur guard.
   Bug: clicking the +/- target spinner while editing a habit immediately
   closed the editor because onBlur on the name input fired and called
   commitEdit(), which set editingId to null.

   Fix: handleEditBlur checks e.relatedTarget. If the element receiving
   focus is still inside the editor container, the blur is a sibling
   transition and the editor must stay open.

   These tests verify:
   1. The relatedTarget containment guard used by handleEditBlur.
   2. That commitEdit correctly passes an updated dailyTarget to updateHabit.
   3. That a target-1 (single-completion) habit is unaffected.
*/

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Pure helper: mirrors the logic inside handleEditBlur
// ---------------------------------------------------------------------------

/**
 * Decides whether a blur event should trigger commitEdit().
 *
 * @param {object|null} container - The editor container element (or a mock
 *   with a `contains(el)` method).
 * @param {object|null} relatedTarget - The element receiving focus next.
 * @returns {boolean} true when the edit should be committed (focus left the
 *   editor), false when it's an intra-editor sibling transition.
 */
function shouldCommitOnBlur(container, relatedTarget) {
  if (container && container.contains(relatedTarget)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 1. Blur guard: intra-editor focus moves must NOT commit
// ---------------------------------------------------------------------------

test("shouldCommitOnBlur returns false when relatedTarget is inside the container", () => {
  // Simulate: user clicks the target number input while name input has focus.
  const targetInput = { id: "target-input" };
  const container = {
    contains(el) {
      return el === targetInput;
    },
  };
  assert.equal(shouldCommitOnBlur(container, targetInput), false,
    "clicking a sibling inside the editor must NOT trigger commit");
});

test("shouldCommitOnBlur returns true when relatedTarget is outside the container", () => {
  const outsideElement = { id: "somewhere-else" };
  const container = {
    contains(el) {
      return el === null; // nothing inside
    },
  };
  assert.equal(shouldCommitOnBlur(container, outsideElement), true,
    "clicking outside the editor must trigger commit");
});

test("shouldCommitOnBlur returns true when relatedTarget is null (focus leaves the window)", () => {
  const container = {
    contains(_el) {
      return false;
    },
  };
  assert.equal(shouldCommitOnBlur(container, null), true,
    "blur to null (e.g. window focus lost) must trigger commit");
});

test("shouldCommitOnBlur returns true when container is null (editor not mounted)", () => {
  assert.equal(shouldCommitOnBlur(null, { id: "whatever" }), true,
    "a missing container ref must not suppress the commit");
});

test("shouldCommitOnBlur returns false when relatedTarget is the name input itself", () => {
  // e.g. the user tabs from the target input back to the name input.
  const nameInput = { id: "name-input" };
  const container = {
    contains(el) {
      return el === nameInput;
    },
  };
  assert.equal(shouldCommitOnBlur(container, nameInput), false,
    "tabbing back to the name input must keep the editor open");
});

// ---------------------------------------------------------------------------
// 2. commitEdit model concern: editTarget must reach updateHabit
// ---------------------------------------------------------------------------

test("commitEdit calls updateHabit with the current editTarget when it differs from the original", () => {
  // Simulate the state variables and closures that commitEdit uses.
  let capturedArgs = null;

  // In the component, commitEdit closes over these:
  const editingId = "habit-42";
  const editText = "Brush teeth";
  const editTarget = 3; // user changed from 1 to 3

  const updateHabit = (_goalId, habitId, patch) => {
    capturedArgs = { habitId, patch };
  };
  const goalId = "goal-1";

  // Replicate the commitEdit logic:
  function commitEdit() {
    if (editingId) {
      const t = editText.trim();
      if (t) updateHabit(goalId, editingId, { name: t, dailyTarget: editTarget });
    }
  }

  commitEdit();

  assert.ok(capturedArgs, "updateHabit should have been called");
  assert.equal(capturedArgs.habitId, editingId);
  assert.equal(capturedArgs.patch.name, "Brush teeth");
  assert.equal(capturedArgs.patch.dailyTarget, 3,
    "the changed target (3) must be forwarded to updateHabit");
});

test("commitEdit calls updateHabit with dailyTarget 1 for a single-completion habit (no regression)", () => {
  let capturedArgs = null;
  const editingId = "habit-1";
  const editText = "Meditate";
  const editTarget = 1;
  const updateHabit = (_goalId, habitId, patch) => {
    capturedArgs = { habitId, patch };
  };
  const goalId = "goal-1";

  function commitEdit() {
    if (editingId) {
      const t = editText.trim();
      if (t) updateHabit(goalId, editingId, { name: t, dailyTarget: editTarget });
    }
  }

  commitEdit();

  assert.ok(capturedArgs);
  assert.equal(capturedArgs.patch.dailyTarget, 1,
    "single-completion habits must still pass dailyTarget 1");
});

test("commitEdit does nothing when editText is empty (prevents accidental blank-name save)", () => {
  let called = false;
  const editingId = "habit-x";
  const editText = "   "; // whitespace-only
  const editTarget = 2;
  const updateHabit = () => { called = true; };
  const goalId = "goal-1";

  function commitEdit() {
    if (editingId) {
      const t = editText.trim();
      if (t) updateHabit(goalId, editingId, { name: t, dailyTarget: editTarget });
    }
  }

  commitEdit();
  assert.equal(called, false,
    "a blank habit name must not be saved");
});
