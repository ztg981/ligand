import assert from "node:assert/strict";
import test from "node:test";
import { restoreSession, PHASES, POMO_DEFAULTS } from "../src/hooks/usePomodoro.js";
import { isSyncedKey } from "../src/lib/syncPolicy.js";
import { fmtMinutes } from "../src/lib/activities.js";

const S = { ...POMO_DEFAULTS, work: 25, shortBreak: 5, longBreak: 15, longEvery: 4 };
const NOW = 1_800_000_000_000;

/* The saved session is what moves a focus block between devices: it carries an
   ABSOLUTE end time, so a laptop and an iPad reading the same record count down
   to the same instant with nothing to reconcile. */

test("a running block resumes with the elapsed time subtracted", () => {
  const saved = { phase: PHASES.WORK, completed: 1, running: true, endTime: NOW + 600_000 };
  const out = restoreSession(saved, S, NOW);
  assert.equal(out.running, true);
  assert.equal(out.remaining, 600); // ten minutes still to go
  assert.equal(out.endTime, saved.endTime);
  // Five minutes later the SAME record yields five fewer minutes — which is
  // what makes picking it up on another device correct rather than lucky.
  assert.equal(restoreSession(saved, S, NOW + 300_000).remaining, 300);
});

test("a paused block comes back frozen where it was left", () => {
  const saved = { phase: PHASES.WORK, completed: 2, running: false, endTime: null, remaining: 431 };
  const out = restoreSession(saved, S, NOW);
  assert.equal(out.running, false);
  assert.equal(out.remaining, 431);
  assert.equal(out.endTime, null);
  // An hour of sitting untouched changes nothing: paused time isn't elapsed time.
  assert.equal(restoreSession(saved, S, NOW + 3_600_000).remaining, 431);
});

test("a focus block that finished while you were away advances the cycle", () => {
  const saved = { phase: PHASES.WORK, completed: 0, running: true, endTime: NOW - 60_000 };
  const out = restoreSession(saved, S, NOW);
  assert.equal(out.completed, 1, "the block counts as done");
  assert.equal(out.phase, PHASES.SHORT);
  assert.equal(out.running, false);
  assert.equal(out.remaining, 5 * 60);

  // The fourth one earns the long break.
  const fourth = { phase: PHASES.WORK, completed: 3, running: true, endTime: NOW - 1000 };
  assert.equal(restoreSession(fourth, S, NOW).phase, PHASES.LONG);
});

test("a break that elapsed while away drops back to focus", () => {
  const saved = { phase: PHASES.SHORT, completed: 2, running: true, endTime: NOW - 5000 };
  const out = restoreSession(saved, S, NOW);
  assert.equal(out.phase, PHASES.WORK);
  assert.equal(out.completed, 2, "a break never adds to the focus count");
  assert.equal(out.running, false);
});

test("junk falls back to a fresh focus block", () => {
  for (const bad of [null, undefined, {}, { phase: "nonsense" }, { phase: 7 }]) {
    const out = restoreSession(bad, S, NOW);
    assert.equal(out.phase, PHASES.WORK);
    assert.equal(out.running, false);
    assert.equal(out.remaining, 25 * 60);
  }
});

test("the live session and pause stopwatch are synced, not device-local", () => {
  // These two were excluded from sync, which is what stranded a paused timer
  // on the machine that paused it.
  assert.equal(isSyncedKey("ligand.pomodoro.session"), true);
  assert.equal(isSyncedKey("ligand.pomodoro.pausedAt"), true);
  // Settings sync separately; genuinely machine-local state still doesn't.
  assert.equal(isSyncedKey("ligand.guestMode"), false);
  assert.equal(isSyncedKey("ligand.badgesCelebrated"), false);
});

/* Short sessions are real sessions. */

test("under a minute reads in seconds instead of rounding to nothing", () => {
  assert.equal(fmtMinutes(0.7), "42s"); // a 42-second block
  assert.equal(fmtMinutes(0.4), "24s"); // used to render as "0m"
  assert.equal(fmtMinutes(0.005), "1s"); // never "0s" for time that happened
  assert.equal(fmtMinutes(0), "");
  // A minute and over is unchanged.
  assert.equal(fmtMinutes(1), "1m");
  assert.equal(fmtMinutes(45), "45m");
  assert.equal(fmtMinutes(90), "1h 30m");
  assert.equal(fmtMinutes(120), "2h");
});
