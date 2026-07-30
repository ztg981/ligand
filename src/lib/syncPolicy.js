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
  /* NOTE: the live Pomodoro countdown (`ligand.pomodoro.session`) and its
     pause stopwatch (`ligand.pomodoro.pausedAt`) used to be listed here, on
     the reasoning that a timer running on your laptop must not teleport onto
     your phone. That was backwards — starting a block at the desk, pausing,
     and resuming on the iPad is exactly what the timer is for — and it is safe
     because the session stores an ABSOLUTE end time, so two devices count down
     to the same instant with nothing to reconcile. See usePomodoro. */
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
