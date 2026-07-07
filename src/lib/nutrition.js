/* Gentle, additive-only nutrition nudges. Rules, not judgments: suggestions
   only ever ADD something (a veg, a protein source, water) and never tell
   anyone to eat less, skip, or compensate. Returns one line or null. */
export function fuelSuggestion({ meals = [], water = 0, hour = 12, trainedToday = false }) {
  const tags = new Set(meals.flatMap((m) => m.tags || []));
  if (meals.length === 0 && hour >= 11) {
    return "Nothing logged yet. Even noting a quick breakfast counts.";
  }
  if (trainedToday && !tags.has("protein") && meals.length > 0) {
    return "Training day: a protein source with your next meal supports recovery.";
  }
  if (meals.length > 0 && !tags.has("veg") && !tags.has("fruit") && hour >= 15) {
    return "A fruit or veg with your next meal would round today out nicely.";
  }
  if (water < 3 && hour >= 15) {
    return "Water check: a glass now is an easy win.";
  }
  return null;
}
