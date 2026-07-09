import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksOverlap,
  hhmmToMinutes,
  minutesToHHMM,
  nextFreeSlot,
  scheduledMinutes,
  fmtDuration,
} from "../src/lib/dayPlanner.js";

test("time conversions round-trip", () => {
  assert.equal(minutesToHHMM(510), "08:30");
  assert.equal(hhmmToMinutes("08:30"), 510);
  assert.equal(hhmmToMinutes("23:59"), 1439);
  assert.equal(hhmmToMinutes("nonsense"), null);
});

test("overlap detection treats touching blocks as free", () => {
  assert.equal(blocksOverlap({ start: 60, end: 120 }, { start: 120, end: 180 }), false);
  assert.equal(blocksOverlap({ start: 60, end: 121 }, { start: 120, end: 180 }), true);
});

test("scheduledMinutes merges overlaps instead of double counting", () => {
  const blocks = [
    { start: 540, end: 660 }, // 9–11
    { start: 600, end: 720 }, // 10–12 (overlaps)
    { start: 800, end: 860 }, // separate hour
  ];
  assert.equal(scheduledMinutes(blocks), 180 + 60);
});

test("nextFreeSlot finds the first gap that fits", () => {
  const blocks = [
    { start: 540, end: 600 }, // 9–10
    { start: 630, end: 720 }, // 10:30–12
  ];
  // From 9:00 wanting 30m → the 10:00–10:30 gap.
  assert.deepEqual(nextFreeSlot(blocks, 540, 30), { start: 600, end: 630 });
  // Wanting 45m → gap after 12:00.
  assert.deepEqual(nextFreeSlot(blocks, 540, 45), { start: 720, end: 765 });
  // Nothing fits at the very end of the day.
  assert.equal(nextFreeSlot([{ start: 0, end: 1430 }], 0, 20), null);
});

test("fmtDuration reads naturally", () => {
  assert.equal(fmtDuration(90), "1h 30m");
  assert.equal(fmtDuration(120), "2h");
  assert.equal(fmtDuration(45), "45m");
});
