const COOKIE_PREFIX = "ligand_handoff_";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const CHUNK_SIZE = 2800;
const MAX_CHUNKS = 8;

function cookieDocument() {
  return typeof document === "undefined" ? null : document;
}

function cookieBaseName(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${COOKIE_PREFIX}${(hash >>> 0).toString(36)}`;
}

function cookieOptions(maxAge = COOKIE_MAX_AGE) {
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:"
      ? "; Secure"
      : "";
  return `; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function readCookie(name, doc = cookieDocument()) {
  if (!doc) return null;
  const prefix = `${name}=`;
  const match = String(doc.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function expireCookie(name, doc = cookieDocument()) {
  if (!doc) return;
  doc.cookie = `${name}=${cookieOptions(0)}`;
}

export function writeCookieBridge(key, value, doc = cookieDocument()) {
  if (!doc || typeof value !== "string") return;
  const base = cookieBaseName(key);
  const encoded = encodeURIComponent(value);
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }
  if (!chunks.length || chunks.length > MAX_CHUNKS) {
    removeCookieBridge(key, doc);
    return;
  }

  const previousCount = Number(readCookie(`${base}_count`, doc) || 0);
  doc.cookie = `${base}_count=${chunks.length}${cookieOptions()}`;
  chunks.forEach((chunk, index) => {
    doc.cookie = `${base}_${index}=${chunk}${cookieOptions()}`;
  });
  for (let index = chunks.length; index < previousCount; index += 1) {
    expireCookie(`${base}_${index}`, doc);
  }
}

export function readCookieBridge(key, doc = cookieDocument()) {
  if (!doc) return null;
  const base = cookieBaseName(key);
  const count = Number(readCookie(`${base}_count`, doc) || 0);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;

  let encoded = "";
  for (let index = 0; index < count; index += 1) {
    const chunk = readCookie(`${base}_${index}`, doc);
    if (chunk === null) return null;
    encoded += chunk;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function removeCookieBridge(key, doc = cookieDocument()) {
  if (!doc) return;
  const base = cookieBaseName(key);
  const count = Number(readCookie(`${base}_count`, doc) || 0);
  expireCookie(`${base}_count`, doc);
  for (let index = 0; index < Math.min(count || MAX_CHUNKS, MAX_CHUNKS); index += 1) {
    expireCookie(`${base}_${index}`, doc);
  }
}

export function createCookieHandoffStorage(storage = globalThis.localStorage) {
  return {
    getItem(key) {
      try {
        const localValue = storage?.getItem(key);
        if (localValue !== null && localValue !== undefined) {
          writeCookieBridge(key, localValue);
          return localValue;
        }
        const handoffValue = readCookieBridge(key);
        if (handoffValue !== null) storage?.setItem(key, handoffValue);
        return handoffValue;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      storage?.setItem(key, value);
      writeCookieBridge(key, value);
    },
    removeItem(key) {
      storage?.removeItem(key);
      removeCookieBridge(key);
    },
  };
}
