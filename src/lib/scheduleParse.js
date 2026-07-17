/* ============================================================
   scheduleParse — turn a pasted schedule (text lines or the AI's
   JSON reading of a screenshot) into reviewable event drafts.
   ------------------------------------------------------------
   An event draft: { title, date "YYYY-MM-DD", start "HH:MM"|null,
   end "HH:MM"|null }. Drafts are ALWAYS reviewed and confirmed by
   the user before anything is written — this module never touches
   the store. Pure + unit-tested.
   ============================================================ */

import { shiftDay, todayKey } from "./model.js";

const WEEKDAYS = [
  ["monday", "mon"],
  ["tuesday", "tue", "tues"],
  ["wednesday", "wed"],
  ["thursday", "thu", "thur", "thurs"],
  ["friday", "fri"],
  ["saturday", "sat"],
  ["sunday", "sun"],
];

function weekdayFromWord(word) {
  const w = (word || "").toLowerCase().replace(/[.,]/g, "");
  for (let i = 0; i < 7; i++) if (WEEKDAYS[i].includes(w)) return i; // Mon=0
  return null;
}

/** Next occurrence (today counts) of a Mon=0..Sun=6 weekday from refDate. */
export function nextWeekday(weekday, refKey = todayKey()) {
  const refDow = (new Date(refKey + "T00:00:00").getDay() + 6) % 7;
  return shiftDay(refKey, (weekday - refDow + 7) % 7);
}

