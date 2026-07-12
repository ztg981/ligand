import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";

export default function WindowControls({ standalone = false }) {
  const controls =
    typeof window !== "undefined" ? window.electron?.windowControls : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return undefined;
    let active = true;
    controls.isMaximized?.().then((value) => {
      if (active) setMaximized(Boolean(value));
    });
    const unsubscribe = controls.onMaximizedChange?.(setMaximized);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [controls]);

  if (!controls) return null;
  return (
    <div
      className={"window-controls" + (standalone ? " window-controls-standalone" : "")}
      aria-label="Window controls"
    >
      <button className="window-control" title="Minimize" onClick={controls.minimize}>
        <span className="window-minimize" />
      </button>
      <button
        className="window-control"
        title={maximized ? "Restore" : "Maximize"}
        onClick={controls.toggleMaximize}
      >
        <span className={maximized ? "window-restore" : "window-maximize"} />
      </button>
      <button className="window-control close" title="Close" onClick={controls.close}>
        <Icon.Close />
      </button>
    </div>
  );
}

export function StandaloneWindowChrome() {
  return (
    <>
      <div className="electron-drag-strip" aria-hidden="true" />
      <WindowControls standalone />
    </>
  );
}
