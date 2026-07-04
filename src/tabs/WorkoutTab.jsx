import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import WorkoutLogger from "../components/WorkoutLogger.jsx";
import WorkoutPreview from "../components/WorkoutPreview.jsx";
import FitnessProgress from "../components/FitnessProgress.jsx";
import ExerciseBrowser from "../components/ExerciseBrowser.jsx";
import EquipmentSheet from "../components/EquipmentSheet.jsx";
import WorkoutSetup from "../components/WorkoutSetup.jsx";
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
import { MUSCLE_LABEL, findExercise } from "../lib/exercises.js";
import WorkoutPlanner, { todayWeekday, splitLabel } from "../components/WorkoutPlanner.jsx";
import WorkoutImport from "../components/WorkoutImport.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Turn a saved template's exercise plans into fresh, empty logger exercises.
function planToLoggerExercises(template) {
  return (template.exercises || []).map((p) =>
    createWorkoutExercise({
      exerciseId: p.exerciseId,
      name: p.name,
      muscleGroup: p.muscleGroup,
      type: p.type,
      sets: Array.from({ length: Math.max(1, p.targetSets || 3) }, () =>
        createSet(
          p.type === "cardio"
            ? { durationSec: (p.targetMinutes || 0) * 60 }
            : { reps: p.targetReps ?? null, weight: p.targetWeight ?? null }
        )
      ),
    })
  );
}

// Build a reusable template plan from a just-finished session's exercises.
function workoutToTemplatePlan(exercises) {
  return (exercises || []).map((ex) => {
    const strengthSets = ex.sets.filter((s) => s.weight != null);
    const maxWeight = strengthSets.reduce((m, s) => Math.max(m, s.weight || 0), 0);
    const repCounts = {};
    ex.sets.forEach((s) => {
      if (s.reps != null) repCounts[s.reps] = (repCounts[s.reps] || 0) + 1;
    });
    const targetReps = Object.keys(repCounts).sort(
      (a, b) => repCounts[b] - repCounts[a]
    )[0];
    return {
      exerciseId: ex.exerciseId,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      type: ex.type,
      targetSets: ex.sets.length,
      targetReps: targetReps != null ? Number(targetReps) : null,
      targetWeight: maxWeight || null,
    };
  });
}

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
  return `${Math.round(sec / 60)} min`;
}

/* WorkoutTab - the dedicated fitness hub (a first-class main-nav tab, no longer
   buried inside a goal). Reuses the proven WorkoutLogger (in-gym), WorkoutPreview
   (generated-plan review), and FitnessProgress, and adds a session-start
   equipment selector, an exercise browser, and a hub screen tuned for in-gym
   mobile use. Data model is unchanged (store.workouts / workoutTemplates /
   fitnessProfile). */
