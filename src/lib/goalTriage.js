/* goalTriage — detecting goals that quietly stopped fitting your life,
   and deciding when to offer a guided "fresh start" review.
   ------------------------------------------------------------
   Research grounding (design notes, not clinical claims):
   - Goal disengagement/reengagement (Wrosch et al. 2003+): the ability
     to let go of unattainable goals and re-engage with adjusted ones
     predicts better well-being and MORE follow-through, not less. The
     hard part is that abandoning a goal feels like failing — so the UI
     reframes it as information ("June's plan met July's reality").
   - Self-compassion reduces procrastination and avoidance (Sirois
     2014). A pile of untouched goals makes people avoid the whole app;
     a kind, structured way to reshape them removes the avoidance
     trigger. Copy here never says "failed", "behind", or "missed".
   - Fresh-start effect (Dai, Milkman & Riis 2014): returning after a
     gap IS a temporal landmark — the ideal moment to offer a reset.
   - Choice architecture: each flagged goal gets a handful of BIG
     concrete moves (shrink it, move the date, shelve it, keep it)
     rather than a free-form edit screen — decisions, not homework.

   Pure functions only (no React) so everything is testable.
   ============================================================ */

import { todayKey, daysBetween, goalTargetDate, isGoalOverdue } from "./model.js";
import { lastActivityKey } from "./goalHealth.js";

/* A goal is triage-worthy when any of these hold. Reasons are ordered
   by how strongly they suggest the goal needs reshaping. */
export const REASONS = {
  DATE_PASSED: "date-passed",     // target date is behind us
  NEVER_STARTED: "never-started", // ≥ 14 days old with zero activity ever
  GONE_QUIET: "gone-quiet",       // started once, nothing for ≥ 14 days
  WINDOW_TIGHT: "window-tight",   // > 75% of its time window used, ~no progress
};

const NEVER_STARTED_AFTER_DAYS = 14;
const QUIET_AFTER_DAYS = 14;
const WINDOW_TIGHT_FRACTION = 0.75;

// How many active goals feel like a comfortable plate. Beyond MAX the
// review is offered even without individual off-track goals (goal
// competition dilutes effort across all of them).
export const COMFORTABLE_GOALS = 5;

/** Activity + timing signals for one goal. */
export function goalSignals(goal, tasks = [], today = todayKey()) {
  const goalTasks = tasks.filter((t) => t.goalId === goal.id);
  const tasksDone = goalTasks.filter((t) => t.done).length;
  const habitChecks = (goal.habits || []).reduce(
    (n, h) => n + (h.checkIns || []).length,
    0
  );
  const reflections = (goal.reflections || []).length;
  const lastActivity = lastActivityKey(goal, tasks);
  const createdKey = goal.createdAt ? goal.createdAt.slice(0, 10) : null;
  const ageDays = createdKey ? Math.max(0, daysBetween(createdKey, today)) : 0;
  const target = goalTargetDate(goal);

  // Fraction of the created→target window already elapsed (null without dates).
  let windowUsed = null;
  if (createdKey && target && target > createdKey) {
    const total = daysBetween(createdKey, target);
    const used = daysBetween(createdKey, today);
    windowUsed = Math.min(1, Math.max(0, used / total));
  }

  const started = tasksDone > 0 || habitChecks > 0 || reflections > 0;
  return {
    createdKey,
    ageDays,
    target,
    windowUsed,
    started,
    tasksDone,
    taskCount: goalTasks.length,
    habitChecks,
    reflections,
    lastActivity,
    quietDays: lastActivity ? daysBetween(lastActivity, today) : null,
  };
}

