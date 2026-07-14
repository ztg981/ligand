/* badgeProgress — "almost there" detection for the badge system.
   ------------------------------------------------------------
   Goal-gradient effect (Hull 1932; Kivetz, Urminsky & Zheng 2006):
   effort accelerates as a visible reward gets close. ADHD reward
   research points the same way — near, concrete, visualized rewards
   recruit motivation that distant abstract ones don't. So instead of
   only celebrating badges AFTER they unlock, we surface the one or
   two badges the user is CLOSEST to, with real progress bars.

   Only countable badges participate (boolean one-shot badges can't
   show a gradient). Pure data + math, no React — testable directly.
   The stats object is the same one App.jsx builds for useBadges.
   ============================================================ */

import { BADGES } from "./badges.js";

/* stat key + target for every quantifiable badge. `label` words the
   remaining distance in warm, concrete terms. */
const PROGRESS_DEFS = {
  "on-a-roll":      { stat: "tasksDone",         target: 10, unit: "task" },
  "thirty-up":      { stat: "maxCountUp",        target: 30, unit: "day" },
  "the-long-game":  { stat: "maxGoalAgeDays",    target: 30, unit: "day" },
  "five-goals":     { stat: "goalCount",         target: 5,  unit: "goal" },
  "seven-days":     { stat: "maxStreak",         target: 7,  unit: "day" },
  "showing-up":     { stat: "visitDays",         target: 7,  unit: "day" },
  "daily-ritual":   { stat: "maxVisitStreak",    target: 7,  unit: "day" },
  "polymath":       { stat: "habitGoalCount",    target: 3,  unit: "goal" },
  "deep-focus":     { stat: "focusSessions",     target: 10, unit: "session" },
  "reflective":     { stat: "reflectionCount",   target: 7,  unit: "reflection" },
  "iron-will":      { stat: "workoutCount",      target: 30, unit: "workout" },
  "consistent":     { stat: "maxWorkoutsInWeek", target: 3,  unit: "workout" },
  "streak-builder": { stat: "workoutWeekStreak", target: 4,  unit: "week" },
};

/** Progress rows for every unearned, quantifiable badge.
 *  Each: { badge, now, target, pct, remaining, unit } sorted by pct desc
 *  (closest first). Badges with zero progress are excluded — a full row
 *  of empty bars is noise, not motivation. */
export function badgeProgressRows(stats, unlockedIds = []) {
  if (!stats) return [];
  const unlocked = new Set(unlockedIds);
  const rows = [];
  for (const badge of BADGES) {
    if (unlocked.has(badge.id)) continue;
    const def = PROGRESS_DEFS[badge.id];
    if (!def) continue;
    const now = Math.max(0, Math.min(Number(stats[def.stat]) || 0, def.target));
    if (now <= 0 || now >= def.target) continue; // nothing started, or already earned (unlock pending)
    rows.push({
      badge,
      now,
      target: def.target,
      pct: now / def.target,
      remaining: def.target - now,
      unit: def.unit,
    });
  }
  rows.sort((a, b) => b.pct - a.pct || a.remaining - b.remaining);
  return rows;
}

/** The closest `limit` badges (default 2). */
export function nearestBadges(stats, unlockedIds = [], limit = 2) {
  return badgeProgressRows(stats, unlockedIds).slice(0, limit);
}

/** "2 more days" — concrete remaining-distance wording. */
export function remainingLabel(row) {
  const n = row.remaining;
  const unit = n === 1 ? row.unit : `${row.unit}s`;
  return `${n} more ${unit}`;
}
