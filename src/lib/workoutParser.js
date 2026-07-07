/* ============================================================
   workoutParser — deterministic notes→workout parsing + the
   strict schema sanitizer for ANY imported exercise list.
   ------------------------------------------------------------
   Two jobs:

   1. sanitizeImportedExercises(list): the single validation gate
      every import path goes through (Gemini output AND the local
      parser). Treats input as untrusted: strips markup/control
      chars, whitelists enums, clamps every number, caps list
      size, and drops entries that can't be salvaged. Never
      throws.

   2. parseWorkoutText(text): a no-AI fallback that handles the
      common shorthand people actually write:
        "5x5 bench" / "bench 3x8" / "bench 3 sets of 8"
        "Squat 135 for 3 sets of 8" / "bench 4x8 @ 185"
        "135x8" (weight x reps), "rest 90s", trailing bare names.
      It does NOT pretend to be AI — it's a deterministic parse
      the user reviews and edits, for when Gemini is down.
   ============================================================ */

import { EXERCISES } from "./exercises.js";

export const IMPORT_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "core",
  "cardio",
  "other",
];

const MAX_EXERCISES = 30;
const MAX_NAME_LEN = 80;
const MAX_NOTE_LEN = 200;

// Strip anything that could render as markup plus control chars; collapse
// whitespace. Imported names/notes end up in JSX text nodes (safe from XSS by
// default), but cleaning here also keeps stored data sane.
function cleanText(value, maxLen) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// null/undefined/"" mean "not provided" and must stay the fallback — Number()
// would silently coerce them to 0 and then clamp to the minimum.
function clampInt(value, min, max, fallback = null) {
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

/**
 * Validate + normalize an untrusted imported exercise list.
 * Returns { exercises, dropped } — exercises in the plan shape the preview
 * and logger expect; dropped = count of entries discarded as unusable.
 */
export function sanitizeImportedExercises(rawList) {
  if (!Array.isArray(rawList)) return { exercises: [], dropped: 0 };
  const out = [];
  let dropped = 0;
  for (const raw of rawList.slice(0, MAX_EXERCISES)) {
    if (!raw || typeof raw !== "object") {
      dropped++;
      continue;
    }
    const name = cleanText(raw.name, MAX_NAME_LEN);
    if (!name) {
      dropped++;
      continue;
    }
    const type = raw.type === "cardio" ? "cardio" : "strength";
    const muscleGroup = IMPORT_MUSCLE_GROUPS.includes(raw.muscleGroup)
      ? raw.muscleGroup
      : type === "cardio"
        ? "cardio"
        : "other";
    out.push({
      name,
      muscleGroup,
      type,
      targetSets: clampInt(raw.targetSets, 1, 20, 3),
      targetReps: type === "cardio" ? null : clampInt(raw.targetReps, 1, 200, null),
      targetWeight: type === "cardio" ? null : clampNum(raw.targetWeight, 0, 2000, null),
      targetMinutes: type === "cardio" ? clampInt(raw.targetMinutes, 1, 300, 10) : null,
      restSec: clampInt(raw.restSec, 0, 900, null),
      notes: cleanText(raw.notes, MAX_NOTE_LEN) || null,
    });
  }
  dropped += Math.max(0, rawList.length - MAX_EXERCISES);
  return { exercises: out, dropped };
}

// ---- library matching -------------------------------------------

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Best-effort match of a parsed name to a library exercise so imported
// movements get a real exerciseId (PR tracking + "last time"). Unknown names
// stay as custom exercises (exerciseId null) — never dropped.
export function matchLibraryExercise(name) {
  const n = norm(name);
  if (!n) return null;
  const exact = EXERCISES.find((e) => norm(e.name) === n);
  if (exact) return exact;
  // Contains either direction (e.g. "incline dumbbell press" ~ "Incline Press").
  const contains = EXERCISES.find(
    (e) => norm(e.name).includes(n) || n.includes(norm(e.name))
  );
  if (contains) return contains;
  // Plural → singular retry ("rows" → "row" ~ "Bent Over Row").
  const singular = n.endsWith("s") ? n.slice(0, -1) : null;
  if (singular) {
    return (
      EXERCISES.find(
        (e) => norm(e.name).includes(singular) || singular.includes(norm(e.name))
      ) || null
    );
  }
  return null;
}

/** Attach exerciseId / canonical name / muscle group from the library. */
export function enrichWithLibrary(exercises) {
  return (exercises || []).map((ex) => {
    const lib = matchLibraryExercise(ex.name);
    const type = ex.type === "cardio" || lib?.type === "cardio" ? "cardio" : "strength";
    return {
      ...ex,
      exerciseId: lib?.id || null,
      name: lib?.name || ex.name || "Exercise",
      muscleGroup: lib?.muscleGroup || ex.muscleGroup || "other",
      type,
    };
  });
}

// ---- deterministic text parsing ---------------------------------

const CARDIO_WORDS =
  /\b(run|running|jog|treadmill|bike|biking|cycling|rowing|row machine|elliptical|stairmaster|stair climber|swim|swimming|walk|walking|cardio|hiit)\b/i;

// Words that are session labels, not exercises.
const SKIP_LINE =
  /^(push|pull|legs?|upper|lower|chest|back|shoulders?|arms?|full body)\s*day$/i;
const NOTE_LINE = /^(notes?|remember|nb)\s*[:-]/i;

// "rest 90s" / "rest 3 min" / "90s rest" / "rest: 2 minutes"
// Unit alternation is longest-first: with `s|sec|…|m|min`, "min" would match
// just the "m" and leave "in" behind as junk text.
const REST_RE =
  /(?:rest[:\s]*(\d+(?:\.\d+)?)\s*(seconds|secs|sec|s|minutes|mins|min|m)?)|(?:(\d+(?:\.\d+)?)\s*(seconds|secs|sec|s|minutes|mins|min|m)\s*rest)/i;

function extractRest(seg) {
  const m = seg.match(REST_RE);
  if (!m) return { seg, restSec: null };
  const num = Number(m[1] ?? m[3]);
  const unit = (m[2] ?? m[4] ?? "s").toLowerCase();
  const restSec = unit.startsWith("m") ? Math.round(num * 60) : Math.round(num);
  return { seg: seg.replace(m[0], " "), restSec };
}

// Cardio duration: "20 min treadmill" / "bike 15 minutes" / "run for 30m"
const DURATION_RE = /\b(\d+(?:\.\d+)?)\s*(minutes|mins|min|m)\b/i;

// "@ 185" (unit optional after @) / "at 95 lb" / "with 60kg" (unit REQUIRED
// after at/with, so "with 5 minutes" never reads as a 5-weight).
const WEIGHT_AT_RE =
  /(?:@\s*(\d+(?:\.\d+)?)\s*(?:lbs?|kgs?|kg|pounds?)?|\b(?:at|with)\s+(\d+(?:\.\d+)?)\s*(?:lbs?|kgs?|kg|pounds?)\b)/i;

/* Technique cues, effort targets, and instructions are DESCRIPTIONS of an
   exercise, not exercises. Anything matching these becomes a note on the
   exercise it follows (or the next one, for a leading cue) — never a phantom
   "Slow Controlled" entry in the plan. */
const CUE_RE =
  /\b(slow(?:er|ly)?|controlled?|tempo|squeeze|pause[d]?|strict|explosive|deep|full range|negatives?|hold|easy|hard|light|heavy|focus|form|each\s+(?:leg|side|arm)|per\s+(?:leg|side|arm)|to failure|failure|amrap|drop\s*sets?|rpe\s*\d+(?:\.\d+)?|rir\s*\d+|warm[\s-]?up|cool[\s-]?down|at the (?:top|bottom)|last set)\b/i;

// Extract inline cue phrases that should move from the name into notes.
const INLINE_CUES = [
  /\b(?:each|per)\s+(?:leg|side|arm)\b/i,
  /\brpe\s*\d+(?:\.\d+)?\b/i,
  /\brir\s*\d+\b/i,
  /\bto failure\b/i,
  /\bamrap\b/i,
  /\bdrop\s*sets?\b/i,
  /\bwarm[\s-]?up\b/i,
  /\bcool[\s-]?down\b/i,
];

// Distance for cardio ("run 2 miles"): recorded as a note, since the model
// tracks cardio by minutes.
const DISTANCE_RE = /\b(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|k|meters?)\b/i;

// "3 rounds" / "4 rounds of ..." — rounds are sets.
const ROUNDS_RE = /\b(\d+)\s*rounds?\b(?:\s*of)?/i;

// "plank for 45 seconds" — a timed strength hold; keep the time as a note.
const HOLD_RE = /\bfor\s+(\d+(?:\.\d+)?)\s*(seconds|secs|sec|s)\b/i;

// A segment with structure numbers stripped that still contains a cue and no
// other substance is a note, not an exercise.
function isCueOnly(text) {
  if (!text) return false;
  if (!CUE_RE.test(text)) return false;
  // Remove every cue phrase + connective filler; if nothing meaningful
  // remains, it was purely a description.
  const leftover = text
    .replace(new RegExp(CUE_RE.source, "gi"), " ")
    .replace(/\b(and|with|the|a|at|on|for|then|really|very|nice|good|keep|it|stay)\b/gi, " ")
    .replace(/[\d.,;:!'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return leftover.length === 0;
}

function parseSegment(seg) {
  let text = seg.trim().replace(/^(?:then|and)\s+/i, "");
  if (!text || SKIP_LINE.test(text) || NOTE_LINE.test(text)) return null;

  const notes = [];

  // Pure description segments ("slow and controlled", "RPE 8", "squeeze at
  // the bottom") attach to the previous exercise as a note.
  if (isCueOnly(text)) {
    return { noteOnly: true, note: text.replace(/\s+/g, " ").trim() };
  }

  const restOut = extractRest(text);
  text = restOut.seg;
  const restSec = restOut.restSec;

  // Superset: "superset curls and tricep pushdowns (for 3 rounds)"
  const ss = text.match(/^superset\s+(.+?)\s+(?:and|&|with)\s+(.+?)(?:\s+for\s+(\d+)\s*rounds?)?$/i);
  if (ss) {
    const rounds = ss[3] ? Number(ss[3]) : 3;
    return {
      multi: [ss[1], ss[2]].map((n) => ({
        name: n.trim(),
        muscleGroup: "other",
        type: "strength",
        targetSets: rounds,
        targetReps: null,
        targetWeight: null,
        targetMinutes: null,
        restSec,
        notes: "superset",
      })),
    };
  }

  let targetWeight = null;
  const atW = text.match(WEIGHT_AT_RE);
  if (atW) {
    targetWeight = Number(atW[1] ?? atW[2]);
    text = text.replace(atW[0], " ");
  }

  let targetSets = null;
  let targetReps = null;
  let name = "";

  // Rounds count as sets ("plank ... 3 rounds", "3 rounds of burpees").
  const rounds = text.match(ROUNDS_RE);
  if (rounds) {
    targetSets = Number(rounds[1]);
    text = text.replace(rounds[0], " ");
  }

  // Timed hold: "plank for 45 seconds" → note, not reps.
  const hold = text.match(HOLD_RE);
  if (hold) {
    notes.push(`${hold[1]}${hold[2].startsWith("s") ? "s" : ""} hold`.replace("ss hold", "s hold"));
    text = text.replace(hold[0], " ");
  }

  // Inline cues inside a structured segment ("3x8 each leg", "squat RPE 8")
  // move into notes before name extraction.
  for (const re of INLINE_CUES) {
    const m2 = text.match(re);
    if (m2) {
      notes.push(m2[0].toLowerCase());
      text = text.replace(m2[0], " ");
    }
  }

  // Cardio distance → note ("2 miles").
  const dist = text.match(DISTANCE_RE);
  if (dist && CARDIO_WORDS.test(seg)) {
    notes.push(dist[0].toLowerCase());
    text = text.replace(dist[0], " ");
  }

  // "<name> <w> for <s> sets of <r>"  e.g. "Squat 135 for 3 sets of 8"
  let m = text.match(
    /^(.*?)\s+(\d+(?:\.\d+)?)\s+for\s+(\d+)\s*sets?\s*(?:of|x|×)?\s*(\d+)\b(.*)$/i
  );
  if (m) {
    name = m[1];
    targetWeight = targetWeight ?? Number(m[2]);
    targetSets = Number(m[3]);
    targetReps = Number(m[4]);
    text = m[5] || "";
  }

  // "<name> <s> sets of <r>" / "<s> sets of <r> <name>"
  if (!name) {
    m = text.match(/^(.*?)\s*(\d+)\s*sets?\s*(?:of|x|×)\s*(\d+)\s*(?:reps?)?\s*(.*)$/i);
    if (m) {
      targetSets = Number(m[2]);
      targetReps = Number(m[3]);
      name = m[1] || m[4];
      text = name === m[1] ? m[4] || "" : "";
    }
  }

  // "N sets of NAME" (no rep count): "3 sets of lateral raises"
  if (!name) {
    m = text.match(/^(\d+)\s*sets?\s+(?:of\s+)?([a-z].*)$/i);
    if (m) {
      targetSets = Number(m[1]);
      name = m[2];
      text = "";
    }
  }

  // "<s> sets, <r> reps" (name elsewhere in segment, possibly absent)
  if (!name) {
    m = text.match(/^(.*?)(\d+)\s*sets?\s*,?\s*(\d+)\s*reps?(.*)$/i);
    if (m) {
      targetSets = Number(m[2]);
      targetReps = Number(m[3]);
      name = (m[1] + " " + m[4]).trim();
      text = "";
    }
  }

  let trailing = "";
  // "AxB <name>" or "<name> AxB <descriptor>" — sets×reps vs weight×reps by size.
  if (!name && targetSets == null) {
    m = text.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*(.*)$/i);
    let pre = "";
    if (!m) {
      const m2 = text.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*(.*)$/i);
      if (m2) {
        pre = m2[1];
        m = [m2[0], m2[2], m2[3], m2[4] || ""];
      }
    }
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 20) {
        // "135x8" reads as weight × reps
        targetWeight = targetWeight ?? a;
        targetReps = b;
        targetSets = 3;
      } else {
        targetSets = a;
        targetReps = b;
      }
      // The name is whatever sat before the AxB; anything after it is a
      // descriptor ("felt heavy"), which belongs in notes, not the name.
      name = pre || m[3] || "";
      trailing = pre ? m[3] || "" : "";
      text = "";
    }
  }

  if (!name) name = text; // bare exercise name ("calves", "some flyes")
  const cleanName = (s) =>
    (s || "")
      .replace(/\b(heavy|light|some|maybe|a few|few|finish with|then|and|with|on|the|easy|hard|slow(?:ly)?|controlled?)\b/gi, " ")
      .replace(/\bfor\b\s*$/i, " ")
      .replace(/[.,;:!]+$/g, "")
      .replace(/^[.,;:!\-\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
  const descriptor = (seg.match(/\b(heavy|light|felt \w+|slow and controlled|slow|controlled|paused|easy|hard)\b/i) || [])[0] || null;
  name = cleanName(name);
  trailing = cleanName(trailing);

  const isCardio = CARDIO_WORDS.test(name) || CARDIO_WORDS.test(seg);
  let targetMinutes = null;
  if (isCardio) {
    const dur = seg.match(DURATION_RE);
    targetMinutes = dur ? Math.round(Number(dur[1])) : 10;
    if (dur) name = cleanName(name.replace(dur[0], " "));
  }

  // Rest-only fragments ("rest 3 min" split off by a comma) have no name;
  // signal the caller to attach the rest time to the previous exercise.
  if (!name || /^\d+$/.test(name)) {
    if (restSec != null) return { restOnly: true, restSec };
    // "…, 3 rounds" — a bare count belongs to the exercise it follows.
    if (targetSets != null && targetReps == null && targetWeight == null) {
      return { setsOnly: true, sets: targetSets };
    }
    // A bare-number segment like "135x8" still describes work: keep it as an
    // editable placeholder rather than silently dropping the user's numbers.
    if (targetSets != null || targetReps != null || targetWeight != null) {
      name = "Exercise";
    } else {
      return null;
    }
  }

  const allNotes = [trailing, ...notes, descriptor && !notes.length ? descriptor : null]
    .map((n) => (n || "").trim())
    .filter(Boolean);
  return {
    name,
    muscleGroup: isCardio ? "cardio" : "other",
    type: isCardio ? "cardio" : "strength",
    targetSets: targetSets ?? 3,
    targetReps: isCardio ? null : targetReps,
    targetWeight: isCardio ? null : targetWeight,
    targetMinutes,
    restSec,
    notes: allNotes.length ? [...new Set(allNotes)].join("; ") : null,
  };
}

/**
 * Parse free-text workout notes deterministically (no AI).
 * Returns { exercises } (already sanitized). Empty text → empty list.
 */
export function parseWorkoutText(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return { exercises: [] };
  const normalized = raw
    // keep "5 sets, 5 reps" together across the comma split below
    .replace(/(\d+)\s*sets?\s*,\s*(\d+)\s*reps?/gi, "$1 sets of $2");
  const segments = normalized
    .split(/[\n;]+/)
    .flatMap((line) => (NOTE_LINE.test(line.trim()) ? [] : line.split(/,(?![^(]*\))/)))
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed = [];
  let pendingNote = null; // a leading cue ("warm up:") held for the next exercise
  const appendNote = (ex, note) => {
    ex.notes = ex.notes ? `${ex.notes}; ${note}` : note;
  };
  for (const seg of segments) {
    const p = parseSegment(seg);
    if (!p) continue;
    if (p.restOnly) {
      // "…, rest 3 min" — attach to the exercise it followed.
      const prev = parsed[parsed.length - 1];
      if (prev && prev.restSec == null) prev.restSec = p.restSec;
      continue;
    }
    if (p.setsOnly) {
      // "plank for 45 seconds, 3 rounds" — the rounds apply to the hold.
      const prev = parsed[parsed.length - 1];
      if (prev) prev.targetSets = p.sets;
      continue;
    }
    if (p.noteOnly) {
      // "…, slow and controlled" — a description of the exercise it follows,
      // NEVER a new exercise. A cue with nothing before it waits for the next.
      const prev = parsed[parsed.length - 1];
      if (prev) appendNote(prev, p.note);
      else pendingNote = pendingNote ? `${pendingNote}; ${p.note}` : p.note;
      continue;
    }
    const items = p.multi || [p];
    for (const item of items) {
      if (pendingNote) {
        appendNote(item, pendingNote);
        pendingNote = null;
      }
      parsed.push(item);
    }
  }
  return sanitizeImportedExercises(parsed);
}
