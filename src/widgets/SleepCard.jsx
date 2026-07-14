import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey } from "../lib/model.js";
import {
  buildNights,
  sleepStats,
  durationLabel,
  wakeConsistencyLine,
  nightLine,
  QUALITY_LABELS,
} from "../lib/sleep.js";

/* SleepCard — the diary's home on the dashboard.

   14 nights as bars (height = duration, depth of tint = how it felt),
   an average line, last night in words, and the CBT-I anchor stat:
   wake-time steadiness. Unlogged nights are simply empty slots — the
   diary never scolds a gap (same pause-don't-shatter rule as habits). */

const DAYS = 14;
const MAX_MIN = 12 * 60; // bar scale ceiling: 12h reads as "full"

export default function SleepCard({ sleepLog = [], onLogSleep }) {
  const today = todayKey();
  const nights = useMemo(() => buildNights(sleepLog, DAYS, today), [sleepLog, today]);
  const stats = useMemo(() => sleepStats(sleepLog, DAYS, today), [sleepLog, today]);

  const todayEntry = nights[nights.length - 1]?.entry || null;
  const lastLogged = [...nights].reverse().find((n) => n.entry)?.entry || null;
  const wakeLine = wakeConsistencyLine(stats.wake);
  const avgPct = stats.avgMin ? Math.min(100, (stats.avgMin / MAX_MIN) * 100) : null;

  return (
    <div className="card sleep-card">
      <div className="card-head">
        <div className="card-title"><Icon.Moon /> Sleep</div>
        {onLogSleep && (
          <button className="btn ghost sm" onClick={onLogSleep}>
            {todayEntry ? "Edit" : "Log last night"}
          </button>
        )}
      </div>

      {stats.count === 0 ? (
        <p className="sleep-empty">
          No nights logged yet. One entry each morning — two taps — and this
          fills into your own sleep picture.
        </p>
      ) : (
        <>
          <div className="sleep-chart" role="img"
            aria-label={`Last ${DAYS} nights: ${stats.count} logged, average ${durationLabel(stats.avgMin)}.`}>
            {avgPct != null && (
              <span
                className="sleep-avg-line"
                style={{ bottom: `${avgPct}%` }}
                title={`Average: ${durationLabel(stats.avgMin)}`}
              />
            )}
            {nights.map((n) => {
              const pct = n.min ? Math.min(100, (n.min / MAX_MIN) * 100) : 0;
              const label = new Date(`${n.key}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "short", month: "short", day: "numeric",
              });
              return (
                <span
                  key={n.key}
                  className={
                    "sleep-bar" +
                    (n.entry ? ` q${n.entry.quality}` : " empty") +
                    (n.isToday ? " today" : "")
                  }
                  style={{ "--h": `${pct}%` }}
                  title={
                    n.entry
                      ? `${label}: ${durationLabel(n.min)} · ${QUALITY_LABELS[n.entry.quality]}`
                      : `${label}: not logged`
                  }
                />
              );
            })}
          </div>
          <div className="sleep-chart-lbls">
            <span>14 nights ago</span>
            <span>
              avg {durationLabel(stats.avgMin)}
              {stats.count >= 3 ? ` · ${stats.count} logged` : ""}
            </span>
          </div>

          {lastLogged && <p className="sleep-lastline">{nightLine(lastLogged)}</p>}
          {wakeLine && <p className="sleep-wakeline">{wakeLine}</p>}

          <ul className="visually-hidden">
            {nights.map((n) => (
              <li key={n.key}>
                {n.key}: {n.entry ? `${durationLabel(n.min)}, ${QUALITY_LABELS[n.entry.quality]}` : "not logged"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
