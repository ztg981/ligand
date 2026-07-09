/* dayPlanner — pure helpers for the timed day-block model.

   A block is { start, end } in MINUTES from local midnight (0–1440,
   end > start). Kept pure and unit-tested; all SVG/interaction lives in
   the DayDial component. */

export const DAY_MIN = 24 * 60;

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

export function blocksOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

/** "07:30" ↔ minutes */
export function minutesToHHMM(min) {
  const m = clampMinutes(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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
