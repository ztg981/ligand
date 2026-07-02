import { useElectron } from "../hooks/useElectron.js";

/* A slim custom titlebar shown only in the Electron desktop shell. The native
   title bar is hidden (titleBarStyle: "hidden" in electron/main.js) and the OS
   draws just the min/max/close controls as an overlay in the top corner; this
   strip fills the rest of that band with the app identity and, crucially, a
   draggable region (-webkit-app-region: drag via .electron-titlebar) so the
   window can be moved. Mounted at the root (see main.jsx) so it's present on
   every screen — auth, loading, and the app itself. Renders nothing in the
   browser, where window.electron is undefined. */
export default function ElectronTitlebar() {
  const { isElectron } = useElectron();
  if (!isElectron) return null;
  return (
    <div className="electron-titlebar" role="presentation">
      <span className="electron-titlebar-brand">
        <span className="electron-titlebar-dot" aria-hidden="true" />
        Ligand
      </span>
    </div>
  );
}
