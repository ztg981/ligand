import { test } from "node:test";
import assert from "node:assert/strict";
import { GOAL_COLORS, nextGoalColor, createGoal } from "../src/lib/model.js";

/* Every goal used to fall back to one hardcoded blue, so a dashboard of five
   goals was five identical dots. These cover the assignment that fixed it. */

test("each new goal takes a colour the others aren't using", () => {
  const goals = [];
  for (let i = 0; i < GOAL_COLORS.length; i++) {
    goals.push({ color: nextGoalColor(goals) });
  }
  const used = goals.map((g) => g.color);
  assert.equal(new Set(used).size, GOAL_COLORS.length, "all distinct");
  assert.deepEqual(used, GOAL_COLORS, "and they come out in palette order");
});

test("it fills gaps left by deleted goals rather than marching past them", () => {
  // Goals 0 and 2 remain; the next one should reuse the free slot at index 1.
  const goals = [{ color: GOAL_COLORS[0] }, { color: GOAL_COLORS[2] }];
  assert.equal(nextGoalColor(goals), GOAL_COLORS[1]);
});

test("it avoids a hue that merely LOOKS like one already in use", () => {
  // The pre-fix default blue differs from the palette blue only in chroma, so
  // exact-match avoidance would hand back a dot the eye reads as identical.
  const legacyBlue = "oklch(0.62 0.10 245)";
  const picked = nextGoalColor([{ color: legacyBlue }]);
  assert.notEqual(picked, GOAL_COLORS[0], "not the near-identical blue");
  const hue = Number(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/.exec(picked)[1]);
  assert.ok(Math.abs(hue - 245) >= 25, `hue ${hue} is far enough from 245`);
});

test("a full palette still yields a colour instead of undefined", () => {
  // Every hue is spoken for, so separation is impossible — it must still
  // return something usable rather than leaving a goal with no dot.
  const goals = GOAL_COLORS.map((color) => ({ color }));
  assert.ok(GOAL_COLORS.includes(nextGoalColor(goals)));
});

test("past the end of the palette it cycles instead of returning nothing", () => {
  const goals = GOAL_COLORS.map((color) => ({ color }));
  const next = nextGoalColor(goals);
  assert.ok(GOAL_COLORS.includes(next), "still a palette colour");
});

test("goals without colours in the list don't break the pick", () => {
  assert.equal(nextGoalColor([{ color: null }, {}, undefined]), GOAL_COLORS[0]);
  assert.equal(nextGoalColor([]), GOAL_COLORS[0]);
});

test("an explicit colour is always respected", () => {
  const custom = "oklch(0.5 0.2 200)";
  assert.equal(createGoal({ name: "x", color: custom }).color, custom);
});
