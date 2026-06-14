/* ============================================================
   syncManager — the bridge between localStorage and Supabase.
   ------------------------------------------------------------
   The whole app persists through localStorage under `ligand.*`
   keys. When a user is logged in we mirror that keyspace into a
   single JSON blob in the `user_data` table (one row per user).

   These are pure helpers with no React. The orchestration (when
   to fetch / push, debouncing, status) lives in useSupabaseSync.

   Guest mode never calls any of this, so the local-only path is
   completely untouched.
   ============================================================ */
import { supabase } from "./supabaseClient.js";

// Device-local UI choice — NOT user data, so it never syncs.
const GUEST_KEY = "ligand.guestMode";

/** Is a localStorage key part of the synced user-data keyspace? */
function isSyncedKey(key) {
  return Boolean(key) && key.startsWith("ligand.") && key !== GUEST_KEY;
}

/** Snapshot every synced `ligand.*` key into one plain object. */
export function collectLocalBlob() {
  const blob = {};
  if (typeof window === "undefined") return blob;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!isSyncedKey(key)) continue;
    try {
      blob[key] = JSON.parse(window.localStorage.getItem(key));
    } catch {
      /* skip corrupt entries */
    }
  }
  return blob;
}

/** Does the user have any meaningful local data worth importing? */
export function hasLocalData() {
  const blob = collectLocalBlob();
  // ligand.data holds goals/tasks/journal — the heart of "their data".
  const core = blob["ligand.data"];
  if (core && (
    (Array.isArray(core.goals) && core.goals.length) ||
    (Array.isArray(core.tasks) && core.tasks.length) ||
    (Array.isArray(core.journal) && core.journal.length) ||
    (Array.isArray(core.countUps) && core.countUps.length)
  )) {
    return true;
  }
  // Otherwise, any non-trivial synced keys at all.
  return Object.keys(blob).length > 1;
}

/**
 * Write a fetched blob into localStorage, then tell every
 * useLocalStorage hook to re-read via the `ligand:hydrate` event.
 * Only keys present in the blob are written; local-only keys are
 * left in place (they get pushed up on the next sync).
 */
export function applyBlobToLocal(blob) {
  if (typeof window === "undefined" || !blob || typeof blob !== "object") return;
  for (const [key, value] of Object.entries(blob)) {
    if (!isSyncedKey(key)) continue;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / serialization issues */
    }
  }
  window.dispatchEvent(new CustomEvent("ligand:hydrate"));
}

/**
 * Wipe all synced local keys (used when a user chooses NOT to import
 * existing data into a new account — they want a clean slate). The
 * guest-mode flag and the Supabase auth token are preserved.
 */
export function clearLocalBlob() {
  if (typeof window === "undefined") return;
  const toRemove = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (isSyncedKey(key)) toRemove.push(key);
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
  window.dispatchEvent(new CustomEvent("ligand:hydrate"));
}

/**
 * Fetch the user's row. Returns:
 *   { ok: true, row }   — row may be null when no row exists yet
 *   { ok: false, ... }  — network / table-missing / not-configured
 */
export async function fetchUserData(userId) {
  if (!supabase) return { ok: false, reason: "not-configured" };
  const { data, error } = await supabase
    .from("user_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", error };
  return { ok: true, row: data ?? null };
}

/** Upsert the user's full blob. Returns { ok } / { ok:false }. */
export async function pushUserData(userId, blob) {
  if (!supabase) return { ok: false, reason: "not-configured" };
  const { error } = await supabase.from("user_data").upsert(
    {
      user_id: userId,
      data: blob,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, reason: "error", error };
  return { ok: true };
}
