import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { fmtMinutes, screenLine, screenSeries } from "../lib/activities.js";
import { createActivity, todayKey } from "../lib/model.js";

/* ScreenTimeCard — self-noticed scroll time, handled like the sleep diary:
   describe, never judge. The OS knows your real screen time; this card
   tracks something more useful — the moments you CAUGHT yourself, which is
   the actual skill being built. Quick +15/+30 buttons make the log cost
   two seconds, and the 7-day bars show the noticing habit forming.

   Anti-shame rules (property-tested in lib/activities.js): no "wasted",
   no verdicts, high days described as information. */

export default function ScreenTimeCard({ activities = [], addActivity }) {
  const series = useMemo(() => screenSeries(activities, 7), [activities]);
  const todayMin = series.at(-1)?.minutes || 0;
  const max = Math.max(60, ...series.map((d) => d.minutes));

  const quickLog = (minutes) =>
    addActivity?.(
      createActivity({
        title: "Scrolling",
        category: "screen",
        date: todayKey(),
        durationMin: minutes,
      })
    );

  return (
    <div className="card sst">
      <div className="card-head">
        <div className="card-title"><Icon.Phone /> Screen check-ins</div>
        {todayMin > 0 && <span className="sst-today">{fmtMinutes(todayMin)} today</span>}
      </div>

      <div className="sst-bars" aria-hidden="true">
        {series.map((d) => (
          <div key={d.day} className="sst-col">
            <div
              className={"sst-bar" + (d.day === todayKey() ? " today" : "")}
              style={{ height: `${Math.max(d.minutes > 0 ? 8 : 2, (d.minutes / max) * 100)}%` }}
              title={`${d.day}: ${d.minutes ? fmtMinutes(d.minutes) : "nothing logged"}`}
            />
            <span className="sst-day">
              {new Date(d.day + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          </div>
        ))}
      </div>

      <p className="sst-line">{screenLine(todayMin, series)}</p>

      <div className="sst-actions">
        <span className="sst-actions-label">Caught myself scrolling:</span>
        <button className="btn ghost sm" onClick={() => quickLog(15)}>+15m</button>
        <button className="btn ghost sm" onClick={() => quickLog(30)}>+30m</button>
        <button className="btn ghost sm" onClick={() => quickLog(60)}>+1h</button>
      </div>

      {/* Screen-reader mirror of the bars. */}
      <ul className="visually-hidden">
        {series.map((d) => (
          <li key={d.day}>
            {d.day}: {d.minutes ? `${d.minutes} minutes noticed` : "nothing logged"}
          </li>
        ))}
      </ul>
    </div>
  );
}
