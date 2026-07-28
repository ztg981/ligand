/* appIcon — draws the Ligand mark in the app's current accent colour.

   Used by the desktop shell: Electron's main process owns the window/tray
   icon but has no idea what the accent resolved to (themes, wallpaper tone and
   per-mode presets all live in the renderer's CSS). So the renderer paints the
   mark and hands over a PNG data URL.

   The path is the same artwork as public/favicon.svg, viewBox 0 0 48 46. */

const BOLT_PATH =
  "M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262" +
  "H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578" +
  "H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894" +
  "c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377" +
  "c.943 0 1.473 1.088.89 1.83L25.947 44.94z";

/**
 * The live --accent as a concrete `rgb(r, g, b)` string.
 *
 * Two steps, both necessary. getComputedStyle resolves the var() chain but
 * hands back the authored colour space — modern Chrome returns `oklch(...)`
 * verbatim. Painting that onto a 1x1 canvas and reading the pixel converts it
 * to plain sRGB. Doing the conversion HERE matters: this is the engine that
 * produced the string, so it is guaranteed to parse it, whereas whatever
 * consumes the value (an extension service worker, Electron's main process)
 * may not understand oklch at all.
 */
export function resolvedAccent() {
  try {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;opacity:0;pointer-events:none;color:var(--accent)";
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    if (!computed) return null;
    if (computed.startsWith("rgb")) return computed;

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return computed;
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return null;
  }
}

/**
 * A square PNG data URL of the mark filled with `color`.
 * Returns null when canvas is unavailable rather than throwing — the caller
 * simply keeps the bundled icon.
 */
export function renderAccentIcon(color, size = 256) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Fit the 48x46 artwork into the square with a little breathing room.
    const scale = (size * 0.82) / 48;
    ctx.translate((size - 48 * scale) / 2, (size - 46 * scale) / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = color || "#863bff";
    ctx.fill(new Path2D(BOLT_PATH));
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export default renderAccentIcon;
