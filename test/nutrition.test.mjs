import assert from "node:assert/strict";
import test from "node:test";
import { fuelSuggestion } from "../src/lib/nutrition.js";

test("suggestions are additive-only and context-aware", () => {
  // Nothing logged by late morning → gentle logging nudge.
  assert.match(fuelSuggestion({ meals: [], hour: 12 }), /counts/i);
  // Early morning, nothing logged → stay quiet (no nagging at 7am).
  assert.equal(fuelSuggestion({ meals: [], hour: 8 }), null);
  // Training day without protein → suggest ADDING protein.
  const meal = { tags: ["grain"] };
  assert.match(
    fuelSuggestion({ meals: [meal], hour: 12, trainedToday: true }),
    /protein/i
  );
  // Afternoon with no produce → suggest ADDING fruit/veg.
  assert.match(fuelSuggestion({ meals: [meal], hour: 16 }), /fruit or veg/i);
  // Balanced day, hydrated → nothing to say.
  const balanced = { tags: ["protein", "veg"] };
  assert.equal(
    fuelSuggestion({ meals: [balanced], water: 5, hour: 16, trainedToday: true }),
    null
  );
});

test("no suggestion ever tells the user to eat less", () => {
  // Property check across a grid of states: output never contains
  // restrictive language.
  const banned = /\b(less|too much|cut|skip|avoid|shouldn't have|burn(?: off)?|calorie)/i;
  for (const hour of [8, 12, 16, 21]) {
    for (const trainedToday of [true, false]) {
      for (const meals of [[], [{ tags: [] }], [{ tags: ["treat", "treat"] }]]) {
        const s = fuelSuggestion({ meals, water: 0, hour, trainedToday });
        if (s) assert.doesNotMatch(s, banned, `hour=${hour} trained=${trainedToday}`);
      }
    }
  }
});
