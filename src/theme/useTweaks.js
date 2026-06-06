import { useEffect, useState } from "react";

/* Tweaks = the visual personalization state from the floating panel.
   theme | accent (hue) | ambient glow % | corner radius | density.

   For now this persists with a tiny inline localStorage read/write. In Step 2
   this will be swapped to the shared useLocalStorage hook with zero change to
   how components consume it. */

const STORAGE_KEY = "ligand.tweaks";

export const TWEAK_DEFAULTS = {
  theme: "light", // "light" | "dark"
  accent: 245, // hue angle
  ambient: 60, // 0–100 (%)
  radius: 12, // 4–20 (px)
  density: "compact", // "compact" | "comfy"
};

// Accent swatches offered in the panel — single-hue family, varied by angle.
export const ACCENTS = [
  { id: 245, color: "oklch(0.62 0.10 245)" },
  { id: 290, color: "oklch(0.62 0.10 290)" },
  { id: 165, color: "oklch(0.62 0.10 165)" },
  { id: 70, color: "oklch(0.72 0.12 70)" },
  { id: 20, color: "oklch(0.65 0.13 20)" },
];

function readInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt/blocked storage */
  }
  return TWEAK_DEFAULTS;
}

export function useTweaks() {
  const [tweaks, setTweaks] = useState(readInitial);

  // Apply tweaks to the document root as CSS variables / data attributes.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = tweaks.theme;
    root.dataset.density = tweaks.density;
    root.style.setProperty("--accent-h", tweaks.accent);
    root.style.setProperty("--ambient-opacity", tweaks.ambient / 100);
    root.style.setProperty("--r-md", tweaks.radius - 2 + "px");
    root.style.setProperty("--r-lg", tweaks.radius + "px");
    root.style.setProperty("--r-xl", tweaks.radius + 2 + "px");
    root.style.setProperty("--r-2xl", tweaks.radius + 4 + "px");
  }, [tweaks]);

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      /* ignore */
    }
  }, [tweaks]);

  // Patch one or more keys at once.
  const set = (patch) => setTweaks((prev) => ({ ...prev, ...patch }));

  return { tweaks, set };
}
