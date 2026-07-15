/* sleep — Ligand's gentle sleep diary.
   ------------------------------------------------------------
   Research grounding (design notes, not medical claims):
   - Sleep diaries are the core measurement tool of CBT-I, and
     self-monitoring alone measurably shifts sleep behavior
     (reactivity of self-monitoring). Logging IS the intervention.
   - ADHD & sleep problems are heavily comorbid (delayed sleep
     phase is common), and a consistent WAKE time is the single
     highest-leverage anchor — so consistency is what we reflect
     back, not just hours slept.
   - Anti-orthosomnia rule: no scores, no "bad sleep" verdicts, no
     red numbers. Short nights are described, never judged. The
     diary is a mirror, not a report card.

   Data shape (stored under ligand.sleep, one entry per wake-date):
     { id, date: "YYYY-MM-DD" (the morning you woke), bedTime: "HH:MM",
       wakeTime: "HH:MM", quality: 1..5, note?, createdAt }

   Pure functions only — no React — so everything is testable.
   ============================================================ */

import { todayKey } from "./model.js";

export const QUALITY_LABELS = {
  1: "Rough",
  2: "Meh",
  3: "Okay",
  4: "Good",
  5: "Great",
};

const clampQuality = (q) => Math.min(5, Math.max(1, Number(q) || 3));

function toMinutes(hhmm) {
  if (typeof hhmm !== "string" || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Minutes asleep between bedTime and wakeTime, crossing midnight when
 *  needed. "23:30" → "07:10" = 460. "01:00" → "08:00" = 420. Equal times
 *  (or bad input) → null, never 0 or 24h. */
export function sleepDurationMin(bedTime, wakeTime) {
  const bed = toMinutes(bedTime);
  const wake = toMinutes(wakeTime);
  if (bed == null || wake == null || bed === wake) return null;
  return wake > bed ? wake - bed : 24 * 60 - bed + wake;
}

/** "7h 40m" (durations under an hour show minutes only). */
export function durationLabel(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Normalize + validate a draft entry; returns a clean entry or null. */
export function makeSleepEntry({ date, bedTime, wakeTime, quality, note } = {}) {
  const d = date || todayKey();
  if (sleepDurationMin(bedTime, wakeTime) == null) return null;
  return {
    id: `sleep-${d}`,
    date: d,
    bedTime,
    wakeTime,
    quality: clampQuality(quality),
    note: (note || "").trim().slice(0, 200) || undefined,
    createdAt: new Date().toISOString(),
  };
}

/** The last `days` nights ending at todayStr → oldest first:
 *  [{ key, entry|null, min|null, isToday }] */
export function buildNights(log = [], days = 14, todayStr = todayKey()) {
  const byDate = new Map(log.map((e) => [e.date, e]));
  const base = new Date(`${todayStr}T00:00:00`);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const entry = byDate.get(key) || null;
    out.push({
      key,
      entry,
      min: entry ? sleepDurationMin(entry.bedTime, entry.wakeTime) : null,
      isToday: key === todayStr,
    });
  }
  return out;
}

/* Circular mean/spread of wake times, in minutes-of-day. Circular math so
   23:30 and 00:30 average to midnight, not noon. */
function circularStats(minuteList) {
  if (!minuteList.length) return null;
  const toAngle = (m) => (m / (24 * 60)) * 2 * Math.PI;
  let x = 0;
  let y = 0;
  for (const m of minuteList) {
    x += Math.cos(toAngle(m));
    y += Math.sin(toAngle(m));
  }
  x /= minuteList.length;
  y /= minuteList.length;
  const meanAngle = Math.atan2(y, x);
  const meanMin = ((meanAngle / (2 * Math.PI)) * 24 * 60 + 24 * 60) % (24 * 60);
  // Mean resultant length → spread. R near 1 = very consistent.
  const R = Math.sqrt(x * x + y * y);
  // Convert to an approximate "typical deviation" in minutes for wording.
  const spreadMin = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-9)))) * (24 * 60) / (2 * Math.PI);
  return { meanMin, spreadMin };
}

/** Stats over the last `days` nights: logged count, average duration,
 *  average quality, bed/wake circular means + consistency. Null fields when
 *  too little data. */
export function sleepStats(log = [], days = 14, todayStr = todayKey()) {
  const nights = buildNights(log, days, todayStr).filter((n) => n.entry);
  const count = nights.length;
  if (count === 0)
    return { count: 0, avgMin: null, avgQuality: null, wake: null, bed: null };

  const avgMin = Math.round(nights.reduce((s, n) => s + n.min, 0) / count);
  const avgQuality =
    Math.round((nights.reduce((s, n) => s + (n.entry.quality || 3), 0) / count) * 10) / 10;

  const wakeMinutes = nights
    .map((n) => toMinutes(n.entry.wakeTime))
    .filter((m) => m != null);
  const wake = wakeMinutes.length >= 3 ? circularStats(wakeMinutes) : null;

  const bedMinutes = nights
    .map((n) => toMinutes(n.entry.bedTime))
    .filter((m) => m != null);
  const bed = bedMinutes.length >= 3 ? circularStats(bedMinutes) : null;

  return { count, avgMin, avgQuality, wake, bed };
}

/** Minutes-of-day → a friendly clock label ("11:23 PM"). */
export function clockLabel(min) {
  if (min == null) return "—";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

/** Average duration this week (last 7 nights) vs the 7 before.
 *  → { thisAvg, prevAvg, deltaMin } — nulls unless each window has ≥ 2
 *  logged nights (a one-night "trend" is noise, not information). */
export function weekDelta(log = [], todayStr = todayKey()) {
  const nights = buildNights(log, 14, todayStr);
  const prev = nights.slice(0, 7).filter((n) => n.entry);
  const cur = nights.slice(7).filter((n) => n.entry);
  const avg = (arr) =>
    arr.length >= 2 ? Math.round(arr.reduce((s, n) => s + n.min, 0) / arr.length) : null;
  const thisAvg = avg(cur);
  const prevAvg = avg(prev);
  return {
    thisAvg,
    prevAvg,
    deltaMin: thisAvg != null && prevAvg != null ? thisAvg - prevAvg : null,
  };
}

/** Parse "HH:MM" to minutes-of-day (exported for the pattern chart). */
export function minutesOfDay(hhmm) {
  return toMinutes(hhmm);
}

/** Kind wording for wake-time consistency (the CBT-I anchor). */
export function wakeConsistencyLine(wake) {
  if (!wake) return null;
  if (wake.spreadMin <= 45) return "Your wake time is steady — that's the anchor that matters most.";
  if (wake.spreadMin <= 90) return "Your wake time drifts a little. Even a roughly-steady anchor helps.";
  return "Your wake times vary a lot right now. No judgment — one steady-ish anchor is a fine first aim.";
}

/** One gentle line about last night. Never scolds a short night. */
export function nightLine(entry) {
  if (!entry) return null;
  const min = sleepDurationMin(entry.bedTime, entry.wakeTime);
  const dur = durationLabel(min);
  const q = entry.quality || 3;
  if (q >= 4) return `${dur}, and it felt ${QUALITY_LABELS[q].toLowerCase()}. Carry that with you.`;
  if (q <= 2) return `${dur}, and it felt ${QUALITY_LABELS[q].toLowerCase()}. Be a little gentler with yourself today.`;
  return `${dur} last night. Logged — that's the whole job.`;
}
