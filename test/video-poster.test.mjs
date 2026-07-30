import assert from "node:assert/strict";
import test from "node:test";
import {
  posterTime,
  coverCrop,
  frameIsBlank,
  BLACK_MEAN,
  POSTER_AT_SEC,
} from "../src/lib/videoPoster.js";

/* Pulling a usable frame out of a recorded clip. The decoding itself needs a
   browser; these are the decisions around it — where to look, how to fit it,
   and how to tell a picture from the black rectangle that started all this. */

test("looks past the black opening frames", () => {
  assert.equal(posterTime(30), POSTER_AT_SEC);
  // Short clips seek to their own middle rather than past their end, which
  // would stall on a take shorter than the fixed offset.
  assert.equal(posterTime(0.5), 0.2);
  assert.ok(posterTime(0.5) < 0.5);
});

test("an unusable duration falls back to the fixed offset", () => {
  // MediaRecorder's WebM reports Infinity until the file is fully scanned —
  // computing a fraction of that yields NaN and seeks nowhere.
  for (const bad of [Infinity, NaN, 0, -3, null, undefined, "abc"]) {
    assert.equal(posterTime(bad), POSTER_AT_SEC);
  }
});

test("a portrait clip fills a landscape tile instead of letterboxing", () => {
  // 9:16 phone video into a 132x78 tile: trim top and bottom, keep full width.
  const c = coverCrop(1080, 1920, 132, 78);
  assert.equal(c.sw, 1080, "uses the whole width");
  assert.ok(c.sh < 1920, "crops the height");
  assert.ok(c.sy > 0 && Math.abs(c.sy - (1920 - c.sh) / 2) < 0.01, "centred");
});

test("an ultrawide clip is cropped at the sides", () => {
  const c = coverCrop(1920, 1080, 132, 78);
  assert.equal(c.sh, 1080, "uses the whole height");
  assert.ok(c.sw < 1920);
  assert.ok(c.sx > 0, "centred crop, not left-aligned");
});

test("coverCrop survives nonsense dimensions", () => {
  const c = coverCrop(0, 0, 132, 78);
  assert.ok(c.sw > 0 && c.sh > 0, "never returns a zero-area crop to drawImage");
});

/* frameIsBlank is the guard that catches a seek landing nowhere. A canvas
   context is faked here — only getImageData matters. */
const fakeCtx = (fill) => ({
  getImageData: (x, y, w, h) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = fill(i / 4);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return { data };
  },
});

test("a black frame is recognised as no picture at all", () => {
  assert.equal(frameIsBlank(fakeCtx(() => [0, 0, 0]), 132, 78), true);
  // Sensor noise on an otherwise black frame still counts as blank.
  assert.equal(frameIsBlank(fakeCtx((i) => [i % 3, 0, i % 2]), 132, 78), true);
});

test("a genuinely dark shot is NOT thrown away", () => {
  // A room at night: dim, but well clear of the threshold. Discarding this
  // would mean night-time clips never got a thumbnail.
  const dim = BLACK_MEAN * 4;
  assert.equal(frameIsBlank(fakeCtx(() => [dim, dim, dim]), 132, 78), false);
});

test("a normal frame is kept", () => {
  assert.equal(frameIsBlank(fakeCtx(() => [29, 127, 212]), 132, 78), false);
});

test("an unreadable canvas is kept rather than discarded", () => {
  // A tainted canvas throws on getImageData; a thumbnail we can't measure is
  // better than no thumbnail.
  const throwing = { getImageData: () => { throw new Error("tainted"); } };
  assert.equal(frameIsBlank(throwing, 132, 78), false);
});
