import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sleepDurationMin,
  durationLabel,
  makeSleepEntry,
  buildNights,
  sleepStats,
  wakeConsistencyLine,
  nightLine,
} from "../src/lib/sleep.js";

const TODAY = "2026-07-14";

test("duration crosses midnight correctly", () => {
  assert.equal(sleepDurationMin("23:30", "07:10"), 460);
  assert.equal(sleepDurationMin("01:00", "08:00"), 420); // both after midnight
  assert.equal(sleepDurationMin("22:00", "06:00"), 480);
  assert.equal(sleepDurationMin("13:00", "14:30"), 90); // nap
});

test("duration rejects bad input", () => {
  assert.equal(sleepDurationMin("23:30", "23:30"), null); // equal
  assert.equal(sleepDurationMin("", "07:00"), null);
  assert.equal(sleepDurationMin("25:00", "07:00"), null);
  assert.equal(sleepDurationMin(null, undefined), null);
});

test("durationLabel formats", () => {
  assert.equal(durationLabel(460), "7h 40m");
  assert.equal(durationLabel(480), "8h");
  assert.equal(durationLabel(45), "45m");
  assert.equal(durationLabel(null), "—");
});

test("makeSleepEntry validates and clamps", () => {
  const e = makeSleepEntry({ date: TODAY, bedTime: "23:00", wakeTime: "06:30", quality: 9 });
  assert.equal(e.id, `sleep-${TODAY}`);
  assert.equal(e.quality, 5);
  assert.equal(e.note, undefined);
  assert.equal(makeSleepEntry({ date: TODAY, bedTime: "x", wakeTime: "06:30" }), null);
});

test("buildNights returns one slot per night, oldest first", () => {
  const log = [
    { date: "2026-07-14", bedTime: "23:00", wakeTime: "07:00", quality: 4 },
    { date: "2026-07-12", bedTime: "01:00", wakeTime: "08:00", quality: 2 },
  ];
  const nights = buildNights(log, 4, TODAY);
  assert.equal(nights.length, 4);
  assert.deepEqual(nights.map((n) => n.key), ["2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14"]);
  assert.equal(nights[0].entry, null);
  assert.equal(nights[1].min, 420);
  assert.equal(nights[3].isToday, true);
  assert.equal(nights[3].min, 480);
});

test("sleepStats averages and counts", () => {
  const log = [
    { date: "2026-07-14", bedTime: "23:00", wakeTime: "07:00", quality: 4 },
    { date: "2026-07-13", bedTime: "23:30", wakeTime: "07:10", quality: 2 },
  ];
  const s = sleepStats(log, 14, TODAY);
  assert.equal(s.count, 2);
  assert.equal(s.avgMin, Math.round((480 + 460) / 2));
  assert.equal(s.avgQuality, 3);
  assert.equal(s.wake, null); // fewer than 3 wake samples
});

test("wake consistency handles the midnight wrap", () => {
  // Wakes near 7am, steady → small spread despite naive std-dev being fine here.
  const steady = sleepStats(
    [
      { date: "2026-07-14", bedTime: "23:00", wakeTime: "07:00", quality: 3 },
      { date: "2026-07-13", bedTime: "23:00", wakeTime: "07:10", quality: 3 },
      { date: "2026-07-12", bedTime: "23:00", wakeTime: "06:50", quality: 3 },
    ],
    14,
    TODAY
  );
  assert.ok(steady.wake.spreadMin < 45, `spread was ${steady.wake.spreadMin}`);
  assert.match(wakeConsistencyLine(steady.wake), /steady/);

  // Wakes scattered across the clock → large spread.
  const wild = sleepStats(
    [
      { date: "2026-07-14", bedTime: "23:00", wakeTime: "06:00", quality: 3 },
      { date: "2026-07-13", bedTime: "23:00", wakeTime: "11:30", quality: 3 },
      { date: "2026-07-12", bedTime: "23:00", wakeTime: "15:00", quality: 3 },
    ],
    14,
    TODAY
  );
  assert.ok(wild.wake.spreadMin > 90, `spread was ${wild.wake.spreadMin}`);
});

test("copy never judges a short night", () => {
  const short = nightLine({ bedTime: "03:00", wakeTime: "06:00", quality: 1 });
  assert.doesNotMatch(short, /bad|only|too little|should|fail|poor/i);
  const lines = [
    nightLine({ bedTime: "23:00", wakeTime: "07:00", quality: 5 }),
    nightLine({ bedTime: "23:00", wakeTime: "07:00", quality: 3 }),
    wakeConsistencyLine({ spreadMin: 200 }),
  ];
  for (const l of lines) assert.doesNotMatch(l, /bad|fail|should|poor|guilt/i, l);
});
