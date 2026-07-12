import { useEffect } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage.js";

/* Tweaks = the visual personalization state from the floating panel.
   theme | accent (hue) | ambient glow % | corner radius | density.

   Persistence now goes through the shared useLocalStorage hook (Step 2),
   with no change to how components consume `{ tweaks, set }`. */

const DESKTOP_STORAGE_KEY = "ligand.tweaks";
const MOBILE_STORAGE_KEY = "ligand.mobileTweaks";

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
  // Desktop wordmark face (see WORDMARK_FONTS). Editorial serif by default
  // (reverted from the Sora logotype per the user's saved preference); a
  // picker in Settings lets the user swap it.
  wordmarkFont: "instrument",
};

// Desktop wordmark font options (applied via html[data-wordmark]).
export const WORDMARK_FONTS = [
  { id: "sora", name: "Logotype", sample: "Ligand" },
  { id: "instrument", name: "Editorial", sample: "Ligand" },
  { id: "playfair", name: "Classic", sample: "Ligand" },
  { id: "fraunces", name: "Storybook", sample: "Ligand" },
  { id: "abril", name: "Poster", sample: "Ligand" },
  { id: "pacifico", name: "Retro", sample: "Ligand" },
  { id: "unbounded", name: "Future", sample: "Ligand" },
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

function mobileInitialTweaks() {
  if (typeof window === "undefined") return TWEAK_DEFAULTS;
  try {
    const desktop = JSON.parse(
      window.localStorage.getItem(DESKTOP_STORAGE_KEY) || "null"
    );
    const legacyMobileTheme = JSON.parse(
      window.localStorage.getItem("ligand.mobileTheme") || "null"
    );
    return {
      ...TWEAK_DEFAULTS,
      ...(desktop || {}),
      ...(legacyMobileTheme ? { theme: legacyMobileTheme } : {}),
    };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

export function useTweaks(scope = "desktop") {
  const isMobileScope = scope === "mobile";
  const storageKey = isMobileScope ? MOBILE_STORAGE_KEY : DESKTOP_STORAGE_KEY;
  // Persisted via the shared hook. Spread defaults under the stored value so
  // any newly added tweak keys get sensible fallbacks.
  const [stored, setTweaks] = useLocalStorage(
    storageKey,
    isMobileScope ? mobileInitialTweaks : TWEAK_DEFAULTS
  );
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

  // One-time migration: the default wordmark reverted from the Sora logotype
  // ("sora") back to the editorial serif ("instrument"). Anyone still sitting
  // on the outgoing default gets bumped once; users who explicitly picked
  // another face are left alone. Guarded by a flag so it never fights a later
  // manual choice (supersedes the old v2 instrument→sora migration).
  useEffect(() => {
    if (isMobileScope) return;
    const FLAG = "ligand.wordmark.v3";
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, "1");
    if (!stored.wordmarkFont || stored.wordmarkFont === "sora") {
      set({ wordmarkFont: "instrument" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileScope]);

  return { tweaks, set };
}
