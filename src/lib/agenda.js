/* ============================================================
   Agenda — pure helpers that pick the single most relevant
   "what's next" items from the day's blocks, alarms, and tasks.
   Powers the Up-next glance card. No React, no clocks read here:
   the caller passes `nowMin` (minutes since local midnight) and
   the local weekday so the logic stays deterministic + testable.
   ============================================================ */

/* The block happening now, else the next one starting today.
   Returns { block, state: "now" | "next" } or null. Blocks are the
   day-dial shape: { date, start, end, title, category, done }. */
export function nextBlockForDay(dayBlocks = [], todayKeyStr, nowMin) {
  const todays = dayBlocks
    .filter((b) => b && b.date === todayKeyStr && !b.done)
    .sort((a, b) => a.start - b.start);

  // Active block (started, not yet ended) wins.
  const active = todays.find((b) => b.start <= nowMin && nowMin < b.end);
  if (active) return { block: active, state: "now" };

  // Otherwise the soonest block still to come today.
  const upcoming = todays.find((b) => b.start > nowMin);
  return upcoming ? { block: upcoming, state: "next" } : null;
}

/* Alarm-day arrays use Mon=0..Sun=6; JS Date.getDay() is Sun=0..Sat=6.
   Empty days array means "every day". */
function alarmFiresOn(alarm, jsWeekday) {
  if (!alarm?.days || alarm.days.length === 0) return true;
  const monFirst = (jsWeekday + 6) % 7; // Sun(0)->6, Mon(1)->0, ...
  return alarm.days.includes(monFirst);
}

/* The next enabled alarm still to fire today. Returns the alarm (with a
   parsed `min`) or null. `jsWeekday` is Date.getDay() for today. */
export function nextAlarmToday(alarms = [], nowMin, jsWeekday) {
  const candidates = [];
  for (const a of alarms) {
    if (!a?.enabled) continue;
    if (!alarmFiresOn(a, jsWeekday)) continue;
    const [h, m] = String(a.time || "").split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    const min = h * 60 + m;
    if (min < nowMin) continue; // already passed today
    candidates.push({ ...a, min });
  }
  candidates.sort((x, y) => x.min - y.min);
  return candidates[0] || null;
}

/* The gentlest "one thing" task to suggest: prefer Today, then General,
   then anything; among those the shortest wording (least daunting). Mirrors
   the Home "pick one" heuristic so the glance agrees with the dashboard. */
export function suggestedTask(tasks = []) {
  const open = tasks.filter((t) => t && !t.done);
  if (open.length === 0) return null;
  const rank = (t) => (t.label === "Today" ? 0 : t.label === "General" ? 1 : 2);
  return [...open].sort(
    (a, b) => rank(a) - rank(b) || (a.text || "").length - (b.text || "").length
  )[0];
}
