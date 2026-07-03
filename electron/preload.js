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
});
