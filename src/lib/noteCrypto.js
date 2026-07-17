/* ============================================================
   noteCrypto — client-side encryption primitives for locked notes.
   ------------------------------------------------------------
   Everything here runs in the browser via the Web Crypto API. A
   passphrase is stretched with PBKDF2 into a non-extractable
   AES-GCM key, so the key itself can never be read out, persisted,
   or synced — it lives only in memory for the session.

   Plaintext note content is encrypted BEFORE it ever touches
   localStorage or the sync blob, so what gets stored (and mirrored
   to the cloud) is ciphertext only. Lose the passphrase and the
   note is unrecoverable — that's the point.
   ============================================================ */

const PBKDF2_ITERATIONS = 150000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// A constant we encrypt at vault-creation time so we can later verify a
// passphrase: decrypting it back to this exact string means the passphrase
// was right (AES-GCM's auth tag also throws on a wrong key, but the explicit
// value check is belt-and-suspenders).
const VAULT_CHECK_VALUE = "ligand-vault-ok";

const subtle = () =>
  (typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    globalThis.crypto.subtle) ||
  null;

/** True when the browser can do the crypto we need (all modern ones can). */
export function cryptoAvailable() {
  return Boolean(subtle());
}

// --- base64 <-> bytes -----------------------------------------------------
function bytesToB64(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function randomSaltB64() {
  const salt = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(salt);
  return bytesToB64(salt);
}

/**
 * Stretch a passphrase into an AES-GCM CryptoKey using PBKDF2 + the given
 * salt. The returned key is NON-extractable: it can encrypt/decrypt but can
 * never be exported, so it can't leak into storage or sync.
 */
export async function deriveKey(passphrase, saltB64) {
  const api = subtle();
  if (!api) throw new Error("Web Crypto unavailable");
  const baseKey = await api.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return api.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBytes(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
}

/** Encrypt any JSON-serializable value → { iv, ct } (both base64 strings). */
export async function encryptJSON(key, value) {
  const api = subtle();
  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ct = await api.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

/** Decrypt an { iv, ct } bundle back into the original value. Throws on a
 *  wrong key / tampered data. */
export async function decryptJSON(key, bundle) {
  const api = subtle();
  const plaintext = await api.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(bundle.iv) },
    key,
    b64ToBytes(bundle.ct)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/** Build the verifier stored alongside the salt at vault-creation time. */
export async function makeVaultCheck(key) {
  return encryptJSON(key, VAULT_CHECK_VALUE);
}

/** Verify a derived key against a stored verifier. Returns true/false. */
export async function verifyVaultCheck(key, check) {
  try {
    const value = await decryptJSON(key, check);
    return value === VAULT_CHECK_VALUE;
  } catch {
    return false;
  }
}
