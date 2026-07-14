import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REASONS,
  goalSignals,
  goalTriageReasons,
  triageGoals,
  shouldOfferReview,
  reasonLine,
  reviewIntroLine,
} from "../src/lib/goalTriage.js";

const TODAY = "2026-07-14";

const mkGoal = (over = {}) => ({
  id: over.id || "g1",
  name: over.name || "Test goal",
  type: "custom",
  status: "active",
  createdAt: "2026-06-01T10:00:00.000Z",
  smartFields: {},
  deadline: null,
  habits: [],
  reflections: [],
  ...over,
});

test("fresh new goal raises no flags", () => {
  const g = mkGoal({ createdAt: `${TODAY}T08:00:00.000Z` });
  assert.deepEqual(goalTriageReasons(g, [], TODAY), []);
});

test("never started: old goal with zero activity", () => {
  const g = mkGoal(); // created 2026-06-01, 43 days before TODAY
  const reasons = goalTriageReasons(g, [], TODAY);
  assert.ok(reasons.includes(REASONS.NEVER_STARTED));
});

test("a completed task counts as started", () => {
  const g = mkGoal();
  const tasks = [{ id: "t1", goalId: "g1", done: true, completedOn: "2026-06-05", createdAt: "2026-06-05" }];
  const reasons = goalTriageReasons(g, tasks, TODAY);
  assert.ok(!reasons.includes(REASONS.NEVER_STARTED));
  // …but 39 quiet days since then flags GONE_QUIET instead.
  assert.ok(reasons.includes(REASONS.GONE_QUIET));
});

test("recent activity keeps a goal entirely off the list", () => {
  const g = mkGoal({ habits: [{ id: "h1", checkIns: ["2026-07-12"] }] });
  assert.deepEqual(goalTriageReasons(g, [], TODAY), []);
});

test("date passed flags overdue goals", () => {
  const g = mkGoal({
    deadline: "2026-07-01",
    habits: [{ id: "h1", checkIns: ["2026-07-13"] }], // active but overdue
  });
  const reasons = goalTriageReasons(g, [], TODAY);
  assert.deepEqual(reasons, [REASONS.DATE_PASSED]);
});

test("archived, done, and recovery goals are never triaged", () => {
  assert.deepEqual(goalTriageReasons(mkGoal({ status: "archived" }), [], TODAY), []);
  assert.deepEqual(goalTriageReasons(mkGoal({ status: "done" }), [], TODAY), []);
  assert.deepEqual(goalTriageReasons(mkGoal({ type: "recovery" }), [], TODAY), []);
});

test("window-tight: most of the window gone, no start, date not yet passed", () => {
  const g = mkGoal({
    createdAt: "2026-06-14T10:00:00.000Z", // 30 of 37 days used ≈ 81%
    deadline: "2026-07-21",
  });
  const reasons = goalTriageReasons(g, [], TODAY);
  assert.ok(reasons.includes(REASONS.WINDOW_TIGHT));
  assert.ok(!reasons.includes(REASONS.DATE_PASSED));
});

test("goalSignals computes the window fraction", () => {
  const g = mkGoal({ createdAt: "2026-07-04T00:00:00.000Z", deadline: "2026-07-24" });
  const s = goalSignals(g, [], TODAY);
  assert.equal(s.windowUsed, 0.5); // 10 of 20 days
});

test("triageGoals sorts the most off-track first", () => {
  const overdue = mkGoal({ id: "a", deadline: "2026-07-01", habits: [{ id: "h", checkIns: ["2026-07-13"] }] });
  const quiet = mkGoal({ id: "b", habits: [{ id: "h", checkIns: ["2026-06-10"] }] });
  const items = triageGoals([quiet, overdue], [], TODAY);
  assert.equal(items.length, 2);
  assert.equal(items[0].goal.id, "a"); // DATE_PASSED outweighs GONE_QUIET
});

test("shouldOfferReview: big pile triggers even without a gap", () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ goal: { id: String(i) } }));
  assert.equal(
    shouldOfferReview({ items, activeGoalCount: 6, daysAway: 0, state: {}, today: TODAY }),
    true
  );
});

test("shouldOfferReview: back from a gap with 2+ items", () => {
  const items = [{}, {}];
  assert.equal(
    shouldOfferReview({ items, activeGoalCount: 3, daysAway: 5, state: {}, today: TODAY }),
    true
  );
  // Same items, no gap → not offered.
  assert.equal(
    shouldOfferReview({ items, activeGoalCount: 3, daysAway: 0, state: {}, today: TODAY }),
    false
  );
});

test("shouldOfferReview respects snooze and cooldown", () => {
  const items = Array.from({ length: 6 }, () => ({}));
  assert.equal(
    shouldOfferReview({ items, activeGoalCount: 8, daysAway: 9, state: { snoozedUntil: "2026-07-15" }, today: TODAY }),
    false
  );
  assert.equal(
    shouldOfferReview({ items, activeGoalCount: 8, daysAway: 9, state: { lastReviewAt: "2026-07-10" }, today: TODAY }),
    false
  );
  assert.equal(
    shouldOfferReview({ items, activeGoalCount: 8, daysAway: 9, state: { lastReviewAt: "2026-07-01" }, today: TODAY }),
    true
  );
});

test("copy stays kind — no shame words anywhere", () => {
  const s = goalSignals(mkGoal(), [], TODAY);
  const lines = [
    ...Object.values(REASONS).map((r) => reasonLine(r, { ...s, target: "2026-07-01", quietDays: 20 })),
    reviewIntroLine(1, 0),
    reviewIntroLine(7, 9),
  ];
  for (const line of lines) {
    assert.doesNotMatch(line, /fail|shame|lazy|behind schedule|missed|broke|guilt/i, line);
  }
});
