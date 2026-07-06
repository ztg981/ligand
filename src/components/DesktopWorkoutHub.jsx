import { Icon } from "./Icons.jsx";
import { MUSCLE_LABEL } from "../lib/exercises.js";
import WorkoutPlanner from "./WorkoutPlanner.jsx";
import WorkoutImport from "./WorkoutImport.jsx";

/* DesktopWorkoutHub — the PC Workout landing: PLANNING + PROGRESS.

   At a desk, fitness is a planning activity: lay out the training week, import
   a routine, review how it's going. So the landing leads with the weekly split
   PLANNER and shows progress at a glance beside it — a workspace, not a big
   Start button. Actually starting a session is a small action here (the doing
   happens on the phone), so Start/Generate are a compact row, not the hero. */
export default function DesktopWorkoutHub({
  weeklyPlan = {},
  setDayPlan,
  profile,
  onImported,
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
  workoutVolume,
}) {
  return (
    <div className="dwh">
      {/* Ready banner spans the workspace so the phone-sync cue is unmissable. */}
      {todaysSplit ? (
        <div className="card dwh-ready">
          <span className="wk-ready-dot" />
          <div className="dwh-ready-text">
            <strong>Ready for the gym</strong>
            <span className="wk-ready-focus">
              {todaysSplit} · {todaysGroups.map((g) => MUSCLE_LABEL[g] || g).join(", ")}
            </span>
          </div>
          <span className="dwh-ready-note">This is on your phone, ready to start.</span>
        </div>
      ) : (
        <div className="card dwh-plan-nudge">
          <Icon.Bolt />
          <span>Plan your week below — today's focus then shows up here and on your phone.</span>
        </div>
      )}

      <div className="dwh-grid">
        {/* LEFT — the planning workspace */}
        <div className="dwh-main">
          <WorkoutPlanner plan={weeklyPlan} onChange={setDayPlan} />

          <div className="card dwh-today">
            <div className="card-head">
              <div className="card-title"><Icon.Play /> Start a session</div>
            </div>
            <p className="dwh-today-sub">
              Sessions are logged on your phone. Kick one off here or set today's kit.
            </p>
            <div className="dwh-today-row">
              <button type="button" className="wk-equip-quick dwh-equip" onClick={onOpenEquip}>
                <span className="wk-equip-quick-lbl">
                  <Icon.Dumbbell width={14} height={14} /> Equipment
                </span>
                <span className="wk-equip-quick-val">
                  {sessionEquipment.length ? `${sessionEquipment.length} selected` : "Bodyweight"}
                  <Icon.Arrow width={13} height={13} />
                </span>
              </button>
              <button className="btn primary dwh-start" onClick={onStart}>
                <Icon.Play width={15} height={15} /> Start
              </button>
              <button className="btn sm" onClick={onGenerate}>
                <Icon.Bolt width={14} height={14} /> Generate
              </button>
              <button className="btn sm" onClick={onLogFree}>
                <Icon.Plus width={14} height={14} /> Log freely
              </button>
            </div>
          </div>

          <WorkoutImport profile={profile} onImported={onImported} />
        </div>

        {/* RIGHT — progress at a glance */}
        <div className="dwh-side">
          <div className="card dwh-progress-card">
            <div className="card-head">
              <div className="card-title"><Icon.Trophy /> This week</div>
            </div>
            <div className="dwh-stats">
              <div className="dwh-stat">
                <div className="dwh-stat-num">{weekCount}<span className="wk-stat-den">/{target}</span></div>
                <div className="dwh-stat-lbl">sessions</div>
              </div>
              <div className="dwh-stat">
                <div className="dwh-stat-num wk-streak"><Icon.Flame width={15} height={15} /> {streak}</div>
                <div className="dwh-stat-lbl">week streak</div>
              </div>
              <div className="dwh-stat">
                <div className="dwh-stat-num">
                  {weekVolume >= 1000 ? `${(weekVolume / 1000).toFixed(1)}k` : weekVolume}
                </div>
                <div className="dwh-stat-lbl">{unit} volume</div>
              </div>
            </div>
          </div>

          <div className="fit-section-label"><Icon.Calendar /> Recent</div>
          {recent.length === 0 ? (
            <div className="card fit-empty">No sessions yet.</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {recent.map((w) => (
                <div key={w.id} className="card fit-session dwh-session">
                  <div className="fit-session-head">
                    <span className="fit-session-date">{relDate(w.date)}</span>
                    <span className="fit-session-type">{w.type}</span>
                  </div>
                  <div className="fit-session-exs">
                    {(w.exercises || []).map((e) => e.name).join(", ") || "No exercises"}
                  </div>
                  <div className="fit-session-meta">
                    <span>{fmtDuration(w.durationSec)}</span>
                    <span>·</span>
                    <span>{(w.exercises || []).length} ex</span>
                    {workoutVolume(w) > 0 && (
                      <>
                        <span>·</span>
                        <span>{workoutVolume(w).toLocaleString()} {unit}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="fit-section-label" style={{ marginTop: 18 }}>
            <Icon.Trophy /> Recent PRs
          </div>
          {recentPRs.length === 0 ? (
            <div className="card fit-empty">Complete some weighted sets to see PRs.</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {recentPRs.map((pr, i) => (
                <div key={i} className="card dwh-pr">
                  <span className="dwh-pr-name">🏆 {pr.name}</span>
                  <span className="dwh-pr-weight">{pr.weight} {unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
