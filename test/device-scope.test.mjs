import assert from "node:assert/strict";
import test from "node:test";
import {
  isStandaloneWebApp,
  usesMobilePreferenceScope,
} from "../src/lib/deviceScope.js";

test("iPhone and Android use mobile preferences", () => {
  assert.equal(usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (iPhone)" }), true);
  assert.equal(usesMobilePreferenceScope({ userAgent: "Mozilla/5.0 (Linux; Android 16)" }), true);
});

test("iPhone Home Screen apps keep mobile preferences with a desktop-style user agent", () => {
  assert.equal(
    usesMobilePreferenceScope(
      {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
        standalone: true,
      },
      { width: 393, height: 852 }
    ),
    true
  );
});

test("iPad shares desktop preferences even with its desktop user agent", () => {
  assert.equal(
    usesMobilePreferenceScope(
      { userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 },
      { width: 820, height: 1180 }
    ),
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

test("standalone mode is recognized through either iOS or display-mode", () => {
  assert.equal(isStandaloneWebApp({ standalone: true }, undefined), true);
  assert.equal(
    isStandaloneWebApp({}, () => ({ matches: true })),
    true
  );
  assert.equal(
    isStandaloneWebApp({}, () => ({ matches: false })),
    false
  );
});
