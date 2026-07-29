/* background.js — the extension's service worker.

   Three jobs:
     1. Cache the last state snapshot a Ligand page pushed, so the popup can
        render instantly (and show the Pomodoro) without the app being focused.
     2. Relay writes to a Ligand tab, and QUEUE them when none is open so a
        quick capture is never lost — the queue flushes as soon as Ligand
        appears.
     3. Keep the toolbar badge showing the running Pomodoro.

   MV3 service workers are evicted after ~30s idle, so nothing is kept in
   memory: state lives in chrome.storage.local and the badge is refreshed from
   an alarm plus the absolute Pomodoro end time. */

const LIGAND_URLS = [
  "http://localhost/*",
  "http://127.0.0.1/*",
  "https://*.vercel.app/*",
];

const KEY_SNAPSHOT = "snapshot";
const KEY_QUEUE = "queue";

// ---- storage helpers --------------------------------------------------
async function get(key, fallback = null) {
  const bag = await chrome.storage.local.get(key);
  return bag[key] ?? fallback;
}
const set = (key, value) => chrome.storage.local.set({ [key]: value });

// ---- finding a Ligand tab --------------------------------------------
async function ligandTabs() {
  const tabs = await chrome.tabs.query({ url: LIGAND_URLS });
  // A Ligand page is one whose bridge answered at least once; we can't know
  // that from here, so prefer the most recently active tab and let the send
  // fail over to the next candidate.
  return tabs.sort((a, b) => Number(b.active) - Number(a.active));
}

/** Try every open Ligand tab until one answers. */
async function sendToPage(action, payload) {
  const tabs = await ligandTabs();
  for (const tab of tabs) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        target: "page",
        action,
        payload,
      });
      if (res?.ok) return res;
    } catch {
      /* tab has no bridge (or is still loading) — try the next one */
    }
  }
  return null;
}

// ---- the offline queue ------------------------------------------------
async function enqueue(action, payload) {
  const queue = await get(KEY_QUEUE, []);
  queue.push({ action, payload, at: Date.now() });
  await set(KEY_QUEUE, queue);
}

async function flushQueue() {
  const queue = await get(KEY_QUEUE, []);
  if (!queue.length) return 0;
  const left = [];
  let sent = 0;
  for (const item of queue) {
    const res = await sendToPage(item.action, item.payload);
    if (res?.ok) sent += 1;
    else left.push(item);
  }
  await set(KEY_QUEUE, left);
  return sent;
}

/** Write now if Ligand is open, otherwise queue it. */
async function submit(action, payload) {
  const res = await sendToPage(action, payload);
  if (res?.ok) {
    flushQueue();
    return { ok: true, queued: false, result: res.result };
  }
  await enqueue(action, payload);
  return { ok: true, queued: true };
}

// ---- toolbar icon: the Ligand bolt, in the app's current accent -------
// The mark is the same path as public/favicon.svg (viewBox 0 0 48 46). It is
// redrawn whenever the page reports a different accent, so changing the theme
// in Ligand recolours the toolbar icon to match.
const BOLT_PATH =
  "M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262" +
  "H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578" +
  "H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894" +
  "c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377" +
  "c.943 0 1.473 1.088.89 1.83L25.947 44.94z";
const FALLBACK_ACCENT = "#863bff"; // the logo's own violet
let lastIconAccent = null;

async function refreshIcon(accent) {
  const color = accent || FALLBACK_ACCENT;
  if (color === lastIconAccent) return;
  try {
    const size = 32;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    // Fit the 48x46 artwork into the square with a little breathing room.
    const scale = (size * 0.86) / 48;
    ctx.translate((size - 48 * scale) / 2, (size - 46 * scale) / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(BOLT_PATH));
    await chrome.action.setIcon({ imageData: ctx.getImageData(0, 0, size, size) });
    lastIconAccent = color;
  } catch {
    // OffscreenCanvas/Path2D unavailable — keep the bundled PNG icon.
  }
}

// ---- badge: the running Pomodoro -------------------------------------
async function refreshBadge() {
  const snap = await get(KEY_SNAPSHOT);
  const session = snap?.pomodoro;
  if (!session?.running || !session.endTime) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const left = Math.max(0, Math.round((session.endTime - Date.now()) / 1000));
  if (left <= 0) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const mins = Math.ceil(left / 60);
  await chrome.action.setBadgeBackgroundColor({ color: "#3f6fd8" });
  await chrome.action.setBadgeText({ text: mins > 99 ? "99+" : String(mins) });
}

// ---- wiring -----------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "bridge:snapshot":
        await set(KEY_SNAPSHOT, { ...message.snapshot, at: Date.now() });
        await refreshBadge();
        await refreshIcon(message.snapshot?.theme?.accent);
        sendResponse({ ok: true });
        break;
      case "bridge:ready":
        await flushQueue();
        sendResponse({ ok: true });
        break;
      case "popup:submit":
        sendResponse(await submit(message.action, message.payload));
        break;
      case "popup:state": {
        const [snapshot, queue] = await Promise.all([
          get(KEY_SNAPSHOT),
          get(KEY_QUEUE, []),
        ]);
        const open = (await ligandTabs()).length > 0;
        sendResponse({ ok: true, snapshot, queued: queue.length, ligandOpen: open });
        break;
      }
      case "popup:refresh": {
        // Ask an open page for a snapshot and store it BEFORE replying, so the
        // popup's follow-up read can't race the page's own broadcast.
        const fresh = await sendToPage("snapshot", null);
        if (fresh?.result) {
          await set(KEY_SNAPSHOT, { ...fresh.result, at: Date.now() });
          await refreshBadge();
          await refreshIcon(fresh.result?.theme?.accent);
        }
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message." });
    }
  })();
  return true; // async sendResponse
});

// A Ligand tab finishing a load is the cue to drain anything captured offline.
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)|\.vercel\.app/.test(tab.url)) flushQueue();
});

chrome.alarms.create("tick", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") refreshBadge();
});
// Repaint from the cached accent on wake, so the icon survives the service
// worker being evicted without waiting for Ligand to push a fresh snapshot.
async function restoreFromCache() {
  const snap = await get(KEY_SNAPSHOT);
  await refreshBadge();
  await refreshIcon(snap?.theme?.accent);
}
chrome.runtime.onStartup.addListener(restoreFromCache);
chrome.runtime.onInstalled.addListener(restoreFromCache);
