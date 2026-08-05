/* The logical day rolls over at a cutoff hour, not at midnight.

   Being up at 1am is still the same day you were having. Checking off a habit
   then must land on that day rather than opening a new one and breaking a
   streak mid-keep.

   The other half of this — and the part that could quietly corrupt history —
   is that the cutoff must apply ONLY when the caller hasn't said which date
   they mean. shiftDay and friends normalize already-parsed midnight Dates
   through todayKey(d); shifting those would move every one back a day. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DAY_CUTOFF_HOUR,
  activeDayKey,
  calendarDayKey,
  currentStreak,
  daysBetween,
  getDayCutoffHour,
  normalizeDayCutoffHour,
  setDayCutoffHour,
  shiftDay,
  todayKey,
} from "../src/lib/model.js";

/** A local-time Date, built the way the app experiences one. */
function at(dayKey, hour, minute = 0) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

test("after midnight but before the cutoff still counts as the previous day", () => {
  assert.equal(activeDayKey(at("2026-08-06", 0, 1), 4), "2026-08-05");
  assert.equal(activeDayKey(at("2026-08-06", 1, 30), 4), "2026-08-05");
  assert.equal(activeDayKey(at("2026-08-06", 3, 59), 4), "2026-08-05");
});

test("the cutoff hour itself starts the new day", () => {
  assert.equal(activeDayKey(at("2026-08-06", 4, 0), 4), "2026-08-06");
  assert.equal(activeDayKey(at("2026-08-06", 4, 1), 4), "2026-08-06");
});

test("ordinary daytime hours are unaffected", () => {
  for (const hour of [9, 12, 17, 21, 23]) {
    assert.equal(activeDayKey(at("2026-08-05", hour), 4), "2026-08-05");
  }
});

test("a cutoff of zero restores plain midnight rollover", () => {
  assert.equal(activeDayKey(at("2026-08-06", 0, 1), 0), "2026-08-06");
  assert.equal(activeDayKey(at("2026-08-05", 23, 59), 0), "2026-08-05");
});

test("the cutoff crosses month and year boundaries correctly", () => {
  assert.equal(activeDayKey(at("2026-09-01", 2), 4), "2026-08-31");
  assert.equal(activeDayKey(at("2027-01-01", 2), 4), "2026-12-31");
});

test("the cutoff hour is clamped to something sane", () => {
  assert.equal(normalizeDayCutoffHour(4), 4);
  assert.equal(normalizeDayCutoffHour(-3), 0);
  assert.equal(normalizeDayCutoffHour(99), 12);
  assert.equal(normalizeDayCutoffHour("6"), 6);
  assert.equal(normalizeDayCutoffHour(3.6), 4);
  assert.equal(normalizeDayCutoffHour(null), DEFAULT_DAY_CUTOFF_HOUR);
  assert.equal(normalizeDayCutoffHour(undefined), DEFAULT_DAY_CUTOFF_HOUR);
  assert.equal(normalizeDayCutoffHour("nonsense"), DEFAULT_DAY_CUTOFF_HOUR);
});

/* ---- the part that protects existing history ---------------------- */

test("an explicit date is read as its plain calendar day, with no cutoff", () => {
  // This is what shiftDay and every date-normalizing widget rely on. If the
  // cutoff leaked in here, a parsed midnight would report the day before.
  const midnight = new Date(2026, 7, 6, 0, 0, 0, 0);
  assert.equal(todayKey(midnight), "2026-08-06");
  assert.equal(calendarDayKey(midnight), "2026-08-06");
});

test("shiftDay is unchanged by the cutoff", () => {
  assert.equal(shiftDay("2026-08-06", -1), "2026-08-05");
  assert.equal(shiftDay("2026-08-06", 1), "2026-08-07");
  assert.equal(shiftDay("2026-08-31", 1), "2026-09-01");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  // ...including a round trip through a full week, which is how streaks walk.
  let cursor = "2026-08-06";
  for (let i = 0; i < 7; i += 1) cursor = shiftDay(cursor, -1);
  assert.equal(cursor, "2026-07-30");
  assert.equal(daysBetween("2026-07-30", "2026-08-06"), 7);
});

test("a streak walked back across the cutoff stays intact", () => {
  const habit = {
    checkIns: ["2026-08-03", "2026-08-04", "2026-08-05"],
  };
  // Checking in at 1am on the 6th records the 5th, so the run is unbroken.
  const dayAtOneAm = activeDayKey(at("2026-08-06", 1), 4);
  assert.equal(dayAtOneAm, "2026-08-05");
  assert.equal(currentStreak(habit, dayAtOneAm), 3);
});

test("the configured cutoff is used when no argument is given", () => {
  const original = getDayCutoffHour();
  try {
    assert.equal(setDayCutoffHour(6), 6);
    assert.equal(getDayCutoffHour(), 6);
    assert.equal(activeDayKey(at("2026-08-06", 5)), "2026-08-05");
    assert.equal(activeDayKey(at("2026-08-06", 6)), "2026-08-06");

    setDayCutoffHour(0);
    assert.equal(activeDayKey(at("2026-08-06", 1)), "2026-08-06");
  } finally {
    setDayCutoffHour(original);
  }
});

test("todayKey with no argument reports the logical day", () => {
  const original = getDayCutoffHour();
  try {
    setDayCutoffHour(4);
    // Can't pin the clock, but the two must agree by construction.
    assert.equal(todayKey(), activeDayKey(new Date()));
    assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    setDayCutoffHour(original);
  }
});
