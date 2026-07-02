import { useEffect, useState } from "react";

/* Detects whether the app is running inside the Electron desktop shell (via
   the read-only bridge exposed in electron/preload.js) versus a normal
   browser / PWA. Also stamps <html data-electron / data-electron-platform>
   so CSS can make room for the custom titlebar. In the browser this is inert:
   window.electron is undefined, so isElectron is false and nothing changes. */
export function useElectron() {
  const [info] = useState(() => {
    const api = typeof window !== "undefined" ? window.electron : null;
    return {
      isElectron: !!api?.isElectron,
      platform: api?.platform || null,
    };
  });

  useEffect(() => {
    const root = document.documentElement;
    if (info.isElectron) {
      root.dataset.electron = "true";
      if (info.platform) root.dataset.electronPlatform = info.platform;
    }
    return () => {
      delete root.dataset.electron;
      delete root.dataset.electronPlatform;
    };
  }, [info.isElectron, info.platform]);

  return info;
}

export default useElectron;
