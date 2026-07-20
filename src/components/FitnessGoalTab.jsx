import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import WorkoutLogger from "./WorkoutLogger.jsx";
import WorkoutPreview from "./WorkoutPreview.jsx";
import FitnessProgress from "./FitnessProgress.jsx";
import {
  workoutsThisWeek,
  weeklyWorkoutStreak,
  workoutVolume,
  createWorkoutExercise,
  createSet,
  createWorkoutTemplate,
  todayKey,
} from "../lib/model.js";
import { generateWorkout } from "../lib/workoutGen.js";
import { MUSCLE_LABEL, exerciseKind } from "../lib/exercises.js";

// Turn a saved template's exercise plans into fresh, empty logger exercises
// (targetSets blank sets seeded with the planned reps/weight to beat).
function planToLoggerExercises(template) {
  return (template.exercises || []).map((p) => {
    const kind = exerciseKind(p);
    return createWorkoutExercise({
      exerciseId: p.exerciseId,
      name: p.name,
      muscleGroup: p.muscleGroup,
      type: p.type,
      kind,
      sets:
        kind === "strength"
          ? Array.from({ length: Math.max(1, p.targetSets || 3) }, () =>
              createSet({ reps: p.targetReps ?? null, weight: p.targetWeight ?? null })
            )
          : [createSet({ durationSec: (p.targetMinutes || 0) * 60, intensity: "moderate" })],
    });
  });
}

// Build a reusable template plan from a just-finished session's exercises.
function workoutToTemplatePlan(exercises) {
  return (exercises || []).map((ex) => {
    const strengthSets = ex.sets.filter((s) => s.weight != null);
    const maxWeight = strengthSets.reduce((m, s) => Math.max(m, s.weight || 0), 0);
    // Most common rep count as the target.
    const repCounts = {};
    ex.sets.forEach((s) => {
      if (s.reps != null) repCounts[s.reps] = (repCounts[s.reps] || 0) + 1;
    });
    const targetReps = Object.keys(repCounts).sort(
      (a, b) => repCounts[b] - repCounts[a]
    )[0];
    const kind = exerciseKind(ex);
    const longestSec = ex.sets.reduce((m, s) => Math.max(m, s.durationSec || 0), 0);
    return {
      exerciseId: ex.exerciseId,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      type: ex.type,
      kind,
      targetSets: kind === "strength" ? ex.sets.length : 1,
      targetReps: targetReps != null ? Number(targetReps) : null,
      targetWeight: maxWeight || null,
      targetMinutes: kind !== "strength" && longestSec ? Math.round(longestSec / 60) : undefined,
    };
  });
}

/* FitnessGoalTab - the preset layout for a Fitness goal, distinct from the
   regular SMART goal tab. Three sections per the brief:
     TOP     - today's plan / log button, weekly progress, current streak
     MIDDLE  - recent sessions (last 5)
     BOTTOM  - personal records per muscle group

   Stage B: the overview + manual free logging (via WorkoutLogger).
   (Stage C adds the rest timer + PR celebration + start-from-template;
    Stage D adds generation; Stage E adds progress charts.) */