export default function WorkoutTab({
  profile,
  workouts = [],
  templates = [],
  addWorkout,
  addTemplate,
  updateFitnessProfile,
}) {
  const isMobile = useIsMobile(768);
  const [view, setView] = useState("hub"); // hub | plan | progress | browse

  // Today's planned focus from the weekly split (Mon=0..Sun=6). Drives the
  // "ready for the gym" cue that connects PC planning to phone execution.
  const weeklyPlan = profile?.weeklyPlan || {};
  const todaysGroups = weeklyPlan[todayWeekday()] || [];
  const todaysSplit = todaysGroups.length ? splitLabel(todaysGroups) : null;
  const setDayPlan = (weekday, groups) =>
    updateFitnessProfile?.({
      weeklyPlan: { ...weeklyPlan, [weekday]: groups },
    });
  const [logging, setLogging] = useState(null); // { exercises } | null
  const [preview, setPreview] = useState(null); // generated plan under review
  const [choosing, setChoosing] = useState(false); // start chooser
  const [equipSheet, setEquipSheet] = useState(null); // { onConfirm } | null
  // Today's equipment for generation. `null` = follow the saved profile default
  // (so it stays correct after first-run setup fills the profile in); once the
  // user adjusts it for a session it holds that override.
  const [sessionOverride, setSessionOverride] = useState(null);
  const sessionEquipment = sessionOverride ?? (profile?.availableEquipment || []);
  const setSessionEquipment = setSessionOverride;

  const unit = profile?.weightUnit || "lbs";

  const weekCount = useMemo(() => workoutsThisWeek(workouts).length, [workouts]);
  const streak = useMemo(() => weeklyWorkoutStreak(workouts), [workouts]);
  const target = profile?.workoutDaysPerWeek || 3;
  const recent = workouts.slice(0, 3);

  const weekVolume = useMemo(
    () => workoutsThisWeek(workouts).reduce((sum, w) => sum + workoutVolume(w), 0),
    [workouts]
  );

  // Recent personal records: heaviest completed set per exercise, most recent
  // first, top 3.
  const recentPRs = useMemo(() => {
    const best = {}; // exerciseId -> { name, weight, reps, date }
    workouts.forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        if (ex.type === "cardio" || !ex.exerciseId) return;
        (ex.sets || []).forEach((s) => {
          if (!s.done || s.weight == null) return;
          const cur = best[ex.exerciseId];
          if (!cur || s.weight > cur.weight) {
            best[ex.exerciseId] = { name: ex.name, weight: s.weight, reps: s.reps, date: w.date };
          }
        });
      });
    });
    return Object.values(best)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 3);
  }, [workouts]);

  const handleFinish = (workout) => addWorkout({ ...workout, goalId: null });
  const handleSaveTemplate = (name, exercises) =>
    addTemplate?.(
      createWorkoutTemplate({ name, exercises: workoutToTemplatePlan(exercises) })
    );

  const startFree = () => {
    setChoosing(false);
    setLogging({ exercises: null });
  };
  const startFromTemplate = (tmpl) => {
    setChoosing(false);
    setLogging({ exercises: planToLoggerExercises(tmpl) });
  };
  const startWithExercise = (exId) => {
    const ex = findExercise(exId);
    if (!ex) return;
    setView("hub");
    setLogging({
      exercises: [
        createWorkoutExercise({
          exerciseId: ex.id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          type: ex.type,
        }),
      ],
    });
  };

  // Build a plan from today's equipment (not necessarily the saved default).
  const buildPlan = () =>
    generateWorkout({
      profile: { ...profile, availableEquipment: sessionEquipment },
      workouts,
    });

  // Generate: first confirm today's equipment, then review the plan.
  const onGenerate = () => {
    setChoosing(false);
    setEquipSheet({
      onConfirm: (equip) => {
        setSessionEquipment(equip);
        setEquipSheet(null);
        setPreview(
          generateWorkout({
            profile: { ...profile, availableEquipment: equip },
            workouts,
          })
        );
      },
    });
  };
  const startFromPlan = (plan) => {
    setPreview(null);
    setLogging({ exercises: planToLoggerExercises({ exercises: plan }) });
  };
  const onStartWorkout = () => {
    if (templates.length > 0) setChoosing(true);
    else onGenerate();
  };

  // ---- No profile yet: quick setup ----------------------------------------
  if (!profile) {
    return (
      <WorkoutSetup
        onSave={(p) => updateFitnessProfile?.(p)}
      />
    );
  }

  // ---- Active in-gym session ----------------------------------------------
  if (logging) {
    return (
      <WorkoutLogger
        profile={profile}
        goalId={null}
        priorWorkouts={workouts}
        initialExercises={logging.exercises}
        onFinish={handleFinish}
        onSaveTemplate={handleSaveTemplate}
        onCancel={() => setLogging(null)}
      />
    );
  }

  const previewEl = preview && (
    <WorkoutPreview
      profile={{ ...profile, availableEquipment: sessionEquipment }}
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
          <h1 className="page-title">Workout</h1>
          <p className="page-sub">
            Generate today's session, log it in the gym, and track your lifts.
          </p>
        </div>
      </div>

      <div className="seg fit-view-seg">
        <button className={view === "hub" ? "active" : ""} onClick={() => setView("hub")}>
          Today
        </button>
        {/* Planning is a desktop workspace; the phone is for execution. */}
        {!isMobile && (
          <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>
            Plan
          </button>
        )}
        <button className={view === "browse" ? "active" : ""} onClick={() => setView("browse")}>
          Exercises
        </button>
        <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>
          Progress
        </button>
      </div>

      {view === "progress" && (
        <FitnessProgress
          profile={profile}
          workouts={workouts}
          updateFitnessProfile={updateFitnessProfile}
        />
      )}

      {view === "plan" && !isMobile && (
        <>
          <WorkoutPlanner plan={weeklyPlan} onChange={setDayPlan} />
          <WorkoutImport
            profile={profile}
            onImported={(plan) => setPreview(plan)}
          />
        </>
      )}

      {view === "browse" && (
        <ExerciseBrowser
          equipment={sessionEquipment}
          onPick={(exId) => startWithExercise(exId)}
        />
      )}

      {view === "hub" && (
        <>
          {/* TOP: today's workout + equipment quick-selector */}
          <div className="card wk-today-card">
            <div className="card-head">
              <div className="card-title"><Icon.Bolt /> Today's workout</div>
            </div>
            {todaysSplit ? (
              <div className="wk-ready" role="status">
                <span className="wk-ready-dot" />
                <span className="wk-ready-text">
                  <strong>Ready for the gym</strong>
                  <span className="wk-ready-focus">
                    {todaysSplit} · {todaysGroups.map((g) => MUSCLE_LABEL[g] || g).join(", ")}
                  </span>
                </span>
              </div>
            ) : (
              <p className="fit-today-sub">
                Build a session from your history, or start logging one yourself.
                {!isMobile && " Set a weekly split in Plan to see today's focus here."}
              </p>
            )}

            <button
              type="button"
              className="wk-equip-quick"
              onClick={() =>
                setEquipSheet({
                  onConfirm: (equip) => {
                    setSessionEquipment(equip);
                    updateFitnessProfile?.({ availableEquipment: equip });
                    setEquipSheet(null);
                  },
                })
              }
            >
              <span className="wk-equip-quick-lbl">
                <Icon.Dumbbell width={14} height={14} /> What do you have today?
              </span>
              <span className="wk-equip-quick-val">
                {sessionEquipment.length ? `${sessionEquipment.length} selected` : "Bodyweight"}
                <Icon.Arrow width={13} height={13} />
              </span>
            </button>

            <button className="btn primary wk-start-btn" onClick={onStartWorkout}>
              <Icon.Play /> Start workout
            </button>
            <div className="wk-today-actions">
              <button className="btn sm" onClick={onGenerate}>
                <Icon.Bolt width={14} height={14} /> Generate
              </button>
              <button className="btn sm" onClick={startFree}>
                <Icon.Plus width={14} height={14} /> Log freely
              </button>
            </div>
          </div>

          {/* STATS strip */}
          <div className="wk-stats-strip">
            <div className="card wk-stat">
              <div className="wk-stat-num">{weekCount}<span className="wk-stat-den">/{target}</span></div>
              <div className="wk-stat-lbl">this week</div>
            </div>
            <div className="card wk-stat">
              <div className="wk-stat-num wk-streak"><Icon.Flame width={16} height={16} /> {streak}</div>
              <div className="wk-stat-lbl">week streak</div>
            </div>
            <div className="card wk-stat">
              <div className="wk-stat-num">{weekVolume >= 1000 ? `${(weekVolume / 1000).toFixed(1)}k` : weekVolume}</div>
              <div className="wk-stat-lbl">{unit} this week</div>
            </div>
          </div>

          {/* RECENT sessions (last 3) */}
          <div className="fit-section-label"><Icon.Calendar /> Recent</div>
          {recent.length === 0 ? (
            <div className="card fit-empty">
              No sessions yet. Your logged workouts show up here, newest first.
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
                      <span>{(w.exercises || []).length} ex</span>
                      {vol > 0 && (<><span>·</span><span>{vol.toLocaleString()} {unit}</span></>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PRs (top 3 recent) */}
          <div className="fit-section-label" style={{ marginTop: 22 }}>
            <Icon.Trophy /> Recent PRs
          </div>
          {recentPRs.length === 0 ? (
            <div className="card fit-empty">
              Once you complete some weighted sets, your best lifts show up here.
            </div>
          ) : (
            <div className="fit-pr-grid">
              {recentPRs.map((pr, i) => (
                <div key={i} className="card fit-pr">
                  <div className="fit-pr-group">🏆 {pr.name}</div>
                  <div className="fit-pr-weight">
                    {pr.weight}<span className="fit-pr-unit">{unit}</span>
                  </div>
                  <div className="fit-pr-ex">
                    {pr.reps ? `${pr.reps} reps` : ""}{pr.reps ? " · " : ""}{relDate(pr.date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Start chooser (when templates exist) */}
      {choosing && (
        <div className="scrim" role="presentation" onMouseDown={() => setChoosing(false)}>
          <div className="modal fit-start-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
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
                    <span className="fit-start-opt-desc">Built from your history and today's equipment.</span>
                  </span>
                </button>
                <button className="fit-start-opt" onClick={startFree}>
                  <span className="fit-start-opt-ic"><Icon.Plus /></span>
                  <span className="fit-start-opt-text">
                    <span className="fit-start-opt-name">Log freely</span>
                    <span className="fit-start-opt-desc">Add exercises as you go.</span>
                  </span>
                </button>
                {templates.length > 0 && <div className="fit-start-sep">From a template</div>}
                {templates.map((t) => (
                  <button key={t.id} className="fit-start-opt" onClick={() => startFromTemplate(t)}>
                    <span className="fit-start-opt-ic"><Icon.Pin /></span>
                    <span className="fit-start-opt-text">
                      <span className="fit-start-opt-name">{t.name}</span>
                      <span className="fit-start-opt-desc">{(t.exercises || []).length} exercises</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {equipSheet && (
        <EquipmentSheet
          selected={sessionEquipment}
          onConfirm={equipSheet.onConfirm}
          onClose={() => setEquipSheet(null)}
        />
      )}

      {previewEl}
    </>
  );
}
