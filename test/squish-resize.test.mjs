import assert from "node:assert/strict";
import test from "node:test";
import {
  growFrom,
  clampGrow,
  normalizeGrow,
  panelTransform,
} from "../src/hooks/useSquishResize.js";

/* Dragging the Pomodoro scene's edges. The React plumbing needs a browser;
   these are the parts that decide where the edges end up. */

test("pulling the right edge right grows the panel", () => {
  // 250px of slack on that side, dragged 125px right → half of it taken up.
  assert.equal(growFrom(0, 125, 250, "right"), 0.5);
  // Dragging the right edge back left shrinks it again.
  assert.equal(growFrom(0.5, -125, 250, "right"), 0);
});

test("pulling the left edge LEFT grows it by the same amount", () => {
  // The sign flips: leftward travel on the left edge is growth, not shrinkage.
  assert.equal(growFrom(0, -125, 250, "left"), 0.5);
  assert.equal(growFrom(0.5, 125, 250, "left"), 0);
});

test("growth continues from where that edge already was, and stops at the page", () => {
  assert.equal(growFrom(0.25, 125, 250, "right"), 0.75);
  assert.equal(growFrom(0.9, 999, 250, "right"), 1, "clamped at the page edge");
  assert.equal(growFrom(0.1, -999, 250, "right"), 0);
  // No slack at all can't be divided by — the panel just stays put.
  assert.equal(growFrom(0.4, 200, 0, "right"), 0.4);
});

test("the two edges are genuinely independent", () => {
  /* The old model stored one growth plus a side, so choosing the other side
     reset it to zero — stretching left visibly collapsed the right. Growth is
     now per-edge, and growFrom only ever returns the edge it was asked about. */
  const state = { left: 1, right: 0 };
  const nextRight = growFrom(state.right, 125, 250, "right");
  const after = { ...state, right: nextRight };
  assert.equal(after.left, 1, "the left edge is untouched by a right drag");
  assert.equal(after.right, 0.5);
});

test("a grown panel puts its edges where the growth says", () => {
  // Grown right only: shift right by half the growth, pinning the LEFT edge.
  assert.match(
    panelTransform({ left: 0, right: 1, narrowPx: 620 }),
    /translateX\(calc\(\(50% - 310px\) \* 1\.0000\)\)/
  );
  // Grown left only: the mirror image, pinning the RIGHT edge.
  assert.match(
    panelTransform({ left: 1, right: 0, narrowPx: 620 }),
    /translateX\(calc\(\(50% - 310px\) \* -1\.0000\)\)/
  );
  // Grown equally both ways it stays centred, so there is nothing to shift.
  assert.equal(panelTransform({ left: 1, right: 1 }), "none");
  assert.equal(panelTransform({ left: 0, right: 0 }), "none");
});

test("the transform never scales anything", () => {
  // The panel gets wider; the ring and digits inside must not be distorted.
  for (const v of [
    { left: 0, right: 1 },
    { left: 1, right: 0 },
    { left: 0.3, right: 0.9 },
    { left: 1, right: 1 },
  ]) {
    const t = panelTransform(v);
    assert.ok(!/scale/i.test(t), `no scaling in ${t}`);
  }
});

test("an unevenly grown panel leans toward the bigger side", () => {
  const t = panelTransform({ left: 0.5, right: 1, narrowPx: 620 });
  const k = Number(/\* (-?[\d.]+)\)/.exec(t)[1]);
  // (1 - 0.5) / 1.5
  assert.ok(Math.abs(k - 1 / 3) < 0.001);
});

test("clampGrow keeps a side inside its range", () => {
  assert.equal(clampGrow(-2), 0);
  assert.equal(clampGrow(5), 1);
  assert.equal(clampGrow("nonsense"), 0);
  assert.equal(clampGrow(0.42), 0.42);
});

test("the older single-side shape is read rather than discarded", () => {
  // Upgrading must not silently snap someone's panel back to narrow.
  assert.deepEqual(normalizeGrow({ grow: 0.6, side: "right" }), { left: 0, right: 0.6 });
  assert.deepEqual(normalizeGrow({ grow: 1, side: "left" }), { left: 1, right: 0 });
  assert.deepEqual(normalizeGrow({ left: 0.2, right: 0.8 }), { left: 0.2, right: 0.8 });
  assert.deepEqual(normalizeGrow(null), { left: 0, right: 0 });
  assert.deepEqual(normalizeGrow({ left: 9, right: -3 }), { left: 1, right: 0 });
});
