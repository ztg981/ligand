// Electron main process for Ligand.
//
// Wraps the same Vite-built web app in a native desktop window. In dev it
// loads the live Vite server (http://localhost:5173); when packaged it loads
// the built files from dist/index.html over file:// (which is why vite.config
// uses base "./" so asset paths stay relative). The web/PWA build is
// unchanged — this is an additional shell, not a replacement.
const { app, BrowserWindow, Menu, Tray, shell, ipcMain, nativeImage } = require("electron");
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

app.setName("Ligand");

// Close-to-tray means the first Ligand process often remains alive after its
// window is closed. Never let a shortcut click start a second independent app
// instance: Chromium profiles (including Supabase's persisted auth session)
// are not safe to open from multiple processes at once.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// Windows requires an explicit AppUserModelID for renderer-fired HTML5
// notifications (new Notification(...)) to surface as native toasts and to
// group under the app's Start-menu shortcut. Must match the electron-builder
// appId. Without this, Pomodoro/alarm notifications silently never appear on
// Windows. No-op on other platforms.
if (process.platform === "win32") {
  app.setAppUserModelId("com.ligand.app");
}

let mainWindow = null;
let tray = null;
// True once the user really means to leave (tray → Quit, updater restart, OS
// shutdown). Until then, closing the window just hides it (see "close" below).
let quitting = false;
// Mirrors settings.desktop.closeToTray in the renderer; synced over IPC so the
// close handler works even though main can't read localStorage.
let closeToTray = true;

// Started with --hidden (login launch): create the window but keep it tucked
// in the tray until the user asks for it.
const startHidden = process.argv.includes("--hidden");

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    // A shortcut click while Ligand is already in the tray should reveal the
    // existing window, not create another renderer/profile owner.
    if (app.isReady()) showMainWindow();
  });
}

function createApplicationMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Check for Updates...",
          click: () => {
            showMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("update-checking");
              autoUpdater.checkForUpdates().catch(() => {});
            }
          },
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Ligand Documentation",
          click: () => shell.openExternal("https://ligand.app"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The tray icon is what keeps Ligand alive (and reminders/alarms firing)
// after the window closes.
function createTray() {
  if (tray) return;
  const isMac = process.platform === "darwin";
  const iconFileName = isMac ? "pwa-512.png" : "ligand.ico";
  const iconPath = app.isPackaged
    ? path.join(__dirname, "..", "dist", iconFileName)
    : path.join(__dirname, "..", "public", iconFileName);

  let trayImage;
  if (isMac) {
    trayImage = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    trayImage.setTemplateImage(true);
  } else {
    trayImage = iconPath;
  }

  try {
    tray = new Tray(trayImage);
  } catch {
    // Missing icon or unsupported environment — app still works, it just
    // quits on close like before.
    tray = null;
    return;
  }
  tray.setToolTip("Ligand");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Ligand", click: showMainWindow },
      { type: "separator" },
      {
        label: "Quit Ligand",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", showMainWindow);
}

function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    resizable: true,
    backgroundColor: THEME_BG,
    title: "Ligand",
    icon: app.isPackaged
      ? path.join(__dirname, "..", "dist", isMac ? "pwa-512.png" : "ligand.ico")
      : path.join(__dirname, "..", "public", isMac ? "pwa-512.png" : "ligand.ico"),
    show: false, // reveal on ready-to-show to avoid a white flash
    autoHideMenuBar: !isMac,
    frame: !isMac ? false : true,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Service workers don't run over file://; the app works fine without
      // one in the packaged shell (all assets are local already).
    },
  });

  createApplicationMenu();

  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });

  // Close-to-tray: while the tray exists and the setting is on, closing the
  // window HIDES it instead of quitting. The renderer keeps running, so the
  // daily reminder, alarms, and Pomodoro can still notify — the whole point
  // of tray residency. Quit for real from the tray menu.
  mainWindow.on("close", (event) => {
    if (!quitting && closeToTray && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  const sendMaximized = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window:maximized", mainWindow.isMaximized());
    }
  };
  mainWindow.on("maximize", sendMaximized);
  mainWindow.on("unmaximize", sendMaximized);

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

  mainWindow.webContents.on("found-in-page", (event, result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("find:result", result);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Auto-update via electron-updater (GitHub Releases as the update server).
function setupAutoUpdates(win) {
  if (!app.isPackaged) {
    // Dev: nothing to update. Skip gracefully.
    return;
  }
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

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    /* offline / no releases yet — stay silent */
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  createTray();
  createWindow();

  ipcMain.on("desktop:configure", (_event, cfg = {}) => {
    closeToTray = cfg.closeToTray !== false;
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(cfg.launchAtLogin),
        args: ["--hidden"],
      });
    }
  });

  ipcMain.on("window:show", showMainWindow);

  ipcMain.on("quit-and-install", () => {
    try {
      quitting = true;
      autoUpdater.quitAndInstall();
    } catch {
      /* not packaged / nothing downloaded — ignore */
    }
  });

  ipcMain.handle("updates:check", async () => {
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    try {
      const res = await autoUpdater.checkForUpdates();
      return { ok: true, version: res?.updateInfo?.version || null };
    } catch (err) {
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  });

  setupAutoUpdates(mainWindow);

  ipcMain.on("window:control", (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (action === "minimize") win.minimize();
    else if (action === "maximize") {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (action === "close") win.close();
  });
  ipcMain.handle("window:is-maximized", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return Boolean(win && !win.isDestroyed() && win.isMaximized());
  });

  // ---- Find in Page ----
  ipcMain.on("find:in-page", (event, text, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.findInPage(text, options || {});
  });
  ipcMain.on("find:stop", (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.stopFindInPage(action || "clearSelection");
  });

  // ---- Focus-mode website blocker ----
  ipcMain.handle("blocker:status", () => appBlocker.status());
  ipcMain.handle("blocker:apply", (_e, domains) => appBlocker.apply(domains || []));
  ipcMain.handle("blocker:clear", () => appBlocker.clear());

  // macOS: clicking the dock icon re-shows (or re-creates) the window.
  app.on("activate", showMainWindow);
});

// Any real quit path (tray menu, updater restart, OS shutdown, Cmd+Q) flips
// the flag so the window's close-to-tray handler steps aside.
app.on("before-quit", () => {
  quitting = true;
});

// Always restore sites on exit
app.on("before-quit", (event) => {
  if (!appBlocker.hasBlock()) return;
  event.preventDefault();
  appBlocker.clear().finally(() => app.exit(0));
});

// Quit when all windows are closed, except on macOS where apps stay resident
// until the user explicitly quits (Cmd+Q).
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
