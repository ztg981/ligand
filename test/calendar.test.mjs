import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthGrid,
  monthKey,
  monthLabel,
  shiftMonth,
  weekOf,
  weekdayIndex,
  itemsForDate,
  monthDensity,
} from "../src/lib/calendar.js";

test("monthKey / monthLabel / shiftMonth", () => {
  assert.equal(monthKey("2026-07-16"), "2026-07");
  assert.equal(monthLabel("2026-07"), "July 2026");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("monthGrid is Monday-first and covers the whole month", () => {
  const grid = monthGrid("2026-07"); // July 1 2026 is a Wednesday
  assert.ok(grid.length >= 4 && grid.length <= 6);
  assert.equal(grid[0].length, 7);
  // First cell is the Monday on/before July 1 → June 29.
  assert.equal(grid[0][0].key, "2026-06-29");
  assert.equal(grid[0][0].inMonth, false);
  assert.equal(grid[0][2].key, "2026-07-01");
  assert.equal(grid[0][2].inMonth, true);
  const all = grid.flat().map((c) => c.key);
  assert.ok(all.includes("2026-07-31"));
});

test("weekOf returns Mon..Sun containing the day", () => {
  const week = weekOf("2026-07-16"); // a Thursday
  assert.equal(week.length, 7);
  assert.equal(week[0], "2026-07-13");
  assert.equal(weekdayIndex(week[0]), 0);
  assert.equal(week[6], "2026-07-19");
});

const STORES = {
  dayBlocks: [
    { id: "b1", date: "2026-07-16", start: 540, end: 600, title: "Math", category: "focus", done: false },
  ],
  scheduledWorkouts: [
    { id: "s1", date: "2026-07-16", name: "Push day", status: "planned" },
  ],
  tasks: [
    { id: "t1", scheduledFor: "2026-07-16", text: "Email prof", done: false },
    { id: "t2", scheduledFor: "2026-07-16", text: "Done already", done: true },
  ],
  alarms: [
    { id: "a1", enabled: true, days: [], time: "07:00", label: "Wake" },
    { id: "a2", enabled: true, days: [5], time: "10:00", label: "Sat only" }, // Sat=5
    { id: "a3", enabled: false, days: [], time: "08:00", label: "Off" },
  ],
  goals: [
    { id: "g1", status: "active", name: "Ship app", deadline: "2026-07-16", smartFields: {} },
    { id: "g2", status: "archived", name: "Old", deadline: "2026-07-16", smartFields: {} },
  ],
};

test("itemsForDate merges blocks, workouts, tasks, alarms, deadlines", () => {
  const items = itemsForDate(STORES, "2026-07-16"); // Thursday
  const kinds = items.map((i) => i.kind);
  // timed first (alarm 7:00, block 9:00), then untimed
  assert.deepEqual(kinds.slice(0, 2), ["alarm", "block"]);
  assert.ok(kinds.includes("workout"));
  assert.ok(kinds.includes("task"));
  assert.ok(kinds.includes("deadline"));
  // done task excluded, archived goal excluded, sat-only alarm excluded, disabled excluded
  assert.ok(!items.some((i) => i.title === "Done already"));
  assert.ok(!items.some((i) => i.title === "Sat only"));
  assert.ok(!items.some((i) => i.title === "Off"));
  assert.ok(!items.some((i) => i.title.startsWith("Old")));
});

test("itemsForDate weekday alarm matches its day", () => {
  const items = itemsForDate(STORES, "2026-07-18"); // Saturday
  assert.ok(items.some((i) => i.title === "Sat only"));
});

test("monthDensity counts only days with items", () => {
  const density = monthDensity(
    { dayBlocks: STORES.dayBlocks, scheduledWorkouts: [], tasks: [], alarms: [], goals: [] },
    "2026-07"
  );
  assert.equal(density["2026-07-16"].count, 1);
  assert.equal(density["2026-07-02"], undefined);
});
