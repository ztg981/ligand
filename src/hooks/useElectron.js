import { useEffect, useState } from "react";

/* Detects whether the app is running inside the Electron desktop shell (via
   the read-only bridge exposed in electron/preload.js) versus a normal
   browser / PWA. Also stamps <html data-electron / data-electron-platform>
   so CSS can turn the app's own nav pill into the window's drag handle and
   clear space for the native window controls. In the browser this is inert:
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

  // Keep the native window-controls overlay legible against whichever theme is
  // active: dark glyphs on the light nav, light glyphs on the dark nav. The
  // overlay stays transparent so the nav shows through behind the buttons. We
  // watch <html data-theme>, which App drives, and re-apply on every change.
  useEffect(() => {
    if (!info.isElectron || !window.electron?.setTitleBarOverlay) return;
    const root = document.documentElement;
    const apply = () => {
      const dark = root.dataset.theme === "dark";
      window.electron.setTitleBarOverlay({
        color: "rgba(0, 0, 0, 0)",
        symbolColor: dark ? "#f0eeec" : "#2a2722",
        height: 52,
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [info.isElectron]);

  return info;
}

export default useElectron;
