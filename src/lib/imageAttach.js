/* imageAttach — shared image-attachment logic for Notes and Journal.

   Attachments are stored as data URLs inside the record, so they ride the
   normal localStorage → Supabase blob sync with no extra storage bucket.
   Big camera photos are COMPRESSED to fit instead of rejected: downscale to
   a sane edge, then step the JPEG quality down until the budget is met. The
   old behavior (a hard "too large" error on any real photo) made the camera
   basically unusable. */

export const MAX_ATTACH_BYTES = 1.4 * 1024 * 1024;
export const MAX_ATTACH_COUNT = 6;

// Downscale/quality ladder: try gentle first, shrink harder only if needed.
const COMPRESS_STEPS = [
  { edge: 1800, quality: 0.85 },
  { edge: 1600, quality: 0.75 },
  { edge: 1280, quality: 0.66 },
  { edge: 1024, quality: 0.55 },
];

function attId() {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Compress one image file to fit MAX_ATTACH_BYTES; null if it can't. */
async function compressToFit(file) {
  // Small files pass straight through, original format preserved.
  try {
    const raw = await readAsDataUrl(file);
    if (typeof raw === "string" && raw.length <= MAX_ATTACH_BYTES) return raw;
  } catch {
    return null;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // unreadable/unsupported format
  }
  try {
    for (const step of COMPRESS_STEPS) {
      const scale = Math.min(1, step.edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", step.quality);
      if (dataUrl.length <= MAX_ATTACH_BYTES) return dataUrl;
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Read image files into `{ id, dataUrl }` attachment objects. Oversized
 * photos are compressed to fit; only the count cap and truly unreadable
 * files produce an error message. Resolves { added, error }; never rejects.
 */
export async function readImageAttachments(files, existingCount = 0) {
  const added = [];
  let error = "";
  let remaining = MAX_ATTACH_COUNT - existingCount;

  for (const file of Array.from(files || [])) {
    if (!file.type?.startsWith("image/")) {
      error = "Only images for now (PNG, JPG, screenshots).";
      continue;
    }
    if (remaining <= 0) {
      error = `Up to ${MAX_ATTACH_COUNT} images.`;
      break;
    }
    const dataUrl = await compressToFit(file);
    if (dataUrl) {
      added.push({ id: attId(), dataUrl });
      remaining -= 1;
    } else {
      error = "Couldn't read that image.";
    }
  }
  return { added, error };
}

/** Pull image files out of a paste/drop DataTransfer's items. */
export function imagesFromClipboard(items) {
  return Array.from(items || [])
    .filter((i) => i.type?.startsWith("image/"))
    .map((i) => i.getAsFile())
    .filter(Boolean);
}
