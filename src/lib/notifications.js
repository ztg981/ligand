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
    const n = new Notification(title, {
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
    // Clicking the toast should land the user IN the app — especially when
    // Ligand is sitting hidden in the desktop tray. Best-effort everywhere.
    n.onclick = () => {
      try {
        window.focus();
        window.electron?.desktop?.showWindow?.();
      } catch {
        /* focus can be refused — harmless */
      }
    };
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

/* ------------------------------------------------------------
   Ambient hum — a soft, low warm drone for while the timer runs.
   A few detuned sine voices through a lowpass filter, kept gentle
   by a low gain ceiling so even "full" volume stays unobtrusive.
   No files, no network. Lives independently of the chime so the
   two never interfere.
   ------------------------------------------------------------ */
const AMBIENT_MAX_GAIN = 0.06; // ceiling: full volume is still subtle
let _ambient = null;
const clampVol = (v) => Math.min(1, Math.max(0, Number(v) || 0));

export function startAmbient(volume = 0.4) {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") ctx.resume();
  if (_ambient) {
    setAmbientVolume(volume);
    return true;
  }
  const now = ctx.currentTime;
  const target = Math.max(0.0001, clampVol(volume) * AMBIENT_MAX_GAIN);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(target, now + 1.2); // gentle fade-in

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 620;
  filter.Q.value = 0.5;
  filter.connect(master);
  master.connect(ctx.destination);

  // A warm low pad: root, a slightly detuned root (slow chorus), and a fifth.
  const voices = [
    { f: 110, g: 0.85 },
    { f: 110.4, g: 0.7 },
    { f: 164.81, g: 0.45 },
  ];
  const oscs = voices.map(({ f, g }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.value = g;
    osc.connect(gain).connect(filter);
    osc.start(now);
    return osc;
  });

  _ambient = { master, oscs };
  return true;
}

export function setAmbientVolume(volume) {
  if (!_ambient) return; // check first, so we never create a context just to adjust
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const target = Math.max(0.0001, clampVol(volume) * AMBIENT_MAX_GAIN);
  _ambient.master.gain.cancelScheduledValues(now);
  _ambient.master.gain.setValueAtTime(Math.max(0.0001, _ambient.master.gain.value), now);
  _ambient.master.gain.exponentialRampToValueAtTime(target, now + 0.3);
}

export function stopAmbient() {
  if (!_ambient) return; // nothing playing — don't create a context just to stop
  const ctx = getAudioContext();
  if (!ctx) {
    _ambient = null;
    return;
  }
  const now = ctx.currentTime;
  const a = _ambient;
  _ambient = null;
  try {
    a.master.gain.cancelScheduledValues(now);
    a.master.gain.setValueAtTime(Math.max(0.0001, a.master.gain.value), now);
    a.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6); // fade-out
    a.oscs.forEach((o) => o.stop(now + 0.7));
  } catch {
    /* already stopped */
  }
}

export function isAmbientPlaying() {
  return !!_ambient;
}

export default {
  isSupported,
  permissionStatus,
  requestPermission,
  notify,
  chime,
  startAmbient,
  setAmbientVolume,
  stopAmbient,
  isAmbientPlaying,
};
