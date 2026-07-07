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

test("technique cues become notes, never phantom exercises", () => {
  const { exercises } = parseWorkoutText("3 sets of lateral raises, slow and controlled");
  assert.equal(exercises.length, 1);
  assert.match(exercises[0].name.toLowerCase(), /lateral raises/);
  assert.equal(exercises[0].targetSets, 3);
  assert.match(exercises[0].notes, /slow and controlled/i);
});

test("RPE and cue phrases attach to the exercise they follow", () => {
  const a = parseWorkoutText("Squat 4 sets of 6, RPE 8").exercises;
  assert.equal(a.length, 1);
  assert.match(a[0].notes, /rpe 8/i);
  const b = parseWorkoutText("Lat pulldown 3x10, squeeze at the bottom").exercises;
  assert.equal(b.length, 1);
  assert.match(b[0].notes, /squeeze at the bottom/i);
});

test("weight requires a unit after at/with (never eats durations)", () => {
  const a = parseWorkoutText("Bench press 3x8 at 95 lb, rest 2 minutes").exercises;
  assert.equal(a[0].targetWeight, 95);
  assert.equal(a[0].restSec, 120);
  const b = parseWorkoutText("Warm up with 5 minutes on the bike").exercises;
  assert.equal(b.length, 1);
  assert.equal(b[0].type, "cardio");
  assert.equal(b[0].targetMinutes, 5);
  assert.equal(b[0].targetWeight, null);
  assert.match(b[0].notes, /warm.?up/i);
});

test("supersets expand to both movements with shared rounds", () => {
  const ex = parseWorkoutText("Superset curls and tricep pushdowns for 3 rounds").exercises;
  assert.equal(ex.length, 2);
  assert.equal(ex[0].targetSets, 3);
  assert.equal(ex[1].targetSets, 3);
  assert.match(ex[0].notes, /superset/i);
});

test("timed holds keep duration as a note and rounds as sets", () => {
  const ex = parseWorkoutText("Plank for 45 seconds, 3 rounds").exercises;
  assert.equal(ex.length, 1);
  assert.equal(ex[0].targetSets, 3);
  assert.match(ex[0].notes, /45s hold/i);
});

test("failure sets, unilateral cues, and cardio distance parse as notes", () => {
  const a = parseWorkoutText("Push-ups to failure, then rest 90 seconds").exercises;
  assert.equal(a.length, 1);
  assert.match(a[0].notes, /to failure/i);
  assert.equal(a[0].restSec, 90);
  const b = parseWorkoutText("Bulgarian split squat 3x8 each leg").exercises;
  assert.equal(b.length, 1);
  assert.match(b[0].notes, /each leg/i);
  const c = parseWorkoutText("Run 2 miles easy").exercises;
  assert.equal(c.length, 1);
  assert.equal(c[0].type, "cardio");
  assert.match(c[0].notes, /2 miles/i);
});
