import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuickAdd,
  parseTimeToken,
  parseRepeatToken,
} from "../src/lib/quickParse.js";

test("plain text passes through untouched", () => {
  const r = parseQuickAdd("buy groceries");
  assert.equal(r.cleanText, "buy groceries");
  assert.equal(r.label, null);
  assert.equal(r.repeat, null);
  assert.equal(r.time, null);
  assert.equal(r.tokens.length, 0);
});

test("urgent keyword sets Urgent label and strips token", () => {
  const r = parseQuickAdd("call landlord urgent");
  assert.equal(r.label, "Urgent");
  assert.equal(r.cleanText, "call landlord");
});

test("trailing bangs read as urgent", () => {
  const r = parseQuickAdd("submit form!!");
  assert.equal(r.label, "Urgent");
  assert.equal(r.cleanText, "submit form");
});

test("today keyword sets Today label", () => {
  const r = parseQuickAdd("water plants today");
  assert.equal(r.label, "Today");
  assert.equal(r.cleanText, "water plants");
});

test("urgent outranks today when both present", () => {
  const r = parseQuickAdd("pay bill today urgent");
  assert.equal(r.label, "Urgent");
  // both tokens stripped
  assert.equal(r.cleanText, "pay bill");
});

test("every day parses as daily repeat", () => {
  const r = parseQuickAdd("stretch every day");
  assert.deepEqual(r.repeat, { type: "daily" });
  assert.equal(r.cleanText, "stretch");
});

test("daily keyword parses as daily repeat", () => {
  assert.deepEqual(parseRepeatToken("meditate daily").repeat, { type: "daily" });
});

test("every monday parses weekly with JS getDay index", () => {
  const r = parseQuickAdd("trash out every monday");
  assert.deepEqual(r.repeat, { type: "weekly", weekday: 1 });
  assert.equal(r.cleanText, "trash out");
});

test("every sun abbreviation works", () => {
  const r = parseQuickAdd("meal prep every sun");
  assert.deepEqual(r.repeat, { type: "weekly", weekday: 0 });
});

test("every morning reads as daily", () => {
  assert.deepEqual(parseRepeatToken("run every morning").repeat, { type: "daily" });
});

test("12h times parse to HH:MM", () => {
  assert.equal(parseTimeToken("wake up 7am").time, "07:00");
  assert.equal(parseTimeToken("gym 7:30pm").time, "19:30");
  assert.equal(parseTimeToken("lunch at 12pm").time, "12:00");
  assert.equal(parseTimeToken("midnight snack 12am").time, "00:00");
});

test("24h colon times parse", () => {
  assert.equal(parseTimeToken("standup 09:15").time, "09:15");
  assert.equal(parseTimeToken("call at 19:00").time, "19:00");
});

test("bare hour needs an explicit at", () => {
  assert.equal(parseTimeToken("buy 3 apples"), null);
  assert.equal(parseTimeToken("meet at 3").time, "03:00");
});

test("combined phrase extracts everything and cleans text", () => {
  const r = parseQuickAdd("meds every day at 9am urgent");
  assert.equal(r.label, "Urgent");
  assert.deepEqual(r.repeat, { type: "daily" });
  assert.equal(r.time, "09:00");
  assert.equal(r.cleanText, "meds");
  assert.equal(r.tokens.length, 3);
});

test("time token exposes a friendly display chip", () => {
  const r = parseQuickAdd("wake up at 6:30am");
  const chip = r.tokens.find((t) => t.kind === "time");
  assert.ok(chip);
  assert.match(chip.display, /6:30/);
});
