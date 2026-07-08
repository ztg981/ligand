import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";

/* TaskMomentum — a single-number "how much is cleared" ring.

   One headline (percent of tasks done) is a job for a hero number, not a chart;
   the ring is just its frame. The arc sweeps up from empty on mount and the
   percent counts up with it. Reduced motion jumps straight to the value. */

const R = 52;
const C = 2 * Math.PI * R; // circumference for stroke-dash math

function prefersReduced() {
  return (
    typeof document !== "undefined" &&
    (document.documentElement.getAttribute("data-reduce-motion") === "true" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

export default function TaskMomentum({ tasks = [], onOpenTasks }) {
  const { total, done, pct } = useMemo(() => {
    const t = tasks.length;
    const d = tasks.filter((x) => x.done).length;
    return { total: t, done: d, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [tasks]);

  // Animate both the arc sweep and the counter to the same target.
  const [shown, setShown] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    if (prefersReduced() || pct === 0) {
      rafRef.current = requestAnimationFrame(() => setShown(pct));
      return () => cancelAnimationFrame(rafRef.current);
    }
    const start = performance.now();
    const dur = 850;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(pct * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pct]);

  const offset = C - (C * shown) / 100;
  const remaining = total - done;

  return (
    <div className="card taskring-card">
      <div className="card-head">
        <div className="card-title"><Icon.CheckCircle /> Task momentum</div>
        {onOpenTasks && (
          <button className="btn ghost sm" onClick={onOpenTasks} title="Open tasks">
            Tasks <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>

      {total === 0 ? (
        <p className="taskring-empty">
          No tasks yet. Capture a few and watch this fill as you clear them.
        </p>
      ) : (
        <div className="taskring-wrap">
          <svg className="taskring" viewBox="0 0 128 128" role="img"
            aria-label={`${done} of ${total} tasks done, ${pct} percent`}>
            <circle cx="64" cy="64" r={R} className="taskring-track" />
            <circle
              cx="64" cy="64" r={R}
              className="taskring-arc"
              strokeDasharray={C}
              strokeDashoffset={offset}
              transform="rotate(-90 64 64)"
            />
            <text x="64" y="60" textAnchor="middle" className="taskring-pct">{shown}%</text>
            <text x="64" y="80" textAnchor="middle" className="taskring-cap">done</text>
          </svg>

          <div className="taskring-side">
            <div className="taskring-line">
              <span className="taskring-dot done" /> {done} cleared
            </div>
            <div className="taskring-line">
              <span className="taskring-dot open" /> {remaining} to go
            </div>
            <div className="taskring-note">
              {pct === 100
                ? "Everything's clear. Enjoy it."
                : remaining === 1
                  ? "Just one left — go finish strong."
                  : `${remaining} open across your lists.`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
