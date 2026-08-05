/* ============================================================
   Milestones
   ------------------------------------------------------------
   Optional checkpoints on a goal, and the thing that makes count-ups, habits
   and tasks one progress system instead of three: every trigger type resolves
   to the same {current, target} shape, read from the SAME source data those
   features already own. Nothing here keeps its own copy of a number.

   A trigger is {type, config} — nested rather than flattened onto the
   milestone — so a later compound condition ({all: [...]}) is an additive
   change rather than a destructive migration.

   Automatic milestones LATCH. Once you have brushed your teeth 40 times you
   have done it, and a milestone that un-achieved itself because a streak
   lapsed would be punishing rather than accurate. Latching also keeps
   recalculation deterministic: reached = stamped || current >= target, which
   depends only on stored state and can be recomputed at any time.
   ============================================================ */

import { uid, todayKey } from "./model.js";
import { goalHabitStats, habitStats } from "./habitProgress.js";
import { countUpValue } from "./countUpGoal.js";
import { personalRecords, scopeWorkouts, workoutScopeSummary } from "./workoutScope.js";

export const MILESTONE_STATUS = {
  UPCOMING: "upcoming",
  IN_PROGRESS: "inProgress",
  REACHED: "reached",
  ARCHIVED: "archived",
};

export const MILESTONE_TRIGGERS = {
  MANUAL: "manual",
  COUNT_UP_THRESHOLD: "countUpThreshold",
  HABIT_OCCURRENCE_TOTAL: "habitOccurrenceTotal",
  HABIT_COMPLETED_DAYS: "habitCompletedDays",
  HABIT_STREAK: "habitStreak",
  GOAL_TASK_COUNT: "goalTaskCount",
  SPECIFIC_TASKS: "specificTasks",
  WORKOUT_SESSIONS: "workoutSessions",
  WORKOUT_VOLUME: "workoutVolume",
  WORKOUT_WEEKLY_TARGET: "workoutWeeklyTarget",
  WORKOUT_PERSONAL_RECORD: "workoutPersonalRecord",
};

/* Which triggers update themselves from source data. A manual milestone is
   the only one the user marks by hand. */
export function isAutomaticTrigger(type) {
  return type !== MILESTONE_TRIGGERS.MANUAL;
}

export function createMilestone({
  goalId = null,
  title = "New milestone",
  description = "",
  trigger = { type: MILESTONE_TRIGGERS.MANUAL, config: {} },
  targetDate = null,
  order = 0,
  reward = null,
} = {}) {
  const now = new Date().toISOString();
  return {
    id: uid("ms"),
    goalId,
    title: title || "New milestone",
    description: description || "",
    trigger: {
      type: trigger?.type || MILESTONE_TRIGGERS.MANUAL,
      config: trigger?.config || {},
    },
    targetDate: targetDate || null,
    order,
    // Set when reached; also the record of WHEN, which is why an undo has to
    // be a deliberate act rather than a side effect.
    reachedAt: null,
    archivedAt: null,
    reward: reward ? createMilestoneReward(reward) : null,
    createdAt: now,
    updatedAt: now,
    // Matches the optimistic-concurrency convention task records already use.
    version: 1,
  };
}

export function createMilestoneReward({
  title = "",
  description = "",
  budget = null,
  currency = "USD",
} = {}) {
  return {
    title: title || "",
    description: description || "",
    budget: budget === null || budget === undefined ? null : Number(budget),
    currency: currency || "USD",
    claimedAt: null,
  };
}

// ---- reading -----------------------------------------------------------

export function readMilestones(goal) {
  const stored = goal?.milestones;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((milestone) => milestone && typeof milestone === "object" && milestone.id)
    .map((milestone, index) => ({
      ...milestone,
      order: Number.isFinite(milestone.order) ? milestone.order : index * 10,
      trigger: {
        type: milestone.trigger?.type || MILESTONE_TRIGGERS.MANUAL,
        config: milestone.trigger?.config || {},
      },
    }));
}

/* Milestones are OPT-IN. A goal that has never enabled them shows no
   timeline at all rather than an empty one — but a goal that already has
   milestone data counts as enabled, so nothing built before the toggle
   existed disappears. */
export function milestonesEnabled(goal) {
  if (goal?.milestonesEnabled === true) return true;
  if (goal?.milestonesEnabled === false) return false;
  return readMilestones(goal).length > 0;
}

// ---- trigger evaluation ------------------------------------------------

function habitFor(goal, habitId) {
  const habits = goal?.habits || [];
  return habits.find((habit) => habit.id === habitId) || null;
}

