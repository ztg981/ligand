/* ============================================================
   Built-in exercise library
   ------------------------------------------------------------
   ~60 common movements grouped by muscle group. Pure data — no
   React, no storage. Used by the workout logger (searchable
   picker), the intelligent generator (filter by muscle group +
   available equipment), and progress tracking (group volume).

   Each exercise:
     { id, name, muscleGroup, equipment[], type, kind?, met?, instructions? }
   - muscleGroup: chest | back | shoulders | biceps | triceps |
                  legs | core | cardio | sport
   - type: "strength" (logged as reps × weight) or
           "cardio"   (logged as a duration)   ← kept for all the
           stats/generator code that branches on it.
   - kind: how the logger CAPTURES it (the thing that makes a run feel
           like a run, not a set of bench press):
       "strength" reps × weight, multiple sets      (default)
       "distance" distance + time → live pace       (run, ride, walk)
       "cardio"   duration + intensity              (row, swim, machines)
       "sport"    duration + intensity + score/note (basketball, tennis)
     Absent → derived from type (cardio→"cardio", else "strength").
   - met: metabolic-equivalent value at a moderate effort, used to
          estimate calories from duration + bodyweight (see
          lib/activityMetrics.js). Only carried by the activity kinds.
   - equipment tags (canonical, mapped from onboarding choices):
       barbell | dumbbell | cable | machine | bodyweight |
       cardio  | bands    | kettlebell
   ============================================================ */

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "core",
  "cardio",
];

// Human labels for the equipment multi-select, each mapped to the canonical
// equipment tags an exercise may carry. Additive: pick everything you have.
// Bodyweight movements are ALWAYS available (see availableTags) - bodyweight is
// never a selectable option, so "I have nothing" still yields a full session.
export const EQUIPMENT_OPTIONS = [
  { id: "pullup-bar", label: "Pull-up bar", tags: ["pullup"] },
  { id: "dumbbell", label: "Dumbbells", tags: ["dumbbell"] },
  { id: "barbell", label: "Barbell", tags: ["barbell"] },
  { id: "cable", label: "Cable machines", tags: ["cable", "machine"] },
  { id: "bands", label: "Resistance bands", tags: ["bands"] },
  { id: "kettlebell", label: "Kettlebells", tags: ["kettlebell"] },
  { id: "cardio", label: "Cardio machines", tags: ["cardio"] },
];

// Quick presets for the "what do you have today?" session selector, so someone
// at a hotel gym can switch their whole equipment set with one tap.
export const EQUIPMENT_PRESETS = [
  { id: "full-gym", label: "Full gym", equipment: ["pullup-bar", "dumbbell", "barbell", "cable", "bands", "kettlebell", "cardio"] },
  { id: "home", label: "Home", equipment: ["dumbbell", "bands", "pullup-bar"] },
  { id: "hotel", label: "Hotel gym", equipment: ["dumbbell", "cardio"] },
  { id: "bodyweight", label: "Bodyweight", equipment: [] },
];

const S = "strength";
const C = "cardio";

