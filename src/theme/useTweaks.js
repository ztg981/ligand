import { useEffect } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import {
  DESKTOP_TWEAKS_KEY,
  MOBILE_TWEAKS_KEY,
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
    const legacyMobileTheme = JSON.parse(
      window.localStorage.getItem("ligand.mobileTheme") || "null"
    );
    return {
      ...TWEAK_DEFAULTS,
      ...(legacyMobileTheme ? { theme: legacyMobileTheme } : {}),
    };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

export function useTweaks(scope = "desktop") {
  const isMobileScope = scope === "mobile";
  const storageKey = isMobileScope ? MOBILE_TWEAKS_KEY : DESKTOP_TWEAKS_KEY;
  const [stored, setTweaks] = useLocalStorage(
    storageKey,
    isMobileScope ? mobileInitialTweaks : TWEAK_DEFAULTS
  );
  const tweaks = normalizeTweaksRecord(stored);

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
  }, [
    tweaks.density,
    tweaks.accent,
    tweaks.ambient,
    tweaks.radius,
    tweaks.wordmarkFont,
  ]);

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
