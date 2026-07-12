// Content belongs to the account; preferences belong to the device. Keeping
// this policy separate from the Supabase client makes accidental preference
// syncing straightforward to catch in tests.
export const DEVICE_LOCAL_KEYS = new Set([
  "ligand.guestMode",
  "ligand.settings",
  "ligand.mobileSettings",
  "ligand.tweaks",
  "ligand.mobileTweaks",
  "ligand.mobileTheme",
  "ligand.customWallpaper",
  "ligand.customWallpapers",
  "ligand.pomodoro",
  "ligand.blocker",
  "ligand.hyperfocus",
  "ligand.home.hidden",
  "ligand.goalSidebarCollapsed",
  "ligand.journalSort",
  "ligand.focusTaskId",
]);

export function isSyncedKey(key) {
  return Boolean(key) && key.startsWith("ligand.") && !DEVICE_LOCAL_KEYS.has(key);
}