export const EXERCISES = [
  // ---- Chest -------------------------------------------------
  { id: "bench-press", name: "Bench Press", muscleGroup: "chest", equipment: ["barbell"], type: S, instructions: "Lower the bar to mid-chest with elbows ~45°, then press up." },
  { id: "incline-press", name: "Incline Press", muscleGroup: "chest", equipment: ["barbell", "dumbbell"], type: S, instructions: "Press on a 30–45° incline to bias the upper chest." },
  { id: "decline-press", name: "Decline Press", muscleGroup: "chest", equipment: ["barbell"], type: S },
  { id: "push-up", name: "Push-Up", muscleGroup: "chest", equipment: ["bodyweight"], type: S, instructions: "Keep a straight line head to heels; lower until elbows ~90°." },
  { id: "cable-fly", name: "Cable Fly", muscleGroup: "chest", equipment: ["cable"], type: S },
  { id: "dips", name: "Dips", muscleGroup: "chest", equipment: ["bodyweight"], type: S, instructions: "Lean forward slightly to bias the chest; lower under control." },
  { id: "chest-press-machine", name: "Chest Press Machine", muscleGroup: "chest", equipment: ["machine"], type: S },

  // ---- Back --------------------------------------------------
  { id: "pull-up", name: "Pull-Up", muscleGroup: "back", equipment: ["pullup"], type: S, instructions: "Pull your chest toward the bar; control the descent." },
  { id: "chin-up", name: "Chin-Up", muscleGroup: "back", equipment: ["pullup"], type: S },
  { id: "bent-over-row", name: "Bent-Over Row", muscleGroup: "back", equipment: ["barbell"], type: S, instructions: "Hinge ~45°, flat back, row to the lower ribs." },
  { id: "lat-pulldown", name: "Lat Pulldown", muscleGroup: "back", equipment: ["machine", "cable"], type: S },
  { id: "seated-row", name: "Seated Row", muscleGroup: "back", equipment: ["machine", "cable"], type: S },
  { id: "deadlift", name: "Deadlift", muscleGroup: "back", equipment: ["barbell"], type: S, instructions: "Brace hard, push the floor away, keep the bar close to the shins." },
  { id: "single-arm-row", name: "Single-Arm Row", muscleGroup: "back", equipment: ["dumbbell"], type: S },
  { id: "face-pull", name: "Face Pull", muscleGroup: "back", equipment: ["cable", "bands"], type: S },

  // ---- Shoulders ---------------------------------------------
  { id: "overhead-press", name: "Overhead Press", muscleGroup: "shoulders", equipment: ["barbell", "dumbbell"], type: S, instructions: "Press overhead without leaning back; squeeze glutes to stay braced." },
  { id: "lateral-raise", name: "Lateral Raise", muscleGroup: "shoulders", equipment: ["dumbbell", "cable"], type: S },
  { id: "front-raise", name: "Front Raise", muscleGroup: "shoulders", equipment: ["dumbbell"], type: S },
  { id: "arnold-press", name: "Arnold Press", muscleGroup: "shoulders", equipment: ["dumbbell"], type: S },
  { id: "rear-delt-fly", name: "Rear Delt Fly", muscleGroup: "shoulders", equipment: ["dumbbell", "cable"], type: S },
  { id: "shrug", name: "Shrug", muscleGroup: "shoulders", equipment: ["dumbbell", "barbell"], type: S },

  // ---- Biceps ------------------------------------------------
  { id: "barbell-curl", name: "Barbell Curl", muscleGroup: "biceps", equipment: ["barbell"], type: S },
  { id: "hammer-curl", name: "Hammer Curl", muscleGroup: "biceps", equipment: ["dumbbell"], type: S },
  { id: "incline-curl", name: "Incline Curl", muscleGroup: "biceps", equipment: ["dumbbell"], type: S },
  { id: "concentration-curl", name: "Concentration Curl", muscleGroup: "biceps", equipment: ["dumbbell"], type: S },
  { id: "cable-curl", name: "Cable Curl", muscleGroup: "biceps", equipment: ["cable"], type: S },
  { id: "preacher-curl", name: "Preacher Curl", muscleGroup: "biceps", equipment: ["barbell", "dumbbell", "machine"], type: S },

  // ---- Triceps -----------------------------------------------
  { id: "skull-crusher", name: "Skull Crusher", muscleGroup: "triceps", equipment: ["barbell", "dumbbell"], type: S },
  { id: "tricep-pushdown", name: "Tricep Pushdown", muscleGroup: "triceps", equipment: ["cable"], type: S },
  { id: "overhead-extension", name: "Overhead Extension", muscleGroup: "triceps", equipment: ["dumbbell", "cable"], type: S },
  { id: "close-grip-bench", name: "Close-Grip Bench", muscleGroup: "triceps", equipment: ["barbell"], type: S },
  { id: "triceps-dips", name: "Triceps Dips", muscleGroup: "triceps", equipment: ["bodyweight"], type: S, instructions: "Stay upright to bias the triceps; lower until elbows ~90°." },

  // ---- Legs --------------------------------------------------
  { id: "squat", name: "Squat", muscleGroup: "legs", equipment: ["barbell"], type: S, instructions: "Sit between your hips to at least parallel, chest tall, knees tracking toes." },
  { id: "front-squat", name: "Front Squat", muscleGroup: "legs", equipment: ["barbell"], type: S },
  { id: "leg-press", name: "Leg Press", muscleGroup: "legs", equipment: ["machine"], type: S },
  { id: "romanian-deadlift", name: "Romanian Deadlift", muscleGroup: "legs", equipment: ["barbell", "dumbbell"], type: S, instructions: "Push hips back with soft knees; feel the hamstring stretch, then drive up." },
  { id: "leg-curl", name: "Leg Curl", muscleGroup: "legs", equipment: ["machine"], type: S },
  { id: "leg-extension", name: "Leg Extension", muscleGroup: "legs", equipment: ["machine"], type: S },
  { id: "calf-raise", name: "Calf Raise", muscleGroup: "legs", equipment: ["machine", "dumbbell", "bodyweight"], type: S },
  { id: "bulgarian-split-squat", name: "Bulgarian Split Squat", muscleGroup: "legs", equipment: ["dumbbell", "bodyweight"], type: S },
  { id: "hip-thrust", name: "Hip Thrust", muscleGroup: "legs", equipment: ["barbell"], type: S },
  { id: "walking-lunge", name: "Walking Lunge", muscleGroup: "legs", equipment: ["dumbbell", "bodyweight"], type: S },
  { id: "goblet-squat", name: "Goblet Squat", muscleGroup: "legs", equipment: ["dumbbell", "kettlebell"], type: S },
  { id: "step-up", name: "Step-Up", muscleGroup: "legs", equipment: ["dumbbell", "bodyweight"], type: S },
  { id: "kettlebell-swing", name: "Kettlebell Swing", muscleGroup: "legs", equipment: ["kettlebell"], type: S, instructions: "Hinge and snap the hips to float the bell to chest height; it's a hinge, not a squat." },

  // ---- Core --------------------------------------------------
  { id: "plank", name: "Plank", muscleGroup: "core", equipment: ["bodyweight"], type: S, instructions: "Brace as if bracing for a punch; don't let the hips sag." },
  { id: "crunch", name: "Crunch", muscleGroup: "core", equipment: ["bodyweight"], type: S },
  { id: "leg-raise", name: "Leg Raise", muscleGroup: "core", equipment: ["bodyweight"], type: S },
  { id: "russian-twist", name: "Russian Twist", muscleGroup: "core", equipment: ["bodyweight", "dumbbell"], type: S },
  { id: "ab-wheel", name: "Ab Wheel", muscleGroup: "core", equipment: ["bodyweight"], type: S },
  { id: "bicycle-crunch", name: "Bicycle Crunch", muscleGroup: "core", equipment: ["bodyweight"], type: S },
  { id: "mountain-climber", name: "Mountain Climber", muscleGroup: "core", equipment: ["bodyweight"], type: S },

  // ---- Cardio -------------------------------------------------
  // Distance kind: logged as distance + time, with a live pace readout —
  // the metrics a runner/cyclist actually cares about (never "sets").
  { id: "running", name: "Running", muscleGroup: "cardio", equipment: ["cardio", "bodyweight"], type: C, kind: "distance", met: 9.8 },
  { id: "cycling", name: "Cycling", muscleGroup: "cardio", equipment: ["cardio"], type: C, kind: "distance", met: 7.5 },
  { id: "walking", name: "Walking", muscleGroup: "cardio", equipment: ["bodyweight"], type: C, kind: "distance", met: 3.8 },
  { id: "hiking", name: "Hiking", muscleGroup: "cardio", equipment: ["bodyweight"], type: C, kind: "distance", met: 6.0 },
  // Duration kind: time + how hard it felt (intensity), plus a calorie estimate.
  { id: "rowing", name: "Rowing", muscleGroup: "cardio", equipment: ["cardio"], type: C, kind: "cardio", met: 7.0 },
  { id: "swimming", name: "Swimming", muscleGroup: "cardio", equipment: ["cardio"], type: C, kind: "cardio", met: 8.0 },
  { id: "jump-rope", name: "Jump Rope", muscleGroup: "cardio", equipment: ["bodyweight"], type: C, kind: "cardio", met: 12.3 },
  { id: "stairmaster", name: "Stairmaster", muscleGroup: "cardio", equipment: ["cardio"], type: C, kind: "cardio", met: 9.0 },
  { id: "elliptical", name: "Elliptical", muscleGroup: "cardio", equipment: ["cardio"], type: C, kind: "cardio", met: 5.0 },
  { id: "hiit", name: "HIIT", muscleGroup: "cardio", equipment: ["bodyweight", "cardio"], type: C, kind: "cardio", met: 8.0 },
  { id: "burpee", name: "Burpee", muscleGroup: "cardio", equipment: ["bodyweight"], type: C, kind: "cardio", met: 8.0 },

  // ---- Sports -------------------------------------------------
  // muscleGroup "sport" is deliberately NOT in MUSCLE_GROUPS: the gym
  // generator iterates those groups (and picks cardio finishers), and
  // "Tennis 3×8" is not a workout it should ever suggest. Sports log what you
  // actually played: how long, how hard, and (if it's your thing) the score.
  { id: "tennis", name: "Tennis", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 7.3 },
  { id: "basketball", name: "Basketball", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 6.5 },
  { id: "soccer", name: "Soccer", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 7.0 },
  { id: "volleyball", name: "Volleyball", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 4.0 },
  { id: "badminton", name: "Badminton", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 5.5 },
  { id: "pickleball", name: "Pickleball", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 5.5 },
  { id: "table-tennis", name: "Table Tennis", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 4.0 },
  { id: "golf", name: "Golf", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 4.8 },
  { id: "skating", name: "Skating", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 7.0 },
  { id: "skiing", name: "Skiing / Snowboarding", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 7.0 },
  { id: "martial-arts", name: "Martial Arts / Boxing", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 10.0 },
  { id: "climbing", name: "Climbing", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 8.0 },
  { id: "dance", name: "Dance", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 5.0 },
  { id: "yoga", name: "Yoga / Stretching", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 3.0 },
  { id: "baseball", name: "Baseball / Softball", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 5.0 },
  { id: "football", name: "Football", muscleGroup: "sport", equipment: ["bodyweight"], type: C, kind: "sport", met: 8.0 },
];

