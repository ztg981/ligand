import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClock,
  parseScheduleLine,
  parseScheduleText,
  nextWeekday,
  normalizeAiEvents,
  draftToBlock,
  clockToMin,
} from "../src/lib/scheduleParse.js";

const REF = "2026-07-16"; // a Thursday

test("parseClock handles am/pm, bare hours, and hints", () => {
  assert.equal(parseClock("9:30am"), "09:30");
  assert.equal(parseClock("2pm"), "14:00");
  assert.equal(parseClock("12am"), "00:00");
  assert.equal(parseClock("12pm"), "12:00");
  assert.equal(parseClock("9", "am"), "09:00");
  // bare small hours guess afternoon
  assert.equal(parseClock("3"), "15:00");
  assert.equal(parseClock("nope"), null);
});

test("nextWeekday counts today as a hit", () => {
  assert.equal(nextWeekday(3, REF), REF); // Thu=3
  assert.equal(nextWeekday(0, REF), "2026-07-20"); // next Monday
});

test("parseScheduleLine: weekday + range + title", () => {
  const e = parseScheduleLine("Mon 9:00-10:15 Math 101", REF);
  assert.deepEqual(e, { title: "Math 101", date: "2026-07-20", start: "09:00", end: "10:15" });
});

test("parseScheduleLine: full weekday word and single time", () => {
  const e = parseScheduleLine("Tuesday 2pm Dentist", REF);
  assert.deepEqual(e, { title: "Dentist", date: "2026-07-21", start: "14:00", end: null });
});

test("parseScheduleLine: slash date with pm range", () => {
  const e = parseScheduleLine("7/21 3:30pm-5pm Practice", REF);
  assert.deepEqual(e, { title: "Practice", date: "2026-07-21", start: "15:30", end: "17:00" });
});

test("parseScheduleLine: time before weekday, shared am hint on ranges", () => {
  const e = parseScheduleLine("Standup 9-9:15am Wednesday", REF);
  assert.equal(e.date, "2026-07-22");
  assert.equal(e.start, "09:00");
  assert.equal(e.end, "09:15");
  assert.equal(e.title, "Standup");
});

test("parseScheduleLine: no date defaults to refDate; no title is dropped", () => {
  assert.equal(parseScheduleLine("Lunch 12pm", REF).date, REF);
  assert.equal(parseScheduleLine("9:00-10:00", REF), null);
  assert.equal(parseScheduleLine("", REF), null);
});

test("parseScheduleText splits lines and caps at 60", () => {
  const events = parseScheduleText("Mon 9am Standup\n\nFri 3pm Review", REF);
  assert.equal(events.length, 2);
  const many = parseScheduleText(Array(80).fill("Mon 9am Thing").join("\n"), REF);
  assert.equal(many.length, 60);
});

test("normalizeAiEvents clamps untrusted output", () => {
  const events = normalizeAiEvents(
    {
      events: [
        { title: "Physics", date: "2026-07-20", start: "9:00 am", end: "10:15" },
        { title: "Weekly sync", weekday: 4, start: "13:00" }, // Fri=4
        { title: "", start: "9:00" }, // dropped
        { title: "Bad date", date: "07/20", start: "9:00" }, // date falls back to ref
      ],
    },
    REF
  );
  assert.equal(events.length, 3);
  assert.deepEqual(events[0], { title: "Physics", date: "2026-07-20", start: "09:00", end: "10:15" });
  assert.equal(events[1].date, "2026-07-17");
  assert.equal(events[2].date, REF);
});

test("draftToBlock: timed, untimed placeholder, and end<=start repair", () => {
  assert.deepEqual(
    draftToBlock({ title: "Math", date: REF, start: "09:00", end: "10:15" }),
    { date: REF, start: 540, end: 615, title: "Math", category: "work" }
  );
  const untimed = draftToBlock({ title: "Sometime", date: REF, start: null, end: null });
  assert.equal(untimed.start, 540);
  assert.equal(untimed.end, 600);
  const repaired = draftToBlock({ title: "X", date: REF, start: "23:30", end: "23:00" });
  assert.ok(repaired.end > repaired.start);
  assert.equal(clockToMin("07:30"), 450);
});
