// Preload — runs with contextIsolation on, so it's the only safe bridge
// between the sandboxed renderer and Electron. It exposes a tiny, read-only
// surface the web app feature-detects to know it's running in the desktop
// shell (see useElectron.js), plus a one-way setter to recolor the native
// window-controls overlay so its glyphs stay legible against the current theme.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform, // "win32" | "darwin" | "linux"
  setTitleBarOverlay: (opts) => ipcRenderer.send("titlebar-overlay", opts),

  // Auto-update bridge. The main process (electron-updater) fires these when a
  // newer release is found / finished downloading; the renderer shows a subtle
  // banner and calls quitAndInstall() to apply it. Each subscriber returns an
  // unsubscribe fn so React effects can clean up.
  onUpdateAvailable: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  quitAndInstall: () => ipcRenderer.send("quit-and-install"),

  // Manual update check (Settings → About). Resolves { ok, version|reason }.
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  onUpdateStatus: (cb) => {
    // One subscription for the lightweight status stream the About panel
    // shows: checking / none / progress / error. (available/downloaded have
    // their own dedicated subscribers above.)
    const handlers = [
      ["update-checking", () => cb({ state: "checking" })],
      ["update-none", () => cb({ state: "none" })],
      ["update-progress", (_e, p) => cb({ state: "progress", percent: p?.percent })],
      ["update-error", (_e, msg) => cb({ state: "error", message: msg })],
    ].map(([ch, fn]) => {
      const handler = (e, payload) => fn(e, payload);
      ipcRenderer.on(ch, handler);
      return [ch, handler];
    });
    return () => handlers.forEach(([ch, h]) => ipcRenderer.removeListener(ch, h));
  },

  // Focus-mode website blocker (Windows). All async; each resolves to a status
  // object { ok, active/blocked, error?, cancelled?, supported?, presets? }.
  blocker: {
    status: () => ipcRenderer.invoke("blocker:status"),
    apply: (domains) => ipcRenderer.invoke("blocker:apply", domains),
    clear: () => ipcRenderer.invoke("blocker:clear"),
  },
});
