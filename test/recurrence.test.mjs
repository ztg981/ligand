import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandRepeat,
  describeRepeat,
  normalizeRepeat,
  weekdayOf,
  MAX_OCCURRENCES,
} from "../src/lib/recurrence.js";

test("normalizeRepeat clamps and rejects", () => {
  assert.equal(normalizeRepeat(null), null);
  assert.equal(normalizeRepeat({ freq: "yearly" }), null);
  const r = normalizeRepeat({ freq: "weekly", interval: 99, weekdays: [6, 6, 2, 9], until: "2026-08-31" });
  assert.deepEqual(r, { freq: "weekly", interval: 12, weekdays: [2, 6], until: "2026-08-31" });
  assert.equal(normalizeRepeat({ freq: "daily", until: "bogus" }).until, null);
});

test("no rule = just the start date", () => {
  assert.deepEqual(expandRepeat("2026-07-19", null), ["2026-07-19"]);
});

test("daily until a date", () => {
  const days = expandRepeat("2026-07-19", { freq: "daily", until: "2026-07-22" });
  assert.deepEqual(days, ["2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22"]);
});

test("every 2 days respects the interval", () => {
  const days = expandRepeat("2026-07-19", { freq: "daily", interval: 2, until: "2026-07-25" });
  assert.deepEqual(days, ["2026-07-19", "2026-07-21", "2026-07-23", "2026-07-25"]);
});

test("the user's exact case: every Sunday 7/19 to end of August", () => {
  // 2026-07-19 IS a Sunday.
  assert.equal(weekdayOf("2026-07-19"), 6);
  const days = expandRepeat("2026-07-19", {
    freq: "weekly",
    weekdays: [6],
    until: "2026-08-31",
  });
  assert.deepEqual(days, [
    "2026-07-19", "2026-07-26", "2026-08-02", "2026-08-09",
    "2026-08-16", "2026-08-23", "2026-08-30",
  ]);
});

test("weekly with no weekday picks uses the start date's weekday", () => {
  const days = expandRepeat("2026-07-16", { freq: "weekly", until: "2026-07-31" }); // Thu
  assert.deepEqual(days, ["2026-07-16", "2026-07-23", "2026-07-30"]);
});

test("weekly multi-day skips days before the start date in week one", () => {
  // Start Thursday 7/16, repeat Mon+Thu: the Monday of the first week (7/13)
  // must not appear.
  const days = expandRepeat("2026-07-16", {
    freq: "weekly", weekdays: [0, 3], until: "2026-07-24",
  });
  assert.deepEqual(days, ["2026-07-16", "2026-07-20", "2026-07-23"]);
});

test("monthly keeps the day-of-month and skips short months", () => {
  const days = expandRepeat("2026-08-31", { freq: "monthly", until: "2026-12-31" });
  // September/November have no 31st.
  assert.deepEqual(days, ["2026-08-31", "2026-10-31", "2026-12-31"]);
});

test("open-ended series stop at the horizon and the hard cap", () => {
  const days = expandRepeat("2026-07-19", { freq: "daily" });
  assert.ok(days.length <= MAX_OCCURRENCES);
  assert.ok(days.length > 150); // ~6 months of dailies
  const weekly = expandRepeat("2026-07-19", { freq: "weekly", weekdays: [6] });
  assert.ok(weekly.length >= 24 && weekly.length <= 28);
});

test("describeRepeat reads like a person", () => {
  assert.equal(describeRepeat(null), null);
  assert.equal(describeRepeat({ freq: "daily" }), "Every day");
  assert.equal(
    describeRepeat({ freq: "weekly", weekdays: [6], until: "2026-08-31" }),
    "Every week on Sun until Aug 31"
  );
  assert.equal(describeRepeat({ freq: "weekly", interval: 2, weekdays: [0, 3] }), "Every 2 weeks on Mon, Thu");
});
