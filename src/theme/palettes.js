/* Palettes — named looks, chosen SEPARATELY for light mode and dark mode.

   The appearance MODE (light / dark / auto) says which side is active; the
   palette says what that side looks like. Auto mode therefore switches both
   the mode and the user's palette for that mode, e.g. Soft Paper by day,
   Deep Navy by night. Token overrides live in index.css keyed off
   html[data-theme][data-palette]; App.jsx stamps both attributes. */

export const LIGHT_PALETTES = [
  { id: "paper", name: "Soft Paper", desc: "Warm cream (default)", swatch: "#faf6f0" },
  { id: "porcelain", name: "Porcelain", desc: "Cool, clean neutral", swatch: "#f7f8fa" },
  { id: "meadow", name: "Meadow", desc: "Calm green tint", swatch: "#f4f7f2" },
  { id: "contrast-light", name: "High Contrast", desc: "Maximum readability", swatch: "#ffffff" },
];

export const DARK_PALETTES = [
  { id: "midnight", name: "Midnight", desc: "Deep neutral (default)", swatch: "#15161a" },
  { id: "navy", name: "Deep Navy", desc: "Blue-black", swatch: "#0e1420" },
  { id: "forest", name: "Calm Forest", desc: "Green-tinted dark", swatch: "#121711" },
  { id: "lowstim", name: "Low Stim", desc: "Muted, ambient off", swatch: "#1a1a1c" },
];

export const PALETTE_DEFAULTS = { lightPalette: "paper", darkPalette: "midnight" };

const LIGHT_IDS = new Set(LIGHT_PALETTES.map((p) => p.id));
const DARK_IDS = new Set(DARK_PALETTES.map((p) => p.id));

/**
 * The palette id to apply for a resolved mode ("light" | "dark"), falling
 * back to that mode's default when the stored id is missing or belongs to
 * the other mode (e.g. an old/corrupt value). Pure — unit tested.
 */
export function paletteFor(mode, tweaks = {}) {
  if (mode === "dark") {
    const id = tweaks.darkPalette;
    return DARK_IDS.has(id) ? id : PALETTE_DEFAULTS.darkPalette;
  }
  const id = tweaks.lightPalette;
  return LIGHT_IDS.has(id) ? id : PALETTE_DEFAULTS.lightPalette;
}
