/* ============================================================
   Ligand data model
   ------------------------------------------------------------
   Pure data shapes + helpers. No React, no localStorage here —
   just factories and small functions the store hook builds on.

   Design notes that matter for ADHD-friendliness:
   - Habits are FORGIVING. We only ever record the days you DID
     check in. We never write a "miss", so a gap is just absence
     of data — never a failure, never shaming.
   - Streaks PAUSE instead of shattering: not opening the app today
     does not zero your streak.
   - The "What I'm proud of" count-up simply counts elapsed days
     since a start date, so nothing can reset it.
   ============================================================ */

// Simple unique id — fine for local-only, single-user data.
export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ---- constants -------------------------------------------------
export const GOAL_TYPES = { BUILT_IN: "built-in", CUSTOM: "custom", RECOVERY: "recovery", FITNESS: "fitness" };
export const GOAL_STATUS = { ACTIVE: "active", DONE: "done", ARCHIVED: "archived" };
export const TASK_LABELS = ["Today", "Urgent", "General"]; // per-goal names added at runtime
export const TASK_TERMS = { SHORT: "short", LONG: "long" };

// ---- fitness constants -----------------------------------------
export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];
// Primary training focus. "loseweight" biases toward higher reps + cardio in
// the generator; the others map to conventional rep ranges.
export const FITNESS_GOAL_TYPES = ["strength", "hypertrophy", "endurance", "loseweight", "general"];
export const WEIGHT_UNITS = ["lbs", "kg"];
// Sets per exercise suggested by experience level (used by the generator).
export const SETS_BY_LEVEL = { beginner: 3, intermediate: 4, advanced: 5 };

/* ---- date helpers ----------------------------------------------
   Dates are stored as local "YYYY-MM-DD" strings to avoid timezone drift.

   THE DAY DOESN'T END AT MIDNIGHT.

   Someone still up at 1am is still having Tuesday, and checking off a habit
   then should land on Tuesday — not silently open Wednesday and break a
   streak they were in the middle of keeping. So the logical day rolls over at
   a cutoff hour (4am by default) rather than at 00:00.

   The cutoff applies ONLY when nobody says which date they mean:

     todayKey()   "what day is it right now"      → cutoff applied
     todayKey(d)  "what calendar day is this Date" → cutoff NOT applied

   That distinction is load-bearing. shiftDay, weeklyWorkoutStreak and a dozen
   widgets all normalize an already-parsed midnight Date through todayKey(d);
   shifting those back four hours would move every one of them to the previous
   day and quietly corrupt history everywhere. Callers that hold a real "now"
   and want the logical day should use activeDayKey(now) instead. */
export const DEFAULT_DAY_CUTOFF_HOUR = 4;
export const MAX_DAY_CUTOFF_HOUR = 12;

export function normalizeDayCutoffHour(hour) {
  // Number(null) and Number("") are both 0, which would silently read as a
  // deliberate midnight rollover. Absent means absent: fall back to default.
  if (hour === null || hour === undefined || hour === "") {
    return DEFAULT_DAY_CUTOFF_HOUR;
  }
  const value = Number(hour);
  if (!Number.isFinite(value)) return DEFAULT_DAY_CUTOFF_HOUR;
  return Math.min(MAX_DAY_CUTOFF_HOUR, Math.max(0, Math.round(value)));
}

/* The active cutoff, as a module-level value.

   model.js is deliberately React-free and is imported by pure helpers that
   have no way to reach a hook, so the preference is pushed in from App once
   settings load rather than threaded through every call site. Until then the
   default applies, which is also what guests and tests get. */
let dayCutoffHour = DEFAULT_DAY_CUTOFF_HOUR;

export function setDayCutoffHour(hour) {
  dayCutoffHour = normalizeDayCutoffHour(hour);
  return dayCutoffHour;
}

export function getDayCutoffHour() {
  return dayCutoffHour;
}

/**
 * The logical day an instant belongs to.
 *
 * Anything before the cutoff still counts as the previous day, so 1am Tuesday
 * night reads as Tuesday, and 4am Wednesday reads as Wednesday.
 */
export function activeDayKey(now = new Date(), cutoffHour = dayCutoffHour) {
  const shifted = new Date(now.getTime());
  // setHours (not a millisecond subtraction) so the shift stays correct
  // across a daylight-saving boundary.
  shifted.setHours(shifted.getHours() - normalizeDayCutoffHour(cutoffHour));
  return calendarDayKey(shifted);
}

