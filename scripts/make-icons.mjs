/* Render the Ligand bolt to every PNG icon the app ships.
 *
 * The extension used to ship a copy of the PWA icon, which is a filled square —
 * hence the boxy corners in chrome://extensions. Chrome only accepts bitmaps
 * for `icons`, so the mark has to be rasterised somewhere; doing it here (with
 * the Electron already in devDependencies) keeps it reproducible instead of a
 * hand-made binary nobody can regenerate.
 *
 *   node scripts/make-icons.mjs
 */
import { app, BrowserWindow } from "electron";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "extension", "icons");

// Same artwork as public/favicon.svg (viewBox 0 0 48 46).
const BOLT =
  "M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262" +
  "H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578" +
  "H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894" +
  "c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377" +
  "c.943 0 1.473 1.088.89 1.83L25.947 44.94z";

/* `plate` fills the square behind the mark.
   Transparent for the extension toolbar (no box around the bolt); filled for
   the app icon, which the OS masks into its own shape and which therefore has
   to bring its own background. The mark is kept inside the middle ~62% there,
   the maskable "safe zone", so a circular mask can't clip it. */
const draw = (size, { plate = false } = {}) => `
  (() => {
    const c = document.createElement('canvas');
    c.width = c.height = ${size};
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, ${size}, ${size});
    ${
      plate
        ? `const bg = ctx.createLinearGradient(0, 0, ${size}, ${size});
           bg.addColorStop(0, '#241a3d');
           bg.addColorStop(1, '#140f24');
           ctx.fillStyle = bg;
           ctx.fillRect(0, 0, ${size}, ${size});`
        : ""
    }
    const scale = (${size} * ${plate ? 0.5 : 0.8}) / 48;
    ctx.translate((${size} - 48 * scale) / 2, (${size} - 46 * scale) / 2);
    ctx.scale(scale, scale);
    const g = ctx.createLinearGradient(0, 0, 48, 46);
    g.addColorStop(0, '#a78bff');
    g.addColorStop(1, '#7c3aff');
    ctx.fillStyle = g;
    ctx.fill(new Path2D(${JSON.stringify(BOLT)}));
    return c.toDataURL('image/png').split(',')[1];
  })()
`;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 600 });
  await win.loadURL("data:text/html,<html><body></body></html>");
  mkdirSync(outDir, { recursive: true });

  const write = async (file, size, opts) => {
    const b64 = await win.webContents.executeJavaScript(draw(size, opts));
    const bytes = Buffer.from(b64, "base64");
    writeFileSync(file, bytes);
    console.log(`wrote ${file} (${bytes.length} bytes)`);
  };

  // Extension toolbar: the bare mark, no plate.
  for (const size of [128, 512]) {
    await write(join(outDir, `icon-${size}.png`), size, { plate: false });
  }

  // App icons (PWA install, iOS home screen). These are masked by the OS, so
  // they carry their own background and keep the mark inside the safe zone.
  const pub = join(root, "public");
  for (const [file, size] of [
    ["pwa-192.png", 192],
    ["pwa-512.png", 512],
    ["pwa-fullbleed-192.png", 192],
    ["pwa-fullbleed-512.png", 512],
    ["apple-touch-icon.png", 180],
    ["apple-touch-icon-precomposed.png", 180],
    ["apple-touch-icon-180x180.png", 180],
  ]) {
    await write(join(pub, file), size, { plate: true });
  }

  win.destroy();
  app.quit();
});
