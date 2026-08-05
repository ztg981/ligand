/* ============================================================
   Habit occurrences
   ------------------------------------------------------------
   A habit may need doing several times a day. This module owns the counting:
   how many times today, whether the day is finished, and the three DIFFERENT
   totals that the rest of the app keeps wanting to conflate.

     total occurrences   every tick ever recorded, partial days included
     completed days      days where the target was fully met
     completed-day streak  consecutive completed days

   Those are not interchangeable. "Brush teeth 40 times" counts occurrences;
   "keep it up for 14 days" counts completed days; the streak counts them
   consecutively. Milestones ask for each separately, so they are computed
   separately here rather than left to call sites to get subtly wrong.

   MIGRATION IS LAZY AND NON-DESTRUCTIVE. A habit written before any of this
   existed has checkIns and no occurrences; readHabitDay derives {count: 1,
   target: 1} for those days on read. Nothing rewrites stored history, so the
   user never has to migrate anything and old data cannot be damaged by a bug
   in code that runs once.
   ============================================================ */

import {
  MIN_HABIT_DAILY_TARGET,
  normalizeHabitDailyTarget,
  shiftDay,
  todayKey,
} from "./model.js";

/** The habit's target for NEW days. Historic days keep their own snapshot. */
export function habitDailyTarget(habit) {
  return normalizeHabitDailyTarget(habit?.dailyTarget ?? MIN_HABIT_DAILY_TARGET);
}

/**
 * What happened on one day: { count, target, done, at }.
 *
 * Falls back to the legacy checkIns representation, where a listed day means
 * one occurrence against a target of one.
 */
export function readHabitDay(habit, dayKey) {
  const record = habit?.occurrences?.[dayKey];
  if (record && typeof record === "object") {
    const target = normalizeHabitDailyTarget(record.target ?? habitDailyTarget(habit));
    const count = Math.max(0, Math.round(Number(record.count) || 0));
    return {
      count,
      target,
      done: count >= target,
      at: Array.isArray(record.at) ? record.at : [],
    };
  }

  const legacy = Array.isArray(habit?.checkIns) && habit.checkIns.includes(dayKey);
  // A legacy completed day was recorded against a target of one, whatever the
  // habit's target has since become — that is what "don't rewrite history"
  // means in practice.
  return legacy
    ? { count: 1, target: 1, done: true, at: [] }
    : { count: 0, target: habitDailyTarget(habit), done: false, at: [] };
}

/** 0 → 1 as the day fills up. Capped, so an extra tick can't overflow a bar. */
export function habitDayFraction(habit, dayKey) {
  const { count, target } = readHabitDay(habit, dayKey);
  if (target <= 0) return 0;
  return Math.min(1, count / target);
}

/**
 * Record one more occurrence (delta +1) or take one back (delta -1).
 *
 * Returns a NEW habit. Both views are written together so they cannot drift:
 * occurrences gets the count, checkIns gets the day only while it is complete.
 * Counts are clamped to [0, target] — a tick past the target would misreport
 * both the progress bar and the occurrence milestones.
 */
export function applyHabitOccurrence(habit, dayKey = todayKey(), delta = 1, at = null) {
  const current = readHabitDay(habit, dayKey);
  // A day already on record keeps ITS target; a fresh day takes the habit's.
  const target = current.count > 0 || habit?.occurrences?.[dayKey]
    ? current.target
    : habitDailyTarget(habit);
  const next = Math.min(target, Math.max(0, current.count + delta));
  if (next === current.count) return habit;

  const stamps = [...current.at];
  if (delta > 0) stamps.push(at || new Date().toISOString());
  else stamps.pop();

  const occurrences = { ...(habit.occurrences || {}) };
  if (next === 0) delete occurrences[dayKey];
  else occurrences[dayKey] = { count: next, target, at: stamps };

  const done = next >= target;
  const checkIns = new Set(habit.checkIns || []);
  if (done) checkIns.add(dayKey);
  else checkIns.delete(dayKey);

  return { ...habit, occurrences, checkIns: [...checkIns].sort() };
}

/** Every tick ever recorded, partial days included. */
export function totalHabitOccurrences(habit) {
  const occurrences = habit?.occurrences;
  if (occurrences && Object.keys(occurrences).length) {
    const days = new Set(Object.keys(occurrences));
    let total = 0;
    for (const day of days) total += readHabitDay(habit, day).count;
    // Legacy completed days that predate the occurrence log still count once.
    for (const day of habit.checkIns || []) {
      if (!days.has(day)) total += 1;
    }
    return total;
  }
  return (habit?.checkIns || []).length;
}

/** Days where the full daily target was met. */
export function completedHabitDays(habit) {
  return (habit?.checkIns || []).length;
}

/** The day keys that count as complete, sorted. */
export function completedHabitDayKeys(habit) {
  return [...(habit?.checkIns || [])].sort();
}

/**
 * Consecutive completed days ending at refKey.
 *
 * Pauses rather than shatters, matching the app's existing forgiving rule: if
 * today isn't finished yet we look back from yesterday, so an unfinished
 * today never zeroes a streak that is still live.
 */
export function completedDayStreak(habit, refKey = todayKey()) {
  const days = new Set(habit?.checkIns || []);
  if (!days.size) return 0;
  let streak = 0;
  let cursor = days.has(refKey) ? refKey : shiftDay(refKey, -1);
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** The three totals plus today, computed once for a habit. */
export function habitStats(habit, refKey = todayKey()) {
  const today = readHabitDay(habit, refKey);
  return {
    dailyTarget: habitDailyTarget(habit),
    today,
    todayFraction: habitDayFraction(habit, refKey),
    totalOccurrences: totalHabitOccurrences(habit),
    completedDays: completedHabitDays(habit),
    completedDayStreak: completedDayStreak(habit, refKey),
  };
}

/** Same, summed across every habit on a goal — what milestones ask about. */
export function goalHabitStats(goal, refKey = todayKey()) {
  const habits = goal?.habits || [];
  return habits.reduce(
    (totals, habit) => {
      const stats = habitStats(habit, refKey);
      return {
        totalOccurrences: totals.totalOccurrences + stats.totalOccurrences,
        completedDays: totals.completedDays + stats.completedDays,
        bestStreak: Math.max(totals.bestStreak, stats.completedDayStreak),
      };
    },
    { totalOccurrences: 0, completedDays: 0, bestStreak: 0 }
  );
}