function relDate(key) {
  if (!key) return "";
  const today = todayKey();
  if (key === today) return "Today";
  const d = new Date(key + "T00:00:00");
  const diff = Math.round((new Date(today + "T00:00:00") - d) / 86400000);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDuration(sec) {
  if (!sec) return "-";
  const m = Math.round(sec / 60);
  return `${m} min`;
}

export default function FitnessGoalTab({
  goal,
  profile,
  workouts = [],
  templates = [],
  addWorkout,
  addTemplate,
  updateFitnessProfile,
  onArchiveGoal,
}) {
  const [view, setView] = useState("overview"); // overview | progress
  // logging: null (overview) | { exercises } (active session, exercises may be
  // empty for a free log or seeded from a template/generated plan)
  const [logging, setLogging] = useState(null);
  const [choosing, setChoosing] = useState(false); // "how to start" chooser
  const [preview, setPreview] = useState(null); // generated plan under review
  const unit = profile?.weightUnit || "lbs";

  // Only this goal's sessions (fall back to all if none are tagged - a lone
  // fitness goal often logs untagged sessions).
  const myWorkouts = useMemo(() => {
    const tagged = workouts.filter((w) => w.goalId === goal.id);
    return tagged.length ? tagged : workouts;
  }, [workouts, goal.id]);

  const weekCount = useMemo(() => workoutsThisWeek(myWorkouts).length, [myWorkouts]);
  const streak = useMemo(() => weeklyWorkoutStreak(myWorkouts), [myWorkouts]);
  const target = profile?.workoutDaysPerWeek || 3;
  const recent = myWorkouts.slice(0, 5);

  // Personal records: heaviest completed set per muscle group, tagged with the
  // exercise it came from.
  const prsByGroup = useMemo(() => {
    const best = {}; // group -> { name, weight, reps }
    myWorkouts.forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        if (ex.type === "cardio") return;
        (ex.sets || []).forEach((s) => {
          if (!s.done || s.weight == null) return;
          const g = ex.muscleGroup || "other";
          if (!best[g] || s.weight > best[g].weight) {
            best[g] = { name: ex.name, weight: s.weight, reps: s.reps };
          }
        });
      });
    });
    return best;
  }, [myWorkouts]);

  const prGroups = Object.keys(prsByGroup);

  const handleFinish = (workout) => {
    addWorkout({ ...workout, goalId: goal.id });
  };

  const handleSaveTemplate = (name, exercises) => {
    addTemplate?.(
      createWorkoutTemplate({
        name,
        goalId: goal.id,
        exercises: workoutToTemplatePlan(exercises),
      })
    );
  };

  // Start a session - free log, or seeded from a template.
  const startFree = () => {
    setChoosing(false);
    setLogging({ exercises: null });
  };
  const startFromTemplate = (tmpl) => {
    setChoosing(false);
    setLogging({ exercises: planToLoggerExercises(tmpl) });
  };
  const onLogClick = () => {
    // If there are saved routines, offer a quick chooser; otherwise log freely.
    if (templates.length > 0) setChoosing(true);
    else startFree();
  };

  // Generation: build a plan, review it, then start it in the logger.
  const buildPlan = () => generateWorkout({ profile, workouts: myWorkouts });
  const onGenerate = () => {
    setChoosing(false);
    setPreview(buildPlan());
  };
  const startFromPlan = (plan) => {
    setPreview(null);
    setLogging({ exercises: planToLoggerExercises({ exercises: plan }) });
  };

  if (logging) {
    return (
      <WorkoutLogger
        profile={profile}
        goalId={goal.id}
        priorWorkouts={myWorkouts}
        initialExercises={logging.exercises}
        onFinish={handleFinish}
        onSaveTemplate={handleSaveTemplate}
        onCancel={() => setLogging(null)}
      />
    );
  }

  const previewEl = preview && (
    <WorkoutPreview
      profile={profile}
      initialPlan={preview}
      onRegenerate={buildPlan}
      onStart={startFromPlan}
      onSaveTemplate={handleSaveTemplate}
      onClose={() => setPreview(null)}
    />
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fitness</div>
          <h1 className="page-title">{goal.name}</h1>
          <p className="page-sub">
            Log your sessions, track your lifts, and keep the streak going.
          </p>
        </div>
        {onArchiveGoal && goal.type !== "built-in" && (
          <button
            className="btn ghost sm"
            onClick={() => onArchiveGoal(goal.id)}
            title="Archive this goal"
            style={{ flex: "none" }}
          >
            <Icon.Trash width={13} height={13} /> Archive
          </button>
        )}
      </div>

      <div className="seg fit-view-seg">
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
          Overview
        </button>
        <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>
          Progress
        </button>
      </div>

      {view === "progress" ? (
        <FitnessProgress
          profile={profile}
          workouts={myWorkouts}
          updateFitnessProfile={updateFitnessProfile}
        />
      ) : (
      <>
      {/* overview content wrapper */}

      {/* TOP: today's plan + weekly progress + streak */}
      <div className="fit-top">
        <div className="card fit-today-card">
          <div className="card-head">
            <div className="card-title"><Icon.Bolt /> Today's workout</div>
          </div>
          <p className="fit-today-sub">
            Let us build today's session from your history, or log one yourself.
          </p>
          <div className="fit-today-actions">
            <button className="btn primary fit-log-btn" onClick={onGenerate}>
              <Icon.Bolt /> Generate workout
            </button>
            <button className="btn fit-log-btn-alt" onClick={onLogClick}>
              <Icon.Plus /> Log freely
            </button>
          </div>
        </div>

        <div className="card fit-stat-card">
          <div className="fit-stat-num">
            {weekCount}<span className="fit-stat-den">/{target}</span>
          </div>
          <div className="fit-stat-lbl">workouts this week</div>
          <div className="fit-week-dots" aria-hidden="true">
            {Array.from({ length: target }, (_, i) => (
              <span key={i} className={"fit-week-dot" + (i < weekCount ? " on" : "")} />
            ))}
          </div>
        </div>

        <div className="card fit-stat-card">
          <div className="fit-stat-num fit-streak">
            <Icon.Flame /> {streak}
          </div>
          <div className="fit-stat-lbl">
            week{streak === 1 ? "" : "s"} in a row
          </div>
        </div>
      </div>

      {/* MIDDLE: recent sessions */}
      <div className="fit-section-label"><Icon.Calendar /> Recent sessions</div>
      {recent.length === 0 ? (
        <div className="card fit-empty">
          No sessions yet. Your logged workouts will show up here, newest first.
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {recent.map((w) => {
            const vol = workoutVolume(w);
            const exNames = (w.exercises || []).map((e) => e.name).join(", ");
            return (
              <div key={w.id} className="card fit-session">
                <div className="fit-session-head">
                  <span className="fit-session-date">{relDate(w.date)}</span>
                  <span className="fit-session-type">{w.type}</span>
                </div>
                <div className="fit-session-exs">{exNames || "No exercises"}</div>
                <div className="fit-session-meta">
                  <span>{fmtDuration(w.durationSec)}</span>
                  <span>·</span>
                  <span>
                    {(w.exercises || []).length}{" "}
                    {(w.exercises || []).length === 1 ? "exercise" : "exercises"}
                  </span>
                  {vol > 0 && (
                    <>
                      <span>·</span>
                      <span>{vol.toLocaleString()} {unit}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM: personal records */}
      <div className="fit-section-label" style={{ marginTop: 22 }}>
        <Icon.Trophy /> Personal records
      </div>
      {prGroups.length === 0 ? (
        <div className="card fit-empty">
          Once you complete some weighted sets, your best lift per muscle group
          shows up here.
        </div>
      ) : (
        <div className="fit-pr-grid">
          {prGroups.map((g) => {
            const pr = prsByGroup[g];
            return (
              <div key={g} className="card fit-pr">
                <div className="fit-pr-group">{MUSCLE_LABEL[g] || g}</div>
                <div className="fit-pr-weight">
                  {pr.weight}<span className="fit-pr-unit">{unit}</span>
                </div>
                <div className="fit-pr-ex">
                  {pr.name}{pr.reps ? ` · ${pr.reps} reps` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* "How do you want to start?" chooser (only when templates exist). */}
      {choosing && (
        <div className="scrim" role="presentation" onMouseDown={() => setChoosing(false)}>
          <div
            className="modal fit-start-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 18 }}>
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div className="eyebrow">Start a workout</div>
                  <h2 className="page-title" style={{ fontSize: 20 }}>How do you want to start?</h2>
                </div>
                <button className="iconbtn" title="Close" onClick={() => setChoosing(false)}>
                  <Icon.Close />
                </button>
              </div>

              <div className="stack" style={{ gap: 8, marginTop: 14 }}>
                <button className="fit-start-opt" onClick={onGenerate}>
                  <span className="fit-start-opt-ic"><Icon.Bolt /></span>
                  <span className="fit-start-opt-text">
                    <span className="fit-start-opt-name">Generate a workout</span>
                    <span className="fit-start-opt-desc">Built from your history and profile.</span>
                  </span>
                </button>
                <button className="fit-start-opt" onClick={startFree}>
                  <span className="fit-start-opt-ic"><Icon.Plus /></span>
                  <span className="fit-start-opt-text">
                    <span className="fit-start-opt-name">Log freely</span>
                    <span className="fit-start-opt-desc">Add exercises as you go.</span>
                  </span>
                </button>

                {templates.length > 0 && (
                  <div className="fit-start-sep">From a template</div>
                )}
                {templates.map((t) => (
                  <button key={t.id} className="fit-start-opt" onClick={() => startFromTemplate(t)}>
                    <span className="fit-start-opt-ic"><Icon.Pin2 /></span>
                    <span className="fit-start-opt-text">
                      <span className="fit-start-opt-name">{t.name}</span>
                      <span className="fit-start-opt-desc">
                        {(t.exercises || []).length} exercises
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewEl}
    </>
  );
}
