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

/* ---- zoomable timeline ------------------------------------------
   Points positioned on a REAL time axis for a chosen range, so the
   graph never stretches: 2w plots every entry, 1m averages per day,
   1y and all average per week. Pure and unit-tested. */

export const MOOD_RANGES = [
  { id: "2w", label: "2w", days: 14 },
  { id: "1m", label: "1m", days: 31 },
  { id: "1y", label: "1y", days: 366 },
  { id: "all", label: "All", days: null },
];

function weekKeyOf(ts) {
  const d = new Date(ts);
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow); // Monday of that week
  return day.getTime();
}

export function moodTimeline(journal = [], range = "2w", now = Date.now()) {
  const spec = MOOD_RANGES.find((r) => r.id === range) || MOOD_RANGES[0];
  const raw = [];
  for (const e of journal) {
    const score = moodScore(e?.mood);
    if (score == null) continue;
    const ts = Date.parse(e?.createdAt || "");
    if (Number.isNaN(ts) || ts > now) continue;
    raw.push({ ts, score });
  }
  if (!raw.length) return { points: [], from: now, to: now };
  raw.sort((a, b) => a.ts - b.ts);

  const from = spec.days != null ? now - spec.days * 86400000 : raw[0].ts;
  const inRange = raw.filter((p) => p.ts >= from);
  if (!inRange.length) return { points: [], from, to: now };

  let points;
  if (range === "2w") {
    points = inRange.map((p) => ({ t: p.ts, score: p.score, count: 1 }));
  } else {
    // Bucket by day (1m) or by week (1y / all) and average each bucket.
    const keyOf =
      range === "1m"
        ? (ts) => new Date(ts).setHours(0, 0, 0, 0)
        : weekKeyOf;
    const buckets = new Map();
    for (const p of inRange) {
      const k = keyOf(p.ts);
      const b = buckets.get(k) || { sum: 0, count: 0 };
      b.sum += p.score;
      b.count += 1;
      buckets.set(k, b);
    }
    points = [...buckets.entries()]
      .map(([t, b]) => ({ t, score: b.sum / b.count, count: b.count }))
      .sort((a, b) => a.t - b.t);
  }
  return { points, from, to: now };
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
