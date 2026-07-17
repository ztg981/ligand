/* ============================================================
   Calendar — pure helpers for the month/week overview tab.
   ------------------------------------------------------------
   The Calendar is the wide-angle lens; the Day tab stays the
   close-up. These helpers merge everything Ligand knows is
   SCHEDULED (day blocks, planned workouts, dated tasks, alarms,
   goal target dates) into per-day item lists and a month grid.
   No React, no storage — unit-tested pure functions only.
   ============================================================ */

import { goalTargetDate, shiftDay, todayKey } from "./model.js";
import { categoryById, minutesToLabel } from "./dayPlanner.js";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAY_MIN = ["M", "T", "W", "T", "F", "S", "S"]; // Mon-first

/** "2026-07" from a date key or Date. */
export function monthKey(d = new Date()) {
  const key = typeof d === "string" ? d : todayKey(d);
  return key.slice(0, 7);
}

export function monthLabel(mKey) {
  const [y, m] = mKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function shiftMonth(mKey, delta) {
  const [y, m] = mKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Monday-first weekday index (Mon=0 … Sun=6) for a YYYY-MM-DD key. */
export function weekdayIndex(dayKey) {
  return (new Date(dayKey + "T00:00:00").getDay() + 6) % 7;
}

/**
 * A Monday-first month grid: array of weeks, each week an array of 7
 * { key, inMonth } cells. Leading/trailing cells come from the
 * neighbouring months so every week is complete.
 */
export function monthGrid(mKey) {
  const first = `${mKey}-01`;
  let cursor = shiftDay(first, -weekdayIndex(first));
  const weeks = [];
  // 6 rows always: a stable-height grid never reflows the panel below it.
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ key: cursor, inMonth: cursor.slice(0, 7) === mKey });
      cursor = shiftDay(cursor, 1);
    }
    weeks.push(week);
  }
  // Trim a fully out-of-month trailing row (Feb starting on Monday etc.).
  return weeks.filter((week, i) => i < 4 || week.some((c) => c.inMonth));
}

/** The 7 day keys (Mon-first) of the week containing dayKey. */
export function weekOf(dayKey) {
  const start = shiftDay(dayKey, -weekdayIndex(dayKey));
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
}

/* ---- merging what's scheduled on a date --------------------------
   Each item: { id, kind, title, startMin, endMin, timeLabel, color, done }
   kinds: block | workout | task | alarm | deadline
   startMin null = untimed (sorts after timed items). */

const KIND_COLOR = {
  workout: "oklch(0.62 0.13 150)",
  task: "oklch(0.62 0.14 245)",
  alarm: "oklch(0.66 0.13 60)",
  deadline: "oklch(0.66 0.14 350)",
};

export function itemsForDate(
  {
    dayBlocks = [],
    scheduledWorkouts = [],
    tasks = [],
    alarms = [],
    goals = [],
  } = {},
  dayKey
) {
  const items = [];
  const wd = weekdayIndex(dayKey);

  dayBlocks
    .filter((b) => b.date === dayKey)
    .forEach((b) =>
      items.push({
        id: "blk-" + b.id,
        kind: "block",
        refId: b.id,
        title: b.title,
        startMin: b.start,
        endMin: b.end,
        timeLabel: `${minutesToLabel(b.start)} – ${minutesToLabel(b.end)}`,
        color: categoryById(b.category).color,
        done: Boolean(b.done),
      })
    );

  scheduledWorkouts
    .filter((s) => s.date === dayKey)
    .forEach((s) =>
      items.push({
        id: "wk-" + s.id,
        kind: "workout",
        refId: s.id,
        title: s.name || "Workout",
        startMin: null,
        endMin: null,
        timeLabel: null,
        color: KIND_COLOR.workout,
        done: s.status === "done",
      })
    );

  tasks
    .filter((t) => t.scheduledFor === dayKey && !t.done)
    .forEach((t) =>
      items.push({
        id: "task-" + t.id,
        kind: "task",
        refId: t.id,
        title: t.text,
        startMin: null,
        endMin: null,
        timeLabel: null,
        color: KIND_COLOR.task,
        done: Boolean(t.done),
      })
    );

  alarms
    .filter((a) => a.enabled && (!a.days?.length || a.days.includes(wd)))
    .forEach((a) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(a.time || "");
      const min = m ? Number(m[1]) * 60 + Number(m[2]) : null;
      items.push({
        id: "alm-" + a.id,
        kind: "alarm",
        refId: a.id,
        title: a.label || "Alarm",
        startMin: min,
        endMin: null,
        timeLabel: min != null ? minutesToLabel(min) : null,
        color: KIND_COLOR.alarm,
        done: false,
      });
    });

  goals
    .filter((g) => g.status === "active" && goalTargetDate(g) === dayKey)
    .forEach((g) =>
      items.push({
        id: "ddl-" + g.id,
        kind: "deadline",
        refId: g.id,
        title: `${g.name} · target date`,
        startMin: null,
        endMin: null,
        timeLabel: null,
        color: KIND_COLOR.deadline,
        done: false,
      })
    );

  items.sort((a, b) => {
    if (a.startMin == null && b.startMin == null) return 0;
    if (a.startMin == null) return 1;
    if (b.startMin == null) return -1;
    return a.startMin - b.startMin;
  });
  return items;
}

/**
 * Per-day summary for a whole month in one pass (cheap enough to memo once
 * per data change): { [dayKey]: { count, colors: [up to 3] } }.
 */
export function monthDensity(stores, mKey) {
  const out = {};
  for (const week of monthGrid(mKey)) {
    for (const cell of week) {
      const items = itemsForDate(stores, cell.key);
      if (items.length) {
        out[cell.key] = {
          count: items.length,
          colors: [...new Set(items.map((i) => i.color))].slice(0, 3),
        };
      }
    }
  }
  return out;
}
