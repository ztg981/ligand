/* ============================================================
   Stats — pure aggregation over the whole store for the Stats
   page. Everything is per-date and never pruned, so these read
   real history back for any window. No React, no storage.
   ============================================================ */

import { shiftDay, todayKey } from "./model.js";
import { categoryOf, fmtMinutes } from "./activities.js";

/** Inclusive list of the last `days` day-keys, oldest → newest. */
export function lastDays(days, refKey = todayKey()) {
  return Array.from({ length: days }, (_, i) => shiftDay(refKey, -(days - 1 - i)));
}

/** Sum of a per-day numeric picker over a window. */
function sumOver(list, days, pick, refKey = todayKey()) {
  const from = shiftDay(refKey, -(days - 1));
  return (list || []).reduce((n, row) => {
    const d = pick.date(row);
    return d && d >= from && d <= refKey ? n + (pick.val(row) || 0) : n;
  }, 0);
}

/**
 * The headline numbers, computed for a rolling window (default 7 days).
 * `store` is the flat data object (goals, tasks, focusLog, pauseLog,
 * workouts, activities, journal, sleepLog…).
 */
export function computeStats(store = {}, sleepLog = [], windowDays = 7, refKey = todayKey()) {
  const {
    focusLog = [],
    pauseLog = [],
    workouts = [],
    activities = [],
    journal = [],
    tasks = [],
    goals = [],
  } = store;

  const focusMin = sumOver(focusLog, windowDays, { date: (f) => f.date, val: (f) => f.minutes }, refKey);
  const pauseMin = Math.round(
    sumOver(pauseLog, windowDays, { date: (p) => p.date, val: (p) => p.seconds }, refKey) / 60
  );
  const workoutCount = (workouts || []).filter(
    (w) => w.date && w.date >= shiftDay(refKey, -(windowDays - 1)) && w.date <= refKey
  ).length;
  const trainedMin = Math.round(
    sumOver(workouts, windowDays, { date: (w) => w.date, val: (w) => (w.durationSec || 0) / 60 }, refKey)
  );
  const from = shiftDay(refKey, -(windowDays - 1));
  const activityCount = (activities || []).filter((a) => a.date >= from && a.date <= refKey).length;
  const movingMin = (activities || [])
    .filter((a) => a.date >= from && a.date <= refKey && a.category === "sport")
    .reduce((n, a) => n + (a.durationMin || 0), 0);
  const screenMin = (activities || [])
    .filter((a) => a.date >= from && a.date <= refKey && a.category === "screen")
    .reduce((n, a) => n + (a.durationMin || 0), 0);
  const tasksDone = (tasks || []).filter(
    (t) => t.done && t.completedOn && t.completedOn >= from && t.completedOn <= refKey
  ).length;
  const journalCount = (journal || []).filter((e) => {
    const d = String(e.createdAt || "").slice(0, 10);
    return d >= from && d <= refKey;
  }).length;
  const nights = (sleepLog || []).filter((s) => s.date >= from && s.date <= refKey);
  const sleepAvgMin = nights.length
    ? Math.round(
        nights.reduce((n, s) => {
          const b = clockMin(s.bedTime);
          const w = clockMin(s.wakeTime);
          if (b == null || w == null) return n;
          return n + ((w - b + 1440) % 1440);
        }, 0) / nights.length
      )
    : 0;

  return {
    focusMin,
    pauseMin,
    workoutCount,
    trainedMin,
    activityCount,
    movingMin,
    screenMin,
    tasksDone,
    journalCount,
    sleepAvgMin,
    activeGoals: (goals || []).filter((g) => g.status === "active").length,
  };
}

function clockMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Per-day focus minutes for a sparkline, oldest → newest. */
export function focusSeries(focusLog = [], days = 14, refKey = todayKey()) {
  const keys = lastDays(days, refKey);
  const byDay = Object.create(null);
  for (const f of focusLog) byDay[f.date] = (byDay[f.date] || 0) + (f.minutes || 0);
  return keys.map((k) => ({ day: k, minutes: byDay[k] || 0 }));
}

/** Focus minutes attributed to each goal in a window, most first. */
export function focusByGoal(focusLog = [], goals = [], windowDays = 30, refKey = todayKey()) {
  const from = shiftDay(refKey, -(windowDays - 1));
  const byGoal = Object.create(null);
  for (const f of focusLog) {
    if (!f.goalId || f.date < from || f.date > refKey) continue;
    byGoal[f.goalId] = (byGoal[f.goalId] || 0) + (f.minutes || 0);
  }
  return Object.entries(byGoal)
    .map(([goalId, minutes]) => ({
      goalId,
      minutes,
      name: goals.find((g) => g.id === goalId)?.name || "A goal",
      color: goals.find((g) => g.id === goalId)?.color || "var(--accent)",
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** How the last `windowDays` were spent, by activity category (minutes). */
export function activityBreakdown(activities = [], windowDays = 30, refKey = todayKey()) {
  const from = shiftDay(refKey, -(windowDays - 1));
  const byCat = Object.create(null);
  for (const a of activities) {
    if (a.date < from || a.date > refKey) continue;
    byCat[a.category] = (byCat[a.category] || 0) + (a.durationMin || 0);
  }
  const total = Object.values(byCat).reduce((n, m) => n + m, 0) || 1;
  return Object.entries(byCat)
    .map(([id, minutes]) => {
      const c = categoryOf(id);
      return { id, minutes, pct: Math.round((minutes / total) * 100), name: c.name, color: c.color, emoji: c.emoji };
    })
    .filter((c) => c.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/** Number of distinct days with ANY logged activity in a window (a "showing up"
    signal that spans everything, not just app-open). */
export function activeDayCount({ focusLog = [], workouts = [], activities = [], journal = [] } = {}, windowDays = 30, refKey = todayKey()) {
  const from = shiftDay(refKey, -(windowDays - 1));
  const days = new Set();
  const add = (d) => { if (d && d >= from && d <= refKey) days.add(d); };
  focusLog.forEach((f) => add(f.date));
  workouts.forEach((w) => add(w.date));
  activities.forEach((a) => add(a.date));
  journal.forEach((e) => add(String(e.createdAt || "").slice(0, 10)));
  return days.size;
}

export { fmtMinutes };
