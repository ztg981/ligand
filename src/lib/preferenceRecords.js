export const ACCOUNT_PROFILE_KEY = "ligand.profile";
export const DESKTOP_SETTINGS_KEY = "ligand.settings";
export const MOBILE_SETTINGS_KEY = "ligand.mobileSettings";
export const DESKTOP_TWEAKS_KEY = "ligand.tweaks";
export const MOBILE_TWEAKS_KEY = "ligand.mobileTweaks";

export const SETTINGS_DEFAULTS = {
  profile: {
    name: "Guest",
  },
  notifications: {
    enabled: false,
    pomodoroChime: true,
    pomodoroAlarm: false,
    dailyReminder: false,
    reminderTime: "09:00",
    anchor: "",
  },
  desktop: {
    closeToTray: true,
    launchAtLogin: false,
  },
  sleep: {
    morningCheckIn: true,
    bedtimeReminder: false,
    bedtime: "23:00",
    wakeTarget: "07:00",
  },
  habits: {
    showStreaks: true,
    weekStartsMonday: true,
  },
  assistant: {
    encouragement: true,
    tone: "warm",
  },
  ai: {
    aiGoalInsights: true,
    aiWeeklyReview: true,
    includeJournalText: false,
    aiRecoveryInsights: false,
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
    enabled: true,
    volume: 75,
  },
  bgMusic: {
    enabled: false,
    track: "rain",
    volume: 30,
  },
  hyperfocus: {
    theme: "crimson",
  },
};

export const TWEAK_DEFAULTS = {
  theme: "light",
  accent: 245,
  ambient: 60,
  radius: 16,
  density: "compact",
  lightPalette: "paper",
  darkPalette: "midnight",
  wordmarkFont: "instrument",
};

const MOBILE_SETTINGS_SECTIONS = Object.keys(SETTINGS_DEFAULTS).filter(
  (section) => section !== "profile" && section !== "desktop"
);

function parseStorageJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) || "null");
  } catch {
    return null;
  }
}

function stripSyncMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const rest = { ...value };
  delete rest._updatedAt;
  return rest;
}

export function normalizeSettingsRecord(stored) {
  const source = stored || {};
  const out = { ...SETTINGS_DEFAULTS };
  for (const section of Object.keys(SETTINGS_DEFAULTS)) {
    out[section] = {
      ...SETTINGS_DEFAULTS[section],
      ...(source[section] || {}),
    };
  }
  return out;
}

export function mobileSettingsDefaults() {
  return Object.fromEntries(
    MOBILE_SETTINGS_SECTIONS.map((section) => [
      section,
      { ...SETTINGS_DEFAULTS[section] },
    ])
  );
}

export function normalizeMobileSettingsRecord(stored) {
  const source = stored || {};
  const out = mobileSettingsDefaults();
  for (const section of MOBILE_SETTINGS_SECTIONS) {
    out[section] = {
      ...SETTINGS_DEFAULTS[section],
      ...(source[section] || {}),
    };
  }
  if (source._updatedAt) out._updatedAt = source._updatedAt;
  return out;
}

export function normalizeTweaksRecord(stored) {
  return { ...TWEAK_DEFAULTS, ...(stored || {}) };
}

export function readLegacyProfile(storage = globalThis.localStorage) {
  for (const key of [ACCOUNT_PROFILE_KEY, DESKTOP_SETTINGS_KEY, MOBILE_SETTINGS_KEY]) {
    const value = parseStorageJson(storage, key);
    const name = String(
      key === ACCOUNT_PROFILE_KEY ? value?.name || "" : value?.profile?.name || ""
    ).trim();
    if (name && name !== "Guest" && name !== "Maya") return { name };
  }
  return { ...SETTINGS_DEFAULTS.profile };
}

export function shouldSyncPhonePreference(key, value) {
  if (key === MOBILE_SETTINGS_KEY) {
    if (value?._updatedAt) return true;
    const normalized = stripSyncMetadata(normalizeMobileSettingsRecord(value));
    return JSON.stringify(normalized) !== JSON.stringify(mobileSettingsDefaults());
  }

  if (key === MOBILE_TWEAKS_KEY) {
    if (value?._updatedAt) return true;
    const normalized = stripSyncMetadata(normalizeTweaksRecord(value));
    return JSON.stringify(normalized) !== JSON.stringify(TWEAK_DEFAULTS);
  }

  return true;
}

export function phonePreferenceSyncValue(key, value) {
  if (key === MOBILE_SETTINGS_KEY) return normalizeMobileSettingsRecord(value);
  if (key === MOBILE_TWEAKS_KEY) return normalizeTweaksRecord(value);
  return value;
}

export const COOKIE_HANDOFF_KEYS = new Set([
  ACCOUNT_PROFILE_KEY,
  MOBILE_SETTINGS_KEY,
  MOBILE_TWEAKS_KEY,
]);
