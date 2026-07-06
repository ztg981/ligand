import { Icon } from "./Icons.jsx";
import { MUSCLE_LABEL } from "../lib/exercises.js";

/* MobileWorkoutHome — the phone Workout landing: EXECUTION first.

   A phone user is (about to be) at the gym. So this is deliberately not the
   desktop dashboard: one hero that answers "what am I doing and how do I
   start", a big Start button, and only a compact glance at recent work + PRs.
   No weekly planner, no AI import, no analytics grid — those are PC planning
   tools and live on the desktop hub. */
export default function MobileWorkoutHome({
  todaysSplit,
  todaysGroups = [],
  sessionEquipment = [],
  onOpenEquip,
  onStart,
  onGenerate,
  onLogFree,
  weekCount,
  target,
  streak,
  weekVolume,
  unit,
  recent = [],
  recentPRs = [],
  relDate,
  fmtDuration,
}) {
  return (
    <div className="mwh">
      {/* HERO — today's session, front and centre */}
      <div className="card mwh-hero">
        {todaysSplit ? (
          <div className="mwh-ready">
            <span className="mwh-eyebrow">
              <span className="wk-ready-dot" /> Ready for the gym
            </span>
            <div className="mwh-title">{todaysSplit}</div>
            <div className="mwh-sub">
              {todaysGroups.map((g) => MUSCLE_LABEL[g] || g).join(" · ")}
            </div>
          </div>
        ) : (
          <div className="mwh-ready">
            <span className="mwh-eyebrow">
              <Icon.Bolt width={13} height={13} /> Today's workout
            </span>
            <div className="mwh-title">Let's train</div>
            <div className="mwh-sub">Start a session and log it set by set.</div>
          </div>
        )}

        <button type="button" className="mwh-equip" onClick={onOpenEquip}>
          <span className="mwh-equip-lbl">
            <Icon.Dumbbell width={14} height={14} />
            {sessionEquipment.length ? `${sessionEquipment.length} pieces of kit` : "Bodyweight"}
          </span>
          <Icon.Arrow width={13} height={13} />
        </button>

        <button className="btn primary mwh-start" onClick={onStart}>
          <Icon.Play /> Start workout
        </button>

        <div className="mwh-secondary">
          <button className="btn ghost sm" onClick={onGenerate}>
            <Icon.Bolt width={13} height={13} /> Generate
          </button>
          <button className="btn ghost sm" onClick={onLogFree}>
            <Icon.Plus width={13} height={13} /> Log freely
          </button>
        </div>
      </div>

      {/* Compact stats */}
      <div className="wk-stats-strip">
        <div className="card wk-stat">
          <div className="wk-stat-num">
            {weekCount}
            <span className="wk-stat-den">/{target}</span>
          </div>
          <div className="wk-stat-lbl">this week</div>
        </div>
        <div className="card wk-stat">
          <div className="wk-stat-num wk-streak">
            <Icon.Flame width={16} height={16} /> {streak}
          </div>
          <div className="wk-stat-lbl">week streak</div>
        </div>
        <div className="card wk-stat">
          <div className="wk-stat-num">
            {weekVolume >= 1000 ? `${(weekVolume / 1000).toFixed(1)}k` : weekVolume}
          </div>
          <div className="wk-stat-lbl">{unit} this week</div>
        </div>
      </div>

      {/* Compact recent (last 2, one line each) */}
      {recent.length > 0 && (
        <div className="mwh-block">
          <div className="fit-section-label"><Icon.Calendar /> Recent</div>
          <div className="mwh-recent">
            {recent.slice(0, 2).map((w) => (
              <div key={w.id} className="mwh-recent-row">
                <span className="mwh-recent-date">{relDate(w.date)}</span>
                <span className="mwh-recent-exs">
                  {(w.exercises || []).map((e) => e.name).join(", ") || "Session"}
                </span>
                <span className="mwh-recent-meta">{fmtDuration(w.durationSec)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact PR chips */}
      {recentPRs.length > 0 && (
        <div className="mwh-block">
          <div className="fit-section-label"><Icon.Trophy /> Recent PRs</div>
          <div className="mwh-pr-chips">
            {recentPRs.map((pr, i) => (
              <div key={i} className="mwh-pr-chip">
                🏆 {pr.name} <b>{pr.weight} {unit}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
