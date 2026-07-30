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

/* The social card: what Slack, iMessage, Discord, X and Google show when the
   deployed URL is pasted anywhere. Without one they render a bare link with no
   mark at all, which is most of why the site can look unbranded even though the
   favicon is correct. 1200x630 is the size every one of them crops to. */
const drawCard = (w = 1200, h = 630) => `
  (() => {
    const c = document.createElement('canvas');
    c.width = ${w}; c.height = ${h};
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, ${w}, ${h});
    bg.addColorStop(0, '#241a3d');
    bg.addColorStop(1, '#0e0a19');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, ${w}, ${h});

    // A violet bloom behind the mark, echoing the app's ambient glow.
    const glow = ctx.createRadialGradient(${w} * 0.28, ${h} * 0.5, 0, ${w} * 0.28, ${h} * 0.5, ${h} * 0.75);
    glow.addColorStop(0, 'rgba(140, 80, 255, 0.42)');
    glow.addColorStop(1, 'rgba(140, 80, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, ${w}, ${h});

    ctx.save();
    const scale = ${h} * 0.46 / 46;
    ctx.translate(${w} * 0.18 - (48 * scale) / 2, (${h} - 46 * scale) / 2);
    ctx.scale(scale, scale);
    const g = ctx.createLinearGradient(0, 0, 48, 46);
    g.addColorStop(0, '#c4b0ff');
    g.addColorStop(1, '#7c3aff');
    ctx.fillStyle = g;
    ctx.fill(new Path2D(${JSON.stringify(BOLT)}));
    ctx.restore();

    const x = ${w} * 0.33;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 104px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Ligand', x, ${h} * 0.5);
    // Shrunk to fit rather than trusting a guess: the tagline is long, and a
    // card whose text runs off the right edge is worse than a smaller one.
    ctx.fillStyle = 'rgba(226, 216, 255, 0.74)';
    const tagline = 'Focus, habits, and goals — designed for ADHD';
    let size = 38;
    do {
      ctx.font = '400 ' + size + 'px "Segoe UI", system-ui, sans-serif';
      size -= 1;
    } while (size > 20 && ctx.measureText(tagline).width > ${w} - x - 56);
    ctx.fillText(tagline, x, ${h} * 0.5 + 60);

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

  /* Windows .ico for the desktop build.
     An ICO is just a small header plus a directory of embedded images, so the
     PNGs rendered above can be packed directly — no image library needed. A
     size of 256 is written as 0, which is how the format encodes it. */
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of icoSizes) {
    const b64 = await win.webContents.executeJavaScript(draw(size, { plate: true }));
    images.push({ size, data: Buffer.from(b64, "base64") });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach((img, i) => {
    const at = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, at + 0); // width
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, at + 1); // height
    dir.writeUInt8(0, at + 2); // palette size
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(img.data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += img.data.length;
  });

  const icoBytes = Buffer.concat([header, dir, ...images.map((i) => i.data)]);
  // ligand.ico is what the Windows desktop build ships; favicon.ico is the
  // same file at the path every browser, crawler and link-unfurler probes by
  // convention when it doesn't parse the page's <link> tags.
  for (const name of ["ligand.ico", "favicon.ico"]) {
    writeFileSync(join(pub, name), icoBytes);
    console.log(`wrote ${join(pub, name)} (${icoSizes.length} sizes)`);
  }

  // Social card.
  const cardB64 = await win.webContents.executeJavaScript(drawCard());
  const cardBytes = Buffer.from(cardB64, "base64");
  writeFileSync(join(pub, "og-card.png"), cardBytes);
  console.log(`wrote ${join(pub, "og-card.png")} (${cardBytes.length} bytes)`);

  win.destroy();
  app.quit();
});
