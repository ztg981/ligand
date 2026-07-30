import assert from "node:assert/strict";
import test from "node:test";
import {
  squishFrom,
  squishTransform,
  snapTarget,
  SQUISH_SCALE,
} from "../src/hooks/useSquishResize.js";

/* The geometry behind grab-and-drag resizing of the Pomodoro scene. The React
   plumbing needs a browser; these are the parts that decide how it FEELS, and
   they're plain functions on purpose. */

test("no overshoot means no deformation", () => {
  assert.equal(squishFrom(0), 0);
  assert.equal(squishTransform(squishFrom(0)), "none");
});

test("squish is signed and eases toward a limit", () => {
  const right = squishFrom(SQUISH_SCALE);
  const left = squishFrom(-SQUISH_SCALE);
  assert.ok(right > 0 && left < 0);
  assert.equal(right, -left); // symmetric

  // Doubling the shove does NOT double the squash, and it's bounded at 1 —
  // otherwise dragging to the edge of the screen would turn the panel into a
  // pancake instead of just showing resistance.
  assert.ok(squishFrom(SQUISH_SCALE * 2) < right * 2);
  assert.ok(squishFrom(SQUISH_SCALE * 20) <= 1);
  assert.ok(squishFrom(Number.MAX_SAFE_INTEGER) <= 1);
});

test("squashing wider also makes it thinner", () => {
  const t = squishTransform(squishFrom(SQUISH_SCALE));
  const sx = Number(/scaleX\(([\d.]+)\)/.exec(t)[1]);
  const sy = Number(/scaleY\(([\d.]+)\)/.exec(t)[1]);
  assert.ok(sx > 1, "stretches along the drag");
  assert.ok(sy < 1, "thins across it");
  // Leans in the direction of the drag rather than merely inflating.
  assert.ok(t.includes("translateX("));
  assert.ok(!t.startsWith("translateX(-"));
});

test("pushing left leans and stretches the other way", () => {
  const t = squishTransform(squishFrom(-SQUISH_SCALE));
  assert.ok(t.startsWith("translateX(-"));
  // Magnitude is what drives the scale, so a leftward push squashes too.
  assert.ok(Number(/scaleX\(([\d.]+)\)/.exec(t)[1]) > 1);
});

test("release settles to whichever end is nearer", () => {
  assert.equal(snapTarget(700, 620, 1200), false); // still near narrow
  assert.equal(snapTarget(1000, 620, 1200), true); // past halfway → wide
  assert.equal(snapTarget(910, 620, 1200), false); // exactly halfway stays put
  // No room to grow into: never claims to be wide.
  assert.equal(snapTarget(620, 620, 620), false);
});
