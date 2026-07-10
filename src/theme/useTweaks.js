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
  // Desktop wordmark face (see WORDMARK_FONTS). Clean geometric logotype by
  // default; a picker in Settings lets the user swap it.
  wordmarkFont: "sora",
};

// Desktop wordmark font options (applied via html[data-wordmark]).
export const WORDMARK_FONTS = [
  { id: "sora", name: "Logotype", sample: "Ligand" },
  { id: "instrument", name: "Editorial", sample: "Ligand" },
  { id: "dancing", name: "Cursive", sample: "Ligand" },
  { id: "vibes", name: "Signature", sample: "Ligand" },
  { id: "caveat", name: "Handwritten", sample: "Ligand" },
  { id: "grotesk", name: "Modern", sample: "LIGAND" },
  { id: "plain", name: "Clean", sample: "Ligand" },
];

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
    root.dataset.wordmark = tweaks.wordmarkFont;
    root.style.setProperty("--accent-h", tweaks.accent);
    root.style.setProperty("--ambient-opacity", tweaks.ambient / 100);
    root.style.setProperty("--r-md", tweaks.radius - 2 + "px");
    root.style.setProperty("--r-lg", tweaks.radius + "px");
    root.style.setProperty("--r-xl", tweaks.radius + 2 + "px");
    root.style.setProperty("--r-2xl", tweaks.radius + 4 + "px");
  }, [tweaks.density, tweaks.accent, tweaks.ambient, tweaks.radius, tweaks.wordmarkFont]);

  // Patch one or more keys at once.
  const set = (patch) => setTweaks((prev) => ({ ...prev, ...patch }));

  // One-time migration: the default wordmark changed from the editorial serif
  // ("instrument") to the Sora logotype ("sora"). Anyone still sitting on the
  // old default gets bumped once; users who explicitly picked another face are
  // left alone. Guarded by a flag so it never fights a later manual choice.
  useEffect(() => {
    const FLAG = "ligand.wordmark.v2";
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, "1");
    if (!stored.wordmarkFont || stored.wordmarkFont === "instrument") {
      set({ wordmarkFont: "sora" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tweaks, set };
}
