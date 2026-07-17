/* ============================================================
   Recurrence — repeat rules for scheduled blocks, Apple-Calendar
   style: daily / weekly (with weekday picks) / monthly, an
   optional interval ("every 2 weeks"), and an optional end date.
   ------------------------------------------------------------
   Ligand MATERIALIZES a series into real dated blocks that share
   a seriesId instead of computing virtual occurrences at read
   time. Every existing surface (dial, ring, story, calendar,
   sync) then works untouched, and "delete just this one" is a
   plain delete. Open-ended series simply materialize out to a
   horizon (default ~6 months).
   Pure + unit-tested; no React, no storage.
   ============================================================ */

import { shiftDay, todayKey } from "./model.js";

export const REPEAT_FREQS = ["daily", "weekly", "monthly"];
export const MAX_OCCURRENCES = 240;
export const DEFAULT_HORIZON_DAYS = 183; // ~6 months for open-ended series

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mon=0..Sun=6 for a YYYY-MM-DD key. */
export function weekdayOf(dayKey) {
  return (new Date(dayKey + "T00:00:00").getDay() + 6) % 7;
}

/** Normalize a raw rule into { freq, interval, weekdays, until } or null. */
export function normalizeRepeat(rule) {
  if (!rule || !REPEAT_FREQS.includes(rule.freq)) return null;
  const interval = Math.min(12, Math.max(1, Math.round(Number(rule.interval) || 1)));
  const weekdays =
    rule.freq === "weekly"
      ? [...new Set((rule.weekdays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
  const until =
    typeof rule.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rule.until)
      ? rule.until
      : null;
  return { freq: rule.freq, interval, weekdays, until };
}

/**
 * All occurrence dates for a rule, starting at (and including) startDate.
 * Weekly rules with weekday picks fill the matching weekdays of each
 * included week (the week of startDate counts only from startDate on).
 * Capped by `until`, the horizon, and MAX_OCCURRENCES.
 */
export function expandRepeat(startDate, rule, horizonDays = DEFAULT_HORIZON_DAYS) {
  const r = normalizeRepeat(rule);
  if (!r) return [startDate];
  const hardEnd = r.until || shiftDay(startDate, horizonDays);
  const out = [];

  if (r.freq === "daily") {
    let cursor = startDate;
    while (cursor <= hardEnd && out.length < MAX_OCCURRENCES) {
      out.push(cursor);
      cursor = shiftDay(cursor, r.interval);
    }
    return out;
  }

  if (r.freq === "weekly") {
    const days = r.weekdays.length ? r.weekdays : [weekdayOf(startDate)];
    // Anchor on the Monday of the start week; step interval weeks at a time.
    let weekStart = shiftDay(startDate, -weekdayOf(startDate));
    while (weekStart <= hardEnd && out.length < MAX_OCCURRENCES) {
      for (const wd of days) {
        const day = shiftDay(weekStart, wd);
        if (day >= startDate && day <= hardEnd && out.length < MAX_OCCURRENCES) {
          out.push(day);
        }
      }
      weekStart = shiftDay(weekStart, 7 * r.interval);
    }
    return out;
  }

  // monthly: same day-of-month each step; months lacking it (the 31st in
  // April) are skipped rather than sliding to a wrong day.
  const [y0, m0, d0] = startDate.split("-").map(Number);
  for (let i = 0; out.length < MAX_OCCURRENCES; i += r.interval) {
    const d = new Date(y0, m0 - 1 + i, d0);
    if (d.getDate() !== d0) continue; // overflowed into the next month
    const key = todayKey(d);
    if (key > hardEnd) break;
    if (key >= startDate) out.push(key);
  }
  return out;
}

/** Human line for a rule: "Every week on Sun until Aug 31". */
export function describeRepeat(rule) {
  const r = normalizeRepeat(rule);
  if (!r) return null;
  const every =
    r.interval === 1
      ? { daily: "Every day", weekly: "Every week", monthly: "Every month" }[r.freq]
      : `Every ${r.interval} ${{ daily: "days", weekly: "weeks", monthly: "months" }[r.freq]}`;
  const days =
    r.freq === "weekly" && r.weekdays.length
      ? ` on ${r.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ")}`
      : "";
  const until = r.until
    ? ` until ${new Date(r.until + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";
  return every + days + until;
}
