import { test } from "node:test";
import assert from "node:assert/strict";
import { planBadgeUpdate } from "../src/lib/badges.js";

const ALL = ["a", "b", "c"];
const at = "2026-07-01T00:00:00.000Z";
const held = (...ids) => ids.map((id) => ({ id, at }));

test("first run adopts earned badges silently", () => {
  const plan = planBadgeUpdate({ earned: ["a", "b"], allIds: ALL, unlocked: null });
  assert.equal(plan.firstRun, true);
  assert.deepEqual(plan.celebrate, [], "no ambush of old milestones");
  assert.deepEqual(plan.nextUnlocked.map((u) => u.id), ["a", "b"]);
  assert.deepEqual(plan.nextCelebrated, ["a", "b"]);
});

test("a genuinely new badge is granted and celebrated once", () => {
  const plan = planBadgeUpdate({
    earned: ["a", "b"],
    allIds: ALL,
    unlocked: held("a"),
    known: ALL,
    celebrated: ["a"],
  });
  assert.deepEqual(plan.celebrate, ["b"]);
  assert.deepEqual(plan.nextUnlocked.map((u) => u.id), ["a", "b"]);
  assert.ok(plan.nextCelebrated.includes("b"));
});

test("a stale sync pull cannot replay a celebration", () => {
  // The reported bug: a cloud pull overwrites ligand.badges with a list that
  // predates the grant, so the badge looks freshly earned on every app open.
  // The append-only celebrated record must veto the replay.
  const plan = planBadgeUpdate({
    earned: ["a", "b"],
    allIds: ALL,
    unlocked: held("a"), // reverted — "b" is missing again
    known: ALL,
    celebrated: ["a", "b"], // but we know we already showed it
  });
  assert.deepEqual(plan.celebrate, [], "no celebration");
  assert.deepEqual(
    plan.nextUnlocked.map((u) => u.id),
    ["a", "b"],
    "and the badge is quietly re-granted so the collection self-heals"
  );
});

test("newly shipped definitions are granted but never celebrated", () => {
  // An upgrade that adds badges the user already satisfies must not fire a
  // storm of celebrations for things they did months ago.
  const plan = planBadgeUpdate({
    earned: ["a", "b", "c"],
    allIds: ALL,
    unlocked: held("a"),
    known: ["a"], // b and c are new definitions to this install
    celebrated: ["a"],
  });
  assert.deepEqual(plan.celebrate, []);
  assert.deepEqual(plan.nextKnown, ALL);
  assert.ok(plan.nextCelebrated.includes("b") && plan.nextCelebrated.includes("c"),
    "and they're marked celebrated so they can't fire later either");
});

test("an install with no celebration record adopts its unlocked badges", () => {
  // Upgrading to this fix must not replay everything already collected.
  const plan = planBadgeUpdate({
    earned: ["a", "b"],
    allIds: ALL,
    unlocked: held("a", "b"),
    known: ALL,
    celebrated: null,
  });
  assert.deepEqual(plan.celebrate, []);
  assert.deepEqual(plan.nextCelebrated.sort(), ["a", "b"]);
});

test("nothing new means nothing to write", () => {
  const plan = planBadgeUpdate({
    earned: ["a"],
    allIds: ALL,
    unlocked: held("a"),
    known: ALL,
    celebrated: ["a"],
  });
  assert.equal(plan.nextUnlocked, null);
  assert.equal(plan.nextKnown, null);
  assert.equal(plan.nextCelebrated, null);
  assert.deepEqual(plan.celebrate, []);
});
