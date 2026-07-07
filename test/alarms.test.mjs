import test from "node:test";
import assert from "node:assert/strict";
import { isAlarmDue } from "../src/hooks/useAlarms.js";
import { todayKey } from "../src/lib/model.js";

// 2026-07-06 is a Monday. Local-time constructor keeps weekday math honest.
const monday7am = new Date(2026, 6, 6, 7, 0, 30);
const base = { enabled: true, time: "07:00", days: [], lastFired: null };

test("fires when time matches and no repeat restriction", () => {
  assert.equal(isAlarmDue({ ...base }, monday7am), true);
});

test("does not fire when disabled", () => {
  assert.equal(isAlarmDue({ ...base, enabled: false }, monday7am), false);
});

test("does not fire at a different minute", () => {
  assert.equal(isAlarmDue({ ...base }, new Date(2026, 6, 6, 7, 1, 0)), false);
  assert.equal(isAlarmDue({ ...base }, new Date(2026, 6, 6, 6, 59, 59)), false);
});

test("repeat days: Monday alarm fires Monday, not Tuesday", () => {
  const monOnly = { ...base, days: [0] }; // Mon=0
  assert.equal(isAlarmDue(monOnly, monday7am), true);
  const tuesday7am = new Date(2026, 6, 7, 7, 0, 0);
  assert.equal(isAlarmDue(monOnly, tuesday7am), false);
});

test("duplicate-fire guard: lastFired today blocks a refire in the same minute", () => {
  const fired = { ...base, lastFired: todayKey(monday7am) };
  assert.equal(isAlarmDue(fired, monday7am), false);
});

test("midnight boundary: a 00:00 alarm fired yesterday fires again today", () => {
  const midnight = new Date(2026, 6, 7, 0, 0, 10); // Tue 00:00
  const alarm = { ...base, time: "00:00", lastFired: todayKey(new Date(2026, 6, 6)) };
  assert.equal(isAlarmDue(alarm, midnight), true);
});

test("empty days array means every day", () => {
  const sunday = new Date(2026, 6, 5, 7, 0, 0);
  assert.equal(isAlarmDue({ ...base, days: [] }, sunday), true);
});
