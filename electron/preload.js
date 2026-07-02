// Preload — runs with contextIsolation on, so it's the only safe bridge
// between the sandboxed renderer and Electron. It exposes a tiny, read-only
// surface the web app can feature-detect to know it's running in the desktop
// shell (used to render a custom draggable titlebar; see useElectron.js).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform, // "win32" | "darwin" | "linux"
});
