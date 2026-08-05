/* ============================================================
   Count-up goals
   ------------------------------------------------------------
   A goal whose progress is a number that grows: "make 15 new connections",
   "read 12 books". Recording one needs a tap, not a new task each time.

   THE CURRENT VALUE IS DERIVED, NEVER STORED AS THE TRUTH.

     value = start + Σ (deltas of events that have not been reversed)

   Storing the running total would make every bug a permanent, silent
   corruption — and there would be no way to tell a wrong total from a right
   one after the fact. Deriving it means the log IS the record: undo is
   marking an event reversed rather than subtracting and hoping, and a
   double-tap or a sync replay is harmless because events are applied by id.

   Note on this codebase: `countUps` in the store is a DIFFERENT, older thing —
   an elapsed-days counter ("Days showing up"). It is untouched by any of this.
   ============================================================ */

import { uid } from "./model.js";

export const GOAL_PROGRESS_MODES = { STANDARD: "standard", COUNT_UP: "countUp" };
export const DEFAULT_COUNT_UP_STEP = 1;

export function goalProgressMode(goal) {
  return goal?.progressMode === GOAL_PROGRESS_MODES.COUNT_UP
    ? GOAL_PROGRESS_MODES.COUNT_UP
    : GOAL_PROGRESS_MODES.STANDARD;
}

export function isCountUpGoal(goal) {
  return goalProgressMode(goal) === GOAL_PROGRESS_MODES.COUNT_UP;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * The count-up configuration for a goal, with every field defaulted.
 *
 * target and min are deliberately allowed to be null: an open-ended count is
 * a first-class case, and a null minimum means "no floor" rather than zero.
 */
export function createCountUpMetric({
  name = "Count",
  unit = "",
  start = 0,
  target = null,
  step = DEFAULT_COUNT_UP_STEP,
  min = 0,
} = {}) {
  const startValue = finiteOr(start, 0);
  return {
    metricId: uid("metric"),
    name: name || "Count",
    unit: unit || "",
    start: startValue,
    target: target === null || target === undefined ? null : finiteOr(target, null),
    step: Math.max(1, Math.round(finiteOr(step, DEFAULT_COUNT_UP_STEP))),
    min: min === null || min === undefined ? null : finiteOr(min, 0),
    createdAt: new Date().toISOString(),
  };
}

export function readCountUpMetric(goal) {
  const stored = goal?.countUp;
  if (!stored || typeof stored !== "object") return null;
  return {
    metricId: stored.metricId || "metric",
    name: stored.name || "Count",
    unit: stored.unit || "",
    start: finiteOr(stored.start, 0),
    target:
      stored.target === null || stored.target === undefined
        ? null
        : finiteOr(stored.target, null),
    step: Math.max(1, Math.round(finiteOr(stored.step, DEFAULT_COUNT_UP_STEP))),
    min: stored.min === null || stored.min === undefined ? null : finiteOr(stored.min, 0),
    createdAt: stored.createdAt || null,
  };
}

/** Events in recorded order, oldest first, ignoring anything malformed. */
export function readCountUpEvents(goal) {
  const events = goal?.countUpEvents;
  if (!Array.isArray(events)) return [];
  return events.filter(
    (event) => event && typeof event === "object" && event.id && Number.isFinite(Number(event.delta))
  );
}

/** An event that still counts toward the total. */
function isLive(event) {
  return !event.reversedAt;
}

/**
 * The current value: start plus every live delta.
 *
 * Reversed events stay in the log — the history of what happened is not the
 * same as the arithmetic, and deleting them would destroy the audit trail the
 * undo feature depends on.
 */
export function countUpValue(goal) {
  const metric = readCountUpMetric(goal);
  if (!metric) return 0;
  return readCountUpEvents(goal)
    .filter(isLive)
    .reduce((total, event) => total + Number(event.delta), metric.start);
}

/** What a delta WOULD do, clamped to the configured minimum. */
export function clampCountUpDelta(goal, delta) {
  const metric = readCountUpMetric(goal);
  if (!metric) return 0;
  const requested = Math.round(finiteOr(delta, 0));
  if (requested === 0) return 0;
  if (metric.min === null) return requested;
  const current = countUpValue(goal);
  // Never silently drop below the floor: shrink the step to land exactly on
  // it, and refuse entirely once already there.
  return Math.max(requested, metric.min - current);
}

/**
 * Record an adjustment.
 *
 * `id` is supplied by the caller so the same tap can be applied twice — by a
 * double click, an optimistic retry, or a sync replay — without counting
 * twice. Returns the unchanged goal when the event is already present or the
 * delta would do nothing.
 */
export function applyCountUpEvent(
  goal,
  { id = null, delta = 1, note = "", source = "manual", at = null } = {}
) {
  const metric = readCountUpMetric(goal);
  if (!metric) return goal;

  const eventId = id || uid("cue");
  const events = readCountUpEvents(goal);
  if (events.some((event) => event.id === eventId)) return goal; // already applied

  const applied = clampCountUpDelta(goal, delta);
  if (applied === 0) return goal;

  const event = {
    id: eventId,
    metricId: metric.metricId,
    delta: applied,
    // The resulting value is denormalized for the history list only. Totals
    // are always recomputed from deltas, so a stale one here cannot mislead
    // the arithmetic.
    value: countUpValue(goal) + applied,
    note: String(note || "").slice(0, 200),
    source,
    at: at || new Date().toISOString(),
    reversedAt: null,
  };

  return { ...goal, countUpEvents: [...(goal.countUpEvents || []), event] };
}

/** The most recent adjustment that has not already been undone. */
export function lastLiveCountUpEvent(goal) {
  const events = readCountUpEvents(goal).filter(isLive);
  return events.length ? events[events.length - 1] : null;
}

/**
 * Undo an adjustment by marking it reversed.
 *
 * The event is kept. History is the point: a reversed entry says "this
 * happened and was taken back", which a deletion cannot.
 */
export function reverseCountUpEvent(goal, eventId, at = null) {
  const events = readCountUpEvents(goal);
  const target = events.find((event) => event.id === eventId);
  if (!target || target.reversedAt) return goal;

  return {
    ...goal,
    countUpEvents: (goal.countUpEvents || []).map((event) =>
      event.id === eventId
        ? { ...event, reversedAt: at || new Date().toISOString() }
        : event
    ),
  };
}

export function undoLastCountUpEvent(goal, at = null) {
  const last = lastLiveCountUpEvent(goal);
  return last ? reverseCountUpEvent(goal, last.id, at) : goal;
}

/** Newest-first adjustments for the history list. */
export function countUpHistory(goal, limit = 20) {
  return [...readCountUpEvents(goal)].reverse().slice(0, limit);
}

/**
 * Progress toward the target.
 *
 * With no target this reports `fraction: null` rather than a number, so the
 * UI shows a count instead of inventing a misleading percentage. The fraction
 * is capped at 1 while `value` keeps the real figure, so passing the target
 * fills the bar without hiding that you went past it.
 */
export function countUpProgress(goal) {
  const metric = readCountUpMetric(goal);
  if (!metric) return null;
  const value = countUpValue(goal);
  const { target, start } = metric;

  if (target === null) {
    return { value, target: null, fraction: null, complete: false, openEnded: true };
  }

  const span = target - start;
  const fraction = span <= 0 ? (value >= target ? 1 : 0) : (value - start) / span;
  return {
    value,
    target,
    fraction: Math.max(0, Math.min(1, fraction)),
    complete: value >= target,
    openEnded: false,
  };
}
