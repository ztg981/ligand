import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage.js";

/* useSettings — app preferences that aren't visual Tweaks or Pomodoro timings.
   Notifications, habits, the assistant, wallpaper/sound, and general behavior.
   Persisted under its own key so it's easy to reason about and reset. */

const DESKTOP_STORAGE_KEY = "ligand.settings";
const MOBILE_STORAGE_KEY = "ligand.mobileSettings";

export const SETTINGS_DEFAULTS = {
  profile: {
    name: "Guest", // shown in the dashboard greeting
  },
  notifications: {
    enabled: false, // master switch (placeholder for now)
    pomodoroChime: true, // soft sound when a focus block ends
    pomodoroAlarm: false, // ring an insistent alarm until dismissed (kitchen-timer style)
    dailyReminder: false, // a gentle nudge once a day
    reminderTime: "09:00",
  },
  habits: {
    showStreaks: true,
    weekStartsMonday: true,
  },
  assistant: {
    encouragement: true, // the warm dashboard lines
    tone: "warm", // "warm" | "plain" | "cheerful"
  },
  ai: {
    // Per-feature control over what is sent to the Gemini API.
    aiGoalInsights: true, // goal summary / "At a glance" / overdue advice / prompts
    aiWeeklyReview: true, // the "Your week" card
    includeJournalText: false, // off: only aggregate stats leave the device
    aiRecoveryInsights: false, // recovery data is private unless explicitly on
  },
  wallpaper: {
    id: "none",
    sound: "none",
    volume: 40,
  },
  behavior: {
    reduceMotion: false,
    confirmBeforeDelete: true,
    showDesktopScrollbars: false,
  },
  uiSounds: {
    enabled: true, // subtle click/pop/ding feedback on interactions
    volume: 75,    // 0–100%; scales the whole UI sound palette
  },
  bgMusic: {
    enabled: false, // off by default; user must opt in — no autoplay
    track: "rain",  // "rain" | "stream" | "waves"
    volume: 30,     // 0–100 percentage
  },
  hyperfocus: {
    theme: "crimson", // crimson | monster | cyber | violet | ember | ice
  },
};

// Deep-ish merge so newly added nested keys get defaults.
function withDefaults(stored) {
  const s = stored || {};
  const out = { ...SETTINGS_DEFAULTS };
  for (const k of Object.keys(SETTINGS_DEFAULTS)) {
    out[k] = { ...SETTINGS_DEFAULTS[k], ...(s[k] || {}) };
  }
  return out;
}

function mobileInitialSettings() {
  if (typeof window === "undefined") return SETTINGS_DEFAULTS;
  try {
    return JSON.parse(
      window.localStorage.getItem(DESKTOP_STORAGE_KEY) || "null"
    ) || SETTINGS_DEFAULTS;
  } catch {
    return SETTINGS_DEFAULTS;
  }
}

export function useSettings(scope = "desktop") {
  const isMobileScope = scope === "mobile";
  const [stored, setStored] = useLocalStorage(
    isMobileScope ? MOBILE_STORAGE_KEY : DESKTOP_STORAGE_KEY,
    isMobileScope ? mobileInitialSettings : SETTINGS_DEFAULTS
  );
  const settings = withDefaults(stored);

  // Reflect behavior preferences at the document root so CSS can honor them.
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = settings.behavior.reduceMotion
      ? "true"
      : "false";
    document.documentElement.dataset.desktopScrollbars = settings.behavior.showDesktopScrollbars
      ? "show"
      : "hide";
  }, [settings.behavior.reduceMotion, settings.behavior.showDesktopScrollbars]);

  // Patch a whole section at once, e.g. setSection("notifications", { enabled: true }).
  const setSection = (section, patch) =>
    setStored((prev) => ({
      ...prev,
      [section]: { ...withDefaults(prev)[section], ...patch },
    }));

  const reset = () => setStored(SETTINGS_DEFAULTS);

  return { settings, setSection, reset };
}

export default useSettings;
