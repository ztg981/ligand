/* ============================================================
   noteVault — session-lifetime holder for the notes passphrase key.
   ------------------------------------------------------------
   The derived AES key lives ONLY here, in a module-level variable.
   It is never written to localStorage and never synced, so it
   evaporates on reload / tab close — you re-enter the passphrase
   once per session to unlock. Kept at module scope (not React
   state) so switching away from the Notes tab and back doesn't
   re-lock you within the same page session.

   What DOES persist (and sync across devices) is only the salt +
   verifier under `ligand.noteVault`: enough to re-derive and check
   the key from the passphrase, never enough to read notes without it.
   ============================================================ */
import {
  deriveKey,
  makeVaultCheck,
  verifyVaultCheck,
  randomSaltB64,
  cryptoAvailable,
} from "./noteCrypto.js";

const VAULT_KEY = "ligand.noteVault";

// In-memory only. Not exported directly so nothing can serialize it.
let _key = null;

function readVaultMeta() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(VAULT_KEY) || "null");
  } catch {
    return null;
  }
}

function writeVaultMeta(meta) {
  window.localStorage.setItem(VAULT_KEY, JSON.stringify(meta));
  // Let the Supabase sync layer notice and push (inert in guest mode).
  window.dispatchEvent(
    new CustomEvent("ligand:localwrite", { detail: { key: VAULT_KEY } })
  );
}

/** Has the user ever set a notes passphrase? */
export function vaultExists() {
  const meta = readVaultMeta();
  return Boolean(meta && meta.salt && meta.check);
}

/** Is the vault unlocked in this session (key held in memory)? */
export function isUnlocked() {
  return _key !== null;
}

export function getKey() {
  return _key;
}

/** Drop the in-memory key — locks every locked note until re-unlock. */
export function lockVault() {
  _key = null;
}

export { cryptoAvailable };

/**
 * First-time setup: pick the passphrase. Generates a salt, derives the key,
 * stores salt + verifier, and holds the key for the session.
 * Throws if a vault already exists (callers should unlock instead).
 */
export async function createVault(passphrase) {
  if (vaultExists()) throw new Error("A notes passphrase already exists.");
  const salt = randomSaltB64();
  const key = await deriveKey(passphrase, salt);
  const check = await makeVaultCheck(key);
  writeVaultMeta({ salt, check, createdAt: new Date().toISOString() });
  _key = key;
  return key;
}

/**
 * Unlock an existing vault with the passphrase. Returns true on success (key
 * now held for the session), false if the passphrase was wrong.
 */
export async function unlockVault(passphrase) {
  const meta = readVaultMeta();
  if (!meta || !meta.salt || !meta.check) return false;
  const key = await deriveKey(passphrase, meta.salt);
  const ok = await verifyVaultCheck(key, meta.check);
  if (!ok) return false;
  _key = key;
  return true;
}
