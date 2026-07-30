/* videoPoster — pull a real frame out of a recorded clip.

   Pointing a <video> at a clip and hoping it paints something is not enough,
   which is why the strip showed black rectangles:

     • `preload="metadata"` fetches the header and no picture at all, so there
       is nothing to paint;
     • the `#t=0.1` media fragment is ignored on `blob:` URLs, so even with the
       data loaded the element sits on frame zero;
     • frame zero of a real recording is usually black anyway — the camera is
       still metering when the first frame is written.

   So the frame is fetched deliberately: load the clip, seek a little way in,
   and draw that frame to a canvas. A JPEG data URL comes back, which is a
   plain <img> — no video element per row, nothing decoding in the background,
   and it survives being scrolled out of view. */

/** How far in to look. Late enough to clear the black first frames. */
export const POSTER_AT_SEC = 0.45;

/** Longest we'll wait for a frame before giving up on the thumbnail. */
export const POSTER_TIMEOUT_MS = 5000;

/* Mean 0–255 brightness below which a frame is treated as "no picture".

   Not a nicety: seeking a MediaRecorder WebM often doesn't land anywhere,
   because the file it writes has no seek index and frequently reports a
   duration of Infinity — so the element sits on frame zero and hands back
   exactly the black rectangle this module exists to avoid. Measuring the
   frame is the only way to know that happened, and it's cheap at thumbnail
   size. A genuinely dark clip (a room at night) sits well above this. */
export const BLACK_MEAN = 8;

/** Is this canvas essentially empty? Sampled, not exhaustive — it's a check. */
export function frameIsBlank(ctx, w, h) {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    // Every 16th pixel is plenty to tell "black" from "a picture".
    for (let i = 0; i < data.length; i += 64) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return sum / (data.length / 64) <= BLACK_MEAN;
  } catch {
    return false; // can't measure it — assume it's fine rather than discard it
  }
}

/* Where to seek, given how long the clip is.

   Clamped to the middle of very short clips so a 0.3s take doesn't seek past
   its own end and stall. MediaRecorder's WebM often reports a duration of
   Infinity until the file is fully scanned, so an unusable duration falls back
   to the fixed offset rather than trying to compute a fraction of nothing. */
export function posterTime(durationSec, at = POSTER_AT_SEC) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return at;
  return Math.min(at, d * 0.4);
}

/* Fit a frame into a thumbnail box, preserving aspect and covering it.
   Returns the source rectangle to crop — centre-cropped, so a portrait clip
   fills a landscape tile instead of being letterboxed into a black frame. */
export function coverCrop(srcW, srcH, boxW, boxH) {
  if (!(srcW > 0 && srcH > 0 && boxW > 0 && boxH > 0)) {
    return { sx: 0, sy: 0, sw: srcW || 1, sh: srcH || 1 };
  }
  const srcRatio = srcW / srcH;
  const boxRatio = boxW / boxH;
  if (srcRatio > boxRatio) {
    // Source is wider than the box — trim the sides.
    const sw = srcH * boxRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  // Source is taller — trim top and bottom.
  const sh = srcW / boxRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/**
 * Grab a poster frame from a video URL.
 *
 * @returns {Promise<string|null>} a JPEG data URL, or null if the clip can't
 *   be decoded (a codec the browser won't take, a truncated file, a timeout).
 *   Never throws — a missing thumbnail is a cosmetic loss, and the caller
 *   falls back to an icon.
 */
export async function posterFromVideo(url, { width = 264, height = 156, at = POSTER_AT_SEC } = {}) {
  if (!url || typeof document === "undefined") return null;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  // "auto", not "metadata": we need actual picture data, not just the header.
  video.preload = "auto";
  video.src = url;

  const cleanup = () => {
    video.removeAttribute("src");
    try {
      video.load(); // release the decoder rather than waiting for GC
    } catch {
      /* already torn down */
    }
  };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  /* Draw whatever the element is currently showing. Returns null when there
     is no picture to take — either no dimensions yet, or a blank frame. */
  const capture = () => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    try {
      const { sx, sy, sw, sh } = coverCrop(w, h, width, height);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      if (frameIsBlank(ctx, width, height)) return null;
      return canvas.toDataURL("image/jpeg", 0.72);
    } catch {
      return null; // tainted canvas or a dead decoder
    }
  };

  const once = (target, event, ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        target.removeEventListener(event, hit);
        resolve(false);
      }, ms);
      const hit = () => {
        clearTimeout(t);
        resolve(true);
      };
      target.addEventListener(event, hit, { once: true });
    });

  try {
    const ready = await Promise.race([
      once(video, "loadeddata", POSTER_TIMEOUT_MS),
      once(video, "error", POSTER_TIMEOUT_MS).then(() => false),
    ]);
    if (!ready) return null;

    const target = posterTime(video.duration, at);

    /* First try: seek straight to the target. Cheap and instant when the file
       supports it — anything the browser wrote a proper index for. */
    if (Math.abs(video.currentTime - target) > 0.01) {
      try {
        video.currentTime = target;
        await once(video, "seeked", 1200);
      } catch {
        /* fall through to playback */
      }
    }
    const seeked = capture();
    if (seeked) return seeked;

    /* Second try: play it.

       A clip straight out of MediaRecorder usually has no seek index and often
       reports a duration of Infinity, so the seek above quietly does nothing
       and leaves the element on frame zero — which is black, because the
       camera is still metering when the first frame is written. Playing it
       decodes frames in order, which always works, and `requestVideoFrameCallback`
       says when one has genuinely been presented rather than merely requested.
       Muted, so this can never make a noise at someone. */
    video.currentTime = 0;
    try {
      await video.play();
    } catch {
      return null; // autoplay refused, and there's no other way through
    }

    const deadline = Date.now() + POSTER_TIMEOUT_MS;
    const hasRvfc = typeof video.requestVideoFrameCallback === "function";
    let frame = null;
    while (Date.now() < deadline) {
      /* Always race the frame callback against a timer.

         requestVideoFrameCallback only fires when a frame is actually
         PRESENTED, so in a tab that isn't being painted — backgrounded, or
         offscreen — it never fires at all and awaiting it alone would hang
         this loop forever, deadline or no deadline. The timer guarantees
         another lap, so the deadline can do its job. */
      await Promise.race([
        hasRvfc
          ? new Promise((r) => video.requestVideoFrameCallback(() => r()))
          : Promise.resolve(),
        new Promise((r) => setTimeout(r, 120)),
      ]);
      if (video.currentTime < Math.min(target, 0.2)) continue;
      frame = capture();
      if (frame) break;
      if (video.ended) break;
    }
    video.pause();
    return frame;
  } catch {
    return null;
  } finally {
    cleanup();
  }
}