/** Reasons this goal deserves a look (possibly empty). */
export function goalTriageReasons(goal, tasks = [], today = todayKey()) {
  // Only active, non-recovery goals are reviewed; recovery goals are
  // private and have no deadlines, done/archived goals are already settled.
  if (goal.status !== "active" || goal.type === "recovery") return [];
  const s = goalSignals(goal, tasks, today);
  const reasons = [];

  if (s.target && isGoalOverdue(goal, today)) reasons.push(REASONS.DATE_PASSED);
  if (!s.started && s.ageDays >= NEVER_STARTED_AFTER_DAYS)
    reasons.push(REASONS.NEVER_STARTED);
  if (s.started && s.quietDays != null && s.quietDays >= QUIET_AFTER_DAYS)
    reasons.push(REASONS.GONE_QUIET);
  if (
    !reasons.includes(REASONS.DATE_PASSED) &&
    s.windowUsed != null &&
    s.windowUsed >= WINDOW_TIGHT_FRACTION &&
    !s.started
  )
    reasons.push(REASONS.WINDOW_TIGHT);

  return reasons;
}

/** All goals worth reviewing, most off-track first.
 *  → [{ goal, reasons, signals }] */
export function triageGoals(goals = [], tasks = [], today = todayKey()) {
  const weight = {
    [REASONS.DATE_PASSED]: 4,
    [REASONS.NEVER_STARTED]: 3,
    [REASONS.WINDOW_TIGHT]: 2,
    [REASONS.GONE_QUIET]: 1,
  };
  return goals
    .map((goal) => ({
      goal,
      reasons: goalTriageReasons(goal, tasks, today),
      signals: goalSignals(goal, tasks, today),
    }))
    .filter((x) => x.reasons.length > 0)
    .sort(
      (a, b) =>
        b.reasons.reduce((n, r) => n + weight[r], 0) -
        a.reasons.reduce((n, r) => n + weight[r], 0)
    );
}

/** Should we OFFER the fresh-start review right now?
 *  state: { lastReviewAt, snoozedUntil } (day-keys or null)
 *  Triggers when there's a real pile-up or the user returns from a gap
 *  to off-track goals — but never during a snooze, never more than once
 *  per cooldown, and never for a single slightly-quiet goal. */
export function shouldOfferReview({
  items = [],
  activeGoalCount = 0,
  daysAway = 0,
  state = {},
  today = todayKey(),
  cooldownDays = 7,
  snoozeDays = 3,
} = {}) {
  void snoozeDays; // documented default lives with the caller's snooze action
  if (!items.length) return false;
  if (state.snoozedUntil && state.snoozedUntil >= today) return false;
  if (state.lastReviewAt && daysBetween(state.lastReviewAt, today) < cooldownDays)
    return false;

  const overloaded = activeGoalCount > COMFORTABLE_GOALS && items.length >= 3;
  const backFromGap = daysAway >= 4 && items.length >= 2;
  const bigPile = items.length >= 5;
  return overloaded || backFromGap || bigPile;
}

/* ---------- copy helpers (kind, concrete, no shame) ---------- */

const REASON_LINES = {
  [REASONS.DATE_PASSED]: (s) =>
    `Its target date (${s.target}) is behind us now`,
  [REASONS.NEVER_STARTED]: (s) =>
    `Set ${describeAge(s.ageDays)} ago — still waiting for its first step`,
  [REASONS.GONE_QUIET]: (s) =>
    `Nothing new in ${s.quietDays} days — it may just need a smaller shape`,
  [REASONS.WINDOW_TIGHT]: () =>
    `Most of its time window has passed without a start`,
};

function describeAge(days) {
  if (days >= 60) return `${Math.round(days / 30)} months`;
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return `${days} days`;
}

/** One friendly sentence per reason. */
export function reasonLine(reason, signals) {
  const fn = REASON_LINES[reason];
  return fn ? fn(signals) : "";
}

/** Intro line for the review, sized to the situation. */
export function reviewIntroLine(count, daysAway = 0) {
  if (daysAway >= 4) {
    return count === 1
      ? "While you were away, one goal drifted out of date. Two minutes puts it right."
      : `While you were away, ${count} goals drifted out of date. Plans age — that's information, not a verdict. A few taps reshapes them.`;
  }
  return count === 1
    ? "One goal looks out of step with your life right now. Want to reshape it?"
    : `${count} goals look out of step with your life right now. Reshaping them takes about two minutes.`;
}
