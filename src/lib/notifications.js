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

// Placeholder chime for the Pomodoro phase change.
export function chime() {
  // TODO(notifications): play a soft sound via the Web Audio API / <audio>.
  if (typeof console !== "undefined") {
    console.debug("[notifications:placeholder] chime");
  }
}

export default { isSupported, requestPermission, notify, chime };
