/* ============================================================
   Notifications — real browser Notification API + Web Audio chime.
   ------------------------------------------------------------
   The OS-notification layer is thin and best-effort: it only ever
   shows a notification when the user has explicitly granted browser
   permission. Everything degrades silently if unsupported or denied,
   so callers never need to special-case it.

   The richer state (the in-app feed, unread badge, once-per-day
   dedup, master-toggle gating) lives in useNotifications.js — this
   file is just the low-level browser plumbing.
   ============================================================ */

// Whether this environment supports the Notification API at all.
export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// The current permission: "default" (not yet asked), "granted", or "denied".
export function permissionStatus() {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

// Ask the browser for permission — ONCE. If we've already been answered
// (granted or denied), we return that answer without re-prompting, so the
// user is never nagged. Should be called from a user gesture (e.g. flipping
// the Settings toggle) so every browser honours it.
export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Older Safari used a callback signature; fall back to the live value.
    return Notification.permission;
  }
}

// Show an OS notification. Returns true only if one was actually shown.
// No-ops (returning false) when unsupported or not granted — callers rely
// on this to "fall back silently".
export function notify(title, body = "") {
  if (!isSupported() || Notification.permission !== "granted") return false;
  try {
    new Notification(title, {
      body,
      // A tiny inline dot keeps the OS chrome from showing a broken-image icon
      // without shipping an asset. Optional — browsers fall back gracefully.
      icon:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="%236b8cff"/></svg>'
        ),
      tag: "ligand",
    });
    return true;
  } catch {
    return false;
  }
}

// A soft two-note chime for the Pomodoro phase change. Uses the Web Audio
// API directly — no files, no network, no permissions. Created lazily and
// resumed on demand (the user's Start click unlocks audio autoplay).
let _audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!_audioCtx) _audioCtx = new Ctx();
  return _audioCtx;
}

export function chime() {
  // Breadcrumb first, so the call is observable even if audio is blocked.
  if (typeof console !== "undefined") console.debug("[notifications] chime");
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    // Two gentle sine notes (a soft rising "ding-ding").
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    return true;
  } catch {
    return false;
  }
}

export default { isSupported, permissionStatus, requestPermission, notify, chime };
