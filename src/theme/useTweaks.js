import { useEffect } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import {
  DESKTOP_TWEAKS_KEY,
  MOBILE_TWEAKS_KEY,
  MOBILE_TWEAK_DEFAULTS,
  TWEAK_DEFAULTS,
  normalizeTweaksRecord,
} from "../lib/preferenceRecords.js";

export { TWEAK_DEFAULTS };

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

/* Accent choices. `id` is the stored value; `h`/`l`/`c` are optional overrides
   for accents that can't be expressed as "the theme's usual accent, at hue N".

   `l`/`c` are what made a genuinely DEEPER purple possible — a hue on its own
   can only ever be a different colour, never a darker or a more vivid one.
   `h` then lets an entry render at a hue other than its id, so a slot can be
   restyled without changing what's already saved in anyone's preferences. */
export const ACCENTS = [
  { id: 245, name: "Blue", color: "oklch(0.62 0.10 245)" },
  { id: 290, name: "Lavender", color: "oklch(0.62 0.10 290)" },
  /* Cyberpunk violet. The muted `oklch(0.45 0.15 295)` that used to sit here
     read as dusty rather than electric — deep, but dull with it. Neon is a
     chroma effect, not a lightness one: this pushes chroma right to the edge
     of sRGB and shifts the hue toward magenta, which is the difference between
     "dark purple" and the lit-sign purple this is meant to be. The id stays
     295 so anyone who already picked this slot is simply upgraded in place. */
  { id: 295, name: "Neon violet", color: "oklch(0.58 0.26 310)", h: 310, l: 0.58, c: 0.26, neon: true },
  { id: 165, name: "Mint", color: "oklch(0.62 0.10 165)" },
  { id: 70, name: "Amber", color: "oklch(0.72 0.12 70)" },
  { id: 20, name: "Rose", color: "oklch(0.65 0.13 20)" },
];

/** The ACCENTS entry for a stored accent, if it carries any overrides. */
export function accentShade(hue) {
  return ACCENTS.find((a) => a.id === hue) || null;
}

/** The hue an accent actually renders at (its id, unless it overrides one). */
export function accentHue(id) {
  return accentShade(id)?.h ?? id;
}

function mobileInitialTweaks() {
  if (typeof window === "undefined") return MOBILE_TWEAK_DEFAULTS;
  try {
    const legacyMobileTheme = JSON.parse(
      window.localStorage.getItem("ligand.mobileTheme") || "null"
    );
    return {
      ...MOBILE_TWEAK_DEFAULTS,
      ...(legacyMobileTheme ? { theme: legacyMobileTheme } : {}),
    };
  } catch {
    return MOBILE_TWEAK_DEFAULTS;
  }
}

export function useTweaks(scope = "desktop") {
  const isMobileScope = scope === "mobile";
  const storageKey = isMobileScope ? MOBILE_TWEAKS_KEY : DESKTOP_TWEAKS_KEY;
  const [stored, setTweaks] = useLocalStorage(
    storageKey,
    isMobileScope ? mobileInitialTweaks : TWEAK_DEFAULTS
  );
  const tweaks = normalizeTweaksRecord(
    stored,
    isMobileScope ? MOBILE_TWEAK_DEFAULTS : TWEAK_DEFAULTS
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = tweaks.density;
    root.dataset.wordmark = tweaks.wordmarkFont;
    // Accent + ambient are mode-dependent (saved per light/dark preset) and are
    // applied in App.jsx where the resolved mode is known. Radius/density/
    // wordmark are mode-independent, so they stay here.
    root.style.setProperty("--r-md", tweaks.radius - 2 + "px");
    root.style.setProperty("--r-lg", tweaks.radius + "px");
    root.style.setProperty("--r-xl", tweaks.radius + 2 + "px");
    root.style.setProperty("--r-2xl", tweaks.radius + 4 + "px");
  }, [tweaks.density, tweaks.radius, tweaks.wordmarkFont]);

  const set = (patch) =>
    setTweaks((previous) => ({
      ...previous,
      ...patch,
      ...(isMobileScope ? { _updatedAt: new Date().toISOString() } : {}),
    }));

  useEffect(() => {
    if (isMobileScope) return;
    const flag = "ligand.wordmark.v3";
    if (localStorage.getItem(flag)) return;
    localStorage.setItem(flag, "1");
    if (!stored.wordmarkFont || stored.wordmarkFont === "sora") {
      set({ wordmarkFont: "instrument" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileScope]);

  return { tweaks, set };
}