/** "9", "9:30", "09:30", with optional am/pm → "HH:MM" (24h) or null. */
export function parseClock(raw, ampmHint = null) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i.exec((raw || "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const suffix = (m[3] || ampmHint || "").toLowerCase();
  if (h > 24 || min > 59) return null;
  if (suffix.startsWith("p") && h < 12) h += 12;
  if (suffix.startsWith("a") && h === 12) h = 0;
  // Bare small hours ("3") in a schedule almost always mean afternoon —
  // but only guess when there was no explicit am/pm anywhere.
  if (!suffix && h >= 1 && h <= 6) h += 12;
  if (h === 24) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "M/D" or "M/D/YY(YY)" → "YYYY-MM-DD" (nearest sensible year) or null. */
function parseSlashDate(raw, refKey) {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec((raw || "").trim());
  if (!m) return null;
  const [refY] = refKey.split("-").map(Number);
  const mo = Number(m[1]);
  const day = Number(m[2]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  let y = m[3] ? Number(m[3]) : refY;
  if (y < 100) y += 2000;
  return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const TIME_RANGE =
  /(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:-|–|—|to|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)/i;
const TIME_SINGLE = /(?:^|\s|@)(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

/**
 * Parse one line like:
 *   "Mon 9:00-10:15 Math 101"
 *   "Tuesday 2pm Dentist"
 *   "7/21 3:30pm-5pm Practice"
 *   "Standup 9:15am Wednesday"
 * Returns an event draft or null when no title survives.
 */
export function parseScheduleLine(line, refKey = todayKey()) {
  let rest = (line || "").trim();
  if (!rest || rest.length > 200) return null;

  let date = null;

  // Pull a date token from anywhere in the line (weekday word or M/D).
  const tokens = rest.split(/\s+/);
  for (const tk of tokens) {
    const wd = weekdayFromWord(tk);
    const slash = wd == null ? parseSlashDate(tk, refKey) : null;
    if (wd != null || slash) {
      date = wd != null ? nextWeekday(wd, refKey) : slash;
      rest = rest.replace(tk, " ");
      break;
    }
  }

  // Pull a time range first, then a single time.
  let start = null;
  let end = null;
  const range = TIME_RANGE.exec(rest);
  if (range) {
    // Share the range's am/pm across both ends ("9-10:15am" → both am).
    const hint = /pm|p\b/i.test(range[2]) ? "pm" : /am|a\b/i.test(range[2]) ? "am" : null;
    start = parseClock(range[1], hint);
    end = parseClock(range[2]);
    if (start && end) rest = rest.replace(range[0], " ");
    else { start = null; end = null; }
  }
  if (!start) {
    const single = TIME_SINGLE.exec(rest);
    if (single) {
      start = parseClock(single[1]);
      if (start) rest = rest.replace(single[1], " ");
    }
  }

  const title = rest.replace(/[@·|,;]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!title) return null;
  return {
    title: title.slice(0, 80),
    date: date || refKey,
    start,
    end,
  };
}

/** Parse a whole pasted block of text, one event per line. */
export function parseScheduleText(text, refKey = todayKey()) {
  return (text || "")
    .split(/\n+/)
    .map((l) => parseScheduleLine(l, refKey))
    .filter(Boolean)
    .slice(0, 60);
}

/* ---- normalizing the AI's screenshot reading ---------------------
   The edge function returns {events:[{title, date|null, weekday|null,
   start|null, end|null}]}. Treat it as untrusted: clamp, resolve
   weekdays to real dates, and drop anything without a title. */
export function normalizeAiEvents(raw, refKey = todayKey()) {
  const list = Array.isArray(raw?.events) ? raw.events : [];
  return list
    .map((e) => {
      const title = String(e?.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!title) return null;
      let date = null;
      if (typeof e?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        date = e.date;
      } else if (Number.isInteger(e?.weekday) && e.weekday >= 0 && e.weekday <= 6) {
        date = nextWeekday(e.weekday, refKey);
      }
      const start = typeof e?.start === "string" ? parseClock(e.start) : null;
      const end = typeof e?.end === "string" ? parseClock(e.end) : null;
      return { title, date: date || refKey, start, end };
    })
    .filter(Boolean)
    .slice(0, 60);
}

/* ---- natural-language event lines ---------------------------------
   "Meeting with James every Sunday 7/19 to end of August at 7pm" →
   { title, date, start, end, repeat }. This is the OFFLINE parser; the
   Gemini action handles messier phrasing when signed in. Both feed the
   same prefilled editor, and nothing saves without the user confirming. */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function lastDayOfMonth(year, monthIdx) {
  const d = new Date(year, monthIdx + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthFromWord(word) {
  const w = (word || "").toLowerCase().replace(/[.,]/g, "");
  const i = MONTHS.findIndex((m) => m === w || m.slice(0, 3) === w);
  return i >= 0 ? i : null;
}

export function parseNaturalEvent(line, refKey = todayKey()) {
  let rest = (line || "").replace(/\s+/g, " ").trim();
  if (!rest || rest.length > 220) return null;
  const refYear = Number(refKey.slice(0, 4));
  const repeat = { freq: null, weekdays: [], until: null };

  // "until/to/through end of august" | "... 8/31" | "... august 31"
  const untilMatch =
    /\b(?:until|till|to|through|thru)\s+(end of\s+([a-z]+)|(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)|([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?)\b/i.exec(rest);
  if (untilMatch) {
    if (untilMatch[2] != null) {
      const mi = monthFromWord(untilMatch[2]);
      if (mi != null) {
        const y = mi < Number(refKey.slice(5, 7)) - 1 ? refYear + 1 : refYear;
        repeat.until = lastDayOfMonth(y, mi);
      }
    } else if (untilMatch[3]) {
      repeat.until = parseSlashDate(untilMatch[3], refKey);
    } else if (untilMatch[4] && untilMatch[5]) {
      const mi = monthFromWord(untilMatch[4]);
      if (mi != null) {
        repeat.until = `${refYear}-${String(mi + 1).padStart(2, "0")}-${String(Number(untilMatch[5])).padStart(2, "0")}`;
      }
    }
    if (repeat.until) rest = rest.replace(untilMatch[0], " ");
  }

  // "every sunday (and monday)" | "every day" | "every 2 weeks" | "weekly"
  const everyMatch = /\bevery\s+(other\s+)?([a-z]+)((?:\s*(?:,|and)\s*[a-z]+)*)\b/i.exec(rest);
  if (everyMatch) {
    const first = everyMatch[2].toLowerCase();
    if (first === "day" || first === "morning" || first === "night") {
      repeat.freq = "daily";
    } else if (first === "week") {
      repeat.freq = "weekly";
    } else if (first === "month") {
      repeat.freq = "monthly";
    } else {
      const wd = weekdayFromWord(first);
      if (wd != null) {
        repeat.freq = "weekly";
        repeat.weekdays = [wd];
        (everyMatch[3] || "")
          .split(/,|and/i)
          .map((s) => weekdayFromWord(s.trim()))
          .forEach((d) => {
            if (d != null && !repeat.weekdays.includes(d)) repeat.weekdays.push(d);
          });
        repeat.weekdays.sort();
      }
    }
    if (repeat.freq) {
      repeat.interval = everyMatch[1] ? 2 : 1;
      rest = rest.replace(everyMatch[0], " ");
    }
  } else if (/\bdaily\b/i.test(rest)) {
    repeat.freq = "daily";
    repeat.interval = 1;
    rest = rest.replace(/\bdaily\b/i, " ");
  } else if (/\bweekly\b/i.test(rest)) {
    repeat.freq = "weekly";
    repeat.interval = 1;
    rest = rest.replace(/\bweekly\b/i, " ");
  }

  // Reuse the line parser for start date, times, and the remaining title.
  const base = parseScheduleLine(rest, refKey);
  if (!base) return null;

  // Starting date for a weekly rule with weekdays: the first matching
  // weekday on/after the explicit date (or today).
  let date = base.date;
  if (repeat.freq === "weekly" && repeat.weekdays.length) {
    const wds = repeat.weekdays;
    for (let i = 0; i < 7; i += 1) {
      const cand = shiftDay(date, i);
      const wd = (new Date(cand + "T00:00:00").getDay() + 6) % 7;
      if (wds.includes(wd)) {
        date = cand;
        break;
      }
    }
  }

  return {
    title: base.title,
    date,
    start: base.start,
    end: base.end,
    repeat: repeat.freq
      ? {
          freq: repeat.freq,
          interval: repeat.interval || 1,
          weekdays: repeat.weekdays,
          until: repeat.until,
        }
      : null,
  };
}

/** Minutes from midnight for "HH:MM", or null. */
export function clockToMin(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Turn a CONFIRMED draft into day-block fields (the store's addDayBlock
 * takes it from there). Untimed events get a placeholder morning hour so
 * they land on the dial and can be dragged into place.
 */
export function draftToBlock(draft) {
  const start = clockToMin(draft.start) ?? 9 * 60;
  let end = clockToMin(draft.end);
  if (end == null || end <= start) end = Math.min(24 * 60, start + 60);
  return {
    date: draft.date,
    start,
    end,
    title: draft.title,
    category: "work",
  };
}
