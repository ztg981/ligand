import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekStartKey,
  weekDayKeys,
  summarizeWeek,
  weekLine,
  reconcileKeptWeeks,
  DEFAULT_TARGET,
} from "../src/lib/showingUp.js";

// 2026-07-14 is a Tuesday; its week runs Mon 2026-07-13 .. Sun 2026-07-19.
const TUE = "2026-07-14";

test("weekStartKey anchors to Monday", () => {
  assert.equal(weekStartKey(TUE), "2026-07-13");
  assert.equal(weekStartKey("2026-07-13"), "2026-07-13"); // Monday itself
  assert.equal(weekStartKey("2026-07-19"), "2026-07-13"); // Sunday
  assert.equal(weekStartKey("2026-07-12"), "2026-07-06"); // previous Sunday
});

test("weekDayKeys returns Mon..Sun of the containing week", () => {
  const keys = weekDayKeys(TUE);
  assert.equal(keys.length, 7);
  assert.equal(keys[0], "2026-07-13");
  assert.equal(keys[6], "2026-07-19");
});

test("weekDayKeys crosses month boundaries", () => {
  // 2026-08-01 is a Saturday; week starts Mon 2026-07-27.
  const keys = weekDayKeys("2026-08-01");
  assert.equal(keys[0], "2026-07-27");
  assert.equal(keys[6], "2026-08-02");
});

test("summarizeWeek counts only this week's visits", () => {
  const s = summarizeWeek({
    visitDates: ["2026-07-10", "2026-07-13", "2026-07-14"], // Fri last week + Mon/Tue
    target: 4,
    todayStr: TUE,
  });
  assert.equal(s.count, 2);
  assert.equal(s.target, 4);
  assert.equal(s.met, false);
  assert.equal(s.toGo, 2);
  assert.equal(s.daysLeft, 6); // Tue..Sun inclusive
  assert.equal(s.reachable, true);
  assert.equal(s.days.filter((d) => d.visited).length, 2);
  assert.equal(s.days.find((d) => d.isToday).key, TUE);
});

test("summarizeWeek: met week", () => {
  const s = summarizeWeek({
    visitDates: ["2026-07-13", "2026-07-14"],
    target: 2,
    todayStr: TUE,
  });
  assert.equal(s.met, true);
  assert.equal(s.toGo, 0);
  assert.match(weekLine(s), /week made/i);
});

test("summarizeWeek: unreachable target is detected, copy stays kind", () => {
  // Sunday, no visits all week, target 4 → only today could count: unreachable.
  const s = summarizeWeek({ visitDates: [], target: 4, todayStr: "2026-07-19" });
  assert.equal(s.reachable, false);
  const line = weekLine(s);
  assert.doesNotMatch(line, /fail|miss|lost|broke|behind/i);
});

test("weekLine: one day to go", () => {
  const s = summarizeWeek({
    visitDates: ["2026-07-13", "2026-07-14", "2026-07-15"],
    target: 4,
    todayStr: "2026-07-15",
  });
  assert.equal(weekLine(s), "One more day makes your week.");
});

test("reconcileKeptWeeks counts completed weeks that met the target", () => {
  // Two full weeks of history before the current week (of 2026-07-14):
  // week of 06-29: 4 visits (kept), week of 07-06: 2 visits (skipped).
  const visits = [
    "2026-06-29", "2026-06-30", "2026-07-02", "2026-07-04", // week 1: 4 days
    "2026-07-06", "2026-07-08",                             // week 2: 2 days
    "2026-07-13", "2026-07-14",                             // current week
  ];
  const { state, newlyKept } = reconcileKeptWeeks(
    { target: 4, keptWeeks: 0, lastCountedWeek: null },
    visits,
    TUE
  );
  assert.equal(newlyKept, 1);
  assert.equal(state.keptWeeks, 1);
  assert.equal(state.lastCountedWeek, "2026-07-06"); // cursor advanced past skipped week
});

test("reconcileKeptWeeks never double-counts", () => {
  const visits = ["2026-06-29", "2026-06-30", "2026-07-02", "2026-07-04"];
  const first = reconcileKeptWeeks({ target: 4, keptWeeks: 0, lastCountedWeek: null }, visits, TUE);
  const second = reconcileKeptWeeks(first.state, visits, TUE);
  assert.equal(second.newlyKept, 0);
  assert.equal(second.state.keptWeeks, first.state.keptWeeks);
});

test("reconcileKeptWeeks with no visits is a no-op", () => {
  const { state, newlyKept } = reconcileKeptWeeks(undefined, [], TUE);
  assert.equal(newlyKept, 0);
  assert.equal(state.keptWeeks, 0);
  assert.equal(state.target, DEFAULT_TARGET);
});

test("reconcileKeptWeeks skips gap weeks without penalty", () => {
  // A kept week, then a 3-week gap, then activity in the current week.
  const visits = ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", TUE];
  const { state, newlyKept } = reconcileKeptWeeks(
    { target: 4, keptWeeks: 5, lastCountedWeek: null },
    visits,
    TUE
  );
  assert.equal(newlyKept, 1); // only the June week
  assert.equal(state.keptWeeks, 6);
  assert.equal(state.lastCountedWeek, "2026-07-06"); // last completed week
});
