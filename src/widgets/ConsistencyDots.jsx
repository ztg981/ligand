import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey } from "../lib/model.js";

/* ConsistencyDots — a 14-day focus "did I show up" strip.

   Sequential single-hue encoding: emptier days are faint, heavier days deepen
   toward the accent (magnitude → one hue, light→dark, per the viz rules). It's
   deliberately a longer, coarser view than FocusTrend's 7 exact bars — this one
   answers "am I keeping a chain going?" not "how many minutes Tuesday?".

   Colour is never the only signal: every cell has a text tooltip and the whole
   strip is mirrored to a visually-hidden list for screen readers. */

const DAYS = 14;

// Four magnitude steps → an accent-tinted ramp. Level 0 is an empty track.
function levelFor(min) {
  if (min <= 0) return 0;
  if (min < 20) return 1;
  if (min < 45) return 2;
  if (min < 90) return 3;
  return 4;
}

function buildDays(focusLog, todayStr) {
  const totals = new Map();
  for (const e of focusLog) {
    if (!e?.date) continue;
    totals.set(e.date, (totals.get(e.date) || 0) + (e.minutes || 0));
  }
  const base = new Date(`${todayStr}T00:00:00`);
  const out = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = todayKey(d); // local key, matches the rest of the app
    const min = totals.get(key) || 0;
    out.push({
      key,
      min,
      level: levelFor(min),
      dateLabel: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      isToday: i === 0,
    });
  }
  return out;
}

// Consecutive days with any focus, counting back from today.
function currentStreak(days) {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].min > 0) n++;
    else break;
  }
  return n;
}

export default function ConsistencyDots({ focusLog = [] }) {
  const today = todayKey();
  const days = useMemo(() => buildDays(focusLog, today), [focusLog, today]);
  const streak = currentStreak(days);
  const activeCount = days.filter((d) => d.min > 0).length;

  return (
    <div className="card consistency-card">
      <div className="card-head">
        <div className="card-title"><Icon.Flame /> Focus consistency</div>
        {streak > 0 && (
          <span className="consistency-streak" title="Days in a row with focus">
            {streak}-day chain
          </span>
        )}
      </div>

      <div className="consistency-strip" role="img"
        aria-label={`Focus over the last ${DAYS} days: ${activeCount} active days, current streak ${streak} days.`}>
        {days.map((d, i) => (
          <span
            key={d.key}
            className={"consistency-cell lvl-" + d.level + (d.isToday ? " today" : "")}
            style={{ "--i": i }}
            title={`${d.dateLabel}: ${d.min > 0 ? d.min + " min" : "no focus"}`}
          />
        ))}
      </div>

      <div className="consistency-legend">
        <span className="consistency-legend-lbl">14 days ago</span>
        <span className="consistency-legend-ramp" aria-hidden="true">
          <span className="consistency-cell lvl-0" />
          <span className="consistency-cell lvl-1" />
          <span className="consistency-cell lvl-2" />
          <span className="consistency-cell lvl-3" />
          <span className="consistency-cell lvl-4" />
        </span>
        <span className="consistency-legend-lbl">today</span>
      </div>

      {/* Screen-reader mirror — identity is never colour-alone. */}
      <ul className="visually-hidden">
        {days.map((d) => (
          <li key={d.key}>{d.dateLabel}: {d.min} minutes focused</li>
        ))}
      </ul>
    </div>
  );
}
