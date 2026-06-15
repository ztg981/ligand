import { useEffect } from "react";
import { Icon } from "./Icons.jsx";

/* A gentle, auto-dismissing toast shown when a badge unlocks. Tapping it
   dismisses early. Motion is handled by CSS and respects the global
   reduced-motion rule. */
function Toast({ badge, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(badge.id), 4500);
    return () => clearTimeout(t);
  }, [badge.id, onDismiss]);

  const IconCmp = Icon[badge.icon] || Icon.Star;
  return (
    <div
      className="badge-toast"
      role="status"
      onClick={() => onDismiss(badge.id)}
      title="Dismiss"
    >
      <span className="badge-toast-ic">
        <IconCmp />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="badge-toast-title">Badge unlocked · {badge.name}</div>
        <div className="badge-toast-desc">{badge.desc}</div>
      </div>
    </div>
  );
}

export default function BadgeToast({ queue = [], onDismiss }) {
  if (!queue.length) return null;
  return (
    <div className="badge-toast-stack" aria-live="polite">
      {queue.map((b) => (
        <Toast key={b.id} badge={b} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
