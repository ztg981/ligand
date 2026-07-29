/* Render the Ligand bolt to the extension's PNG icons.
 *
 * The extension used to ship a copy of the PWA icon, which is a filled square —
 * hence the boxy corners in chrome://extensions. Chrome only accepts bitmaps
 * for `icons`, so the mark has to be rasterised somewhere; doing it here (with
 * the Electron already in devDependencies) keeps it reproducible instead of a
 * hand-made binary nobody can regenerate.
 *
 *   node scripts/make-extension-icons.mjs
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

const draw = (size) => `
  (() => {
    const c = document.createElement('canvas');
    c.width = c.height = ${size};
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, ${size}, ${size});   // transparent — no square plate
    const scale = (${size} * 0.80) / 48;
    ctx.translate((${size} - 48 * scale) / 2, (${size} - 46 * scale) / 2);
    ctx.scale(scale, scale);
    const g = ctx.createLinearGradient(0, 0, 48, 46);
    g.addColorStop(0, '#8b5cff');
    g.addColorStop(1, '#6a2bff');
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

  for (const size of [128, 512]) {
    const b64 = await win.webContents.executeJavaScript(draw(size));
    const file = join(outDir, `icon-${size}.png`);
    writeFileSync(file, Buffer.from(b64, "base64"));
    console.log(`wrote ${file} (${Buffer.from(b64, "base64").length} bytes)`);
  }

  win.destroy();
  app.quit();
});
