/* mediaSync — cloud storage for journal recordings.

   The blob lives in two places with different jobs:

     IndexedDB (lib/mediaStore.js) — the fast local copy. Always written first,
       so recording works offline, in guest mode, and before any upload lands.
     Supabase Storage bucket "journal-media" — the durable copy, so a recording
       survives a wiped browser and reaches your other devices.

   Only the REFERENCE travels through the normal data sync (inside the journal
   entry): `{ id, kind, mime, durationMs, size, remotePath }`. Once remotePath
   is set, any signed-in device can fetch the bytes on demand and cache them
   locally. Guest mode simply never sets it and stays device-local.

   Every function here is best-effort: a failed upload leaves the local copy
   untouched and returns null, so the journal never loses a recording because
   the network was down. Uploads are retried opportunistically via
   `syncPendingMedia`. */

import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { getMediaBlob, putMediaAt } from "./mediaStore.js";

const BUCKET = "journal-media";
const SIGNED_URL_TTL = 60 * 60; // 1 hour — long enough to play, short enough to leak little

/** Objects are namespaced by owner; the RLS policies enforce this same shape. */
export function remotePathFor(userId, mediaId) {
  return `${userId}/${mediaId}`;
}

export function canSyncMedia(userId) {
  return Boolean(isSupabaseConfigured && supabase && userId);
}

/**
 * Upload one local recording. Returns its remote path, or null if it could not
 * be uploaded (offline, guest, storage unavailable) — never throws.
 */
export async function uploadMedia(userId, mediaRef) {
  if (!canSyncMedia(userId) || !mediaRef?.id) return null;
  if (mediaRef.remotePath) return mediaRef.remotePath; // already up
  try {
    const blob = await getMediaBlob(mediaRef.id);
    if (!blob) return null;
    const path = remotePathFor(userId, mediaRef.id);
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mediaRef.mime || blob.type || "application/octet-stream",
      upsert: true,
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/**
 * Fetch a recording this device doesn't have locally and cache it in
 * IndexedDB, so playback is instant next time and works offline afterwards.
 * Returns the Blob, or null.
 */
export async function fetchMedia(userId, mediaRef) {
  if (!canSyncMedia(userId) || !mediaRef?.remotePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(mediaRef.remotePath);
    if (error || !data) return null;
    // Cache under the SAME id the entry references, so the local lookup hits.
    await putMediaAt(mediaRef.id, data, {
      kind: mediaRef.kind,
      durationMs: mediaRef.durationMs,
    });
    return data;
  } catch {
    return null;
  }
}

/** A temporary URL for streaming without downloading the whole file first. */
export async function signedUrlFor(userId, mediaRef) {
  if (!canSyncMedia(userId) || !mediaRef?.remotePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(mediaRef.remotePath, SIGNED_URL_TTL);
    return error ? null : data?.signedUrl || null;
  } catch {
    return null;
  }
}

/** Remove the cloud copy when a recording is deleted. Best-effort. */
export async function removeRemoteMedia(userId, mediaRefs = []) {
  const paths = mediaRefs.map((m) => m?.remotePath).filter(Boolean);
  if (!canSyncMedia(userId) || !paths.length) return false;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Walk the journal for recordings that never made it to the cloud and push
 * them. Called after sign-in and when connectivity returns, so a recording
 * captured offline is not stranded on one device forever.
 *
 * `patchEntry(entryId, media)` persists the updated reference list.
 * Returns how many uploads succeeded.
 */
export async function syncPendingMedia(userId, journal = [], patchEntry) {
  if (!canSyncMedia(userId) || typeof patchEntry !== "function") return 0;
  let uploaded = 0;
  for (const entry of journal) {
    const media = entry?.media || [];
    if (!media.some((m) => m && !m.remotePath)) continue;

    let changed = false;
    const next = [];
    for (const ref of media) {
      if (ref?.remotePath) {
        next.push(ref);
        continue;
      }
      const path = await uploadMedia(userId, ref);
      if (path) {
        next.push({ ...ref, remotePath: path });
        changed = true;
        uploaded += 1;
      } else {
        next.push(ref); // still local-only; try again next time
      }
    }
    if (changed) patchEntry(entry.id, next);
  }
  return uploaded;
}
