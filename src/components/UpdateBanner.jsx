import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";

/* UpdateBanner - a subtle, non-blocking "an update is ready" prompt for the
   packaged Electron app. It listens for the main process's update-downloaded
   IPC event (wired in electron/preload.js + main.js via electron-updater) and,
   only then, shows a small fixed banner. Clicking it restarts into the new
   version. Completely inert on the web/PWA build and in electron:dev, where
   window.electron.onUpdateDownloaded doesn't exist / never fires. */
export default function UpdateBanner() {
  const [ready, setReady] = useState(null); // { version } once downloaded
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const el = typeof window !== "undefined" ? window.electron : null;
    if (!el?.onUpdateDownloaded) return undefined; // not the desktop shell
    // Returns an unsubscribe fn (see preload).
    return el.onUpdateDownloaded((info) => setReady(info || {}));
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <button
        className="update-banner-main"
        onClick={() => window.electron?.quitAndInstall()}
        title="Restart to install the update"
      >
        <span className="update-banner-ic"><Icon.Cloud /></span>
        <span className="update-banner-text">
          Update ready{ready.version ? ` — v${ready.version}` : ""}. Restart to install.
        </span>
        <span className="update-banner-cta"><Icon.Reset width={14} height={14} /> Restart</span>
      </button>
      <button
        className="update-banner-x"
        title="Later"
        onClick={() => setDismissed(true)}
      >
        <Icon.Close />
      </button>
    </div>
  );
}