function numericTarget(config, key = "target") {
  const value = Number(config?.[key]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Where a milestone stands right now: {current, target, fraction}.
 *
 * Reads live source data every time. Nothing is cached onto the milestone,
 * so this can be recomputed at any point and cannot drift from the truth.
 */
export function evaluateMilestoneProgress(milestone, context = {}) {
  const { goal = null, tasks = [], workouts = [], refKey = todayKey() } = context;
  const { type, config } = milestone.trigger || {};
  const goalTasks = tasks.filter((task) => task?.goalId === goal?.id);

  const measure = () => {
    switch (type) {
      case MILESTONE_TRIGGERS.COUNT_UP_THRESHOLD:
        return { current: countUpValue(goal), target: numericTarget(config) };

      case MILESTONE_TRIGGERS.HABIT_OCCURRENCE_TOTAL: {
        const habit = habitFor(goal, config?.habitId);
        const current = habit
          ? habitStats(habit, refKey).totalOccurrences
          : goalHabitStats(goal, refKey).totalOccurrences;
        return { current, target: numericTarget(config) };
      }

      case MILESTONE_TRIGGERS.HABIT_COMPLETED_DAYS: {
        const habit = habitFor(goal, config?.habitId);
        const current = habit
          ? habitStats(habit, refKey).completedDays
          : goalHabitStats(goal, refKey).completedDays;
        return { current, target: numericTarget(config) };
      }

      case MILESTONE_TRIGGERS.HABIT_STREAK: {
        const habit = habitFor(goal, config?.habitId);
        const current = habit
          ? habitStats(habit, refKey).completedDayStreak
          : goalHabitStats(goal, refKey).bestStreak;
        return { current, target: numericTarget(config) };
      }

      case MILESTONE_TRIGGERS.GOAL_TASK_COUNT:
        return {
          current: goalTasks.filter((task) => task.done).length,
          target: numericTarget(config),
        };

      case MILESTONE_TRIGGERS.SPECIFIC_TASKS: {
        const wanted = Array.isArray(config?.taskIds) ? config.taskIds : [];
        const done = wanted.filter((id) =>
          tasks.some((task) => task?.id === id && task.done)
        ).length;
        return { current: done, target: wanted.length };
      }

      case MILESTONE_TRIGGERS.WORKOUT_SESSIONS:
        return {
          current: scopeWorkouts(workouts, goal?.id).length,
          target: numericTarget(config),
        };

      case MILESTONE_TRIGGERS.WORKOUT_VOLUME: {
        const summary = workoutScopeSummary({
          workouts,
          goals: [goal].filter(Boolean),
          scope: goal?.id,
          refKey,
        });
        return { current: summary.weekVolume, target: numericTarget(config) };
      }

      case MILESTONE_TRIGGERS.WORKOUT_WEEKLY_TARGET: {
        const summary = workoutScopeSummary({
          workouts,
          goals: [goal].filter(Boolean),
          scope: goal?.id,
          refKey,
        });
        return {
          current: summary.weekCount,
          target: numericTarget(config) || summary.target || 0,
        };
      }

      case MILESTONE_TRIGGERS.WORKOUT_PERSONAL_RECORD: {
        const records = personalRecords(scopeWorkouts(workouts, goal?.id), Infinity);
        const match = records.find((record) => record.exerciseId === config?.exerciseId);
        return { current: match?.weight || 0, target: numericTarget(config, "weight") };
      }

      case MILESTONE_TRIGGERS.MANUAL:
      default:
        // A manual milestone has no measurable source; it is 0 or 1.
        return { current: milestone.reachedAt ? 1 : 0, target: 1 };
    }
  };

  const { current, target } = measure();
  const safeTarget = Number.isFinite(target) ? target : 0;
  const safeCurrent = Number.isFinite(current) ? current : 0;
  return {
    current: safeCurrent,
    target: safeTarget,
    fraction: safeTarget > 0 ? Math.max(0, Math.min(1, safeCurrent / safeTarget)) : 0,
  };
}

/**
 * A milestone resolved for display: progress, status, reward state.
 *
 * `reached` latches on the stamp, so recomputing never un-achieves something
 * the user already earned.
 */
export function resolveMilestone(milestone, context = {}) {
  const progress = evaluateMilestoneProgress(milestone, context);
  const archived = Boolean(milestone.archivedAt);
  const automatic = isAutomaticTrigger(milestone.trigger?.type);
  const meetsTarget = progress.target > 0 && progress.current >= progress.target;
  const reached = Boolean(milestone.reachedAt) || (automatic && meetsTarget);

  let status = MILESTONE_STATUS.UPCOMING;
  if (archived) status = MILESTONE_STATUS.ARCHIVED;
  else if (reached) status = MILESTONE_STATUS.REACHED;
  else if (progress.current > 0) status = MILESTONE_STATUS.IN_PROGRESS;

  const refKey = context.refKey || todayKey();
  return {
    ...milestone,
    ...progress,
    automatic,
    reached,
    status,
    // Overdue is stated, not scolded about — the UI wording stays neutral.
    overdue: Boolean(milestone.targetDate && !reached && milestone.targetDate < refKey),
    rewardUnlocked: Boolean(reached && milestone.reward?.title),
    rewardClaimed: Boolean(milestone.reward?.claimedAt),
  };
}

/**
 * The timeline: active milestones in display order.
 *
 * Explicit order wins, because the user arranged it. Target dates only break
 * ties — sorting by date first would shuffle a deliberately ordered roadmap
 * the moment somebody added one date. Undated milestones keep their place
 * rather than being pushed to the end; no date is invented for them.
 */
export function goalTimeline(goal, context = {}) {
  const resolved = readMilestones(goal)
    .map((milestone) => resolveMilestone(milestone, { ...context, goal }))
    .filter((milestone) => milestone.status !== MILESTONE_STATUS.ARCHIVED);

  resolved.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    return 0;
  });
  return resolved;
}

