/* imageAttach — shared image-attachment logic for Notes and Journal.

   Attachments are stored as data URLs inside the record, so they ride the
   normal localStorage → Supabase blob sync with no extra storage bucket.
   That means we keep them small: images only, capped count + bytes. */

export const MAX_ATTACH_BYTES = 1.4 * 1024 * 1024;
export const MAX_ATTACH_COUNT = 6;

function attId() {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Read image files into `{ id, dataUrl }` attachment objects, enforcing the
 * image-only / count / size caps. Resolves with { added, error } — `added`
 * is the array of new attachments, `error` a user-facing message or "".
 * Never rejects.
 */
export function readImageAttachments(files, existingCount = 0) {
  return new Promise((resolve) => {
    const added = [];
    let error = "";
    let remaining = MAX_ATTACH_COUNT - existingCount;
    const list = Array.from(files || []);
    let pending = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      if (pending === 0) {
        done = true;
        resolve({ added, error });
      }
    };

    for (const file of list) {
      if (!file.type?.startsWith("image/")) {
        error = "Only images for now (PNG, JPG, screenshots).";
        continue;
      }
      if (remaining <= 0) {
        error = `Up to ${MAX_ATTACH_COUNT} images.`;
        break;
      }
      remaining -= 1;
      pending += 1;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        if (typeof dataUrl === "string" && dataUrl.length <= MAX_ATTACH_BYTES) {
          added.push({ id: attId(), dataUrl });
        } else {
          error = "That image is too large (keep it under ~1 MB so sync stays fast).";
        }
        pending -= 1;
        finish();
      };
      reader.onerror = () => {
        error = "Couldn't read that image.";
        pending -= 1;
        finish();
      };
      reader.readAsDataURL(file);
    }
    finish();
  });
}

/** Pull image files out of a paste/drop DataTransfer's items. */
export function imagesFromClipboard(items) {
  return Array.from(items || [])
    .filter((i) => i.type?.startsWith("image/"))
    .map((i) => i.getAsFile())
    .filter(Boolean);
}
