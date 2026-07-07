export const ACTIONS = Object.freeze([
  "goal-summary",
  "overdue-advice",
  "journal-prompt",
  "weekly_review",
  "import_workout",
  "recovery_insight",
]);

export const ACTION_SET = new Set(ACTIONS);

export const MAX_BODY_BYTES = 24_000;
export const MAX_NOTES_CHARS = 4_000;
export const MAX_TEXT_OUTPUT_CHARS = 1_200;
export const MAX_WORKOUT_OUTPUT_CHARS = 12_000;

const DAY_NAMES = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const IMPORT_MUSCLE_GROUPS = new Set([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "core",
  "cardio",
  "other",
]);

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export const RATE_LIMITS = Object.freeze({
  "goal-summary": { maxRequests: 60, windowSeconds: 60 * 60 },
  "overdue-advice": { maxRequests: 60, windowSeconds: 60 * 60 },
  "journal-prompt": { maxRequests: 60, windowSeconds: 60 * 60 },
  weekly_review: { maxRequests: 20, windowSeconds: 60 * 60 },
  import_workout: { maxRequests: 15, windowSeconds: 60 * 60 },
  recovery_insight: { maxRequests: 40, windowSeconds: 60 * 60 },
});

export function parseAllowedOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin, configuredOrigins = []) {
  if (!origin) return true;
  const allowed = configuredOrigins.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
  if (allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}

export function corsHeadersForOrigin(origin, configuredOrigins = []) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin, configuredOrigins)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function cleanText(value, maxLen) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    // eslint-disable-next-line no-control-regex -- stripping control chars is intentional.
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanDate(value) {
  return cleanText(value, 32);
}

// null/undefined/"" mean "not provided" and must return the fallback —
// Number(null) is 0, which would otherwise clamp to min (reps 1, rest 0).
function clampInt(value, min, max, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNum(value, min, max, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function list(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function sanitizeTasks(value, limit = 8) {
  return list(value, limit)
    .map((task) => ({
      text: cleanText(task?.text, 160),
      done: Boolean(task?.done),
    }))
    .filter((task) => task.text);
}

function sanitizeStringList(value, limit = 12, maxLen = 80) {
  return list(value, limit)
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean);
}

function sanitizeWeekdayCounts(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [day, count] of Object.entries(value)) {
    if (DAY_NAMES.has(day)) out[day] = clampInt(count, 0, 10_000, 0);
  }
  return out;
}

export function sanitizeContext(action, context) {
  if (!ACTION_SET.has(action)) {
    return { ok: false, error: "Invalid action provided." };
  }
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return { ok: false, error: "Context must be a JSON object." };
  }

  if (action === "goal-summary") {
    return {
      ok: true,
      context: {
        name: cleanText(context.name, 120) || "Untitled goal",
        targetDate: cleanDate(context.targetDate),
        tasks: sanitizeTasks(context.tasks, 8),
        habits: sanitizeStringList(context.habits, 12, 80),
      },
    };
  }

  if (action === "overdue-advice") {
    return {
      ok: true,
      context: {
        name: cleanText(context.name, 120) || "Untitled goal",
        targetDate: cleanDate(context.targetDate),
        activitySummary: cleanText(context.activitySummary, 600),
      },
    };
  }

  if (action === "journal-prompt") {
    return {
      ok: true,
      context: {
        name: cleanText(context.name, 120) || "Untitled goal",
        tasks: sanitizeTasks(context.tasks, 8),
      },
    };
  }

  if (action === "weekly_review") {
    return {
      ok: true,
      context: {
        activeGoals: sanitizeStringList(context.activeGoals, 12, 120),
        tasksDone: clampInt(context.tasksDone, 0, 5_000, 0),
        tasksTotal: clampInt(context.tasksTotal, 0, 5_000, 0),
        habitCheckInsThisWeek: clampInt(context.habitCheckInsThisWeek, 0, 10_000, 0),
        weekdayCheckIns: sanitizeWeekdayCounts(context.weekdayCheckIns),
        journalEntriesThisWeek: clampInt(context.journalEntriesThisWeek, 0, 1_000, 0),
      },
    };
  }

  if (action === "import_workout") {
    const notes = cleanText(context.notes, MAX_NOTES_CHARS + 1);
    if (!notes) return { ok: false, error: "No notes provided." };
    if (notes.length > MAX_NOTES_CHARS) {
      return { ok: false, error: `Notes too long (max ${MAX_NOTES_CHARS} characters).` };
    }
    return { ok: true, context: { notes } };
  }

  return {
    ok: true,
    context: {
      days: clampInt(context.days, 0, 50_000, 0),
      label: cleanText(context.label, 100) || "something important",
      why: cleanText(context.why, 700),
      recentJournal: cleanText(context.recentJournal, 1_200),
    },
  };
}

export function getRateLimit(action) {
  return RATE_LIMITS[action] || { maxRequests: 30, windowSeconds: 60 * 60 };
}

export function sanitizeInsightOutput(text) {
  const cleaned = cleanText(text, MAX_TEXT_OUTPUT_CHARS);
  if (!cleaned) return { ok: false, error: "Empty model response." };
  return { ok: true, text: cleaned.replace(/^["']|["']$/g, "").trim() };
}

function sanitizeWorkoutExercise(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = cleanText(raw.name, 80);
  if (!name) return null;
  const type = raw.type === "cardio" ? "cardio" : "strength";
  const muscleGroup = IMPORT_MUSCLE_GROUPS.has(raw.muscleGroup)
    ? raw.muscleGroup
    : type === "cardio"
      ? "cardio"
      : "other";
  return {
    name,
    muscleGroup,
    type,
    targetSets: clampInt(raw.targetSets, 1, 20, 3),
    targetReps: type === "cardio" ? null : clampInt(raw.targetReps, 1, 200, null),
    targetWeight: type === "cardio" ? null : clampNum(raw.targetWeight, 0, 2_000, null),
    targetMinutes: type === "cardio" ? clampInt(raw.targetMinutes, 1, 300, 10) : null,
    restSec: clampInt(raw.restSec, 0, 900, null),
    notes: cleanText(raw.notes, 200) || null,
  };
}

export function sanitizeWorkoutOutput(text) {
  if (typeof text !== "string" || text.length > MAX_WORKOUT_OUTPUT_CHARS) {
    return { ok: false, error: "Workout response was empty or too large." };
  }
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: "Workout response did not contain JSON." };
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: "Workout response JSON was malformed." };
  }
  const exercises = list(parsed.exercises, 30)
    .map(sanitizeWorkoutExercise)
    .filter(Boolean);
  if (!exercises.length) {
    return { ok: false, error: "Workout response contained no usable exercises." };
  }
  return { ok: true, text: JSON.stringify({ exercises }) };
}
