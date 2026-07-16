import { useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import {
  ACCOUNT_PROFILE_KEY,
  DESKTOP_SETTINGS_KEY,
  MOBILE_SETTINGS_KEY,
  SETTINGS_DEFAULTS,
  mobileSettingsDefaults,
  normalizeMobileSettingsRecord,
  normalizeSettingsRecord,
  readLegacyProfile,
} from "../lib/preferenceRecords.js";

/*
 * General app preferences. Desktop/iPad settings and phone settings use
 * separate records, while the display name lives in one account-wide profile.
 */

export { SETTINGS_DEFAULTS };

export function useSettings(scope = "desktop") {
  const isMobileScope = scope === "mobile";
  const [stored, setStored] = useLocalStorage(
    isMobileScope ? MOBILE_SETTINGS_KEY : DESKTOP_SETTINGS_KEY,
    isMobileScope ? mobileSettingsDefaults : SETTINGS_DEFAULTS
  );
  const [profile, setProfile] = useLocalStorage(
    ACCOUNT_PROFILE_KEY,
    readLegacyProfile
  );

  const settings = isMobileScope
    ? {
        ...normalizeSettingsRecord(normalizeMobileSettingsRecord(stored)),
        profile: { ...SETTINGS_DEFAULTS.profile, ...(profile || {}) },
      }
    : {
        ...normalizeSettingsRecord(stored),
        profile: { ...SETTINGS_DEFAULTS.profile, ...(profile || {}) },
      };

  // Older builds buried the display name inside desktop/mobile settings.
  // Re-check after cloud hydration so an isolated Home Screen container can
  // adopt the account name from the existing synced desktop settings record.
  useEffect(() => {
    const adoptLegacyProfile = () => {
      const legacy = readLegacyProfile();
      setProfile((current) => {
        const currentName = String(current?.name || "").trim();
        if (currentName && currentName !== "Guest" && currentName !== "Maya") {
          return current;
        }
        return legacy.name === currentName ? current : legacy;
      });
    };
    window.addEventListener("ligand:hydrate", adoptLegacyProfile);
    return () =>
      window.removeEventListener("ligand:hydrate", adoptLegacyProfile);
  }, [setProfile]);

  // Reflect behavior preferences at the document root so CSS can honor them.
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = settings.behavior.reduceMotion
      ? "true"
      : "false";
    document.documentElement.dataset.desktopScrollbars =
      settings.behavior.showDesktopScrollbars ? "show" : "hide";
  }, [
    settings.behavior.reduceMotion,
    settings.behavior.showDesktopScrollbars,
  ]);

  const setSection = useCallback(
    (section, patch, options = {}) => {
      if (section === "profile") {
        setProfile((current) => ({
          ...SETTINGS_DEFAULTS.profile,
          ...(current || {}),
          ...patch,
        }));
        return;
      }

      setStored((previous) => {
        const normalized = isMobileScope
          ? normalizeMobileSettingsRecord(previous)
          : normalizeSettingsRecord(previous);
        return {
          ...normalized,
          [section]: { ...normalized[section], ...patch },
          ...(isMobileScope && options.sync !== false
            ? { _updatedAt: new Date().toISOString() }
            : {}),
        };
      });
    },
    [isMobileScope, setProfile, setStored]
  );

  const reset = useCallback(() => {
    if (isMobileScope) {
      setStored({
        ...mobileSettingsDefaults(),
        _updatedAt: new Date().toISOString(),
      });
      return;
    }
    setStored(SETTINGS_DEFAULTS);
    setProfile(SETTINGS_DEFAULTS.profile);
  }, [isMobileScope, setProfile, setStored]);

  return { settings, setSection, reset };
}

export default useSettings;
