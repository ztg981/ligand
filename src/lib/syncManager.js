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

/**
 * Has the user actually created something locally worth importing?
 * The fresh seed ships one built-in "productivity" goal and empty
 * lists, so we only count tasks / journal / count-ups, or goals that
 * go beyond that bare seed (custom goals, habits, or reflections).
 * This decides whether the first-login import prompt is worth showing.
 */
export function hasMeaningfulLocalData() {
  if (typeof window === "undefined") return false;
  let core;
  try {
    core = JSON.parse(window.localStorage.getItem("ligand.data") || "null");
  } catch {
    return false;
  }
  if (!core) return false;
  const tasks = Array.isArray(core.tasks) ? core.tasks.length : 0;
  const journal = Array.isArray(core.journal) ? core.journal.length : 0;
  const countUps = Array.isArray(core.countUps) ? core.countUps.length : 0;
  const goals = Array.isArray(core.goals) ? core.goals : [];
  const richGoals = goals.some(
    (g) =>
      g.type !== "built-in" ||
      (Array.isArray(g.habits) && g.habits.length > 0) ||
      (Array.isArray(g.reflections) && g.reflections.length > 0)
  );
  return tasks > 0 || journal > 0 || countUps > 0 || richGoals;
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
