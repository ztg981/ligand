import { test } from "node:test";
import assert from "node:assert/strict";
import { collectDayWins, winLines } from "../src/lib/dayWins.js";

const TODAY = "2026-07-12";

test("empty store yields zero wins", () => {
  const w = collectDayWins({}, TODAY);
  assert.deepEqual(w, {
    tasksDone: 0,
    habitsChecked: 0,
    habitsTotal: 0,
    focusMin: 0,
    workoutsDone: 0,
    journaled: false,
  });
  assert.deepEqual(winLines(w), []);
});

test("counts only tasks completed TODAY", () => {
  const w = collectDayWins(
    {
      tasks: [
        { id: "a", done: true, completedOn: TODAY },
        { id: "b", done: true, completedOn: "2026-07-10" }, // older
        { id: "c", done: false, completedOn: null },
      ],
    },
    TODAY
  );
  assert.equal(w.tasksDone, 1);
});

test("habit check-ins counted across goals", () => {
  const w = collectDayWins(
    {
      goals: [
        { habits: [{ checkIns: [TODAY] }, { checkIns: [] }] },
        { habits: [{ checkIns: ["2026-07-01", TODAY] }] },
      ],
    },
    TODAY
  );
  assert.equal(w.habitsChecked, 2);
  assert.equal(w.habitsTotal, 3);
});

test("focus minutes summed for today only", () => {
  const w = collectDayWins(
    {
      focusLog: [
        { date: TODAY, minutes: 25 },
        { date: TODAY, minutes: 50 },
        { date: "2026-07-11", minutes: 90 },
      ],
    },
    TODAY
  );
  assert.equal(w.focusMin, 75);
});

test("journal entry with ISO createdAt counts for its local day", () => {
  const w = collectDayWins(
    { journal: [{ createdAt: `${TODAY}T20:15:00` }] },
    TODAY
  );
  assert.equal(w.journaled, true);
});

test("winLines only includes what happened, in stable order", () => {
  const lines = winLines({
    tasksDone: 2,
    habitsChecked: 1,
    habitsTotal: 4,
    focusMin: 50,
    workoutsDone: 0,
    journaled: true,
  });
  assert.deepEqual(
    lines.map((l) => l.id),
    ["tasks", "habits", "focus", "journal"]
  );
  assert.match(lines[0].text, /2 tasks/);
  assert.match(lines[1].text, /1 of 4/);
});
