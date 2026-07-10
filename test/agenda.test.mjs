import assert from "node:assert/strict";
import test from "node:test";
import { nextBlockForDay, nextAlarmToday, suggestedTask } from "../src/lib/agenda.js";

const TODAY = "2026-07-10";

test("nextBlockForDay returns the active block as 'now'", () => {
  const blocks = [
    { date: TODAY, start: 540, end: 600, title: "Standup" },   // 9:00–10:00
    { date: TODAY, start: 600, end: 720, title: "Deep work" }, // 10:00–12:00
  ];
  const r = nextBlockForDay(blocks, TODAY, 630); // 10:30
  assert.equal(r.state, "now");
  assert.equal(r.block.title, "Deep work");
});

test("nextBlockForDay returns the soonest upcoming block as 'next'", () => {
  const blocks = [
    { date: TODAY, start: 600, end: 660, title: "Deep work" },
    { date: TODAY, start: 780, end: 840, title: "Gym" }, // 13:00
  ];
  const r = nextBlockForDay(blocks, TODAY, 700); // 11:40, between the two
  assert.equal(r.state, "next");
  assert.equal(r.block.title, "Gym");
});

test("nextBlockForDay ignores other days, done blocks, and past days", () => {
  const blocks = [
    { date: "2026-07-09", start: 600, end: 660, title: "Yesterday" },
    { date: TODAY, start: 600, end: 660, title: "Done one", done: true },
  ];
  assert.equal(nextBlockForDay(blocks, TODAY, 500), null);
});

test("nextAlarmToday picks the earliest still-upcoming enabled alarm", () => {
  // 2026-07-10 is a Friday → JS getDay() = 5.
  const alarms = [
    { enabled: true, time: "07:00", days: [] },        // passed
    { enabled: true, time: "18:30", days: [] },        // upcoming
    { enabled: true, time: "14:00", days: [] },        // sooner upcoming
    { enabled: false, time: "13:00", days: [] },       // disabled
  ];
  const a = nextAlarmToday(alarms, 12 * 60, 5); // noon
  assert.equal(a.time, "14:00");
  assert.equal(a.min, 14 * 60);
});

test("nextAlarmToday respects the weekday filter (Mon=0..Sun=6)", () => {
  // Friday = JS 5 → Mon-first index 4. An alarm only on Monday(0) shouldn't fire.
  const mondayOnly = [{ enabled: true, time: "20:00", days: [0] }];
  assert.equal(nextAlarmToday(mondayOnly, 12 * 60, 5), null);
  const fridayOnly = [{ enabled: true, time: "20:00", days: [4] }];
  assert.equal(nextAlarmToday(fridayOnly, 12 * 60, 5)?.time, "20:00");
});

test("suggestedTask prefers Today, then General, then shortest", () => {
  const tasks = [
    { text: "a longer general task", label: "General", done: false },
    { text: "urgent thing", label: "Urgent", done: false },
    { text: "buy milk", label: "Today", done: false },
  ];
  assert.equal(suggestedTask(tasks).text, "buy milk");
  assert.equal(suggestedTask([]), null);
  assert.equal(suggestedTask([{ text: "x", done: true }]), null);
});
