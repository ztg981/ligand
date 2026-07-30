import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksOverlap,
  hhmmToMinutes,
  minutesToHHMM,
  minutesToLabel,
  nextFreeSlot,
  scheduledMinutes,
  fmtDuration,
  resolveRange,
  spansMidnight,
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

/* Late nights. A block from 11pm to 1am is stored as 1380 → 1500: the end runs
   past 1440 rather than wrapping to 60, so durations and containment tests stay
   plain arithmetic. Only the wall-clock formatters wrap. */

test("resolveRange reads an earlier end as the next day", () => {
  assert.deepEqual(resolveRange(1380, 60), { start: 1380, end: 1500 });
  // A normal daytime range is left exactly alone.
  assert.deepEqual(resolveRange(540, 660), { start: 540, end: 660 });
  // Equal times don't get pushed a day apart — the caller rejects them.
  assert.deepEqual(resolveRange(600, 600), { start: 600, end: 600 });
});

test("an overnight block reports a real duration, not a negative one", () => {
  const { start, end } = resolveRange(1380, 60);
  assert.equal(end - start, 120);
  assert.equal(fmtDuration(end - start), "2h");
  assert.equal(spansMidnight({ start, end }), true);
  assert.equal(spansMidnight({ start: 540, end: 660 }), false);
});

test("wall-clock formatters wrap an end past midnight", () => {
  // 1500 is 1am tomorrow — NOT clamped back to midnight.
  assert.equal(minutesToHHMM(1500), "01:00");
  assert.equal(minutesToHHMM(1440), "00:00");
  assert.match(minutesToLabel(1500), /1:00/);
  // Round-trips through the editor's time fields and back.
  const { start, end } = resolveRange(
    hhmmToMinutes(minutesToHHMM(1380)),
    hhmmToMinutes(minutesToHHMM(1500))
  );
  assert.deepEqual({ start, end }, { start: 1380, end: 1500 });
});

test("an overnight block collides with the early hours it runs into", () => {
  const overnight = { start: 1380, end: 1500 }; // 11pm–1am
  // Its tail covers 00:30–01:30, so that block is NOT free.
  assert.equal(blocksOverlap(overnight, { start: 30, end: 90 }), true);
  assert.equal(blocksOverlap({ start: 30, end: 90 }, overnight), true);
  // But it leaves the rest of the morning alone.
  assert.equal(blocksOverlap(overnight, { start: 120, end: 180 }), false);
});

test("fmtDuration reads naturally", () => {
  assert.equal(fmtDuration(90), "1h 30m");
  assert.equal(fmtDuration(120), "2h");
  assert.equal(fmtDuration(45), "45m");
});