/** The plain calendar date of a Date, with no cutoff applied. */
export function calendarDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(d) {
  return d === undefined ? activeDayKey(new Date()) : calendarDayKey(d);
}
export function daysBetween(aKey, bKey) {
  const a = new Date(aKey + "T00:00:00");
  const b = new Date(bKey + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
export function shiftDay(dayKey, delta) {
  const d = new Date(dayKey + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return todayKey(d);
}

/* Is this a goal the user can still act on?

   Archiving is what Ligand's delete button does — the record stays so the
   recycle bin can undo it — so "not archived" is the test for every surface
   that lists goals. Written once here because getting it wrong is invisible:
   the extension checked a `goal.archived` field that nothing has ever set,
   so its filter silently passed everything through for as long as it existed.
   A goal marked done is finished, not gone, and still counts. */
export function isActiveGoal(goal) {
  return (goal?.status || GOAL_STATUS.ACTIVE) !== GOAL_STATUS.ARCHIVED;
}

export function goalTargetDate(goal) {
  return goal?.smartFields?.timeBound || goal?.deadline || null;
}

export function isGoalOverdue(goal, refKey = todayKey()) {
  const target = goalTargetDate(goal);
  if (!target || goal?.status === GOAL_STATUS.ARCHIVED) return false;
  if (goal.overdueSnoozedUntil && goal.overdueSnoozedUntil >= refKey) return false;
  return target < refKey;
}

// ---- factories -------------------------------------------------
/* Goal dot colours.

   Every goal used to fall back to the same blue, so a dashboard of five goals
   was five identical dots and the colour carried no information at all. These
   are spread around the hue wheel at a common lightness/chroma so they stay
   distinguishable from each other without any one shouting. */
export const GOAL_COLORS = [
  "oklch(0.62 0.13 245)", // blue
  "oklch(0.64 0.14 150)", // green
  "oklch(0.68 0.15 55)", // amber
  "oklch(0.60 0.15 300)", // violet
  "oklch(0.64 0.12 195)", // teal
  "oklch(0.63 0.16 15)", // rose
  "oklch(0.66 0.14 105)", // lime
  "oklch(0.60 0.14 270)", // indigo
  "oklch(0.64 0.15 340)", // pink
  "oklch(0.66 0.13 75)", // ochre
];

/** The hue angle out of an oklch(...) string, or null if it isn't one. */
function hueOf(color) {
  const m = /oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i.exec(color || "");
  return m ? Number(m[1]) : null;
}

/** Shortest distance between two hue angles, in degrees (0–180). */
function hueGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * A dot colour that reads as distinct from the goals already in play.
 *
 * Exact-match avoidance isn't enough: the old default blue and the palette's
 * blue differ only in chroma, so "unused" colours could still look identical
 * on screen. This keeps a minimum hue separation, which is what the eye
 * actually reads, and only falls back to a plain unused colour (then to
 * cycling) when the palette runs out of room.
 */
export function nextGoalColor(goals = [], minHueGap = 25) {
  const used = (goals || []).map((g) => g?.color).filter(Boolean);
  const usedSet = new Set(used);
  const usedHues = used.map(hueOf).filter((h) => h != null);

  const distinct = GOAL_COLORS.find((c) => {
    if (usedSet.has(c)) return false;
    const h = hueOf(c);
    return h == null || usedHues.every((u) => hueGap(h, u) >= minHueGap);
  });
  if (distinct) return distinct;

  const free = GOAL_COLORS.find((c) => !usedSet.has(c));
  return free || GOAL_COLORS[used.length % GOAL_COLORS.length];
}

export function createGoal({
  name,
  type = GOAL_TYPES.CUSTOM,
  color,
  smartFields = {},
  deadline = null,
  recoveryData = null,
} = {}) {
  return {
    id: uid("goal"),
    name: name || "New goal",
    type,
    // Callers that care (recovery, fitness) pass a colour; everyone else gets
    // one assigned by addGoal, which can see the goals already in play.
    color: color || GOAL_COLORS[0],
    // Free-form SMART fields (specific / measurable / achievable / relevant / timebound)
    smartFields,
    habits: [],
    reflections: [],
    deadline,
    // Recovery goals store their private data here:
    // { startDate, label, why, milestonesReached: [days...] }
    recoveryData,
    status: GOAL_STATUS.ACTIVE,
    createdAt: todayKey(),
  };
}

export function createTask({
  text,
  label = "General",
  goalId = null,
  term = TASK_TERMS.SHORT,
  repeat = null, // null | { type: "daily" } | { type: "weekly", weekday: 0-6 }
  scheduledFor = null,
  assistantPrivate = false,
  // The Chrome tab group this task is worked in, set from the browser
  // extension: { title, color }. Keyed by the group's human identity because
  // Chrome's numeric group ids do not survive a browser restart.
  tabGroup = null,
} = {}) {
  const now = new Date().toISOString();
  return {
    id: uid("task"),
    text: text || "",
    label,
    goalId,
    term,
    repeat,
    scheduledFor,
    tabGroup,
    assistantPrivate: Boolean(assistantPrivate),
    done: false,
    completedOn: null, // YYYY-MM-DD a recurring task was last completed
    version: 0, // assigned by the authoritative task-record RPC after sync
    createdAt: todayKey(),
    updatedAt: now,
  };
}

// ---- recurring tasks -------------------------------------------
// A recurring task never disappears: when its next occurrence arrives it
// quietly flips back to not-done. The "anchor" is the start of the current
// occurrence (today for daily; the most recent matching weekday for weekly).
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function recurringAnchor(repeat, refKey = todayKey()) {
  if (!repeat || repeat.type === "daily") return refKey;
  if (repeat.type === "weekly") {
    const dow = new Date(refKey + "T00:00:00").getDay();
    const back = (dow - repeat.weekday + 7) % 7;
    return shiftDay(refKey, -back);
  }
  return refKey;
}

// True when a completed recurring task has rolled into a new occurrence and
// should reset to not-done.
export function recurringResetDue(task, refKey = todayKey()) {
  if (!task?.repeat || !task.done || !task.completedOn) return false;
  return task.completedOn < recurringAnchor(task.repeat, refKey);
}

export function repeatLabel(repeat) {
  if (!repeat) return null;
  if (repeat.type === "daily") return "Repeats daily";
  if (repeat.type === "weekly") return `Repeats every ${WEEKDAY_SHORT[repeat.weekday]}`;
  return null;
}

// Forgiving habit: checkIns holds only completed days. Never a "miss".
/* Habits can need doing more than once a day ("brush teeth", target 3).

   The storage keeps TWO views on purpose, and which is authoritative matters:

     occurrences  {day: {count, target, at[]}} — the full record. Each day
                  snapshots the target that was in force THAT day, so raising
                  the target later cannot retroactively turn completed days
                  into partial ones.
     checkIns     the days where count reached target — i.e. fully completed
                  days, and nothing else.

   checkIns keeping exactly its old meaning is what makes this safe to ship:
   currentStreak, the calendar heatmaps, goalHealth and dayWins all read it
   and all stay correct without being touched. A habit with target 1 behaves
   precisely as it always did. */
export const MIN_HABIT_DAILY_TARGET = 1;
export const MAX_HABIT_DAILY_TARGET = 20;

export function normalizeHabitDailyTarget(target) {
  const value = Number(target);
  if (!Number.isFinite(value)) return MIN_HABIT_DAILY_TARGET;
  return Math.min(MAX_HABIT_DAILY_TARGET, Math.max(MIN_HABIT_DAILY_TARGET, Math.round(value)));
}

export function createHabit({
  name,
  cadence = "daily",
  dailyTarget = MIN_HABIT_DAILY_TARGET,
  unitLabel = null,
} = {}) {
  return {
    id: uid("habit"),
    name: name || "New habit",
    cadence, // "daily" | "weekly"
    dailyTarget: normalizeHabitDailyTarget(dailyTarget),
    // What one occurrence is called ("brushes", "glasses"). Display only.
    unitLabel: unitLabel || null,
    checkIns: [], // days the daily target was fully met
    occurrences: {}, // day -> { count, target, at: [ISO] }
    createdAt: todayKey(),
  };
}

export function createReflection({
  text,
  prompt = null,
  mood = null,
  location = null,
  geo = null,
  attachments = [],
  media = [],
} = {}) {
  return {
    id: uid("refl"),
    text: text || "",
    prompt,
    mood,
    // Optional resolved place name (e.g. "Costco Wholesale, Brooklyn").
    location,
    // Optional { lat, lon }, rounded to ~11 m — only so the journal map can
    // plot the entry. Absent on entries written before the map existed, and
    // on any entry saved without a location.
    geo,
    // Optional image attachments: [{ id, dataUrl }]. Ride the sync blob.
    attachments,
    // Voice notes / clips: [{ id, kind, mime, durationMs, size }]. Only the
    // REFERENCE lives here — the blob itself is in IndexedDB (see
    // lib/mediaStore.js), because base64 media would blow the localStorage
    // budget the sync blob has to fit inside.
    media,
    createdAt: new Date().toISOString(),
  };
}

// A mood check-in belongs to the day, not to a journal entry. Multiple
// check-ins are intentional: they let the user record a real change in how
// the day feels without needing to create another reflection.
export function createMoodCheckIn({
  mood,
  date = todayKey(),
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id: uid("mood"),
    mood,
    date,
    createdAt,
  };
}

// A lightweight song log entry - "what I was listening to", not a player.
// `date` (YYYY-MM-DD) is what same-day journal surfacing matches on;
// `createdAt` is the full timestamp, used to break ties when several songs
// share a date.
export function createSong({
  title,
  artist,
  album = null,
  mood = null,
  note = null,
  artworkUrl = null, // small album-art thumbnail from the iTunes lookup
  journalEntryId = null,
  date = todayKey(),
} = {}) {
  return {
    id: uid("song"),
    title: title || "",
    artist: artist || "",
    album,
    mood,
    note,
    artworkUrl,
    journalEntryId,
    date,
    createdAt: new Date().toISOString(),
  };
}

// "What I'm proud of" — counts UP from a start date, forgiving by design.
export function createCountUp({ label, startDate = todayKey() } = {}) {
  return { id: uid("count"), label: label || "Day counter", startDate };
}

// Notes — a frictionless plain-text scratchpad. No structure, no prompts;
// the first line acts as the title. createdAt/updatedAt are full ISO
// timestamps so we can sort newest-first and show a relative time.
export function createNote({ text = "" } = {}) {
  const now = new Date().toISOString();
  return { id: uid("note"), text, createdAt: now, updatedAt: now };
}

// A photo-scan alarm. To dismiss it you must photograph a specific object (the
// stored targetPhoto), which forces you out of bed to wherever that object is.
// days: array of weekdays it repeats on (Mon=0..Sun=6); empty = every day.
// Only fires while the app is open (browsers can't wake a sleeping device).
export function createAlarm({
  label = "Alarm",
  time = "07:00", // HH:MM, 24h
  days = [], // [] = daily; otherwise Mon=0..Sun=6
  targetPhoto = null, // data URL of the object to scan
  targetLabel = "", // what the object is ("bathroom sink")
  threshold = 70, // % similarity required to dismiss
  enabled = true,
} = {}) {
  return {
    id: uid("alarm"),
    label,
    time,
    days,
    targetPhoto,
    targetLabel,
    threshold,
    enabled,
    lastFired: null, // "YYYY-MM-DD" of the last day this alarm fired
    createdAt: new Date().toISOString(),
  };
}

// ---- fitness / workout factories -------------------------------
// The user's training profile, set during the fitness-goal onboarding. One
// per app (there's a single lifter). null until onboarding completes.
export function createFitnessProfile({
  experienceLevel = "beginner",
  availableEquipment = ["bodyweight"],
  goalType = "general", // strength | hypertrophy | endurance | general
  workoutDaysPerWeek = 3,
  weightUnit = "lbs",
  distanceUnit = null, // "mi" | "km"; null → follow weightUnit (lbs→mi, kg→km)
} = {}) {
  return {
    experienceLevel,
    availableEquipment,
    goalType,
    workoutDaysPerWeek,
    weightUnit,
    distanceUnit: distanceUnit || (weightUnit === "kg" ? "km" : "mi"),
    // Optional user-entered body stats over time: { date, weight, bodyFat? }.
    bodyStats: [],
    // Default rest between sets (seconds); cardio gets a shorter default.
    restStrengthSec: 90,
    restCardioSec: 30,
    // Weekly training split, planned on desktop: { 0: ["chest","triceps"], ... }
    // keyed Mon=0..Sun=6. Empty/absent day = rest. Read on mobile for the
    // "ready for the gym" cue.
    weeklyPlan: {},
    createdAt: todayKey(),
  };
}

// A single logged effort within an exercise. What it carries depends on the
// exercise's logging kind (see lib/exercises.js `exerciseKind`):
//   strength  reps + weight
//   distance  distance + durationSec  (pace is derived, not stored)
//   cardio    durationSec + intensity
//   sport     durationSec + intensity (+ the parent exercise's note/score)
// `done` flips true when ticked mid-workout. Extra fields are null when unused,
// so a strength set and a run set share the same shape harmlessly.
export function createSet({
  reps = null,
  weight = null,
  durationSec = null,
  distance = null, // in the profile's distance unit (mi/km), as entered
  intensity = null, // "light" | "moderate" | "hard" | "allout"
  done = false,
  warmup = false,
} = {}) {
  // warmup sets ramp you up to the working weight; they're excluded from
  // volume, PRs and set-count stats (only working sets drive progress math).
  return { id: uid("set"), reps, weight, durationSec, distance, intensity, done, warmup };
}

// One exercise inside a workout session: a snapshot of the library entry
// (so renames/removals from the library never orphan history) plus its sets.
export function createWorkoutExercise({
  exerciseId,
  name,
  muscleGroup = "other",
  type = "strength",
  kind = null, // logging kind: strength | distance | cardio | sport (null → derive)
  sets = [],
  restSec = null, // per-exercise rest override; null = profile default
  notes = null, // short user note ("felt heavy", "seat at 4", "won 21-18")
} = {}) {
  return {
    id: uid("wex"),
    exerciseId: exerciseId || null,
    name: name || "Exercise",
    muscleGroup,
    type,
    kind,
    sets: sets.length ? sets : [createSet()],
    restSec,
    notes,
  };
}

// A logged (or in-progress) workout session.
export function createWorkout({
  date = todayKey(),
  type = "strength", // strength | cardio | mixed
  exercises = [],
  durationSec = 0,
  notes = "",
  goalId = null,
  templateId = null,
} = {}) {
  return {
    id: uid("workout"),
    date,
    type,
    exercises,
    durationSec,
    notes,
    goalId,
    templateId,
    createdAt: new Date().toISOString(),
  };
}

// A saved routine the user can start from. Its exercises are *plans*
// (target sets/reps/weight), not logged sets.
export function createWorkoutTemplate({
  name = "My routine",
  type = "strength",
  exercises = [],
  goalId = null,
} = {}) {
  return {
    id: uid("tmpl"),
    name,
    type,
    // Each: { exerciseId, name, muscleGroup, type, targetSets, targetReps, targetWeight? }
    exercises,
    goalId,
    createdAt: todayKey(),
  };
}

// A workout planned for a specific calendar date — one dated instance,
// distinct from a template (reusable) and from a logged workout (history).
// Created by scheduling an import/template/built plan; completing it links
// the logged session via completedWorkoutId.
export function createScheduledWorkout({
  date = todayKey(),
  name = "Workout",
  exercises = [], // plan shape: { exerciseId, name, muscleGroup, type, targetSets, targetReps, targetWeight, targetMinutes, restSec, notes }
  templateId = null,
  notes = "",
  // Which fitness goal this session is FOR. Null means unassigned, which is
  // what every session planned before this field existed stays — there is no
  // reliable way to infer the goal after the fact, and guessing would file
  // somebody's history under the wrong heading.
  goalId = null,
} = {}) {
  const now = new Date().toISOString();
  return {
    id: uid("sched"),
    date, // YYYY-MM-DD
    name,
    exercises,
    templateId,
    notes,
    goalId,
    status: "planned", // planned | done | skipped
    completedWorkoutId: null,
    createdAt: now,
    updatedAt: now,
  };
}

// A timed block on the day dial. start/end are MINUTES from local midnight
// (end > start). Blocks can link back to the record they schedule (a task,
// habit, workout instance) so completing one completes the other.
export function createDayBlock({
  date = todayKey(),
  start = 9 * 60,
  end = 10 * 60,
  title = "Block",
  category = "focus", // see BLOCK_CATEGORIES in lib/dayPlanner.js
  protected: isProtected = false,
  done = false,
  linkType = null, // null | "task" | "habit" | "workout"
  linkId = null,
  notes = "",
  seriesId = null, // shared by every materialized occurrence of a repeat
  repeat = null, // the rule that created the series (for display/editing)
} = {}) {
  const now = new Date().toISOString();
  return {
    id: uid("blk"),
    date,
    start: Math.max(0, Math.min(24 * 60, Math.round(start))),
    /* Up to 48h, not 24. A block that runs past midnight is stored with its
       end carrying on past 1440 (11pm–1am is 1380 → 1500; see the header of
       lib/dayPlanner.js), so clamping to a single day here silently truncated
       every late-night block back to finishing at midnight. */
    end: Math.max(1, Math.min(48 * 60, Math.round(end))),
    title,
    category,
    protected: Boolean(isProtected),
    done: Boolean(done),
    linkType,
    linkId,
    notes,
    seriesId,
    repeat,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// A logged activity — the universal "what did I just do?" record. Covers
// everything the dedicated logs don't: sports, games, scrolling, chores,
// people time, rest. `feel` describes what the time did FOR YOU (energized /
// drained), never a moral judgment; there is no "wasted time" state anywhere
// in this model. Duration + endTime are both optional — "I played tennis"
// with no numbers is a perfectly good log.
export function createActivity({
  title = "",
  category = "other", // see ACTIVITY_CATEGORIES in lib/activities.js
  date = todayKey(),
  endTime = null, // "HH:MM" — defaults to now at the call site
  durationMin = null,
  feel = null, // see FEELS in lib/activities.js
  note = "",
  linkType = null, // null | "workout" (the record this activity mirrors)
  linkId = null,
  goalId = null, // focus logs can credit a goal's worked time
} = {}) {
  const now = new Date();
  return {
    id: uid("act"),
    title,
    category,
    date,
    endTime:
      endTime ||
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    durationMin: durationMin != null && durationMin > 0 ? Math.round(durationMin) : null,
    feel,
    note,
    linkType,
    linkId,
    goalId,
    createdAt: now.toISOString(),
  };
}

// A logged meal — deliberately gentle: no calories, no macros, no “good/bad”
// foods. Balance is captured as simple tags the user taps; suggestions built
// on them stay supportive (add a veg, remember water), never restrictive.
export const MEAL_TAGS = ["protein", "veg", "fruit", "grain", "dairy", "treat"];
export function createMeal({
  name = "Meal",
  date = todayKey(),
  time = null, // "HH:MM" — defaults to now at the call site
  tags = [],
  notes = "",
} = {}) {
  const now = new Date();
  return {
    id: uid("meal"),
    name,
    date,
    time:
      time ||
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    tags: tags.filter((t) => MEAL_TAGS.includes(t)),
    notes,
    createdAt: now.toISOString(),
  };
}

// ---- workout helpers -------------------------------------------
// Total volume (weight × reps summed over completed strength sets) for a
// session. Cardio sets contribute no volume. Used for the session summary,
// the "Volume King" badge, and per-exercise progress.
export function workoutVolume(workout) {
  if (!workout?.exercises) return 0;
  let total = 0;
  workout.exercises.forEach((ex) => {
    (ex.sets || []).forEach((s) => {
      // Warm-up ramps don't count toward working volume.
      if (s.done && !s.warmup && s.weight && s.reps) total += s.weight * s.reps;
    });
  });
  return total;
}

// Count of completed sets across a session.
export function completedSetCount(workout) {
  if (!workout?.exercises) return 0;
  return workout.exercises.reduce(
    (n, ex) => n + (ex.sets || []).filter((s) => s.done).length,
    0
  );
}

// Best (heaviest) completed set weight for an exercise id across a history of
// workouts. Returns { weight, reps } or null. Basis for personal records.
export function exercisePR(workouts, exerciseId) {
  let best = null;
  (workouts || []).forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach((s) => {
        if (s.done && !s.warmup && s.weight != null) {
          if (!best || s.weight > best.weight) best = { weight: s.weight, reps: s.reps };
        }
      });
    });
  });
  return best;
}

// ---- estimated one-rep max (e1RM) --------------------------------
// Epley formula: weight × (1 + reps/30). The standard the big gym loggers
// (Strong, Hevy) use to compare sets at different rep counts on one scale.
// A single rep IS the max; zero/invalid inputs return null.
export function epley1RM(weight, reps) {
  if (!weight || weight <= 0 || !reps || reps <= 0) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Best estimated 1RM for an exercise across history (working sets only).
// Returns { e1rm, weight, reps, date } or null. This can rise even when the
// raw weight PR doesn't — doing 135×10 beats 140×3 on this scale, which is
// exactly why lifters track it.
export function exerciseBest1RM(workouts, exerciseId) {
  let best = null;
  (workouts || []).forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach((s) => {
        if (!s.done || s.warmup) return;
        const e = epley1RM(s.weight, s.reps);
        if (e != null && (!best || e > best.e1rm)) {
          best = { e1rm: e, weight: s.weight, reps: s.reps, date: w.date };
        }
      });
    });
  });
  return best;
}

