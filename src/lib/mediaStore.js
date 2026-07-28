/* mediaStore — IndexedDB storage for journal voice notes and clips.

   Why not the existing attachment path: photos ride the record itself as
   base64 data URLs inside `ligand.data`, which the sync layer pushes WHOLE on
   every change. That works for images and cannot work for media —
   localStorage is ~5 MB per origin (shared with goals, tasks, workouts and
   wallpapers), and base64 inflates a blob by a third. A single 30-second clip
   would blow the entire budget.

   So media is stored as real Blobs in IndexedDB (async, hundreds of MB of
   quota, no base64 tax) and the journal entry keeps only a reference:

     entry.media = [{ id, kind, mime, durationMs, size }]

   Everything here degrades quietly: if IndexedDB is unavailable (private
   browsing, ancient browser) every call resolves to a safe empty value rather
   than throwing, so the journal keeps working without recordings.

   NOTE: blobs are device-local. Cross-device sync is a later phase; until
   then `mediaStats()` backs the "stored on this device" notice in Settings. */

const DB_NAME = "ligand.media";
const DB_VERSION = 1;
const STORE = "blobs";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/** Run one transaction, resolving to `fallback` if storage is unavailable. */
async function tx(mode, run, fallback = null) {
  const db = await openDb();
  if (!db) return fallback;
  return new Promise((resolve) => {
    let transaction;
    try {
      transaction = db.transaction(STORE, mode);
    } catch {
      return resolve(fallback);
    }
    const store = transaction.objectStore(STORE);
    let result = fallback;
    try {
      run(store, (value) => {
        result = value;
      });
    } catch {
      return resolve(fallback);
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => resolve(fallback);
    transaction.onabort = () => resolve(fallback);
  });
}

export function mediaId() {
  return `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Store one recording. Returns the lightweight reference to put on the entry
 * (never the blob itself), or null if storage was unavailable.
 */
export async function putMedia(blob, { kind = "audio", durationMs = 0 } = {}) {
  if (!blob) return null;
  const record = {
    id: mediaId(),
    blob,
    kind,
    mime: blob.type || (kind === "video" ? "video/mp4" : "audio/mp4"),
    durationMs: Math.max(0, Math.round(durationMs)),
    size: blob.size,
    createdAt: new Date().toISOString(),
  };
  const ok = await tx("readwrite", (store, set) => {
    store.put(record);
    set(true);
  }, false);
  if (!ok) return null;
  // The reference the journal entry carries — deliberately tiny.
  return {
    id: record.id,
    kind: record.kind,
    mime: record.mime,
    durationMs: record.durationMs,
    size: record.size,
  };
}

export async function getMediaBlob(id) {
  if (!id) return null;
  return tx("readonly", (store, set) => {
    const request = store.get(id);
    request.onsuccess = () => set(request.result?.blob || null);
  });
}

/** An object URL for playback. The caller MUST revoke it when done. */
export async function getMediaUrl(id) {
  const blob = await getMediaBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteMedia(id) {
  if (!id) return false;
  return tx("readwrite", (store, set) => {
    store.delete(id);
    set(true);
  }, false);
}

export async function deleteMediaMany(ids = []) {
  const list = ids.filter(Boolean);
  if (!list.length) return true;
  return tx("readwrite", (store, set) => {
    for (const id of list) store.delete(id);
    set(true);
  }, false);
}

/** How much space recordings take, for the "on this device" notice. */
export async function mediaStats() {
  return tx("readonly", (store, set) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = request.result || [];
      set({
        count: rows.length,
        bytes: rows.reduce((sum, r) => sum + (r.size || 0), 0),
      });
    };
  }, { count: 0, bytes: 0 });
}

/**
 * Drop blobs no entry references any more. Deleting a journal entry only
 * removes its reference, so without this the blob would linger forever.
 * `keepIds` is every media id still referenced anywhere.
 */
export async function pruneOrphans(keepIds = []) {
  const keep = new Set(keepIds.filter(Boolean));
  return tx("readwrite", (store, set) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = request.result || [];
      let removed = 0;
      for (const row of rows) {
        if (!keep.has(row.id)) {
          store.delete(row.id);
          removed += 1;
        }
      }
      set(removed);
    };
  }, 0);
}

/** Rough remaining quota, so we can warn before a write starts failing. */
export async function storageEstimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, free: Math.max(0, quota - usage) };
  } catch {
    return null;
  }
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
