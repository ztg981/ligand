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
  // The live Pomodoro countdown + pause stopwatch are machine-local: a timer
  // running (or paused) on your laptop must not teleport onto your phone.
  "ligand.pomodoro.session",
  "ligand.pomodoro.pausedAt",
  // "Which celebrations have already played here" is a UI fact about this
  // device, not account data — and keeping it out of the synced blob is what
  // stops a stale pull from replaying a badge animation on every app open.
  "ligand.badgesCelebrated",
  // Version snapshots and queued task mutations are account/device control
  // state, not user content. Never mirror them into the legacy JSON blob.
  "ligand.taskRecordSync",
]);

export function isSyncedKey(key) {
  return Boolean(key) && key.startsWith("ligand.") && !DEVICE_LOCAL_KEYS.has(key);
}
