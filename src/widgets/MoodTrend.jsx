import { useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import {
  MOOD_RANGES,
  moodDirection,
  moodLabel,
  moodSeries,
  moodTimeline,
} from "../lib/mood.js";

/* MoodTrend v2 — a real graph of your logged moods, with a zoom.

   Fixes over v1: the SVG kept its aspect (v1 stretched, so dots became
   smears), points sit on a TRUE time axis, and a soft dot-grid + five
   mood guide lines give the line something to live on. The range control
   zooms out with a small animation: two weeks (every entry), a month
   (daily averages), a year, or everything (weekly averages). Still no
   scores anywhere — the scale is words at the edges. */

const W = 560;
const H = 168;
const PAD_X = 16;
const PAD_TOP = 18;
const PAD_BOT = 24;

const DIRECTION_COPY = {
  up: "Trending gently up",
  down: "Dipping a little lately",
  steady: "Holding steady",
};

function fmtTick(ts, range) {
  const d = new Date(ts);
  if (range === "2w" || range === "1m") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function MoodTrend({ journal = [], onOpenJournal }) {
  const [range, setRange] = useState("2w");
  // Which way the last range change zoomed, for the animation direction.
  const [zoomDir, setZoomDir] = useState("out");
  const prevIdx = useRef(0);

  const { points } = useMemo(() => moodTimeline(journal, range), [journal, range]);
  const recent = useMemo(() => moodSeries(journal, 14), [journal]);

  const pickRange = (id) => {
    const from = prevIdx.current;
    const to = MOOD_RANGES.findIndex((r) => r.id === id);
    setZoomDir(to >= from ? "out" : "in");
    prevIdx.current = to;
    setRange(id);
  };

  const latest = recent.at(-1) || null;
  const dir = moodDirection(recent);

  const seg = (
    <div className="seg moodtrend-seg" role="tablist" aria-label="Time range">
      {MOOD_RANGES.map((r) => (
        <button
          key={r.id}
          role="tab"
          aria-selected={range === r.id}
          className={range === r.id ? "active" : ""}
          onClick={() => pickRange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (points.length < 2) {
    return (
      <div className="card moodtrend-card">
        <div className="card-head">
          <div className="card-title"><Icon.Heart /> Mood trend</div>
          {seg}
        </div>
        <p className="moodtrend-empty">
          {journal.some((e) => e.mood)
            ? "Not enough moods in this window yet. Zoom out, or keep logging."
            : "Log a mood with a journal entry or two and your trend appears here."}
        </p>
        {onOpenJournal && (
          <button className="btn ghost sm" onClick={onOpenJournal}>
            Open the journal <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>
    );
  }

  const t0 = points[0].t;
  const t1 = points.at(-1).t;
  const span = Math.max(1, t1 - t0);
  const x = (t) => PAD_X + ((t - t0) / span) * (W - PAD_X * 2);
  const y = (score) =>
    H - PAD_BOT - ((score - 1) / 4) * (H - PAD_TOP - PAD_BOT);

  const pts = points.map((p) => ({ ...p, x: x(p.t), y: y(p.score) }));
  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${pts.at(-1).x.toFixed(1)},${(H - PAD_BOT).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - PAD_BOT).toFixed(1)} Z`;

  // Three time ticks: start, middle, end.
  const ticks = [t0, t0 + span / 2, t1];

  return (
    <div className="card moodtrend-card">
      <div className="card-head">
        <div className="card-title"><Icon.Heart /> Mood trend</div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {seg}
          {onOpenJournal && (
            <button className="btn ghost sm" onClick={onOpenJournal} title="Open the journal">
              <Icon.Book width={13} height={13} />
            </button>
          )}
        </div>
      </div>

      {latest && (
        <div className="moodtrend-stat">
          <span className="moodtrend-latest">{moodLabel(latest.value)}</span>
          <span className="moodtrend-sub">
            latest · {points.length} {range === "2w" ? "entries" : "points"} shown
          </span>
        </div>
      )}

      {/* key=range remounts the plot so the zoom animation plays each switch */}
      <div key={range} className={"moodtrend-plot zoom-" + zoomDir}>
        <svg
          className="moodtrend-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Mood over this range. Most recent: ${latest ? moodLabel(latest.value) : "none"}.`}
        >
          <defs>
            <pattern id="mood-dots" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="1.2" cy="1.2" r="1.2" fill="var(--line)" />
            </pattern>
          </defs>
          <rect
            x={PAD_X / 2}
            y={PAD_TOP / 2}
            width={W - PAD_X}
            height={H - PAD_TOP / 2 - PAD_BOT / 2}
            fill="url(#mood-dots)"
            opacity="0.6"
          />
          {/* five mood guide lines */}
          {[1, 2, 3, 4, 5].map((s) => (
            <line
              key={s}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y(s)}
              y2={y(s)}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray={s === 3 ? "none" : "3 5"}
              opacity={s === 3 ? 0.8 : 0.5}
            />
          ))}
          <text x={PAD_X} y={y(5) - 5} className="moodtrend-guide">Great</text>
          {/* Above its line, not below, so it never collides with the
             bottom-left date tick. */}
          <text x={PAD_X} y={y(1) - 6} className="moodtrend-guide">Rough</text>

          <path className="moodtrend-area" d={areaPath} />
          <path className="moodtrend-line" pathLength="1" d={linePath} />
          {pts.map((p, i) => (
            <circle
              key={p.t}
              className={"moodtrend-dot" + (i === pts.length - 1 ? " last" : "")}
              cx={p.x}
              cy={p.y}
              r={i === pts.length - 1 ? 4 : pts.length > 40 ? 1.6 : 2.6}
            >
              <title>
                {`${new Date(p.t).toLocaleDateString()} · ${
                  p.count > 1 ? `${p.count} entries` : moodLabel(recentValueAt(p, recent)) || "logged"
                }`}
              </title>
            </circle>
          ))}
          {ticks.map((t, i) => (
            <text
              key={i}
              x={x(t)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              className="moodtrend-tick"
            >
              {fmtTick(t, range)}
            </text>
          ))}
        </svg>
      </div>

      {dir && <p className="moodtrend-foot">{DIRECTION_COPY[dir]}</p>}

      <ul className="visually-hidden">
        {pts.map((p) => (
          <li key={p.t}>
            {new Date(p.t).toLocaleDateString()}: mood level {p.score.toFixed(1)} of 5
          </li>
        ))}
      </ul>
    </div>
  );
}

// Best-effort label for single-entry points (exact value known only there).
function recentValueAt(point, recent) {
  const day = new Date(point.t).toISOString().slice(0, 10);
  return recent.find((r) => r.day === day)?.value || null;
}
