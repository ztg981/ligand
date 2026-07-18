import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import Select from "../components/Select.jsx";
import {
  computeStats,
  focusSeries,
  focusByGoal,
  activityBreakdown,
  activeDayCount,
  fmtMinutes,
} from "../lib/stats.js";

/* Stats — the "how am I actually doing?" screen, reachable from the avatar
   menu. Everything is read from the same per-date logs the rest of the app
   writes (focus, pauses, workouts, activities, journal, sleep), so it's an
   honest mirror of real history over a chosen window. Calm, encouraging,
   never a report card. */

const WINDOWS = [
  { value: 7, label: "This week" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 3 months" },
  { value: 365, label: "This year" },
];

function StatTile({ icon, value, label, sub, accent }) {
  return (
    <div className={"stat-tile" + (accent ? " accent" : "")}>
      <span className="stat-tile-ic">{icon}</span>
      <div className="stat-tile-val">{value}</div>
      <div className="stat-tile-lbl">{label}</div>
      {sub && <div className="stat-tile-sub">{sub}</div>}
    </div>
  );
}

function Sparkline({ series, height = 44 }) {
  const max = Math.max(30, ...series.map((p) => p.minutes));
  const W = 240;
  const stepX = series.length > 1 ? W / (series.length - 1) : W;
  const pts = series.map((p, i) => [i * stepX, height - (p.minutes / max) * (height - 6) - 3]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${height} L0,${height} Z`;
  return (
    <svg className="stat-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} className="stat-spark-area" />
      <path d={line} className="stat-spark-line" pathLength="1" />
    </svg>
  );
}

export default function Stats({ data = {}, sleepLog = [], onOpenPomodoro }) {
  const [windowDays, setWindowDays] = useState(7);

  const s = useMemo(() => computeStats(data, sleepLog, windowDays), [data, sleepLog, windowDays]);
  const spark = useMemo(() => focusSeries(data.focusLog || [], Math.min(30, windowDays), undefined), [data.focusLog, windowDays]);
  const byGoal = useMemo(() => focusByGoal(data.focusLog || [], data.goals || [], windowDays), [data.focusLog, data.goals, windowDays]);
  const breakdown = useMemo(() => activityBreakdown(data.activities || [], windowDays), [data.activities, windowDays]);
  const activeDays = useMemo(() => activeDayCount(data, windowDays), [data, windowDays]);

  const maxGoalMin = byGoal[0]?.minutes || 1;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your numbers</div>
          <h1 className="page-title">Stats</h1>
          <p className="page-sub">
            An honest mirror of what you've actually been doing. No grades,
            just the shape of your time.
          </p>
        </div>
        <Select
          className="stats-window"
          ariaLabel="Time window"
          align="right"
          value={windowDays}
          onChange={(v) => setWindowDays(Number(v))}
          options={WINDOWS}
        />
      </div>

      {/* Headline tiles */}
      <div className="stat-grid">
        <StatTile
          accent
          icon={<Icon.Timer />}
          value={fmtMinutes(s.focusMin) || "0m"}
          label="Focused"
          sub={s.pauseMin > 0 ? `${fmtMinutes(s.pauseMin)} paused` : "keep it going"}
        />
        <StatTile
          icon={<Icon.Dumbbell />}
          value={s.workoutCount}
          label={s.workoutCount === 1 ? "Workout" : "Workouts"}
          sub={s.trainedMin > 0 ? `${fmtMinutes(s.trainedMin)} trained` : null}
        />
        <StatTile
          icon={<Icon.Spark />}
          value={s.activityCount}
          label="Things logged"
          sub={s.movingMin > 0 ? `${fmtMinutes(s.movingMin)} moving` : null}
        />
        <StatTile
          icon={<Icon.Check />}
          value={s.tasksDone}
          label="Tasks done"
        />
        <StatTile
          icon={<Icon.Flame />}
          value={activeDays}
          label="Active days"
          sub="days you did something"
        />
        <StatTile
          icon={<Icon.Moon />}
          value={s.sleepAvgMin ? fmtMinutes(s.sleepAvgMin) : "—"}
          label="Avg sleep"
        />
        <StatTile
          icon={<Icon.Book />}
          value={s.journalCount}
          label={s.journalCount === 1 ? "Journal entry" : "Journal entries"}
        />
        <StatTile
          icon={<Icon.Phone />}
          value={s.screenMin ? fmtMinutes(s.screenMin) : "—"}
          label="Scrolling noticed"
        />
      </div>

      <div className="grid grid-12 stats-body">
        {/* Focus over time */}
        <div className="col-7" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><Icon.Timer /> Focus over time</div>
              {onOpenPomodoro && (
                <button className="btn ghost sm" onClick={onOpenPomodoro}>
                  Focus <Icon.Arrow width={13} height={13} />
                </button>
              )}
            </div>
            {s.focusMin > 0 ? (
              <>
                <div className="stats-bighead">
                  {fmtMinutes(s.focusMin)}
                  <span className="stats-bighead-sub">focused {WINDOWS.find((w) => w.value === windowDays)?.label.toLowerCase()}</span>
                </div>
                <Sparkline series={spark} />
              </>
            ) : (
              <p className="dp-empty">No focus logged in this window yet. Start a Pomodoro or log a work/study activity.</p>
            )}
          </div>

          {/* Time by goal */}
          {byGoal.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 10 }}><Icon.Target /> Time by goal</div>
              <div className="stats-bars">
                {byGoal.slice(0, 6).map((g) => (
                  <div key={g.goalId} className="stats-bar-row">
                    <span className="stats-bar-name">{g.name}</span>
                    <span className="stats-bar-track">
                      <span
                        className="stats-bar-fill"
                        style={{ width: `${Math.max(4, (g.minutes / maxGoalMin) * 100)}%`, background: g.color }}
                      />
                    </span>
                    <span className="stats-bar-val mono">{fmtMinutes(g.minutes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* How the time was spent */}
        <div className="col-5" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}><Icon.Spark /> Where the time went</div>
            {breakdown.length > 0 ? (
              <>
                <div className="stats-donutbar" aria-hidden="true">
                  {breakdown.map((c) => (
                    <span key={c.id} style={{ width: `${c.pct}%`, background: c.color }} title={`${c.name}: ${c.pct}%`} />
                  ))}
                </div>
                <div className="stats-legend">
                  {breakdown.map((c) => (
                    <div key={c.id} className="stats-legend-row">
                      <span className="stats-legend-dot" style={{ background: c.color }} />
                      <span className="stats-legend-name">{c.emoji} {c.name}</span>
                      <span className="stats-legend-val mono">{fmtMinutes(c.minutes)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="dp-empty">Log a few activities and this fills in with how your time actually splits.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
