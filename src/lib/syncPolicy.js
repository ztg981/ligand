// Account content and desktop preferences sync between the PC website and the
// Electron app. Phone/iPad preferences and truly machine-local UI state stay
// on their device.
export const DEVICE_LOCAL_KEYS = new Set([
  "ligand.guestMode",
  "ligand.mobileSettings",
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
