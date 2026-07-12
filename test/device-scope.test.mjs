import assert from "node:assert/strict";
import test from "node:test";
import { usesMobilePreferenceScope } from "../src/lib/deviceScope.js";

test("iPhone and Android use mobile preferences", () => {
  assert.equal(usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (iPhone)" }), true);
  assert.equal(usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (Linux; Android 16)" }), true);
});

test("iPad shares desktop preferences even with its desktop user agent", () => {
  assert.equal(
    usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }),
    false
  );
  assert.equal(usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (iPad)" }), false);
});

test("Windows and actual Macs keep desktop preferences", () => {
  assert.equal(
    usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (Windows NT 10.0)", platform: "Win32", maxTouchPoints: 10 }),
    false
  );
  assert.equal(
    usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }),
    false
  );
});
