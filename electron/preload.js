// Preload — runs with contextIsolation on, so it's the only safe bridge
// between the sandboxed renderer and Electron. It exposes a tiny, read-only
// surface the web app feature-detects to know it's running in the desktop
// shell (see useElectron.js), plus a narrow bridge for the custom window
// controls rendered inside Ligand's own draggable navigation bar.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform, // "win32" | "darwin" | "linux"
  windowControls: {
    minimize: () => ipcRenderer.send("window:control", "minimize"),
    toggleMaximize: () => ipcRenderer.send("window:control", "maximize"),
    close: () => ipcRenderer.send("window:control", "close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChange: (cb) => {
      const handler = (_event, maximized) => cb(Boolean(maximized));
      ipcRenderer.on("window:maximized", handler);
      return () => ipcRenderer.removeListener("window:maximized", handler);
    },
  },

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

  // Tray-residency bridge. configure() mirrors settings.desktop into the main
  // process (close-to-tray flag + launch-at-login registration); showWindow()
  // raises the window from the tray, e.g. when a notification is clicked.
  desktop: {
    configure: (cfg) => ipcRenderer.send("desktop:configure", cfg),
    showWindow: () => ipcRenderer.send("window:show"),
  },

  // Focus-mode website blocker (Windows). All async; each resolves to a status
  // object { ok, active/blocked, error?, cancelled?, supported?, presets? }.
  blocker: {
    status: () => ipcRenderer.invoke("blocker:status"),
    apply: (domains) => ipcRenderer.invoke("blocker:apply", domains),
    clear: () => ipcRenderer.invoke("blocker:clear"),
  },
});
