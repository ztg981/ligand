import assert from "node:assert/strict";
import test from "node:test";
import {
  focusStreak,
  focusByHour,
  bestHour,
  hourLabel,
  focusByGoal,
  focusRecords,
  focusSummary,
  recentSessions,
  minutesByDay,
  tidy,
} from "../src/lib/focusStats.js";

const TODAY = "2026-07-30";
const at = (day, hour, min = 0) => `${day}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;

test("float minutes are tidied so totals don't leak precision", () => {
  const log = [
    { date: TODAY, minutes: 0.7 },
    { date: TODAY, minutes: 0.7 },
    { date: TODAY, minutes: 0.7 },
  ];
  // Summed raw this is 2.0999999999999996 and it ends up on screen.
  assert.equal(minutesByDay(log).get(TODAY), 2.1);
  assert.equal(tidy(0.1 + 0.2), 0.3);
});

test("a streak counts back from today", () => {
  const log = [
    { date: "2026-07-28", minutes: 25 },
    { date: "2026-07-29", minutes: 25 },
    { date: TODAY, minutes: 25 },
  ];
  const s = focusStreak(log, TODAY);
  assert.equal(s.current, 3);
  assert.equal(s.endsToday, true);
});

test("a streak survives a day you haven't focused yet", () => {
  // Nothing today, but yesterday and the day before. Breaking the streak at
  // midnight would scold someone for not having focused before breakfast.
  const log = [
    { date: "2026-07-28", minutes: 25 },
    { date: "2026-07-29", minutes: 25 },
  ];
  const s = focusStreak(log, TODAY);
  assert.equal(s.current, 2);
  assert.equal(s.endsToday, false, "flagged so the UI can say 'focus today to keep it'");
});

test("a streak breaks once a whole day has passed empty", () => {
  const log = [
    { date: "2026-07-26", minutes: 25 },
    { date: "2026-07-27", minutes: 25 },
    // 28th and 29th empty
  ];
  assert.equal(focusStreak(log, TODAY).current, 0);
  // The run itself is still on the record as a personal best.
  assert.equal(focusStreak(log, TODAY).longest, 2);
});

test("the longest streak is found anywhere in the history", () => {
  const log = [
    { date: "2026-07-01", minutes: 10 },
    { date: "2026-07-02", minutes: 10 },
    { date: "2026-07-03", minutes: 10 },
    { date: "2026-07-04", minutes: 10 },
    { date: "2026-07-20", minutes: 10 },
    { date: TODAY, minutes: 10 },
  ];
  assert.equal(focusStreak(log, TODAY).longest, 4);
  assert.equal(focusStreak(log, TODAY).current, 1);
});

test("an empty log has no streak rather than a broken one", () => {
  assert.deepEqual(focusStreak([], TODAY), { current: 0, longest: 0, endsToday: false });
});

test("hour buckets only count sessions that recorded a time", () => {
  const log = [
    { date: TODAY, minutes: 25, at: at(TODAY, 9) },
    { date: TODAY, minutes: 25, at: at(TODAY, 9, 40) },
    { date: TODAY, minutes: 50, at: at(TODAY, 14) },
    { date: TODAY, minutes: 30 }, // written before `at` existed
    { date: TODAY, minutes: 30, at: "not a date" },
  ];
  const { hours, placed, skipped } = focusByHour(log);
  assert.equal(hours[9], 50);
  assert.equal(hours[14], 50);
  assert.equal(placed, 3);
  // Reported, so the view can say the chart is drawn from part of the history
  // rather than quietly implying it's the whole picture.
  assert.equal(skipped, 2);
});

test("the best hour is the one with the most minutes, or null", () => {
  const log = [
    { date: TODAY, minutes: 10, at: at(TODAY, 8) },
    { date: TODAY, minutes: 45, at: at(TODAY, 21) },
  ];
  assert.deepEqual(bestHour(log), { hour: 21, minutes: 45 });
  // Nothing placeable → no claim about when you focus best.
  assert.equal(bestHour([{ date: TODAY, minutes: 30 }]), null);
  assert.equal(bestHour([]), null);
});

test("hours read the way you'd say them", () => {
  assert.equal(hourLabel(0), "midnight");
  assert.equal(hourLabel(12), "noon");
  assert.equal(hourLabel(9), "9 am");
  assert.equal(hourLabel(21), "9 pm");
});

test("time by goal names deleted goals honestly and keeps loose time", () => {
  const goals = [{ id: "g1", name: "Thesis", color: "#f00" }];
  const rows = focusByGoal(
    [
      { date: TODAY, minutes: 60, goalId: "g1" },
      { date: TODAY, minutes: 30, goalId: "gone" },
      { date: TODAY, minutes: 90, goalId: null },
    ],
    goals
  );
  assert.equal(rows[0].name, "Not tied to a goal", "biggest first");
  assert.equal(rows[0].minutes, 90);
  assert.equal(rows.find((r) => r.id === "g1").name, "Thesis");
  assert.equal(rows.find((r) => r.id === "gone").name, "A deleted goal");
});

test("records pick the best day and the single longest session", () => {
  const log = [
    { date: "2026-07-28", minutes: 25, label: "Reading" },
    { date: "2026-07-28", minutes: 25 },
    { date: TODAY, minutes: 45, label: "Thesis" },
  ];
  const r = focusRecords(log);
  assert.deepEqual(r.bestDay, { date: "2026-07-28", minutes: 50 });
  assert.equal(r.bestSession.minutes, 45);
  assert.equal(r.bestSession.label, "Thesis");
});

test("the week-on-week change is null when there is nothing to compare to", () => {
  // "Up 100%" from a week you weren't using the app is not a real fact.
  const onlyThisWeek = [{ date: TODAY, minutes: 60 }];
  assert.equal(focusSummary(onlyThisWeek, { refKey: TODAY }).change, null);

  const both = [
    { date: "2026-07-20", minutes: 50 }, // previous window
    { date: TODAY, minutes: 75 },
  ];
  assert.equal(focusSummary(both, { refKey: TODAY }).change, 50);
});

test("the summary separates finished blocks from every other kind of time", () => {
  const log = [
    { date: TODAY, minutes: 25, source: "timer" },
    { date: TODAY, minutes: 25, source: "timer" },
    { date: TODAY, minutes: 7, source: "partial" },
    { date: TODAY, minutes: 40, source: "manual" },
  ];
  const s = focusSummary(log, { refKey: TODAY });
  assert.equal(s.sessions, 4);
  assert.equal(s.finished, 2, "only whole blocks count as finished");
  assert.equal(s.today, 97);
  assert.equal(s.averageSession, 24.3);
});

test("recent sessions come back newest first", () => {
  const log = [
    { date: "2026-07-28", minutes: 10, at: at("2026-07-28", 9) },
    { date: TODAY, minutes: 10, at: at(TODAY, 8) },
    { date: TODAY, minutes: 10, at: at(TODAY, 17) },
  ];
  const r = recentSessions(log, 3);
  assert.equal(r[0].at, at(TODAY, 17));
  assert.equal(r[2].date, "2026-07-28");
  assert.equal(recentSessions(log, 2).length, 2);
});

test("an empty log summarises to zeroes, not NaN", () => {
  const s = focusSummary([], { refKey: TODAY });
  assert.equal(s.lifetime, 0);
  assert.equal(s.averageSession, 0);
  assert.equal(s.dailyAverage, 0);
  assert.equal(s.best, null);
  assert.equal(s.change, null);
});
