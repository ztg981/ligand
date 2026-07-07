import { useEffect } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage.js";

/* Tweaks = the visual personalization state from the floating panel.
   theme | accent (hue) | ambient glow % | corner radius | density.

   Persistence now goes through the shared useLocalStorage hook (Step 2),
   with no change to how components consume `{ tweaks, set }`. */

const STORAGE_KEY = "ligand.tweaks";

export const TWEAK_DEFAULTS = {
  theme: "light", // "light" | "dark" | "auto" (auto follows the OS color scheme)
  accent: 245, // hue angle
  ambient: 60, // 0–100 (%)
  radius: 16, // 4–20 (px) — softer corners out of the box for new users
  density: "compact", // "compact" | "comfy"
  // Separate LOOK per mode (see src/theme/palettes.js). Auto mode swaps both
  // the mode and the palette chosen for that mode.
  lightPalette: "paper",
  darkPalette: "midnight",
};

// Accent swatches offered in the panel — single-hue family, varied by angle.
export const ACCENTS = [
  { id: 245, color: "oklch(0.62 0.10 245)" },
  { id: 290, color: "oklch(0.62 0.10 290)" },
  { id: 165, color: "oklch(0.62 0.10 165)" },
  { id: 70, color: "oklch(0.72 0.12 70)" },
  { id: 20, color: "oklch(0.65 0.13 20)" },
];

export function useTweaks() {
  // Persisted via the shared hook. Spread defaults under the stored value so
  // any newly added tweak keys get sensible fallbacks.
  const [stored, setTweaks] = useLocalStorage(STORAGE_KEY, TWEAK_DEFAULTS);
  const tweaks = { ...TWEAK_DEFAULTS, ...stored };

  // Apply tweaks to the document root as CSS variables / data attributes.
  // NOTE: data-theme is owned by App, because the chosen wallpaper's tone can
  // override the light/dark token set (so text stays readable on it). We set
  // everything else here.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = tweaks.density;
    root.style.setProperty("--accent-h", tweaks.accent);
    root.style.setProperty("--ambient-opacity", tweaks.ambient / 100);
    root.style.setProperty("--r-md", tweaks.radius - 2 + "px");
    root.style.setProperty("--r-lg", tweaks.radius + "px");
    root.style.setProperty("--r-xl", tweaks.radius + 2 + "px");
    root.style.setProperty("--r-2xl", tweaks.radius + 4 + "px");
  }, [tweaks.density, tweaks.accent, tweaks.ambient, tweaks.radius]);

  // Patch one or more keys at once.
  const set = (patch) => setTweaks((prev) => ({ ...prev, ...patch }));

  return { tweaks, set };
}
