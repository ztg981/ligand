import assert from "node:assert/strict";
import test from "node:test";
import {
  squishFrom,
  growFrom,
  clampGrow,
  panelTransform,
  SQUISH_SCALE,
} from "../src/hooks/useSquishResize.js";

/* The geometry behind dragging the Pomodoro scene's edges. The React plumbing
   needs a browser; these are the parts that decide how it BEHAVES, and they're
   plain functions on purpose. */

test("pulling the right edge right grows the panel", () => {
  // 400px of slack, dragged 200px right → half of it taken up.
  assert.equal(growFrom(0, 200, 400, "right"), 0.5);
  // Dragging the right edge back left shrinks it again.
  assert.equal(growFrom(0.5, -200, 400, "right"), 0);
});

test("pulling the left edge LEFT grows it by the same amount", () => {
  // The sign flips: leftward travel on the left edge is growth, not shrinkage.
  assert.equal(growFrom(0, -200, 400, "left"), 0.5);
  assert.equal(growFrom(0.5, 200, 400, "left"), 0);
});

test("growth continues from where the panel already was", () => {
  assert.equal(growFrom(0.25, 200, 400, "right"), 0.75);
  // No slack at all can't be divided by — the panel just stays put.
  assert.equal(growFrom(0.4, 200, 0, "right"), 0.4);
});

test("only the overshoot is clamped away, and it is what squashes", () => {
  const raw = growFrom(0.9, 200, 400, "right"); // 1.4 — past full
  assert.ok(raw > 1);
  assert.equal(clampGrow(raw), 1);
  assert.ok(squishFrom((raw - 1) * 400) > 0, "pushing past full squashes");
  assert.equal(clampGrow(-0.3), 0);
});

test("squish is signed and eases toward a limit", () => {
  const right = squishFrom(SQUISH_SCALE);
  const left = squishFrom(-SQUISH_SCALE);
  assert.ok(right > 0 && left < 0);
  assert.equal(right, -left);
  // Doubling the shove does NOT double the squash, and it's bounded at 1 —
  // otherwise dragging to the edge of the screen would turn the panel into a
  // pancake instead of just showing resistance.
  assert.ok(squishFrom(SQUISH_SCALE * 2) < right * 2);
  assert.ok(squishFrom(Number.MAX_SAFE_INTEGER) <= 1);
});

test("a grown panel is re-centred toward the side being pulled", () => {
  // Growing rightward shifts the box right by half its growth, which is what
  // pins the LEFT edge in place.
  const right = panelTransform({ grow: 1, side: "right", narrowPx: 620 });
  assert.match(right, /translateX\(calc\(50% - 310px\)\)/);
  // Leftward is the mirror image.
  const left = panelTransform({ grow: 1, side: "left", narrowPx: 620 });
  assert.match(left, /translateX\(calc\(310px - 50%\)\)/);
  // At its natural width there is nothing to re-centre.
  assert.equal(panelTransform({ grow: 0, side: "right" }), "none");
});

test("squashing wider also makes it thinner", () => {
  const t = panelTransform({ grow: 0, squish: squishFrom(SQUISH_SCALE) });
  const sx = Number(/scaleX\(([\d.]+)\)/.exec(t)[1]);
  const sy = Number(/scaleY\(([\d.]+)\)/.exec(t)[1]);
  assert.ok(sx > 1, "stretches along the drag");
  assert.ok(sy < 1, "thins across it");
  // Magnitude drives the scale, so a leftward push squashes just as much.
  const mirror = panelTransform({ grow: 0, squish: squishFrom(-SQUISH_SCALE) });
  assert.equal(mirror, t);
});
