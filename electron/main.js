// Electron main process for Ligand.
//
// Wraps the same Vite-built web app in a native desktop window. In dev it
// loads the live Vite server (http://localhost:5173); when packaged it loads
// the built files from dist/index.html over file:// (which is why vite.config
// uses base "./" so asset paths stay relative). The web/PWA build is
// unchanged — this is an additional shell, not a replacement.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

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
    // Hidden native title bar with an overlay that keeps the min/max/close
    // controls but paints them to match the dark theme (Windows/Linux). On
    // macOS this yields the inset traffic-light buttons over our content.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: THEME_BG,
      symbolColor: THEME_INK,
      height: 40,
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

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS where apps stay resident
// until the user explicitly quits (Cmd+Q).
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
