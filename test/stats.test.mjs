import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStats,
  focusSeries,
  focusByGoal,
  activityBreakdown,
  activeDayCount,
  lastDays,
} from "../src/lib/stats.js";

const REF = "2026-07-16";

test("lastDays returns oldest→newest inclusive", () => {
  const d = lastDays(3, REF);
  assert.deepEqual(d, ["2026-07-14", "2026-07-15", "2026-07-16"]);
});

const STORE = {
  focusLog: [
    { date: "2026-07-16", minutes: 25, goalId: "g1" },
    { date: "2026-07-16", minutes: 25, goalId: null },
    { date: "2026-07-15", minutes: 50, goalId: "g1" },
    { date: "2026-07-01", minutes: 90, goalId: "g2" }, // outside 7d
  ],
  pauseLog: [
    { date: "2026-07-16", seconds: 360 }, // 6 min
    { date: "2026-07-16", seconds: 120 }, // 2 min
  ],
  workouts: [
    { id: "w1", date: "2026-07-16", durationSec: 1800 },
    { id: "w2", date: "2026-07-10", durationSec: 1200 },
  ],
  activities: [
    { id: "a1", date: "2026-07-16", category: "sport", durationMin: 60 },
    { id: "a2", date: "2026-07-16", category: "screen", durationMin: 30 },
    { id: "a3", date: "2026-07-15", category: "gaming", durationMin: 45 },
  ],
  journal: [{ id: "j1", createdAt: "2026-07-16T09:00:00" }],
  tasks: [
    { id: "t1", done: true, completedOn: "2026-07-16" },
    { id: "t2", done: true, completedOn: "2026-06-01" },
  ],
  goals: [
    { id: "g1", status: "active", name: "Study", color: "#abc" },
    { id: "g2", status: "active", name: "Side", color: "#def" },
    { id: "g3", status: "archived", name: "Old" },
  ],
};
const SLEEP = [
  { date: "2026-07-16", bedTime: "23:00", wakeTime: "07:00" }, // 8h = 480
  { date: "2026-07-15", bedTime: "00:00", wakeTime: "06:00" }, // 6h = 360
];

test("computeStats: 7-day window sums the right things", () => {
  const s = computeStats(STORE, SLEEP, 7, REF);
  assert.equal(s.focusMin, 100); // 25+25+50 (7/1 excluded)
  assert.equal(s.pauseMin, 8); // (360+120)/60
  assert.equal(s.workoutCount, 2); // both within 7d
  assert.equal(s.trainedMin, 50); // (1800+1200)/60
  assert.equal(s.activityCount, 3);
  assert.equal(s.movingMin, 60);
  assert.equal(s.screenMin, 30);
  assert.equal(s.tasksDone, 1); // only the 7/16 one
  assert.equal(s.journalCount, 1);
  assert.equal(s.sleepAvgMin, 420); // (480+360)/2
  assert.equal(s.activeGoals, 2);
});

test("focusSeries is per-day oldest→newest", () => {
  const s = focusSeries(STORE.focusLog, 3, REF);
  assert.deepEqual(s.map((p) => p.minutes), [0, 50, 50]); // 7/14, 7/15, 7/16
});

test("focusByGoal aggregates and names, ignoring null goal", () => {
  const g = focusByGoal(STORE.focusLog, STORE.goals, 30, REF);
  // Sorted by minutes desc: g2 (90) then g1 (25+50=75).
  assert.equal(g[0].goalId, "g2");
  assert.equal(g[0].minutes, 90);
  const g1 = g.find((x) => x.goalId === "g1");
  assert.equal(g1.minutes, 75);
  assert.equal(g1.name, "Study");
});

test("activityBreakdown gives category minutes + pct", () => {
  const b = activityBreakdown(STORE.activities, 30, REF);
  const total = 60 + 30 + 45;
  assert.equal(b.reduce((n, c) => n + c.minutes, 0), total);
  assert.equal(b[0].id, "sport"); // largest
  assert.ok(b.every((c) => c.pct >= 0 && c.pct <= 100));
});

test("activeDayCount counts distinct days across sources", () => {
  const n = activeDayCount(STORE, 30, REF);
  // 7/16 (focus+wk+act+journal), 7/15 (focus+act), 7/10 (wk), 7/01 (focus)
  assert.equal(n, 4);
});
