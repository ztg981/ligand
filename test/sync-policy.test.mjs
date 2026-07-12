import assert from "node:assert/strict";
import test from "node:test";
import { isSyncedKey } from "../src/lib/syncPolicy.js";

test("account content remains synced", () => {
  assert.equal(isSyncedKey("ligand.data"), true);
  assert.equal(isSyncedKey("ligand.activeWorkout"), true);
  assert.equal(isSyncedKey("ligand.dayPlanner"), true);
  assert.equal(isSyncedKey("ligand.badges"), true);
  assert.equal(isSyncedKey("ligand.settings"), true);
  assert.equal(isSyncedKey("ligand.tweaks"), true);
});

test("mobile appearance and machine-local settings never sync", () => {
  const localKeys = [
    "ligand.mobileSettings",
    "ligand.mobileTweaks",
    "ligand.mobileTheme",
    "ligand.customWallpapers",
    "ligand.pomodoro",
    "ligand.blocker",
  ];
  for (const key of localKeys) assert.equal(isSyncedKey(key), false, key);
});

test("unrelated storage is never uploaded", () => {
  assert.equal(isSyncedKey("supabase.auth.token"), false);
  assert.equal(isSyncedKey("theme"), false);
  assert.equal(isSyncedKey(""), false);
});
