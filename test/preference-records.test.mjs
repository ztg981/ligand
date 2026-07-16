import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_SETTINGS_KEY,
  MOBILE_TWEAKS_KEY,
  TWEAK_DEFAULTS,
  mobileSettingsDefaults,
  normalizeMobileSettingsRecord,
  phonePreferenceSyncValue,
  readLegacyProfile,
  shouldSyncPhonePreference,
} from "../src/lib/preferenceRecords.js";

test("untouched phone defaults do not seed the account record", () => {
  assert.equal(shouldSyncPhonePreference(MOBILE_SETTINGS_KEY, mobileSettingsDefaults()), false);
  assert.equal(shouldSyncPhonePreference(MOBILE_TWEAKS_KEY, TWEAK_DEFAULTS), false);
});

test("existing or explicitly edited phone appearance can seed the account record", () => {
  assert.equal(
    shouldSyncPhonePreference(MOBILE_TWEAKS_KEY, {
      ...TWEAK_DEFAULTS,
      accent: 165,
      lightPalette: "porcelain",
    }),
    true
  );
  assert.equal(
    shouldSyncPhonePreference(MOBILE_TWEAKS_KEY, {
      ...TWEAK_DEFAULTS,
      _updatedAt: "2026-07-16T20:00:00.000Z",
    }),
    true
  );
});

test("account profile migrates from the existing synced desktop settings", () => {
  const values = new Map([
    ["ligand.settings", JSON.stringify({ profile: { name: "Tiger" } })],
    ["ligand.mobileSettings", JSON.stringify({ profile: { name: "Guest" } })],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.deepEqual(readLegacyProfile(storage), { name: "Tiger" });
});

test("the phone record cannot inherit desktop identity or window behavior", () => {
  const mobile = normalizeMobileSettingsRecord({
    profile: { name: "Wrong name" },
    desktop: { closeToTray: false },
    habits: { showStreaks: false },
  });
  assert.equal(Object.hasOwn(mobile, "profile"), false);
  assert.equal(Object.hasOwn(mobile, "desktop"), false);
  assert.equal(mobile.habits.showStreaks, false);
});

test("the uploaded phone settings payload strips legacy desktop fields", () => {
  const payload = phonePreferenceSyncValue(MOBILE_SETTINGS_KEY, {
    profile: { name: "Tiger" },
    desktop: { closeToTray: false },
    notifications: { dailyReminder: true },
  });
  assert.equal(Object.hasOwn(payload, "profile"), false);
  assert.equal(Object.hasOwn(payload, "desktop"), false);
  assert.equal(payload.notifications.dailyReminder, true);
});
