// Electron main process for Ligand.
//
// Wraps the same Vite-built web app in a native desktop window. In dev it
// loads the live Vite server (http://localhost:5173); when packaged it loads
// the built files from dist/index.html over file:// (which is why vite.config
// uses base "./" so asset paths stay relative). The web/PWA build is
// unchanged — this is an additional shell, not a replacement.
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const appBlocker = require("./appBlocker");

// Dev server URL. Present when running via `npm run electron` / `electron:dev`
// (Vite is up); absent in a packaged app, where we load the built files.
const DEV_SERVER_URL =
  process.env.ELECTRON_START_URL ||
  (app.isPackaged ? null : "http://localhost:5173");

// Dark theme base so the window never flashes white before the app paints —
// matches --bg in the app's dark theme and the PWA manifest background_color.
const THEME_BG = "#15161a";
const THEME_INK = "#f0eeec";

app.setName("Ligand");

// Windows requires an explicit AppUserModelID for renderer-fired HTML5
// notifications (new Notification(...)) to surface as native toasts and to
// group under the app's Start-menu shortcut. Must match the electron-builder
// appId. Without this, Pomodoro/alarm notifications silently never appear on
// Windows. No-op on other platforms.
if (process.platform === "win32") {
  app.setAppUserModelId("com.ligand.app");
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    resizable: true,
    backgroundColor: THEME_BG,
    title: "Ligand",
    icon: path.join(__dirname, "..", "public", "pwa-512.png"),
    show: false, // reveal on ready-to-show to avoid a white flash
    autoHideMenuBar: true,
    // Spotify/Discord-style: no separate title bar. The native min/max/close
    // controls are drawn as a transparent overlay in the top-right so they sit
    // directly over the app's own nav pill, which serves as the drag handle
    // (see -webkit-app-region in index.css). The symbol color starts dark (the
    // app's default light theme) and is updated per-theme at runtime via the
    // "titlebar-overlay" IPC below so the glyphs stay legible in both modes.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "rgba(0, 0, 0, 0)", // transparent — the nav shows through
      symbolColor: "#2a2722",
      height: 52,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Service workers don't run over file://; the app works fine without
      // one in the packaged shell (all assets are local already).
    },
  });

  // No application menu (a native desktop app, not a browser).
  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external http(s) links in the user's real browser instead of a new
  // Electron window (security + expected behavior for outbound links).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  // Same for in-page navigations to external origins.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = DEV_SERVER_URL || "file://";
    if (!url.startsWith(current) && (url.startsWith("http://") || url.startsWith("https://"))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Auto-update via electron-updater (GitHub Releases as the update server).
// Only meaningful in a packaged app — in electron:dev there's no installer to
// swap, and autoUpdater would just error, so we skip it entirely. The renderer
// is told when an update is available and when it's finished downloading so it
// can show a subtle, non-blocking banner; clicking it sends "quit-and-install".
function setupAutoUpdates(win) {
  if (!app.isPackaged) {
    // Dev: nothing to update. Skip gracefully.
    return;
  }
  // Download in the background; we surface the "restart to install" prompt in
  // the UI rather than auto-quitting.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel, payload) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  autoUpdater.on("checking-for-update", () => send("update-checking"));
  autoUpdater.on("update-available", (info) =>
    send("update-available", { version: info?.version })
  );
  autoUpdater.on("update-not-available", () => send("update-none"));
  autoUpdater.on("download-progress", (p) =>
    send("update-progress", { percent: Math.round(p?.percent || 0) })
  );
  autoUpdater.on("update-downloaded", (info) =>
    send("update-downloaded", { version: info?.version })
  );
  autoUpdater.on("error", (err) =>
    send("update-error", String(err && err.message ? err.message : err))
  );

  // Silent check on startup; nothing is shown unless an update turns up.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    /* offline / no releases yet — stay silent */
  });
}

app.whenReady().then(() => {
  createWindow();

  // Renderer clicked "restart to install" — swap in the downloaded update.
  ipcMain.on("quit-and-install", () => {
    try {
      autoUpdater.quitAndInstall();
    } catch {
      /* not packaged / nothing downloaded — ignore */
    }
  });

  // Manual "Check for updates" from Settings → About. Resolves with a plain
  // status; progress/downloaded events stream separately (setupAutoUpdates).
  ipcMain.handle("updates:check", async () => {
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    try {
      const res = await autoUpdater.checkForUpdates();
      return { ok: true, version: res?.updateInfo?.version || null };
    } catch (err) {
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  });

  // Kick off the background update check once the window exists.
  setupAutoUpdates(mainWindow);

  // The renderer flips the window-controls glyph color to match the active
  // theme (light nav → dark glyphs, dark nav → light glyphs). Fire-and-forget;
  // guarded so a malformed payload or unsupported platform can't crash.
  ipcMain.on("titlebar-overlay", (_event, opts) => {
    if (mainWindow && opts && typeof opts === "object") {
      try {
        mainWindow.setTitleBarOverlay(opts);
      } catch {
        /* setTitleBarOverlay is Windows/Linux only — ignore elsewhere */
      }
    }
  });

  // ---- Focus-mode website blocker (Windows hosts file) ----
  // Reading is unprivileged; apply/clear elevate only when needed (see
  // appBlocker.js). All three are async and return a plain status object.
  ipcMain.handle("blocker:status", () => appBlocker.status());
  ipcMain.handle("blocker:apply", (_e, domains) => appBlocker.apply(domains || []));
  ipcMain.handle("blocker:clear", () => appBlocker.clear());

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Always restore sites on exit — the block is only meant to hold while Ligand
// is open. Best-effort and only when a block is actually present (so a normal
// quit never triggers a UAC prompt). A crash can't run this; the renderer
// reconciles a leftover block on next launch via blocker:status.
app.on("before-quit", (event) => {
  if (process.platform !== "win32" || !appBlocker.hasBlock()) return;
  event.preventDefault();
  appBlocker.clear().finally(() => app.exit(0));
});

// Quit when all windows are closed, except on macOS where apps stay resident
// until the user explicitly quits (Cmd+Q).
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
