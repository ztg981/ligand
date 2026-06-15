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
export const GOAL_TYPES = { BUILT_IN: "built-in", CUSTOM: "custom" };
export const GOAL_STATUS = { ACTIVE: "active", DONE: "done", ARCHIVED: "archived" };
export const TASK_LABELS = ["Today", "Urgent", "General"]; // per-goal names added at runtime
export const TASK_TERMS = { SHORT: "short", LONG: "long" };

// ---- date helpers ----------------------------------------------
// Dates are stored as local "YYYY-MM-DD" strings to avoid timezone drift.
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
export function createGoal({
  name,
  type = GOAL_TYPES.CUSTOM,
  color,
  smartFields = {},
  deadline = null,
} = {}) {
  return {
    id: uid("goal"),
    name: name || "New goal",
    type,
    color: color || "oklch(0.62 0.10 245)",
    // Free-form SMART fields (specific / measurable / achievable / relevant / timebound)
    smartFields,
    habits: [],
    reflections: [],
    deadline,
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
} = {}) {
  return {
    id: uid("task"),
    text: text || "",
    label,
    goalId,
    term,
    repeat,
    done: false,
    completedOn: null, // YYYY-MM-DD a recurring task was last completed
    createdAt: todayKey(),
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
export function createHabit({ name, cadence = "daily" } = {}) {
  return {
    id: uid("habit"),
    name: name || "New habit",
    cadence, // "daily" | "weekly"
    checkIns: [], // array of "YYYY-MM-DD" strings
    createdAt: todayKey(),
  };
}

export function createReflection({ text, prompt = null, mood = null } = {}) {
  return {
    id: uid("refl"),
    text: text || "",
    prompt,
    mood,
    createdAt: new Date().toISOString(),
  };
}

// "What I'm proud of" — counts UP from a start date, forgiving by design.
export function createCountUp({ label, startDate = todayKey() } = {}) {
  return { id: uid("count"), label: label || "Day counter", startDate };
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

// ---- seed ------------------------------------------------------
// First-run data: the built-in Productivity goal plus two starter goals.
// Stable ids keep the nav goal-pills consistent across reloads.
// Exposed so the sync layer can tell pristine sample goals apart from
// goals the user actually created (see hasMeaningfulLocalData).
export const SEED_GOAL_IDS = ["productivity", "side-hustles", "college"];
export function seedData() {
  const productivity = {
    ...createGoal({
      name: "Productivity",
      type: GOAL_TYPES.BUILT_IN,
      color: "oklch(0.62 0.10 245)",
    }),
    id: "productivity",
  };
  const side = {
    ...createGoal({ name: "Side Hustles", color: "oklch(0.7 0.12 165)" }),
    id: "side-hustles",
  };
  const college = {
    ...createGoal({ name: "College Planning", color: "oklch(0.62 0.10 290)" }),
    id: "college",
  };
  return {
    version: 1,
    goals: [productivity, side, college],
    tasks: [],
    countUps: [createCountUp({ label: "Days showing up", startDate: todayKey() })],
    journal: [], // app-wide reflections (per-goal reflections live on each goal)
  };
}
