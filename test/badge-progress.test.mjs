import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeProgressRows,
  nearestBadges,
  remainingLabel,
} from "../src/lib/badgeProgress.js";

test("empty stats yield no rows", () => {
  assert.deepEqual(badgeProgressRows(null), []);
  assert.deepEqual(badgeProgressRows({}), []);
});

test("zero-progress badges are excluded", () => {
  const rows = badgeProgressRows({ tasksDone: 0, visitDays: 0 });
  assert.deepEqual(rows, []);
});

test("in-progress badges appear with correct fractions", () => {
  const rows = badgeProgressRows({ tasksDone: 5, visitDays: 6 });
  const ids = rows.map((r) => r.badge.id);
  assert.ok(ids.includes("on-a-roll"));
  assert.ok(ids.includes("showing-up"));
  const showingUp = rows.find((r) => r.badge.id === "showing-up");
  assert.equal(showingUp.now, 6);
  assert.equal(showingUp.target, 7);
  assert.equal(showingUp.remaining, 1);
  // Closest first: 6/7 ahead of 5/10.
  assert.equal(rows[0].badge.id, "showing-up");
});

test("unlocked badges are excluded", () => {
  const rows = badgeProgressRows({ visitDays: 6 }, ["showing-up"]);
  assert.ok(!rows.some((r) => r.badge.id === "showing-up"));
});

test("already-satisfied stats are excluded (unlock pending elsewhere)", () => {
  const rows = badgeProgressRows({ visitDays: 7 });
  assert.ok(!rows.some((r) => r.badge.id === "showing-up"));
});

test("nearestBadges respects the limit", () => {
  const rows = nearestBadges({ tasksDone: 5, visitDays: 6, focusSessions: 3 }, [], 2);
  assert.equal(rows.length, 2);
});

test("remainingLabel pluralizes", () => {
  assert.equal(
    remainingLabel({ remaining: 1, unit: "day" }),
    "1 more day"
  );
  assert.equal(
    remainingLabel({ remaining: 3, unit: "session" }),
    "3 more sessions"
  );
});
