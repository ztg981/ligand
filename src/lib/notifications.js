/* ============================================================
   Notifications — PLACEHOLDER / no-op system.
   ------------------------------------------------------------
   The brief calls for notifications to be stubbed for now. Nothing
   here touches the real browser Notification API yet, so we never
   trigger a permission prompt. Preferences are just remembered; the
   actual delivery is wired later.

   The function SIGNATURES are the contract — swap the bodies for a
   real implementation (Notification API, service worker, chime audio)
   without changing callers.
   ============================================================ */

// Whether the environment *could* support notifications (informational only).
export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// Placeholder: we do NOT call Notification.requestPermission() yet, because
// that would pop a real browser prompt. We just record the user's intent.
export async function requestPermission() {
  // TODO(notifications): call Notification.requestPermission() and return the
  // real result once notifications are actually implemented.
  return "default";
}

// Placeholder send. No-op beyond a console breadcrumb in dev.
export function notify(title, body = "") {
  // TODO(notifications): create a real Notification (or in-app toast) here.
  if (typeof console !== "undefined") {
    console.debug("[notifications:placeholder]", title, body);
  }
  return false; // nothing was actually shown
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

export default { isSupported, requestPermission, notify, chime };