// Sports subset, for the quick "log a sport" chips on the Workout tab.
export const SPORTS = EXERCISES.filter((e) => e.muscleGroup === "sport");

// Fast lookup by id.
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export function findExercise(id) {
  return BY_ID.get(id) || null;
}

// The logging KIND for an exercise — how the logger should capture it.
// Accepts either a library entry or a logged workout-exercise (which may carry
// its own resolved `kind`, or just a `type`). Falls back gracefully so old
// history (no kind) and custom exercises still render sensibly.
export function exerciseKind(ex) {
  if (!ex) return "strength";
  if (ex.kind) return ex.kind;
  const lib = ex.exerciseId ? BY_ID.get(ex.exerciseId) : null;
  if (lib?.kind) return lib.kind;
  return ex.type === "cardio" ? "cardio" : "strength";
}

// True when this exercise is logged as reps × weight sets.
export function isStrengthKind(ex) {
  return exerciseKind(ex) === "strength";
}

// The MET (metabolic equivalent) for an exercise, for calorie estimates.
export function exerciseMET(ex) {
  if (!ex) return null;
  if (typeof ex.met === "number") return ex.met;
  const lib = ex.exerciseId ? BY_ID.get(ex.exerciseId) : null;
  return typeof lib?.met === "number" ? lib.met : null;
}

// Group labels for muscle groups (title-cased for headings).
export const MUSCLE_LABEL = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  core: "Core",
  cardio: "Cardio",
  sport: "Sports",
};

// All exercises in a muscle group.
export function exercisesByGroup(group) {
  return EXERCISES.filter((e) => e.muscleGroup === group);
}

// Resolve a fitness profile's equipment selection to a set of canonical tags.
// Bodyweight is always included so bodyweight movements are never filtered out.
export function availableTags(selectedIds = []) {
  const tags = new Set(["bodyweight"]);
  EQUIPMENT_OPTIONS.forEach((opt) => {
    if (selectedIds.includes(opt.id)) opt.tags.forEach((t) => tags.add(t));
  });
  return tags;
}

// Can this exercise be performed with the available equipment tags?
export function exerciseAvailable(exercise, tagSet) {
  if (!exercise?.equipment?.length) return true;
  return exercise.equipment.some((t) => tagSet.has(t));
}

// Case-insensitive name search across the library, optionally limited.
export function searchExercises(query, limit = 40) {
  const q = (query || "").trim().toLowerCase();
  const list = q
    ? EXERCISES.filter((e) => e.name.toLowerCase().includes(q))
    : EXERCISES;
  return list.slice(0, limit);
}
