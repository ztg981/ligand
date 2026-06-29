import { useEffect, useMemo } from "react";
import { Icon } from "./Icons.jsx";
import { ding } from "../lib/uiSounds.js";

/* A full celebratory moment when a badge unlocks. Dark overlay, a large
   glowing/pulsing badge, the name + description, a warm personal line, and a
   CSS particle burst (no external library). Plays the existing chime on show.
   Shows one badge at a time; dismissing advances to the next in the queue. */

const CONFETTI_COLORS = [
  "var(--accent)",
  "oklch(0.78 0.13 var(--hue-amb))",
  "oklch(0.72 0.14 var(--hue-mint))",
  "oklch(0.7 0.13 var(--hue-lav))",
  "oklch(0.72 0.14 var(--hue-rose))",
];

function Confetti() {
  // Precompute particle trajectories once per mount.
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.4;
        const dist = 90 + Math.random() * 120;
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist - 30, // bias upward
          rot: (Math.random() - 0.5) * 720,
          delay: Math.random() * 0.12,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          round: i % 3 === 0,
        };
      }),
    []
  );

  return (
    <div className="badge-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={"confetti-piece" + (p.round ? " round" : "")}
          style={{
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
            "--rot": `${p.rot}deg`,
            "--delay": `${p.delay}s`,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

export default function BadgeCelebration({ queue = [], onDismiss }) {
  const badge = queue[0] || null;

  // Chime once per badge shown (keyed on id).
  useEffect(() => {
    if (!badge) return;
    try {
      ding();
    } catch {
      /* sound is best-effort */
    }
  }, [badge?.id]);

  // Allow Enter/Escape to dismiss.
  useEffect(() => {
    if (!badge) return;
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") onDismiss(badge.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [badge, onDismiss]);

  if (!badge) return null;
  const IconCmp = Icon[badge.icon] || Icon.Star;
  const remaining = queue.length - 1;

  return (
    <div
      className="badge-cele-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-cele-name"
      onMouseDown={() => onDismiss(badge.id)}
    >
      <div className="badge-cele-card" onMouseDown={(e) => e.stopPropagation()}>
        <Confetti />
        <div className="badge-cele-eyebrow">Badge unlocked</div>
        <div className="badge-cele-medal">
          <span className="badge-cele-glow" aria-hidden="true" />
          <span className="badge-cele-ic">
            <IconCmp />
          </span>
        </div>
        <h2 id="badge-cele-name" className="badge-cele-name">
          {badge.name}
        </h2>
        <div className="badge-cele-desc">{badge.desc}</div>
        <div className="badge-cele-message">{badge.message}</div>
        <button
          type="button"
          className="btn primary badge-cele-btn"
          onClick={() => onDismiss(badge.id)}
          autoFocus
        >
          {remaining > 0 ? `Nice · ${remaining} more` : "Nice"}
        </button>
      </div>
    </div>
  );
}
