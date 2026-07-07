import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkoutText, sanitizeImportedExercises } from "../src/lib/workoutParser.js";

test("deterministic workout parser handles common shorthand", () => {
  const { exercises } = parseWorkoutText("bench 3x8 @ 135, rest 90s\n20 min treadmill");
  assert.equal(exercises.length, 2);
  assert.equal(exercises[0].name.toLowerCase(), "bench");
  assert.equal(exercises[0].targetSets, 3);
  assert.equal(exercises[0].targetReps, 8);
  assert.equal(exercises[0].targetWeight, 135);
  assert.equal(exercises[0].restSec, 90);
  assert.equal(exercises[1].type, "cardio");
});

test("imported exercises strip markup and clamp unsafe values", () => {
  const { exercises, dropped } = sanitizeImportedExercises([
    {
      name: "<img src=x onerror=alert(1)>Squat",
      muscleGroup: "legs",
      type: "strength",
      targetSets: 999,
      targetReps: -5,
      targetWeight: 5000,
      restSec: 9999,
      notes: "<script>alert(1)</script>felt heavy",
    },
    { name: "", type: "strength" },
  ]);

  assert.equal(exercises.length, 1);
  assert.equal(dropped, 1);
  assert.equal(exercises[0].name, "Squat");
  assert.equal(exercises[0].targetSets, 20);
  assert.equal(exercises[0].targetReps, 1);
  assert.equal(exercises[0].targetWeight, 2000);
  assert.equal(exercises[0].restSec, 900);
  assert.equal(exercises[0].notes, "felt heavy");
});
