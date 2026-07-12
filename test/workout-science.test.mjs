import { test } from "node:test";
import assert from "node:assert/strict";
import {
  epley1RM,
  exerciseBest1RM,
  warmupRamp,
  setsPerMuscleWeek,
  workoutVolume,
  exercisePR,
} from "../src/lib/model.js";

// ---- epley1RM ----

test("epley: single rep is the max itself", () => {
  assert.equal(epley1RM(225, 1), 225);
});

test("epley: 135x10 estimates ~180", () => {
  assert.equal(epley1RM(135, 10), 180);
});

test("epley: invalid inputs return null", () => {
  assert.equal(epley1RM(0, 5), null);
  assert.equal(epley1RM(100, 0), null);
  assert.equal(epley1RM(null, 5), null);
});

// ---- exerciseBest1RM ----

const HISTORY = [
  {
    date: "2026-07-10",
    exercises: [
      {
        exerciseId: "bench",
        muscleGroup: "chest",
        type: "strength",
        sets: [
          { done: true, weight: 140, reps: 3 }, // e1RM 154
          { done: true, weight: 135, reps: 10 }, // e1RM 180 ← best
          { done: true, weight: 60, reps: 10, warmup: true }, // ignored
          { done: false, weight: 200, reps: 5 }, // not done → ignored
        ],
      },
    ],
  },
];

test("best e1RM picks the higher-estimate set, not the heavier raw weight", () => {
  const b = exerciseBest1RM(HISTORY, "bench");
  assert.equal(b.e1rm, 180);
  assert.equal(b.weight, 135);
  assert.equal(b.reps, 10);
});

test("warm-up sets never count toward e1RM or weight PR", () => {
  const only = [
    {
      date: "2026-07-10",
      exercises: [
        {
          exerciseId: "squat",
          sets: [{ done: true, weight: 300, reps: 5, warmup: true }],
        },
      ],
    },
  ];
  assert.equal(exerciseBest1RM(only, "squat"), null);
  assert.equal(exercisePR(only, "squat"), null);
});

// ---- warmupRamp ----

test("standard ramp for 225 lbs: 90x10, 135x6, 180x3", () => {
  assert.deepEqual(warmupRamp(225, "lbs"), [
    { weight: 90, reps: 10 },
    { weight: 135, reps: 6 },
    { weight: 180, reps: 3 },
  ]);
});

test("kg ramp rounds to 2.5 kg plates", () => {
  const ramp = warmupRamp(100, "kg");
  assert.deepEqual(ramp, [
    { weight: 40, reps: 10 },
    { weight: 60, reps: 6 },
    { weight: 80, reps: 3 },
  ]);
});

test("light working weights get a shorter, sane ramp", () => {
  const ramp = warmupRamp(20, "lbs"); // 40% = 8 → below 10-lb floor, dropped
  assert.ok(ramp.every((s) => s.weight >= 10 && s.weight < 20));
});

test("no ramp for zero or missing weight", () => {
  assert.deepEqual(warmupRamp(0), []);
  assert.deepEqual(warmupRamp(null), []);
});

// ---- setsPerMuscleWeek ----

test("counts working sets per muscle inside the 7-day window", () => {
  const workouts = [
    {
      date: "2026-07-12",
      exercises: [
        {
          muscleGroup: "chest",
          type: "strength",
          sets: [
            { done: true, weight: 100, reps: 8 },
            { done: true, weight: 100, reps: 8 },
            { done: true, weight: 50, reps: 10, warmup: true }, // excluded
            { done: false }, // excluded
          ],
        },
        { muscleGroup: "legs", type: "cardio", sets: [{ done: true }] }, // cardio excluded
      ],
    },
    {
      date: "2026-07-08",
      exercises: [
        { muscleGroup: "chest", type: "strength", sets: [{ done: true, weight: 95, reps: 8 }] },
      ],
    },
    {
      date: "2026-06-20", // outside window
      exercises: [
        { muscleGroup: "back", type: "strength", sets: [{ done: true, weight: 95, reps: 8 }] },
      ],
    },
  ];
  const counts = setsPerMuscleWeek(workouts, "2026-07-12");
  assert.deepEqual(counts, { chest: 3 });
});

// ---- volume excludes warm-ups ----

test("workoutVolume ignores warm-up sets", () => {
  const w = {
    exercises: [
      {
        sets: [
          { done: true, weight: 100, reps: 10 }, // 1000
          { done: true, weight: 50, reps: 10, warmup: true }, // 0
        ],
      },
    ],
  };
  assert.equal(workoutVolume(w), 1000);
});
