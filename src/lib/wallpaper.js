/* ============================================================
   Wallpaper catalog + ambient sound options.
   ------------------------------------------------------------
   Wallpapers are CSS gradients applied as the app background.
   Each has a `tone` (light | dark) so text stays readable on top.
   Applying the gradient and tone is done in App; this module
   just holds the catalog + a lookup.

   SOUNDS is the list of standalone ambient-sound options shown
   in Settings > Wallpaper & sound. Actual playback is handled by
   ambientPlayer.js; the Pomodoro reads the saved selection via
   the `ambientOverride` prop.
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

function normalizedSelection(selection = {}) {
  return {
    id: selection.id || "none",
    customId: selection.id === "custom" ? selection.customId || null : null,
  };
}

/* Resolve one mode's wallpaper while preserving the old single-wallpaper
   setting. Once either preset is edited, wallpaperSettingsForMode clears the
   legacy fields and writes both explicit mode selections. */
export function wallpaperSelectionForMode(settings = {}, mode = "light") {
  const prefix = mode === "dark" ? "dark" : "light";
  const scoped = normalizedSelection({
    id: settings[`${prefix}Id`],
    customId: settings[`${prefix}CustomId`],
  });
  if (scoped.id !== "none") return scoped;

  const otherPrefix = prefix === "light" ? "dark" : "light";
  const hasExplicitPreset =
    settings[`${prefix}Id`] !== undefined ||
    settings[`${otherPrefix}Id`] !== undefined;
  const legacy = normalizedSelection(settings);
  if (hasExplicitPreset || legacy.id === "none") return scoped;
  if (legacy.id === "custom") return legacy;

  const legacyWallpaper = wallpaperById(legacy.id);
  return legacyWallpaper.tone === prefix ? legacy : scoped;
}

export function wallpaperSettingsForMode(settings = {}, mode, selection) {
  const light =
    mode === "light"
      ? normalizedSelection(selection)
      : wallpaperSelectionForMode(settings, "light");
  const dark =
    mode === "dark"
      ? normalizedSelection(selection)
      : wallpaperSelectionForMode(settings, "dark");

  return {
    ...settings,
    id: "none",
    customId: null,
    lightId: light.id,
    lightCustomId: light.customId,
    darkId: dark.id,
    darkCustomId: dark.customId,
  };
}

export function withoutCustomWallpaper(settings = {}, customId) {
  const light = wallpaperSelectionForMode(settings, "light");
  const dark = wallpaperSelectionForMode(settings, "dark");
  const nextLight =
    light.id === "custom" && light.customId === customId
      ? { id: "none" }
      : light;
  const nextDark =
    dark.id === "custom" && dark.customId === customId
      ? { id: "none" }
      : dark;
  return wallpaperSettingsForMode(
    wallpaperSettingsForMode(settings, "light", nextLight),
    "dark",
    nextDark
  );
}

// Ambient sound override options for the Settings panel.
// When set to something other than "none", the Pomodoro timer uses
// this sound instead of the scene-default sound.
// All sounds are CC0/public-domain — see ambientPlayer.js for sources.
export const SOUNDS = [
  { id: "none",      name: "Scene default" },
  { id: "rain",      name: "Rain" },
  { id: "waves",     name: "Ocean waves" },
  { id: "cafe",      name: "Café" },
  { id: "forest",    name: "Forest rain" },
  { id: "fireplace", name: "Fireplace" },
  { id: "stream",    name: "Hot tub / stream" },
  { id: "wind",      name: "Wind" },
];

export default { WALLPAPERS, wallpaperById, SOUNDS };