export function archivedMilestones(goal, context = {}) {
  return readMilestones(goal)
    .map((milestone) => resolveMilestone(milestone, { ...context, goal }))
    .filter((milestone) => milestone.status === MILESTONE_STATUS.ARCHIVED);
}

/** The next thing to aim at — what the timeline highlights as "current". */
export function nextMilestone(goal, context = {}) {
  return goalTimeline(goal, context).find((milestone) => !milestone.reached) || null;
}

export function milestoneSummary(goal, context = {}) {
  const timeline = goalTimeline(goal, context);
  const reached = timeline.filter((milestone) => milestone.reached).length;
  return {
    total: timeline.length,
    reached,
    fraction: timeline.length ? reached / timeline.length : 0,
    next: timeline.find((milestone) => !milestone.reached) || null,
  };
}

// ---- mutations ---------------------------------------------------------

function touch(milestone) {
  return {
    ...milestone,
    updatedAt: new Date().toISOString(),
    version: (Number(milestone.version) || 1) + 1,
  };
}

function mapMilestones(goal, id, change) {
  return {
    ...goal,
    milestones: readMilestones(goal).map((milestone) =>
      milestone.id === id ? touch(change(milestone)) : milestone
    ),
  };
}

export function addMilestone(goal, options = {}) {
  const existing = readMilestones(goal);
  const order = existing.reduce((max, milestone) => Math.max(max, milestone.order), 0) + 10;
  const milestone = createMilestone({ goalId: goal?.id, order, ...options });
  return {
    ...goal,
    milestonesEnabled: true,
    milestones: [...existing, milestone],
  };
}

export function updateMilestone(goal, id, patch) {
  return mapMilestones(goal, id, (milestone) => ({ ...milestone, ...patch }));
}

/** Mark a manual milestone reached. Automatic ones follow their data. */
export function markMilestoneReached(goal, id, at = null) {
  return mapMilestones(goal, id, (milestone) =>
    milestone.reachedAt ? milestone : { ...milestone, reachedAt: at || new Date().toISOString() }
  );
}

/** Undo a completion. Deliberate by design — it erases the reached date. */
export function undoMilestoneReached(goal, id) {
  return mapMilestones(goal, id, (milestone) => ({ ...milestone, reachedAt: null }));
}

/** Stamp an automatic milestone the first time its data crosses the target. */
export function latchReachedMilestones(goal, context = {}, at = null) {
  const milestones = readMilestones(goal);
  if (!milestones.length) return goal;

  let changed = false;
  const next = milestones.map((milestone) => {
    if (milestone.reachedAt || milestone.archivedAt) return milestone;
    if (!isAutomaticTrigger(milestone.trigger?.type)) return milestone;
    const progress = evaluateMilestoneProgress(milestone, { ...context, goal });
    if (progress.target <= 0 || progress.current < progress.target) return milestone;
    changed = true;
    return touch({ ...milestone, reachedAt: at || new Date().toISOString() });
  });

  return changed ? { ...goal, milestones: next } : goal;
}

export function archiveMilestone(goal, id, at = null) {
  return mapMilestones(goal, id, (milestone) => ({
    ...milestone,
    archivedAt: at || new Date().toISOString(),
  }));
}

export function restoreMilestone(goal, id) {
  return mapMilestones(goal, id, (milestone) => ({ ...milestone, archivedAt: null }));
}

/** Permanently drop a milestone. The UI must confirm before calling this. */
export function removeMilestone(goal, id) {
  return { ...goal, milestones: readMilestones(goal).filter((m) => m.id !== id) };
}

/** Move a milestone within the timeline, renumbering to 10, 20, 30… */
export function reorderMilestones(goal, orderedIds) {
  const milestones = readMilestones(goal);
  const byId = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const rest = milestones.filter((milestone) => !orderedIds.includes(milestone.id));
  return {
    ...goal,
    milestones: [...ordered, ...rest].map((milestone, index) => ({
      ...milestone,
      order: (index + 1) * 10,
    })),
  };
}

export function claimMilestoneReward(goal, id, at = null) {
  return mapMilestones(goal, id, (milestone) =>
    milestone.reward
      ? { ...milestone, reward: { ...milestone.reward, claimedAt: at || new Date().toISOString() } }
      : milestone
  );
}

export function unclaimMilestoneReward(goal, id) {
  return mapMilestones(goal, id, (milestone) =>
    milestone.reward ? { ...milestone, reward: { ...milestone.reward, claimedAt: null } } : milestone
  );
}

/* Turning the timeline off HIDES it; the milestones stay on the record so
   the switch is reversible. Only removeMilestone destroys anything. */
export function setMilestonesEnabled(goal, enabled) {
  return { ...goal, milestonesEnabled: Boolean(enabled) };
}
