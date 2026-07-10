import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { moodSeries, moodDirection, moodLabel } from "../lib/mood.js";

/* MoodTrend — a gentle sparkline of your logged moods over time.

   Journal entries already carry an optional mood; this turns that quiet
   history into a shape you can feel, without ever showing a "score". The
   line runs oldest → newest (left → right = now), the last point is
   emphasized, and a soft direction word ("trending up") sits under it.
   Honest empty state before you've logged any moods. */

const W = 240;
const H = 56;
const PAD = 8;

const DIRECTION_COPY = {
  up: "Trending gently up",
  down: "Dipping a little lately",
  steady: "Holding steady",
};

export default function MoodTrend({ journal = [], onOpenJournal }) {
  const series = useMemo(() => moodSeries(journal, 14), [journal]);

  // Need at least two points to draw a line.
  if (series.length < 2) {
    return (
      <div className="card moodtrend-card">
        <div className="card-head">
          <div className="card-title"><Icon.Heart /> Mood trend</div>
          {onOpenJournal && (
            <button className="btn ghost sm" onClick={onOpenJournal} title="Open the journal">
              Journal <Icon.Arrow width={13} height={13} />
            </button>
          )}
        </div>
        <p className="moodtrend-empty">
          Log a mood with a journal entry or two and your trend appears here.
        </p>
      </div>
    );
  }

  const n = series.length;
  const stepX = (W - PAD * 2) / (n - 1);
  const y = (score) => {
    // score 1..5 → bottom..top, within padding
    const t = (score - 1) / 4;
    return H - PAD - t * (H - PAD * 2);
  };
  const pts = series.map((p, i) => ({ x: PAD + i * stepX, y: y(p.score), ...p }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // Area fill under the line for a softer look.
  const areaPath =
    `${linePath} L${pts[n - 1].x.toFixed(1)},${(H - PAD).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - PAD).toFixed(1)} Z`;

  const last = series[n - 1];
  const dir = moodDirection(series);

  return (
    <div className="card moodtrend-card">
      <div className="card-head">
        <div className="card-title"><Icon.Heart /> Mood trend</div>
        {onOpenJournal && (
          <button className="btn ghost sm" onClick={onOpenJournal} title="Open the journal">
            Journal <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>

      <div className="moodtrend-stat">
        <span className="moodtrend-latest">{moodLabel(last.value)}</span>
        <span className="moodtrend-sub">latest · {n} recent {n === 1 ? "entry" : "entries"}</span>
      </div>

      <svg
        className="moodtrend-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Mood over the last ${n} logged entries. Most recent: ${moodLabel(last.value)}.`}
        preserveAspectRatio="none"
      >
        <path className="moodtrend-area" d={areaPath} />
        <path className="moodtrend-line" d={linePath} />
        {pts.map((p, i) => (
          <circle
            key={i}
            className={"moodtrend-dot" + (i === n - 1 ? " last" : "")}
            cx={p.x}
            cy={p.y}
            r={i === n - 1 ? 3.4 : 2.2}
          >
            <title>{`${p.day}: ${moodLabel(p.value)}`}</title>
          </circle>
        ))}
      </svg>

      {dir && <p className="moodtrend-foot">{DIRECTION_COPY[dir]}</p>}

      {/* Screen-reader mirror — never rely on the line alone. */}
      <ul className="visually-hidden">
        {series.map((p, i) => (
          <li key={i}>{p.day}: {moodLabel(p.value)}</li>
        ))}
      </ul>
    </div>
  );
}