// ---- warm-up ramp -------------------------------------------------
// Progressive warm-up sets for a working weight (the Hevy/Strong pattern):
// ~40%×10, ~60%×6, ~80%×3, rounded to real plate increments (5 lbs / 2.5 kg).
// Steps that round below a meaningful load are dropped, so light working
// weights get a shorter ramp instead of silly 10-pound "sets".
export function warmupRamp(workingWeight, unit = "lbs") {
  if (!workingWeight || workingWeight <= 0) return [];
  const inc = unit === "kg" ? 2.5 : 5;
  const steps = [
    { pct: 0.4, reps: 10 },
    { pct: 0.6, reps: 6 },
    { pct: 0.8, reps: 3 },
  ];
  const out = [];
  for (const st of steps) {
    const w = Math.round((workingWeight * st.pct) / inc) * inc;
    if (w >= inc * 2 && w < workingWeight) out.push({ weight: w, reps: st.reps });
  }
  return out;
}

// ---- weekly training volume by muscle group -----------------------
// Completed working sets per muscle group in the rolling 7-day window.
// Set count per muscle per week is the volume metric hypertrophy research
// actually uses (the usual growth guideline is ~10–20 sets/muscle/week).
export function setsPerMuscleWeek(workouts, refKey = todayKey()) {
  const cutoff = shiftDay(refKey, -6);
  const counts = {};
  (workouts || []).forEach((w) => {
    if (!w.date || w.date < cutoff || w.date > refKey) return;
    (w.exercises || []).forEach((ex) => {
      if (ex.type === "cardio") return;
      const g = ex.muscleGroup || "other";
      const n = (ex.sets || []).filter((s) => s.done && !s.warmup).length;
      if (n > 0) counts[g] = (counts[g] || 0) + n;
    });
  });
  return counts;
}

