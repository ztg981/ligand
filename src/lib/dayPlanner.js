/* dayPlanner — pure helpers for the timed day-block model.

   A block is { start, end } in MINUTES from local midnight, with
   0 <= start < 1440 and end > start. Kept pure and unit-tested; all
   SVG/interaction lives in the DayDial component.

   END MAY EXCEED 1440, and that is the whole trick for late nights: an `end`
   past the end of the day means the block runs into tomorrow, so 11pm–1am is
   { start: 1380, end: 1500 }. The alternative — storing end as 60 and letting
   end < start mean "wrapped" — would silently break every `end - start`
   duration, every `start <= t && t < end` containment test, and every sort in
   this file. Letting the number run on keeps all of that arithmetic true, and
   only the two places that render a WALL CLOCK have to think about it (both
   already do: minutesToHHMM takes hours mod 24, and minutesToLabel hands the
   overflow to Date, which rolls it over for free). */

export const DAY_MIN = 24 * 60;

/** Ceiling for a block's end: a block can reach into tomorrow, not past it. */
export const MAX_END = 2 * DAY_MIN;

/** Does this block run past midnight into the next day? */
export function spansMidnight(block) {
  return (block?.end ?? 0) > DAY_MIN;
}

/* Turn two WALL-CLOCK times into a range.

   The editor's From/To fields can only express a time of day, so "23:00 to
   01:00" arrives as 1380 and 60. An end at or before the start is the only
   thing that can mean — nobody schedules a block that finishes before it
   begins — so it's read as the next day. Equal times stay equal and the
   caller rejects them as a zero-length block. */
export function resolveRange(startMin, endMin) {
  const start = clampMinutes(startMin);
  let end = clampMinutes(endMin);
  if (end < start) end += DAY_MIN;
  return { start, end };
}

/* Block categories: color + texture pattern id (SVG defs in DayDial).
   The palette leans on distinguishable hues that hold up in light and
   dark; sleep gets the wavy texture, work stripes, personal dots — texture
   carries meaning beyond color alone (color-blind friendly). */
export const BLOCK_CATEGORIES = [
  { id: "focus", name: "Focus", color: "oklch(0.62 0.14 245)", pattern: null },
  { id: "work", name: "Work", color: "oklch(0.55 0.12 285)", pattern: "stripes" },
  { id: "personal", name: "Personal", color: "oklch(0.66 0.14 350)", pattern: "dots" },
  { id: "break", name: "Break", color: "oklch(0.66 0.11 180)", pattern: null },
  { id: "exercise", name: "Exercise", color: "oklch(0.62 0.13 150)", pattern: "hatch" },
  { id: "sleep", name: "Sleep", color: "oklch(0.55 0.10 290)", pattern: "waves" },
  { id: "other", name: "Other", color: "oklch(0.6 0.02 260)", pattern: null },
];

export const categoryById = (id) =>
  BLOCK_CATEGORIES.find((c) => c.id === id) || BLOCK_CATEGORIES[BLOCK_CATEGORIES.length - 1];

export function clampMinutes(m) {
  return Math.max(0, Math.min(DAY_MIN, Math.round(Number(m) || 0)));
}

/* Do two blocks on the same day collide?

   A block that runs past midnight also occupies the early hours of the day,
   so it has to be tested twice: once where it sits, and once shifted back a
   day, which is where its tail lands. Without the second test an 11pm–1am
   block reads as clear of a 00:30–01:30 one, because 1380 < 90 is false. */
export function blocksOverlap(a, b) {
  const hit = (p, q) => p.start < q.end && q.start < p.end;
  const shift = (x) => ({ start: x.start - DAY_MIN, end: x.end - DAY_MIN });
  return (
    hit(a, b) ||
    (spansMidnight(a) && hit(shift(a), b)) ||
    (spansMidnight(b) && hit(a, shift(b)))
  );
}

/* "07:30" ↔ minutes.

   Deliberately NOT clampMinutes: an end past midnight is a legitimate value
   (see the header), and clamping 1500 down to 1440 would show a block that
   finishes at 1am as finishing at "00:00". Wrapping is the right reduction —
   a wall clock has no notion of which day it is. */
export function minutesToHHMM(min) {
  const m = ((Math.round(Number(min) || 0) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  return clampMinutes(Number(m[1]) * 60 + Number(m[2]));
}

/** Human label: 510 → "8:30 AM" (locale-aware). */
export function minutesToLabel(min) {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Total scheduled minutes (overlaps counted once). */
export function scheduledMinutes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = null;
  let curEnd = null;
  for (const b of sorted) {
    if (curEnd === null || b.start > curEnd) {
      if (curEnd !== null) total += curEnd - curStart;
      curStart = b.start;
      curEnd = b.end;
    } else {
      curEnd = Math.max(curEnd, b.end);
    }
  }
  if (curEnd !== null) total += curEnd - curStart;
  return total;
}

/**
 * First gap of at least `durMin` minutes starting at or after `fromMin`,
 * avoiding every existing block. Returns { start, end } or null when the
 * rest of the day can't fit it.
 */
export function nextFreeSlot(blocks, fromMin, durMin) {
  const sorted = [...blocks]
    .filter((b) => b.end > fromMin)
    .sort((a, b) => a.start - b.start);
  let cursor = clampMinutes(fromMin);
  for (const b of sorted) {
    if (b.start - cursor >= durMin) break; // gap before this block fits
    cursor = Math.max(cursor, b.end);
  }
  if (DAY_MIN - cursor < durMin) return null;
  return { start: cursor, end: cursor + durMin };
}

/** "2h 30m" style total. */
export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
