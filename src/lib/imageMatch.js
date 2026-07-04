/* imageMatch — canvas-based image similarity for the photo-scan alarm.

   The goal: decide whether the photo just taken shows the SAME object/scene as
   the one saved at setup (your bathroom sink, the kettle, a poster). Two things
   make naive pixel-diffing fail in the real world:

     1. Lighting. A groggy 6am bathroom is dimmer than when you set the alarm.
     2. Framing. You won't hold the phone at exactly the same distance/angle.

   So we don't compare raw pixels. We downscale both images to a tiny grayscale
   grid, then NORMALISE each grid (subtract its mean, divide by its spread) and
   compare with a normalised cross-correlation. That's brightness-invariant — a
   dark and a bright photo of the same sink still correlate strongly — while
   still rejecting a photo of a completely different thing. The result is mapped
   to a friendly 0–100% the UI can show live. */

const SIZE = 40; // grid the images are reduced to (SIZE×SIZE grayscale samples)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Reduce an image source (data URL) to a normalised grayscale vector.
async function toVector(src) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // Cover-fit into the square so aspect ratio differences don't wreck alignment.
  const scale = Math.max(SIZE / img.width, SIZE / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const gray = new Float32Array(SIZE * SIZE);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const v = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = v;
    sum += v;
  }
  const mean = sum / gray.length;

  // Normalise: subtract mean (removes overall brightness), compute std.
  let varSum = 0;
  for (let i = 0; i < gray.length; i++) {
    gray[i] -= mean;
    varSum += gray[i] * gray[i];
  }
  const std = Math.sqrt(varSum / gray.length) || 1;
  for (let i = 0; i < gray.length; i++) gray[i] /= std;

  return { vec: gray, brightness: mean };
}

// Average brightness (0–255) of an image — used to warn about a too-dark room.
export async function imageBrightness(src) {
  try {
    const { brightness } = await toVector(src);
    return brightness;
  } catch {
    return 0;
  }
}

/**
 * Similarity between two image data URLs, 0–100.
 * Normalised cross-correlation of the downscaled grayscale grids, so it's
 * robust to brightness changes. Returns 0 on any failure.
 */
export async function imageSimilarity(srcA, srcB) {
  try {
    const [a, b] = await Promise.all([toVector(srcA), toVector(srcB)]);
    let dot = 0;
    for (let i = 0; i < a.vec.length; i++) dot += a.vec[i] * b.vec[i];
    const corr = dot / a.vec.length; // both are unit-variance → this is r, [-1,1]
    // Map correlation to a 0–100 score. Negative/zero correlation → 0; a good
    // match on the same scene lands well above the ~70% dismiss threshold.
    return Math.max(0, Math.min(100, Math.round(corr * 100)));
  } catch {
    return 0;
  }
}
