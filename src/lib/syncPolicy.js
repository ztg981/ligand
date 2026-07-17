// Account content, desktop preferences, and the separate phone preference
// records sync through the account. Each device family reads only its own
// record; truly machine-local UI state remains excluded.
export const DEVICE_LOCAL_KEYS = new Set([
  "ligand.guestMode",
  "ligand.mobileTheme",
  "ligand.customWallpaper",
  "ligand.pomodoro",
  "ligand.blocker",
  "ligand.hyperfocus",
  "ligand.home.hidden",
  "ligand.goalSidebarCollapsed",
  "ligand.journalSort",
  "ligand.focusTaskId",
  // Version snapshots and queued task mutations are account/device control
  // state, not user content. Never mirror them into the legacy JSON blob.
  "ligand.taskRecordSync",
]);

export function isSyncedKey(key) {
  return Boolean(key) && key.startsWith("ligand.") && !DEVICE_LOCAL_KEYS.has(key);
}
