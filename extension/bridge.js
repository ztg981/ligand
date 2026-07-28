/* bridge.js — content script injected into Ligand pages.

   The extension never writes Ligand's storage itself. Instead it hands work to
   the page, which performs every write through the app's real store actions
   (see src/hooks/useExtensionBridge.js). That keeps one source of truth for the
   data model: no duplicated task/note/activity shapes to drift out of sync, and
   cloud sync + validation happen exactly as they do for a normal click.

   This file is only a relay:
     background/popup  <--chrome.runtime-->  bridge  <--postMessage-->  page

   It also forwards the page's state snapshots outward so the popup can render
   your tasks and Pomodoro without the app being focused. */

const REQ = "ligand-ext-req"; // extension -> page
const RES = "ligand-ext-res"; // page -> extension (replies)
const SNAPSHOT = "ligand-ext-snapshot"; // page -> extension (state pushes)
const HELLO = "ligand-ext-hello"; // page -> extension ("bridge listener is live")

let pageReady = false;
const pending = new Map(); // requestId -> chrome sendResponse

// ---- page -> extension ------------------------------------------------
window.addEventListener("message", (event) => {
  // Only trust messages from this exact page (not iframes, not other origins).
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === HELLO) {
    pageReady = true;
    chrome.runtime.sendMessage({ type: "bridge:ready" }).catch(() => {});
    return;
  }

  if (msg.type === SNAPSHOT) {
    chrome.runtime
      .sendMessage({ type: "bridge:snapshot", snapshot: msg.snapshot })
      .catch(() => {});
    return;
  }

  if (msg.type === RES && msg.requestId) {
    const respond = pending.get(msg.requestId);
    if (respond) {
      pending.delete(msg.requestId);
      respond({ ok: msg.ok, result: msg.result, error: msg.error });
    }
  }
});

// ---- extension -> page ------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "page") return undefined;

  if (!pageReady) {
    sendResponse({ ok: false, error: "Ligand page is not ready yet." });
    return undefined;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pending.set(requestId, sendResponse);
  window.postMessage(
    { type: REQ, requestId, action: message.action, payload: message.payload },
    window.location.origin
  );

  // Never leave the popup hanging on a page that stopped answering.
  setTimeout(() => {
    if (pending.has(requestId)) {
      pending.delete(requestId);
      sendResponse({ ok: false, error: "Ligand did not respond." });
    }
  }, 4000);

  return true; // async sendResponse
});

// The page may have mounted its listener before this script ran; ask it to
// re-announce so we don't sit idle waiting for a hello that already happened.
window.postMessage({ type: REQ, action: "ping" }, window.location.origin);
