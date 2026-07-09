/* Starter routines — sensible, editable presets so "make me a plan" is one
   tap instead of a blank page. Names are canonical library names where
   possible (they get matched to real exerciseIds on add, so PR tracking
   works); everything is a TARGET the user reviews and edits, never advice. */

const ex = (name, targetSets, targetReps, extra = {}) => ({
  name,
  muscleGroup: "other", // filled in by library matching on add
  type: "strength",
  targetSets,
  targetReps,
  targetWeight: null,
  targetMinutes: null,
  restSec: null,
  notes: null,
  ...extra,
});

export const STARTER_ROUTINES = [
  {
    id: "push",
    name: "Push Day",
    desc: "Chest, shoulders, triceps",
    exercises: [
      ex("Bench Press", 4, 8, { restSec: 150 }),
      ex("Overhead Press", 3, 10),
      ex("Incline Dumbbell Press", 3, 10),
      ex("Lateral Raise", 3, 12, { notes: "slow and controlled" }),
      ex("Tricep Pushdown", 3, 12),
    ],
  },
  {
    id: "pull",
    name: "Pull Day",
    desc: "Back and biceps",
    exercises: [
      ex("Deadlift", 3, 5, { restSec: 180 }),
      ex("Lat Pulldown", 3, 10),
      ex("Bent Over Row", 3, 10),
      ex("Face Pull", 3, 15, { notes: "squeeze at the back" }),
      ex("Bicep Curl", 3, 12),
    ],
  },
  {
    id: "legs",
    name: "Leg Day",
    desc: "Quads, hamstrings, calves",
    exercises: [
      ex("Squat", 4, 6, { restSec: 180 }),
      ex("Romanian Deadlift", 3, 10),
      ex("Leg Press", 3, 12),
      ex("Bulgarian Split Squat", 3, 8, { notes: "each leg" }),
      ex("Calf Raise", 4, 15),
    ],
  },
  {
    id: "upper",
    name: "Upper Body",
    desc: "One-session upper split",
    exercises: [
      ex("Bench Press", 3, 8),
      ex("Bent Over Row", 3, 8),
      ex("Overhead Press", 3, 10),
      ex("Lat Pulldown", 3, 10),
      ex("Bicep Curl", 2, 12),
      ex("Tricep Pushdown", 2, 12),
    ],
  },
  {
    id: "fullbody",
    name: "Full Body Basics",
    desc: "3 compound lifts + core",
    exercises: [
      ex("Squat", 3, 8, { restSec: 150 }),
      ex("Bench Press", 3, 8, { restSec: 150 }),
      ex("Bent Over Row", 3, 8, { restSec: 150 }),
      ex("Plank", 3, null, { notes: "45s hold" }),
    ],
  },
  {
    id: "bodyweight",
    name: "Bodyweight Anywhere",
    desc: "No equipment needed",
    exercises: [
      ex("Push-Up", 3, 12),
      ex("Squat", 3, 15, { notes: "bodyweight" }),
      ex("Lunge", 3, 10, { notes: "each leg" }),
      ex("Plank", 3, null, { notes: "45s hold" }),
      ex("Glute Bridge", 3, 15),
    ],
  },
];
