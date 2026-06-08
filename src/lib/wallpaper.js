/* ============================================================
   Wallpaper & ambient sound — PLACEHOLDER system.
   ------------------------------------------------------------
   Catalog data is real (so the picker UI works and the choice is
   remembered), but applying a wallpaper or playing a sound is stubbed.
   Swap the apply/play bodies later without changing the Settings UI.
   ============================================================ */

// Selectable wallpapers. "preview" is a CSS gradient used for the swatch
// AND as the stand-in background until real artwork/animation is wired.
export const WALLPAPERS = [
  { id: "aurora", name: "Aurora", preview: "linear-gradient(135deg, oklch(0.85 0.08 245), oklch(0.82 0.09 290))" },
  { id: "dawn", name: "Dawn", preview: "linear-gradient(135deg, oklch(0.9 0.07 70), oklch(0.86 0.08 20))" },
  { id: "meadow", name: "Meadow", preview: "linear-gradient(135deg, oklch(0.88 0.08 145), oklch(0.85 0.07 195))" },
  { id: "dusk", name: "Dusk", preview: "linear-gradient(135deg, oklch(0.7 0.09 290), oklch(0.6 0.1 245))" },
  { id: "none", name: "None", preview: "var(--panel-2)" },
];

// Ambient sounds for focus. Stubbed — no audio plays yet.
export const SOUNDS = [
  { id: "none", name: "None" },
  { id: "rain", name: "Rain" },
  { id: "waves", name: "Waves" },
  { id: "cafe", name: "Café" },
  { id: "forest", name: "Forest" },
  { id: "brown", name: "Brown noise" },
];

// Placeholder: would set a background layer / animation. No-op for now.
export function applyWallpaper(/* id */) {
  // TODO(wallpaper): paint the chosen wallpaper behind the app shell.
}

// Placeholder: would start/stop an ambient loop at the given volume. No-op.
export function playSound(/* id, volume */) {
  // TODO(sound): stream/loop the selected ambient sound via Web Audio.
}

export function stopSound() {
  // TODO(sound): stop any playing ambient loop.
}

export default { WALLPAPERS, SOUNDS, applyWallpaper, playSound, stopSound };
