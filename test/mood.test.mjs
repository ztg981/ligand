import assert from "node:assert/strict";
import test from "node:test";
import { moodScore, moodSeries, moodDirection } from "../src/lib/mood.js";

test("moodScore maps the 5-point scale, null for unknown", () => {
  assert.equal(moodScore("rough"), 1);
  assert.equal(moodScore("okay"), 3);
  assert.equal(moodScore("great"), 5);
  assert.equal(moodScore("nope"), null);
  assert.equal(moodScore(undefined), null);
});

test("moodSeries drops entries without a mood and runs oldest→newest", () => {
  // Journal is stored newest-first; series should reverse to chronological.
  const journal = [
    { mood: "great", createdAt: "2026-01-03T09:00:00Z" },
    { mood: null, createdAt: "2026-01-02T09:00:00Z" },
    { createdAt: "2026-01-02T08:00:00Z" }, // no mood key
    { mood: "low", createdAt: "2026-01-01T09:00:00Z" },
  ];
  const s = moodSeries(journal);
  assert.deepEqual(s.map((p) => p.value), ["low", "great"]);
  assert.deepEqual(s.map((p) => p.score), [2, 5]);
  assert.deepEqual(s.map((p) => p.day), ["2026-01-01", "2026-01-03"]);
});

test("moodSeries keeps only the most recent `limit` points", () => {
  const journal = Array.from({ length: 20 }, (_, i) => ({
    mood: "okay",
    createdAt: `2026-02-${String(i + 1).padStart(2, "0")}T09:00:00Z`,
  }));
  // Newest-first input; keep last 5 chronological (Feb 16..20).
  const s = moodSeries(journal.reverse(), 5);
  assert.equal(s.length, 5);
  assert.equal(s[0].day, "2026-02-16");
  assert.equal(s[4].day, "2026-02-20");
});

test("moodDirection needs at least 4 points", () => {
  assert.equal(moodDirection([{ score: 1 }, { score: 5 }]), null);
});

test("moodDirection reads up / down / steady from the halves", () => {
  const up = [1, 1, 4, 5].map((score) => ({ score }));
  const down = [5, 4, 1, 1].map((score) => ({ score }));
  const steady = [3, 3, 3, 3].map((score) => ({ score }));
  assert.equal(moodDirection(up), "up");
  assert.equal(moodDirection(down), "down");
  assert.equal(moodDirection(steady), "steady");
});

test("moodTimeline: 2w keeps entries, 1m averages days, 1y averages weeks", async () => {
  const { moodTimeline } = await import("../src/lib/mood.js");
  const NOW = Date.parse("2026-07-16T12:00:00");
  const j = [
    { mood: "great", createdAt: "2026-07-15T09:00:00" },
    { mood: "rough", createdAt: "2026-07-15T21:00:00" },
    { mood: "okay", createdAt: "2026-07-01T12:00:00" },
    { mood: "good", createdAt: "2025-01-01T12:00:00" }, // ancient
    { mood: "good", createdAt: "2099-01-01T12:00:00" }, // future: ignored
    { text: "no mood", createdAt: "2026-07-15T10:00:00" },
  ];
  const twoW = moodTimeline(j, "2w", NOW);
  assert.equal(twoW.points.length, 2); // both 7/15 entries; 7/1 is outside 14 days
  const oneM = moodTimeline(j, "1m", NOW);
  // 7/15 bucket averages 5 and 1 → 3; plus 7/1 bucket
  const d15 = oneM.points.find((p) => new Date(p.t).getDate() === 15);
  assert.equal(d15.score, 3);
  assert.equal(d15.count, 2);
  const all = moodTimeline(j, "all", NOW);
  assert.ok(all.points.length >= 2);
  assert.ok(all.points[0].t <= all.points.at(-1).t);
  assert.deepEqual(moodTimeline([], "2w", NOW).points, []);
});
