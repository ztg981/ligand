import assert from "node:assert/strict";
import test from "node:test";
import {
  growFrom,
  clampGrow,
  normalizeGrow,
  panelTransform,
  velocityFrom,
  settleGrow,
  squishFrom,
  squishScale,
  FLICK_SPEED,
  MAGNET,
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

test("resizing alone never scales anything", () => {
  // The panel gets wider; the ring and digits must not be distorted by growth.
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

/* Squash, and the inverse the clock uses to sit still through it. */

test("pushing past a limit squashes, and the squash is bounded", () => {
  assert.equal(squishFrom(0), 0);
  assert.ok(squishFrom(160) > 0);
  assert.equal(squishFrom(-160), -squishFrom(160), "symmetric");
  assert.ok(squishFrom(160 * 2) < squishFrom(160) * 2, "eases toward a limit");
  assert.ok(squishFrom(Number.MAX_SAFE_INTEGER) <= 1);
});

test("a squashed panel stretches one way and thins the other", () => {
  const { sx, sy } = squishScale(1);
  assert.ok(sx > 1 && sy < 1);
  // Magnitude drives it, so a leftward push deforms identically.
  assert.deepEqual(squishScale(-1), { sx, sy });
  assert.deepEqual(squishScale(0), { sx: 1, sy: 1 });
});

test("the content's inverse exactly undoes the panel's squash", () => {
  // This is what lets the frame give way while the clock does not move.
  for (const s of [0.2, 0.6, 1]) {
    const { sx, sy } = squishScale(s);
    assert.ok(Math.abs(sx * (1 / sx) - 1) < 1e-12);
    assert.ok(Math.abs(sy * (1 / sy) - 1) < 1e-12);
  }
});

/* Letting go: throw it and it commits, place it and it tidies up. */

test("velocity is read from the last moments, not the whole drag", () => {
  // A drag that crawls then bolts must read as fast.
  const samples = [{ x: 0, t: 0 }, { x: 10, t: 400 }, { x: 110, t: 450 }];
  assert.ok(Math.abs(velocityFrom(samples) - 2) < 1e-9);
  assert.equal(velocityFrom([{ x: 0, t: 0 }]), 0, "one sample is no speed");
  assert.equal(velocityFrom([{ x: 0, t: 5 }, { x: 9, t: 5 }]), 0, "no time passed");
});

test("a flick commits to the end it was thrown toward", () => {
  const fast = FLICK_SPEED + 0.4;
  assert.equal(settleGrow(0.2, fast, "right"), 1, "thrown outward");
  assert.equal(settleGrow(0.8, -fast, "right"), 0, "thrown back");
  // On the LEFT edge, leftward travel is growth — the sign has to flip.
  assert.equal(settleGrow(0.2, -fast, "left"), 1);
  assert.equal(settleGrow(0.8, fast, "left"), 0);
});

test("a slow placement snaps onto the nearest stop within reach", () => {
  const slow = FLICK_SPEED / 4;
  assert.equal(settleGrow(1 - MAGNET / 2, slow, "right"), 1);
  assert.equal(settleGrow(MAGNET / 2, slow, "right"), 0);
  assert.equal(settleGrow(0.5 + MAGNET / 2, slow, "right"), 0.5, "the halfway stop");
  assert.equal(settleGrow(0.25 - MAGNET / 2, slow, "right"), 0.25, "quarters too");
  assert.equal(settleGrow(0.75 + MAGNET / 2, slow, "right"), 0.75);
});

test("the magnet takes the NEAREST stop, not the first one it checks", () => {
  const slow = FLICK_SPEED / 4;
  // 0.72 is within reach of 0.75 and nothing else; checking stops in order
  // must not let an earlier one claim it.
  assert.equal(settleGrow(0.72, slow, "right"), 0.75);
  assert.equal(settleGrow(0.28, slow, "right"), 0.25);
});

test("there is still room to rest between the stops", () => {
  // Dead centre between two stops is further than the magnet reaches, so a
  // deliberate placement there survives — this is a drag, not a stepper.
  const slow = FLICK_SPEED / 4;
  assert.equal(settleGrow(0.625, slow, "right"), 0.625);
  assert.equal(settleGrow(0.375, slow, "right"), 0.375);
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
