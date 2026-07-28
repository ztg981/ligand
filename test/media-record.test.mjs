import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickMimeType,
  formatDuration,
  MAX_AUDIO_MS,
  MAX_VIDEO_MS,
  MAX_VIDEO_LOCKED_MS,
} from "../src/lib/mediaRecord.js";

/* The codec ladder is the part that silently breaks across browsers, so it
   takes its support test as an argument and is exercised here against each
   browser's real answer. */

test("audio prefers opus, and falls back to Safari's mp4", () => {
  const chrome = (type) => type.startsWith("audio/webm");
  assert.equal(pickMimeType("audio", chrome), "audio/webm;codecs=opus");

  // Safari supports neither webm nor ogg for recording — only mp4.
  const safari = (type) => type === "audio/mp4";
  assert.equal(pickMimeType("audio", safari), "audio/mp4");
});

test("video prefers mp4, then walks down the webm ladder", () => {
  const safari = (type) => type === "video/mp4";
  assert.equal(pickMimeType("video", safari), "video/mp4");

  const noMp4 = (type) => type.startsWith("video/webm");
  assert.equal(pickMimeType("video", noMp4), "video/webm;codecs=vp9");

  const vp8Only = (type) => type === "video/webm;codecs=vp8";
  assert.equal(pickMimeType("video", vp8Only), "video/webm;codecs=vp8");
});

test("an unsupported browser yields \"\" so MediaRecorder picks its own default", () => {
  assert.equal(pickMimeType("audio", () => false), "");
  assert.equal(pickMimeType("video", () => false), "");
});

test("formatDuration reads as a clock", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9_000), "0:09");
  assert.equal(formatDuration(65_000), "1:05");
  assert.equal(formatDuration(600_000), "10:00");
  assert.equal(formatDuration(-50), "0:00"); // never negative
});

test("caps keep a forgotten recording from eating the device", () => {
  assert.equal(MAX_VIDEO_MS, 15_000);
  assert.equal(MAX_AUDIO_MS, 120_000);
  assert.ok(MAX_VIDEO_MS < MAX_AUDIO_MS);
});

test("locking a take raises the video cap, but still bounds it", () => {
  // A quick hold stays short; sliding to lock means "I meant this to run".
  assert.ok(MAX_VIDEO_LOCKED_MS > MAX_VIDEO_MS);
  assert.equal(MAX_VIDEO_LOCKED_MS, 180_000);
  assert.ok(Number.isFinite(MAX_VIDEO_LOCKED_MS)); // never unbounded
});
