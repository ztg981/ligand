import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_CATEGORIES,
  FEELS,
  buildDayStory,
  daySummary,
  screenSeries,
  screenLine,
  lastActivityLine,
  fmtMinutes,
  hhmmToMin,
  categoryOf,
} from "../src/lib/activities.js";
import { createActivity } from "../src/lib/model.js";

const DAY = "2026-07-15";

test("categoryOf falls back to Other on unknown ids", () => {
  assert.equal(categoryOf("sport").id, "sport");
  assert.equal(categoryOf("nope").id, "other");
  assert.equal(categoryOf(null).id, "other");
});

test("hhmmToMin parses and rejects", () => {
  assert.equal(hhmmToMin("07:30"), 450);
  assert.equal(hhmmToMin("00:00"), 0);
  assert.equal(hhmmToMin("bogus"), null);
  assert.equal(hhmmToMin(null), null);
});

test("fmtMinutes renders hours and minutes", () => {
  assert.equal(fmtMinutes(45), "45m");
  assert.equal(fmtMinutes(60), "1h");
  assert.equal(fmtMinutes(90), "1h 30m");
  assert.equal(fmtMinutes(0), "");
});

test("createActivity defaults are sane", () => {
  const a = createActivity({ title: "Tennis", category: "sport", durationMin: 60 });
  assert.equal(a.title, "Tennis");
  assert.equal(a.category, "sport");
  assert.equal(a.durationMin, 60);
  assert.match(a.endTime, /^\d{2}:\d{2}$/);
  assert.equal(a.linkType, null);
  // Zero/negative durations store as null (unknown), not 0.
  assert.equal(createActivity({ durationMin: 0 }).durationMin, null);
});

test("buildDayStory merges sources chronologically", () => {
  const events = buildDayStory(
    {
      activities: [
        { id: "a1", date: DAY, category: "gaming", title: "Video games", endTime: "21:00", durationMin: 60 },
        { id: "a2", date: DAY, category: "sport", title: "Tennis", endTime: "17:30", durationMin: 45, feel: "energized" },
        { id: "old", date: "2026-07-01", category: "rest", title: "Nap", endTime: "15:00" },
      ],
      workouts: [
        { id: "w1", date: DAY, createdAt: `${DAY}T09:15:00`, durationSec: 1800, exercises: [{ name: "Bench Press" }] },
      ],
      journal: [{ id: "j1", createdAt: `${DAY}T22:05:00`, text: "good day" }],
      meals: [{ id: "m1", date: DAY, time: "12:30", name: "Lunch" }],
      sleepLog: [{ date: DAY, wakeTime: "07:00" }],
      focusLog: [
        { date: DAY, minutes: 25 },
        { date: DAY, minutes: 25 },
        { date: "2026-07-01", minutes: 50 },
      ],
    },
    DAY
  );
  const kinds = events.map((e) => e.kind);
  // sleep 7:00, workout 9:15, meal 12:30, tennis 17:30, games 21:00,
  // journal 22:05, then the untimed focus rollup last.
  assert.deepEqual(kinds, ["sleep", "workout", "meal", "activity", "activity", "journal", "focus"]);
  assert.equal(events.at(-1).meta, "50m");
  // Other days' entries never leak in.
  assert.ok(!events.some((e) => e.id === "old"));
});

test("buildDayStory skips workouts mirrored by a sport activity", () => {
  const events = buildDayStory(
    {
      activities: [
        { id: "a1", date: DAY, category: "sport", title: "Tennis", endTime: "17:30", durationMin: 45, linkType: "workout", linkId: "w1" },
      ],
      workouts: [
        { id: "w1", date: DAY, createdAt: `${DAY}T17:30:00`, durationSec: 2700, exercises: [{ name: "Tennis" }] },
      ],
    },
    DAY
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "activity");
  assert.equal(events[0].title, "Tennis");
});

test("daySummary buckets minutes by what the time was", () => {
  const events = buildDayStory(
    {
      activities: [
        { id: "s", date: DAY, category: "sport", title: "Tennis", endTime: "17:00", durationMin: 45 },
        { id: "g", date: DAY, category: "screen", title: "Scrolling", endTime: "20:00", durationMin: 30 },
        { id: "r", date: DAY, category: "rest", title: "Nap", endTime: "15:00", durationMin: 20 },
      ],
      focusLog: [{ date: DAY, minutes: 50 }],
    },
    DAY
  );
  const sum = daySummary(events);
  assert.equal(sum.movingMin, 45);
  assert.equal(sum.screenMin, 30);
  assert.equal(sum.restMin, 20);
  assert.equal(sum.focusedMin, 50);
});

test("screenSeries returns one point per day, oldest first", () => {
  const series = screenSeries(
    [
      { date: DAY, category: "screen", durationMin: 30 },
      { date: DAY, category: "screen", durationMin: 15 },
      { date: "2026-07-13", category: "screen", durationMin: 60 },
      { date: DAY, category: "gaming", durationMin: 120 }, // not screen
    ],
    7,
    DAY
  );
  assert.equal(series.length, 7);
  assert.equal(series.at(-1).day, DAY);
  assert.equal(series.at(-1).minutes, 45);
  assert.equal(series.find((d) => d.day === "2026-07-13").minutes, 60);
  assert.equal(series[0].minutes, 0);
});

test("PROPERTY: no shame words anywhere in user-facing copy", () => {
  const SHAME = /\b(wasted|lazy|shame|guilt|fail|failure|bad|should have|doomscroll)\b/i;
  // Every screenLine variant across the input space.
  const lines = [];
  for (const min of [0, 10, 30, 45, 90, 100, 300]) {
    lines.push(screenLine(min, []));
    lines.push(screenLine(min, [{ day: DAY, minutes: min }]));
  }
  // Category + feel labels.
  ACTIVITY_CATEGORIES.forEach((c) => lines.push(c.name, ...(c.picks || [])));
  FEELS.forEach((f) => lines.push(f.label));
  for (const line of lines) {
    assert.ok(!SHAME.test(line), `shame word in: "${line}"`);
  }
});

test("lastActivityLine is factual and compact", () => {
  assert.equal(lastActivityLine(null), null);
  assert.equal(
    lastActivityLine({ title: "Tennis", category: "sport", durationMin: 60, feel: "fun" }),
    "Tennis · 1h · fun"
  );
  assert.equal(lastActivityLine({ category: "rest" }), "Rest");
});