// How many distinct calendar weeks (Mon-anchored ISO-ish) had >=1 workout,
// counting consecutively backward from the current week — a workout streak
// in weeks. Used for the "Streak Builder" badge and the fitness tab.
export function weeklyWorkoutStreak(workouts, refKey = todayKey()) {
  if (!workouts?.length) return 0;
  const weekStart = (key) => {
    const d = new Date(key + "T00:00:00");
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    return todayKey(d);
  };
  const weeksWithWorkout = new Set(workouts.map((w) => weekStart(w.date)));
  let streak = 0;
  let cursor = weekStart(refKey);
  while (weeksWithWorkout.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -7);
  }
  return streak;
}

// Workouts falling in the current rolling 7-day window (incl. today).
export function workoutsThisWeek(workouts, refKey = todayKey()) {
  const cutoff = shiftDay(refKey, -6);
  return (workouts || []).filter((w) => w.date >= cutoff && w.date <= refKey);
}

// The most recent PRIOR performance of an exercise: from the newest earlier
// session that contained it, the heaviest completed set (or, for cardio, the
// longest). Powers the "Last time: 135 × 8" reference in the gym so you always
// know what to beat. Returns { date, weight, reps, durationSec } or null.
export function lastExercisePerformance(workouts, exerciseId, beforeDate = null) {
  if (!exerciseId) return null;
  // Newest first.
  const sorted = [...(workouts || [])].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );
  for (const w of sorted) {
    if (beforeDate && w.date >= beforeDate) continue;
    let best = null;
    (w.exercises || []).forEach((ex) => {
      if (ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach((s) => {
        if (!s.done) return;
        if (ex.type === "cardio") {
          if (s.durationSec && (!best || s.durationSec > (best.durationSec || 0)))
            best = { date: w.date, durationSec: s.durationSec };
        } else if (s.weight != null) {
          if (!best || s.weight > best.weight)
            best = { date: w.date, weight: s.weight, reps: s.reps };
        }
      });
    });
    if (best) return best;
  }
  return null;
}

