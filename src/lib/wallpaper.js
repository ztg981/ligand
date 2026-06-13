/* ============================================================
   Wallpaper catalog + ambient sound (sound still a placeholder).
   ------------------------------------------------------------
   Wallpapers are real now: each one is a CSS gradient applied as the
   app background, plus a `tone` (light | dark) that tells the UI which
   token set keeps text readable on top of it. Applying the gradient and
   tone is done in App; this module just holds the catalog + a lookup.

   Sound is intentionally still stubbed for this pass (no audio, no file
   picking) — the catalog stays so the UI can show what's coming.
   ============================================================ */

// Each wallpaper: a gradient `bg` (used both for the picker swatch and the
// live background) and a `tone` so the app can pick readable text/panels.
// "none" falls back to the current theme's flat background.
export const WALLPAPERS = [
  {
    id: "none",
    name: "None",
    tone: null,
    bg: "var(--bg)",
  },
  {
    id: "ivory",
    name: "Warm ivory",
    tone: "light",
    bg: "linear-gradient(160deg, oklch(0.97 0.02 85) 0%, oklch(0.93 0.03 70) 100%)",
  },
  {
    id: "sky",
    name: "Soft blue",
    tone: "light",
    bg: "linear-gradient(160deg, oklch(0.95 0.03 230) 0%, oklch(0.89 0.05 250) 100%)",
  },
  {
    id: "rose",
    name: "Soft rose",
    tone: "light",
    bg: "linear-gradient(160deg, oklch(0.95 0.03 20) 0%, oklch(0.90 0.05 8) 100%)",
  },
  {
    id: "sage",
    name: "Sage mist",
    tone: "light",
    bg: "linear-gradient(160deg, oklch(0.95 0.03 150) 0%, oklch(0.90 0.05 165) 100%)",
  },
  {
    id: "navy",
    name: "Deep navy",
    tone: "dark",
    bg: "linear-gradient(160deg, oklch(0.30 0.06 260) 0%, oklch(0.19 0.05 265) 100%)",
  },
  {
    id: "forest",
    name: "Forest green",
    tone: "dark",
    bg: "linear-gradient(160deg, oklch(0.33 0.06 155) 0%, oklch(0.22 0.05 160) 100%)",
  },
  {
    id: "charcoal",
    name: "Warm charcoal",
    tone: "dark",
    bg: "linear-gradient(160deg, oklch(0.30 0.012 60) 0%, oklch(0.20 0.010 50) 100%)",
  },
];

export function wallpaperById(id) {
  return WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
}

// Ambient sounds for focus. Still stubbed — no audio plays yet.
export const SOUNDS = [
  { id: "none", name: "None" },
  { id: "rain", name: "Rain" },
  { id: "waves", name: "Waves" },
  { id: "cafe", name: "Café" },
  { id: "forest", name: "Forest" },
  { id: "brown", name: "Brown noise" },
];

// Placeholder: would start/stop an ambient loop at the given volume. No-op.
export function playSound(/* id, volume */) {
  // TODO(sound): stream/loop the selected ambient sound via Web Audio.
}

export function stopSound() {
  // TODO(sound): stop any playing ambient loop.
}

export default { WALLPAPERS, wallpaperById, SOUNDS, playSound, stopSound };
