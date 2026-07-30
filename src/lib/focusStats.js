import { todayKey, shiftDay } from "./model.js";

/* focusStats — everything the focus detail view shows, as pure functions.

   The focus log is append-only: { date, minutes, goalId, at?, source?,
   label?, taskId? }. Entries written before the richer fields existed have
   only the first three, so every function here treats `at` and `source` as
   optional and simply reports less rather than guessing.

   Minutes are FRACTIONAL — a 40-second block is 0.7 — so every total is
   rounded back to a tenth. Left alone, summing floats produces
   2.0999999999999996 and it ends up on screen. */

export const tidy = (m) => Math.round((Number(m) || 0) * 10) / 10;

/** Sessions on or after `from` (inclusive), oldest first. */
export function sessionsSince(focusLog = [], from = null) {
  return (focusLog || [])
    .filter((e) => e?.date && (!from || e.date >= from))
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

/** Total minutes in a list of sessions. */
export function totalMinutes(sessions = []) {
  return tidy(sessions.reduce((n, e) => n + (Number(e?.minutes) || 0), 0));
}

/** Minutes per date, as a Map. */
export function minutesByDay(focusLog = []) {
  const out = new Map();
  for (const e of focusLog || []) {
    if (!e?.date) continue;
    out.set(e.date, tidy((out.get(e.date) || 0) + (Number(e.minutes) || 0)));
  }
  return out;
}

/* Consecutive days ending today (or yesterday) with any focus at all.

   Yesterday counts as still-alive on purpose: a streak that dies at midnight
   punishes you for not having focused yet TODAY, which is the wrong message to
   send to someone opening the app in the morning. It only breaks once a whole
   day has passed with nothing in it. */
export function focusStreak(focusLog = [], refKey = todayKey()) {
  const byDay = minutesByDay(focusLog);
  if (!byDay.size) return { current: 0, longest: 0, endsToday: false };

  let current = 0;
  const startedToday = (byDay.get(refKey) || 0) > 0;
  let cursor = startedToday ? refKey : shiftDay(refKey, -1);
  while ((byDay.get(cursor) || 0) > 0) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  // Longest run anywhere in the history.
  const days = [...byDay.keys()].filter((d) => (byDay.get(d) || 0) > 0).sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest, endsToday: startedToday };
}

/* Minutes per hour of the day, 0–23.

   Only sessions carrying `at` can be placed, so this reports how many it could
   use — a chart drawn from three of forty sessions would be a lie told with a
   straight face. */
export function focusByHour(focusLog = []) {
  const hours = Array.from({ length: 24 }, () => 0);
  let placed = 0;
  let skipped = 0;
  for (const e of focusLog || []) {
    const t = e?.at ? new Date(e.at) : null;
    if (!t || Number.isNaN(t.getTime())) {
      skipped += 1;
      continue;
    }
    hours[t.getHours()] += Number(e.minutes) || 0;
    placed += 1;
  }
  return { hours: hours.map(tidy), placed, skipped };
}

/** The hour you've focused most in, or null when nothing can be placed. */
export function bestHour(focusLog = []) {
  const { hours, placed } = focusByHour(focusLog);
  if (!placed) return null;
  let idx = 0;
  for (let i = 1; i < 24; i++) if (hours[i] > hours[idx]) idx = i;
  if (hours[idx] <= 0) return null;
  return { hour: idx, minutes: hours[idx] };
}

/** "2 pm", "midnight", "noon" — how you'd actually say the hour. */
export function hourLabel(h) {
  const n = ((Math.round(Number(h) || 0) % 24) + 24) % 24;
  if (n === 0) return "midnight";
  if (n === 12) return "noon";
  return n < 12 ? `${n} am` : `${n - 12} pm`;
}

/** Minutes per goal, biggest first. Unattributed time is its own row. */
export function focusByGoal(focusLog = [], goals = [], limit = 6) {
  const byId = new Map();
  for (const e of focusLog || []) {
    const key = e?.goalId || "__none";
    byId.set(key, (byId.get(key) || 0) + (Number(e?.minutes) || 0));
  }
  return [...byId.entries()]
    .map(([id, minutes]) => ({
      id,
      minutes: tidy(minutes),
      name:
        id === "__none"
          ? "Not tied to a goal"
          : goals.find((g) => g.id === id)?.name || "A deleted goal",
      color: goals.find((g) => g.id === id)?.color || null,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

/* Personal bests. Records are the rewarding part — they're the only numbers
   that go up and stay up. */
export function focusRecords(focusLog = []) {
  const byDay = minutesByDay(focusLog);
  let bestDay = { date: null, minutes: 0 };
  for (const [date, minutes] of byDay) {
    if (minutes > bestDay.minutes) bestDay = { date, minutes };
  }
  let bestSession = { minutes: 0, label: null, date: null };
  for (const e of focusLog || []) {
    const m = Number(e?.minutes) || 0;
    if (m > bestSession.minutes) {
      bestSession = { minutes: tidy(m), label: e.label || null, date: e.date || null };
    }
  }
  return { bestDay, bestSession, longestStreak: focusStreak(focusLog).longest };
}

/* The headline set. `windowDays` is the recent window compared against the one
   before it, so "this week" always has something to be measured against. */
export function focusSummary(focusLog = [], { refKey = todayKey(), windowDays = 7, goals = [] } = {}) {
  const log = focusLog || [];
  const from = shiftDay(refKey, -(windowDays - 1));
  const prevFrom = shiftDay(refKey, -(windowDays * 2 - 1));

  const inWindow = log.filter((e) => e?.date >= from && e.date <= refKey);
  const inPrev = log.filter((e) => e?.date >= prevFrom && e.date < from);

  const windowMin = totalMinutes(inWindow);
  const prevMin = totalMinutes(inPrev);
  const sessions = log.filter((e) => (Number(e?.minutes) || 0) > 0);
  const finished = sessions.filter((e) => e.source === "timer").length;
  const byDay = minutesByDay(log);
  const activeDays = [...byDay.values()].filter((m) => m > 0).length;

  return {
    lifetime: totalMinutes(log),
    today: tidy(byDay.get(refKey) || 0),
    window: windowMin,
    previous: prevMin,
    // Null rather than 0 or Infinity when there's nothing to compare against —
    // "up 100%" from a week you didn't use the app is not a real fact.
    change: prevMin > 0 ? Math.round(((windowMin - prevMin) / prevMin) * 100) : null,
    sessions: sessions.length,
    finished,
    averageSession: sessions.length ? tidy(totalMinutes(sessions) / sessions.length) : 0,
    activeDays,
    dailyAverage: activeDays ? tidy(totalMinutes(log) / activeDays) : 0,
    streak: focusStreak(log, refKey),
    records: focusRecords(log),
    best: bestHour(log),
    byGoal: focusByGoal(log, goals),
  };
}

/* Recent sessions, newest first, for the log at the bottom of the view. */
export function recentSessions(focusLog = [], limit = 12) {
  return [...(focusLog || [])]
    .filter((e) => e?.date)
    .sort((a, b) => {
      const at = a.at && b.at ? new Date(b.at) - new Date(a.at) : 0;
      if (at) return at;
      return a.date === b.date ? 0 : a.date < b.date ? 1 : -1;
    })
    .slice(0, limit);
}