// Plate math: given a target total weight, the bar, and the unit, return the
// plates to load PER SIDE (largest first). The single most-loved feature of a
// gym logger — no mental arithmetic under the bar. Returns { perSide: number[],
// leftover: number } where leftover is any weight that can't be made from
// standard plates (odd micro-loading). null when the weight is below the bar.
const PLATES = {
  lbs: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};
export function platesFor(totalWeight, unit = "lbs", barWeight = null) {
  const bar = barWeight ?? (unit === "kg" ? 20 : 45);
  const w = Number(totalWeight) || 0;
  if (w < bar) return null;
  let perSideWeight = (w - bar) / 2;
  const perSide = [];
  for (const p of PLATES[unit] || PLATES.lbs) {
    while (perSideWeight >= p - 1e-9) {
      perSide.push(p);
      perSideWeight -= p;
    }
  }
  return { perSide, leftover: Math.round(perSideWeight * 100) / 100, bar };
}

// A rough time estimate (minutes) for a planned/seeded session, from set count
// and rest defaults. Used for the in-gym session overview ("~45 min").
export function estimateWorkoutMinutes(exercises, restStrengthSec = 90) {
  const totalSets = (exercises || []).reduce(
    (n, ex) => n + (ex.sets?.length || 0),
    0
  );
  // ~35s working time per set + the configured rest, plus a small setup buffer.
  const secs = totalSets * (35 + restStrengthSec) + (exercises?.length || 0) * 30;
  return Math.max(5, Math.round(secs / 60));
}

