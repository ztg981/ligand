import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_KEYS,
  applyBackupData,
  buildBackup,
  safeBackupFilename,
  validateBackupText,
} from "../src/lib/backup.js";

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    dump: () => Object.fromEntries(map.entries()),
  };
}

test("backup export only includes known Ligand keys", () => {
  const fake = storage({
    "ligand.data": JSON.stringify({ tasks: [{ text: "ship" }] }),
    "ligand.settings": JSON.stringify({ ai: { includeJournalText: false } }),
    "supabase.auth.token": JSON.stringify({ access_token: "should-not-export" }),
    "ligand.unknown": JSON.stringify({ poison: true }),
  });

  const backup = buildBackup(fake);
  assert.deepEqual(Object.keys(backup).sort(), ["ligand.data", "ligand.settings"]);
  assert.ok(BACKUP_KEYS.includes("ligand.customWallpapers"));
});

test("backup import ignores unknown keys and keeps JSON values", () => {
  const text = JSON.stringify({
    "ligand.data": { goals: [] },
    "ligand.settings": { profile: { name: "Maya" } },
    "not.ligand": { nope: true },
    "supabase.auth.token": { access_token: "bad" },
  });

  const result = validateBackupText(text);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data).sort(), ["ligand.data", "ligand.settings"]);
  assert.equal(result.ignored.length, 2);
});

test("backup import rejects empty and oversized data", () => {
  assert.equal(validateBackupText("").ok, false);
  const large = JSON.stringify({ "ligand.data": "x".repeat(7 * 1024 * 1024) });
  assert.equal(validateBackupText(large).ok, false);
});

test("applyBackupData only writes allowlisted keys", () => {
  const fake = storage();
  applyBackupData(fake, {
    "ligand.data": { tasks: [] },
    "supabase.auth.token": { access_token: "bad" },
  });
  const out = fake.dump();
  assert.ok(out["ligand.data"]);
  assert.equal(out["supabase.auth.token"], undefined);
});

test("backup filenames are stable and date-only", () => {
  assert.equal(safeBackupFilename(new Date("2026-07-06T12:34:56Z")), "ligand-backup-2026-07-06.json");
});
