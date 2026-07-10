/* ============================================================
   Mood — the shared 5-point scale used by the Journal and the
   mood-trend sparkline. Pure helpers only (unit-tested); the
   Journal owns the capture UI.

   The scale is deliberately gentle: five soft steps, no numbers
   shown to the user. Scores exist only so a trend can be drawn.
   ============================================================ */

export const MOODS = [
  { value: "rough", label: "Rough", score: 1 },
  { value: "low", label: "Low", score: 2 },
  { value: "okay", label: "Okay", score: 3 },
  { value: "good", label: "Good", score: 4 },
  { value: "great", label: "Great", score: 5 },
];

const BY_VALUE = new Map(MOODS.map((m) => [m.value, m]));

export function moodScore(value) {
  return BY_VALUE.get(value)?.score ?? null;
}

export function moodLabel(value) {
  return BY_VALUE.get(value)?.label ?? null;
}

/* Build an oldest→newest series of mood scores from journal entries.
   Only entries that carry a mood are included. `limit` keeps the trend
   readable (the most recent N moods). Each point keeps the entry's date
   string (YYYY-MM-DD) for tooltips. Pure — safe to unit test. */
export function moodSeries(journal = [], limit = 14) {
  const points = [];
  for (const e of journal) {
    const score = moodScore(e?.mood);
    if (score == null) continue;
    const day = String(e?.createdAt || "").slice(0, 10);
    points.push({ score, day, value: e.mood });
  }
  // Journal is stored newest-first; reverse to oldest→newest, then keep the
  // most recent `limit` so the sparkline reads left (older) → right (now).
  points.reverse();
  return points.slice(Math.max(0, points.length - limit));
}

/* A coarse direction for the trend: compares the average of the older half
   to the newer half. Returns "up" | "down" | "steady" | null (too little
   data). Kept forgiving — small wobbles read as steady. */
export function moodDirection(series = []) {
  if (!series || series.length < 4) return null;
  const mid = Math.floor(series.length / 2);
  const older = series.slice(0, mid);
  const newer = series.slice(mid);
  const avg = (arr) => arr.reduce((n, p) => n + p.score, 0) / arr.length;
  const delta = avg(newer) - avg(older);
  if (delta >= 0.5) return "up";
  if (delta <= -0.5) return "down";
  return "steady";
}
