import { useEffect, useState } from "react";

/**
 * OfflineBanner - appears at the bottom when the browser reports offline status.
 * Dismisses automatically when the connection returns.
 * Friendly, not alarming. Ligand's local data is always safe.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onOnline  = () => { setOffline(false); setDismissed(false); };
    const onOffline = () => { setOffline(true);  setDismissed(false); };
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div
      className="offline-banner"
      role="status"
      aria-live="polite"
    >
      <span className="offline-banner-text">
        You're offline - your data is safe and the app still works.
      </span>
      <button
        className="offline-banner-close"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ✕
      </button>
    </div>
  );
}