// ---- habit helpers (forgiving) ---------------------------------
export function isCheckedOn(habit, dayKey = todayKey()) {
  return habit?.checkIns?.includes(dayKey) ?? false;
}

// Toggle a day's check-in on/off. Removing a check-in is allowed
// (a correction), but we never auto-write a missed day.
export function toggleCheckIn(habit, dayKey = todayKey()) {
  const has = isCheckedOn(habit, dayKey);
  const checkIns = has
    ? habit.checkIns.filter((d) => d !== dayKey)
    : [...habit.checkIns, dayKey].sort();
  return { ...habit, checkIns };
}

// Streak that PAUSES rather than shatters. We count consecutive recorded
// days ending today; if today isn't checked yet we look back from
// yesterday, so an un-opened "today" never zeroes the streak.
export function currentStreak(habit, refKey = todayKey()) {
  if (!habit?.checkIns?.length) return 0;
  const set = new Set(habit.checkIns);
  let streak = 0;
  let cursor = set.has(refKey) ? refKey : shiftDay(refKey, -1);
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

// ---- count-up helper -------------------------------------------
export function daysSince(startDate, refKey = todayKey()) {
  return Math.max(0, daysBetween(startDate, refKey));
}

// ---- entry timestamp formatting --------------------------------
// Full, legible date + time for journal/reflection entries, e.g.
// "Jun 14, 2026 · 9:42 AM". Falls back gracefully on bad input.
export function formatEntryDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

// ---- seed ------------------------------------------------------
// First-run data: no goals — the intro tour walks a brand-new user through
// creating their first one. Exposed so the sync layer can tell pristine
// sample data apart from goals the user actually created (see
// hasMeaningfulLocalData).
export const SEED_GOAL_IDS = [];
export function seedData() {
  return {
    version: 1,
    goals: [],
    tasks: [],
    // No seeded count-up: "Days showing up" is now a real distinct-active-days
    // metric (ligand.activeDays), not an elapsed-days count-up. Users can still
    // add their own count-ups ("No gaming", etc.) from the goal-tab widget.
    countUps: [],
    journal: [], // app-wide reflections (per-goal reflections live on each goal)
    moodLog: [], // day-level mood check-ins; several are allowed in one day
    notes: [], // frictionless plain-text scratchpad (see Notes tab)
    alarms: [], // photo-scan alarms (see Alarms in Settings)
    // Fitness / workout system. All start empty; a fitnessProfile is created
    // when the user makes their first Fitness goal and finishes onboarding.
    workouts: [], // logged sessions
    workoutTemplates: [], // saved routines
    scheduledWorkouts: [], // dated planned instances (see createScheduledWorkout)
    fitnessProfile: null,
    meals: [], // gentle nutrition log (see createMeal)
    waterLog: {}, // date -> glasses count
    dayBlocks: [], // timed day-dial blocks (see createDayBlock)
    activities: [], // universal "what did I just do?" log (see createActivity)
    songLog: [], // lightweight "what I was listening to" log (see Journal tab)
  };
}
