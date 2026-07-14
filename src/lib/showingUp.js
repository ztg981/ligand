/* showingUp — the flexible weekly "showing up" target.
   ------------------------------------------------------------
   Research grounding (design notes, not medical claims):
   - Lally et al. 2010: missing a single day does not derail habit
     formation — so the unit of commitment here is the WEEK, not an
     all-or-nothing daily chain. A 4-of-7 week absorbs bad days.
   - ADHD-friendly framing: a daily streak dies the first hard day and
     takes motivation with it (abstinence-violation effect). A weekly
     target can still be "made" after a missed Monday, so there is
     always a live, reachable goal — which is what actually pulls a
     user back in (goal-gradient: effort rises near a reachable end).
   - Weeks that fall short are simply not counted. No lost progress,
     no red marks — same "pause, don't shatter" rule habits use.

   Pure date/data helpers only (no React) so they can be tested. Weeks
   are Monday-anchored, matching the habit setting's default.
   ============================================================ */

export const DEFAULT_TARGET = 4; // days/week; 7 is allowed but not the default on purpose
export const TARGET_CHOICES = [2, 3, 4, 5, 6, 7];

const DAY_MS = 86400000;

function toDate(key) {
  return new Date(`${key}T00:00:00`);
}

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Monday of the week containing dayKey, as a YYYY-MM-DD key. */
export function weekStartKey(dayKey) {
  const d = toDate(dayKey);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return toKey(d);
}

/** The 7 day-keys (Mon..Sun) of the week containing dayKey. */
export function weekDayKeys(dayKey) {
  const start = toDate(weekStartKey(dayKey));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toKey(d);
  });
}

/** Summarize the current week for display.
 *  Returns { days, count, target, met, daysLeft, toGo, reachable }
 *  - days: [{ key, visited, isToday, isFuture }] Mon..Sun
 *  - count: distinct visit days so far this week
 *  - met: count >= target
 *  - daysLeft: days remaining in the week INCLUDING today
 *  - toGo: days still needed (0 when met)
 *  - reachable: whether the target can still be made this week
 */
export function summarizeWeek({ visitDates = [], target = DEFAULT_TARGET, todayStr }) {
  const visits = new Set(visitDates);
  const keys = weekDayKeys(todayStr);
  const days = keys.map((key) => ({
    key,
    visited: visits.has(key),
    isToday: key === todayStr,
    isFuture: key > todayStr,
  }));
  const count = days.filter((d) => d.visited).length;
  const met = count >= target;
  const daysLeft = days.filter((d) => d.isToday || d.isFuture).length;
  // Days that could still become visits: today (if not yet visited) + future days.
  const stillOpen = days.filter((d) => (d.isToday && !d.visited) || d.isFuture).length;
  const toGo = Math.max(0, target - count);
  return { days, count, target, met, daysLeft, toGo, reachable: met || toGo <= stillOpen };
}

/** One forgiving line for the card. Never shames a short week. */
export function weekLine(summary) {
  const { count, target, met, toGo, reachable } = summary;
  if (met) {
    return count > target
      ? "Week made — everything extra is a bonus."
      : "That's your week made. Anything more is extra credit.";
  }
  if (!reachable) {
    // The target can't be hit this week. No failure language — the week
    // simply stays quiet, exactly like a paused habit streak.
    return "This week can be a quiet one. A fresh week is already on its way.";
  }
  if (count === 0) return `A fresh week. ${target} open days make it count.`;
  if (toGo === 1) return "One more day makes your week.";
  return `${toGo} more days make your week. Any days work.`;
}

/** Bring the kept-weeks record up to date.
 *
 *  state: { target, keptWeeks, lastCountedWeek } (lastCountedWeek = the
 *  Monday key of the most recent COMPLETED week already reconciled).
 *  Only fully completed weeks (before the current one) are counted, each
 *  at most once. Weeks that missed the target advance the cursor without
 *  incrementing — they are skipped, never penalized.
 *
 *  Returns { state, newlyKept } where newlyKept is how many kept weeks
 *  were just added (lets the UI celebrate a freshly banked week).
 */
export function reconcileKeptWeeks(state, visitDates = [], todayStr) {
  const target = state?.target ?? DEFAULT_TARGET;
  const keptWeeks = state?.keptWeeks ?? 0;
  const currentWeek = weekStartKey(todayStr);

  // Earliest week we could possibly evaluate from the visit history.
  const sorted = [...new Set(visitDates)].sort();
  if (!sorted.length) {
    return { state: { target, keptWeeks, lastCountedWeek: state?.lastCountedWeek ?? null }, newlyKept: 0 };
  }

  let cursor = state?.lastCountedWeek
    ? toDate(state.lastCountedWeek)
    : null;
  const firstWeek = toDate(weekStartKey(sorted[0]));
  // Start from the week after the last counted one, or the first visit's week.
  let week = cursor ? new Date(cursor.getTime() + 7 * DAY_MS) : firstWeek;

  const visits = new Set(sorted);
  let added = 0;
  let lastCounted = state?.lastCountedWeek ?? null;
  const currentWeekDate = toDate(currentWeek);

  while (week < currentWeekDate) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(week.getTime() + i * DAY_MS);
      if (visits.has(toKey(d))) n++;
    }
    if (n >= target) added++;
    lastCounted = toKey(week);
    week = new Date(week.getTime() + 7 * DAY_MS);
  }

  return {
    state: { target, keptWeeks: keptWeeks + added, lastCountedWeek: lastCounted },
    newlyKept: added,
  };
}
