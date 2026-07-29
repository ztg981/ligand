import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskComparator,
  normalizeSort,
  directionLabel,
  DEFAULT_SORT,
} from "../src/lib/taskSort.js";

// Ids carry a base36 timestamp, so later id === later creation.
const t = (id, text, scheduledFor = null) => ({ id, text, scheduledFor });
const older = t("task_a_1", "Banana");
const newer = t("task_b_1", "Apple");
const newest = t("task_c_1", "Cherry");

const order = (tasks, sort) => [...tasks].sort(taskComparator(sort)).map((x) => x.id);

test("created sorts newest first by default, oldest first reversed", () => {
  const tasks = [older, newest, newer];
  assert.deepEqual(order(tasks, DEFAULT_SORT), ["task_c_1", "task_b_1", "task_a_1"]);
  assert.deepEqual(order(tasks, { by: "created", dir: "asc" }), [
    "task_a_1",
    "task_b_1",
    "task_c_1",
  ]);
});

test("name sorts alphabetically, case-insensitively", () => {
  const tasks = [t("task_1", "banana"), t("task_2", "Apple"), t("task_3", "cherry")];
  assert.deepEqual(order(tasks, { by: "name", dir: "asc" }), [
    "task_2",
    "task_1",
    "task_3",
  ]);
  assert.deepEqual(order(tasks, { by: "name", dir: "desc" }), [
    "task_3",
    "task_1",
    "task_2",
  ]);
});

test("scheduled day sorts by date, soonest first", () => {
  const tasks = [
    t("task_1", "later", "2026-08-10"),
    t("task_2", "sooner", "2026-08-01"),
  ];
  assert.deepEqual(order(tasks, { by: "due", dir: "asc" }), ["task_2", "task_1"]);
  assert.deepEqual(order(tasks, { by: "due", dir: "desc" }), ["task_1", "task_2"]);
});

test("unscheduled tasks sink to the bottom in BOTH directions", () => {
  // Reversing must not bury every dated task under the undated ones.
  const tasks = [
    t("task_1", "no date"),
    t("task_2", "dated", "2026-08-01"),
    t("task_3", "also dated", "2026-08-05"),
  ];
  assert.equal(order(tasks, { by: "due", dir: "asc" }).at(-1), "task_1");
  assert.equal(order(tasks, { by: "due", dir: "desc" }).at(-1), "task_1");
});

test("ties fall back to a stable id order rather than shuffling", () => {
  const a = t("task_a", "Same", "2026-08-01");
  const b = t("task_b", "Same", "2026-08-01");
  assert.deepEqual(order([b, a], { by: "due", dir: "asc" }), ["task_a", "task_b"]);
  assert.deepEqual(order([b, a], { by: "name", dir: "asc" }), ["task_a", "task_b"]);
});

test("a corrupt stored setting falls back to the default", () => {
  assert.deepEqual(normalizeSort(undefined), DEFAULT_SORT);
  assert.deepEqual(normalizeSort({ by: "nonsense", dir: "sideways" }), DEFAULT_SORT);
  assert.deepEqual(normalizeSort({ by: "name", dir: "asc" }), { by: "name", dir: "asc" });
});

test("manual order follows the arrangement you dragged", () => {
  const tasks = [older, newer, newest];
  const order = ["task_c_1", "task_a_1", "task_b_1"];
  assert.deepEqual(
    [...tasks].sort(taskComparator({ by: "manual" }, order)).map((t) => t.id),
    order
  );
});

test("a task made after the last drag goes to the top, not the bottom", () => {
  // Otherwise new work is buried under an arrangement made before it existed.
  const fresh = t("task_z_9", "Brand new");
  const order = ["task_a_1", "task_b_1"];
  const sorted = [...[older, newer, fresh]]
    .sort(taskComparator({ by: "manual" }, order))
    .map((x) => x.id);
  assert.equal(sorted[0], "task_z_9");
  assert.deepEqual(sorted.slice(1), order);
});

test("manual ignores direction — you already said what the order is", () => {
  assert.deepEqual(normalizeSort({ by: "manual", dir: "desc" }), {
    by: "manual",
    dir: "asc",
  });
});

test("direction labels read correctly for each sort key", () => {
  assert.equal(directionLabel("created", "desc"), "Newest first");
  assert.equal(directionLabel("created", "asc"), "Oldest first");
  assert.equal(directionLabel("name", "asc"), "A → Z");
  assert.equal(directionLabel("due", "asc"), "Soonest first");
});
