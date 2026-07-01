import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { workoutVolume, todayKey, shiftDay } from "../lib/model.js";
import { MUSCLE_LABEL } from "../lib/exercises.js";

/* FitnessProgress — the analytics view for a Fitness goal:
     - weekly / monthly summary (sessions + volume)
     - muscle-group balance (last 28 days volume per group)
     - per-exercise weight-over-time + volume-over-time sparklines
     - optional body stats (weight / body fat %) with a simple trend
   All charts are hand-rolled SVG — no charting dependency. */

// A tiny sparkline from an array of {x, y}. Scales to the given box.
function Sparkline({ values = [], width = 240, height = 44, color = "var(--accent)" }) {
  if (values.length === 0) return <div className="fp-spark-empty">No data yet</div>;
  if (values.length === 1) {
    return (
      <svg className="fp-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <circle cx={width / 2} cy={height / 2} r="3" fill={color} />
      </svg>
    );
  }
  const ys = values.map((v) => v.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 4 - ((v.y - min) / span) * (height - 8);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="fp-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

export default function FitnessProgress({ profile, workouts = [], updateFitnessProfile }) {
  const unit = profile?.weightUnit || "lbs";
  const today = todayKey();

  // --- summary (this week / this month) ---
  const summary = useMemo(() => {
    const weekCut = shiftDay(today, -6);
    const monthCut = shiftDay(today, -29);
    let wSessions = 0, wVol = 0, mSessions = 0, mVol = 0;
    workouts.forEach((w) => {
      const vol = workoutVolume(w);
      if (w.date >= monthCut) { mSessions += 1; mVol += vol; }
      if (w.date >= weekCut) { wSessions += 1; wVol += vol; }
    });
    return { wSessions, wVol, mSessions, mVol };
  }, [workouts, today]);

  // --- muscle-group balance (last 28 days volume per group) ---
  const balance = useMemo(() => {
    const cut = shiftDay(today, -27);
    const vol = {};
    workouts.forEach((w) => {
      if (w.date < cut) return;
      (w.exercises || []).forEach((ex) => {
        if (ex.type === "cardio") return;
        const g = ex.muscleGroup || "other";
        (ex.sets || []).forEach((s) => {
          if (s.done && s.weight && s.reps) vol[g] = (vol[g] || 0) + s.weight * s.reps;
        });
      });
    });
    const entries = Object.entries(vol).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 0;
    return { entries, max };
  }, [workouts, today]);

  // --- per-exercise history ---
  const exerciseOptions = useMemo(() => {
    const seen = new Map();
    workouts.forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        if (ex.type === "cardio") return;
        if (ex.exerciseId && !seen.has(ex.exerciseId)) seen.set(ex.exerciseId, ex.name);
      });
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [workouts]);

  const [selectedEx, setSelectedEx] = useState("");
  const exHistory = useMemo(() => {
    const id = selectedEx || exerciseOptions[0]?.id;
    if (!id) return { weight: [], volume: [] };
    const rows = [];
    [...workouts]
      .sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
      )
      .forEach((w) => {
        (w.exercises || []).forEach((ex) => {
          if (ex.exerciseId !== id) return;
          let topW = 0, vol = 0;
          (ex.sets || []).forEach((s) => {
            if (s.done && s.weight != null) {
              topW = Math.max(topW, s.weight);
              if (s.reps) vol += s.weight * s.reps;
            }
          });
          rows.push({ date: w.date, topW, vol });
        });
      });
    return {
      weight: rows.map((r) => ({ y: r.topW })),
      volume: rows.map((r) => ({ y: r.vol })),
      latest: rows[rows.length - 1],
      first: rows[0],
    };
  }, [selectedEx, exerciseOptions, workouts]);

  // --- body stats ---
  const bodyStats = profile?.bodyStats || [];
  const [bw, setBw] = useState("");
  const [bf, setBf] = useState("");
  const addBodyStat = () => {
    const weight = Number(bw);
    if (!weight) return;
    const entry = { date: today, weight, bodyFat: bf ? Number(bf) : null };
    // Replace any existing entry for today, then keep sorted.
    const rest = bodyStats.filter((s) => s.date !== today);
    updateFitnessProfile?.({ bodyStats: [...rest, entry].sort((a, b) => a.date.localeCompare(b.date)) });
    setBw("");
    setBf("");
  };
  const bwSpark = bodyStats.map((s) => ({ y: s.weight }));
  const bwDelta =
    bodyStats.length >= 2
      ? bodyStats[bodyStats.length - 1].weight - bodyStats[0].weight
      : 0;

  return (
    <div className="fp">
      {/* Summary */}
      <div className="fp-summary">
        <div className="card fp-sum-card">
          <div className="fp-sum-title">This week</div>
          <div className="fp-sum-row">
            <div><span className="fp-sum-num">{summary.wSessions}</span><span className="fp-sum-lbl">sessions</span></div>
            <div><span className="fp-sum-num">{Math.round(summary.wVol).toLocaleString()}</span><span className="fp-sum-lbl">{unit} volume</span></div>
          </div>
        </div>
        <div className="card fp-sum-card">
          <div className="fp-sum-title">Last 30 days</div>
          <div className="fp-sum-row">
            <div><span className="fp-sum-num">{summary.mSessions}</span><span className="fp-sum-lbl">sessions</span></div>
            <div><span className="fp-sum-num">{Math.round(summary.mVol).toLocaleString()}</span><span className="fp-sum-lbl">{unit} volume</span></div>
          </div>
        </div>
      </div>

      {/* Muscle group balance */}
      <div className="fit-section-label"><Icon.Grid /> Muscle balance · last 28 days</div>
      {balance.entries.length === 0 ? (
        <div className="card fit-empty">Log a few weighted sessions to see how your volume is spread across muscle groups.</div>
      ) : (
        <div className="card fp-balance">
          {balance.entries.map(([g, v]) => (
            <div key={g} className="fp-bal-row">
              <span className="fp-bal-name">{MUSCLE_LABEL[g] || g}</span>
              <span className="fp-bal-track">
                <span className="fp-bal-fill" style={{ width: `${(v / balance.max) * 100}%` }} />
              </span>
              <span className="fp-bal-val">{Math.round(v).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-exercise progress */}
      <div className="fit-section-label"><Icon.Bolt /> Exercise progress</div>
      {exerciseOptions.length === 0 ? (
        <div className="card fit-empty">Once you log weighted exercises, pick one here to see your trend.</div>
      ) : (
        <div className="card fp-exercise">
          <select
            className="input fp-ex-select"
            value={selectedEx || exerciseOptions[0]?.id}
            onChange={(e) => setSelectedEx(e.target.value)}
          >
            {exerciseOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <div className="fp-ex-charts">
            <div className="fp-ex-chart">
              <div className="fp-ex-chart-head">
                <span>Top set weight</span>
                {exHistory.latest && (
                  <span className="fp-ex-latest">{exHistory.latest.topW} {unit}</span>
                )}
              </div>
              <Sparkline values={exHistory.weight} />
            </div>
            <div className="fp-ex-chart">
              <div className="fp-ex-chart-head">
                <span>Volume per session</span>
                {exHistory.latest && (
                  <span className="fp-ex-latest">{Math.round(exHistory.latest.vol).toLocaleString()} {unit}</span>
                )}
              </div>
              <Sparkline values={exHistory.volume} color="oklch(0.7 0.13 var(--hue-lav))" />
            </div>
          </div>
        </div>
      )}

      {/* Body stats */}
      <div className="fit-section-label"><Icon.Heart /> Body stats · optional</div>
      <div className="card fp-body">
        <div className="fp-body-add">
          <label className="wp-field">
            <span>Weight ({unit})</span>
            <input className="input" type="number" inputMode="decimal" min="0" value={bw} onChange={(e) => setBw(e.target.value)} placeholder="—" />
          </label>
          <label className="wp-field">
            <span>Body fat %</span>
            <input className="input" type="number" inputMode="decimal" min="0" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="—" />
          </label>
          <button className="btn" onClick={addBodyStat} disabled={!bw} style={{ opacity: bw ? 1 : 0.5, flex: "none", height: 40, alignSelf: "flex-end" }}>
            <Icon.Plus width={13} height={13} /> Log
          </button>
        </div>
        {bodyStats.length > 0 && (
          <div className="fp-body-trend">
            <div className="fp-body-trend-head">
              <span>Weight trend</span>
              {bodyStats.length >= 2 && (
                <span className={"fp-body-delta" + (bwDelta <= 0 ? " down" : " up")}>
                  {bwDelta > 0 ? "+" : ""}{Math.round(bwDelta * 10) / 10} {unit}
                </span>
              )}
            </div>
            <Sparkline values={bwSpark} color="oklch(0.72 0.14 var(--hue-mint))" />
            <div className="fp-body-latest">
              Latest: {bodyStats[bodyStats.length - 1].weight} {unit}
              {bodyStats[bodyStats.length - 1].bodyFat != null &&
                ` · ${bodyStats[bodyStats.length - 1].bodyFat}% body fat`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
