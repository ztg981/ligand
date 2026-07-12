import assert from "node:assert/strict";
import test from "node:test";
import { isHandheldDevice } from "../src/lib/deviceScope.js";

test("iPhone and Android use mobile preferences", () => {
  assert.equal(isHandheldDevice({ userAgent: "Mozilla/5.0 (iPhone)" }), true);
  assert.equal(isHandheldDevice({ userAgent: "Mozilla/5.0 (Linux; Android 16)" }), true);
});

test("iPadOS desktop user agent still uses mobile preferences", () => {
  assert.equal(
    isHandheldDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }),
    true
  );
});

test("Windows and actual Macs keep desktop preferences", () => {
  assert.equal(
    isHandheldDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0)", platform: "Win32", maxTouchPoints: 10 }),
    false
  );
  assert.equal(
    isHandheldDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }),
    false
  );
});
