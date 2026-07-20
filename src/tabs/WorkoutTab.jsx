import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import WorkoutLogger from "../components/WorkoutLogger.jsx";
import WorkoutPreview from "../components/WorkoutPreview.jsx";
import FitnessProgress from "../components/FitnessProgress.jsx";
import ExerciseBrowser from "../components/ExerciseBrowser.jsx";
import EquipmentSheet from "../components/EquipmentSheet.jsx";
import WorkoutSetup from "../components/WorkoutSetup.jsx";
import NutritionPanel from "../components/NutritionPanel.jsx";
import RoutinesPanel from "../components/RoutinesPanel.jsx";
import { enrichWithLibrary } from "../lib/workoutParser.js";
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
import { findExercise, exerciseKind } from "../lib/exercises.js";
import { todayWeekday, splitLabel } from "../components/WorkoutPlanner.jsx";
import MobileWorkoutHome from "../components/MobileWorkoutHome.jsx";
import DesktopWorkoutHub from "../components/DesktopWorkoutHub.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Turn a saved template's exercise plans into fresh, empty logger exercises.
function planToLoggerExercises(template) {
  return (template.exercises || []).map((p) => {
    const kind = exerciseKind(p);
    const isStrength = kind === "strength";
    return createWorkoutExercise({
      exerciseId: p.exerciseId,
      name: p.name,
      muscleGroup: p.muscleGroup,
      type: p.type,
      kind,
      restSec: p.restSec ?? null,
      notes: p.notes ?? null,
      // Strength plans expand to their planned set count; an activity is a
      // single continuous effort (one card), seeded moderate.
      sets: isStrength
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
  scheduledWorkouts = [],
  addWorkout,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  addScheduledWorkout,
  updateScheduledWorkout,
  deleteScheduledWorkout,
  updateFitnessProfile,
  quickPlan = null, // exercises parsed by the global quick-add
  onQuickPlanHandled,
  meals = [],
  waterLog = {},
  addMeal,
  removeMeal,
  addWater,
  onLogSport = null, // open the global activity sheet preset to sports
}) {
  const isMobile = useIsMobile(768);
  const [view, setView] = useState("hub"); // hub | progress | browse

  // Today's planned focus from the weekly split (Mon=0..Sun=6). Drives the
  // "ready for the gym" cue that connects PC planning to phone execution.
  const weeklyPlan = profile?.weeklyPlan || {};
  const todaysGroups = weeklyPlan[todayWeekday()] || [];
  const todaysSplit = todaysGroups.length ? splitLabel(todaysGroups) : null;
  const setDayPlan = (weekday, groups) =>
    updateFitnessProfile?.({
      weeklyPlan: { ...weeklyPlan, [weekday]: groups },
    });
  const [logging, setLogging] = useState(null); // { exercises, resume? } | null
  const [preview, setPreview] = useState(null); // { plan, source } under review

  // A workout captured in the global quick-add arrives as a parsed plan;
  // open it straight in the review modal (edit → start / schedule / save).
  // This is a one-shot prop→state handoff plus a parent ack — an effect is
  // the correct tool (the ack cannot run during render).
  useEffect(() => {
    if (quickPlan?.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prop→state handoff; the parent ack below cannot run during render
      setPreview({ plan: quickPlan, source: "imported" });
      onQuickPlanHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPlan]);
  // The live in-gym session, mirrored to localStorage (and the cloud blob for
  // signed-in users) so a reload / closed PWA never loses completed sets.
  const [activeSession, setActiveSession] = useLocalStorage(
    "ligand.activeWorkout",
    null
  );
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

  // Open the "what do you have today?" equipment sheet, persisting the choice.
  const onOpenEquip = () =>
    setEquipSheet({
      onConfirm: (equip) => {
        setSessionEquipment(equip);
        updateFitnessProfile?.({ availableEquipment: equip });
        setEquipSheet(null);
      },
    });

  const handleFinish = (workout) => {
    const saved = addWorkout({ ...workout, goalId: null });
    // Started from a scheduled instance → mark it done and link the session.
    if (logging?.scheduledId) {
      updateScheduledWorkout?.(logging.scheduledId, {
        status: "done",
        completedWorkoutId: saved?.id || workout.id || null,
      });
    }
  };
  // Save a routine from EITHER shape: logged exercises (from the in-gym
  // logger, which have .sets) get condensed to targets; plan items (from the
  // builder/preview/import) are already targets and pass through unchanged.
  // The old unconditional workoutToTemplatePlan crashed on plan items
  // (ex.sets is undefined there).
  const toTemplatePlan = (exercises) =>
    (exercises || []).some((e) => Array.isArray(e.sets))
      ? workoutToTemplatePlan(exercises)
      : exercises;
  const handleSaveTemplate = (name, exercises) => {
    const plan = toTemplatePlan(exercises);
    if (preview?.templateId) {
      // Editing an existing routine: save in place.
      updateTemplate?.(preview.templateId, { name, exercises: plan });
    } else {
      addTemplate?.(createWorkoutTemplate({ name, exercises: plan }));
    }
  };

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
        setPreview({
          plan: generateWorkout({
            profile: { ...profile, availableEquipment: equip },
            workouts,
          }),
          source: "generated",
        });
      },
    });
  };
  const startFromPlan = (plan) => {
    setLogging({
      exercises: planToLoggerExercises({ exercises: plan }),
      // Starting a scheduled instance from its edit view still completes it.
      scheduledId: preview?.schedId || null,
    });
    setPreview(null);
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
        resume={logging.resume || null}
        onSnapshot={(snap) =>
          // Carry the scheduled-instance link inside the snapshot so finishing
          // AFTER a reload still marks the calendar entry done.
          setActiveSession(
            snap ? { ...snap, scheduledId: logging.scheduledId || null } : null
          )
        }
        onFinish={handleFinish}
        onSaveTemplate={handleSaveTemplate}
        onCancel={() => {
          setActiveSession(null);
          setLogging(null);
        }}
      />
    );
  }

  // A saved mid-session snapshot (reload, closed tab, app switch) — offer to
  // pick the workout back up from the same exercise and set.
  const resumeBanner = activeSession?.exercises?.length ? (
    <div className="card wk-resume" role="status">
      <div className="wk-resume-text">
        <div className="wk-resume-title">
          <Icon.Bolt width={14} height={14} /> Workout in progress
        </div>
        <div className="wk-resume-sub">
          {activeSession.exercises.length} exercises ·{" "}
          {activeSession.exercises.reduce(
            (n, e) => n + (e.sets || []).filter((s) => s.done).length,
            0
          )}{" "}
          sets done · started{" "}
          {new Date(activeSession.startedAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div className="wk-resume-actions">
        <button
          className="btn ghost sm"
          onClick={() => setActiveSession(null)}
        >
          Discard
        </button>
        <button
          className="btn primary sm"
          onClick={() =>
            setLogging({
              exercises: null,
              resume: activeSession,
              scheduledId: activeSession.scheduledId || null,
            })
          }
        >
          Resume workout
        </button>
      </div>
    </div>
  ) : null;

  // Name a plan from its dominant muscle groups ("Chest + Triceps"), for
  // scheduled entries created out of an import/generation.
  const planName = (plan) => {
    const groups = [...new Set((plan || []).map((p) => p.muscleGroup).filter((g) => g && g !== "other"))];
    if (!groups.length) return "Workout";
    return groups
      .slice(0, 2)
      .map((g) => g[0].toUpperCase() + g.slice(1))
      .join(" + ");
  };

  const handleSchedule = (dateKey, plan, name) => {
    if (preview?.schedId) {
      // Editing an existing instance: save in place (possibly to a new day).
      updateScheduledWorkout?.(preview.schedId, {
        date: dateKey,
        name: name || planName(plan),
        exercises: plan,
      });
    } else {
      addScheduledWorkout?.({
        date: dateKey,
        name: name || planName(plan),
        exercises: plan,
      });
    }
  };

  // ---- scheduled-instance actions (week calendar) --------------------------
  const startScheduled = (sched) =>
    setLogging({
      exercises: planToLoggerExercises(sched),
      scheduledId: sched.id,
    });
  const editScheduled = (sched) =>
    setPreview({
      plan: sched.exercises || [],
      source: "builder",
      schedId: sched.id,
      name: sched.name,
      date: sched.date,
    });
  const moveScheduled = (id, newDate) =>
    updateScheduledWorkout?.(id, { date: newDate });
  const duplicateScheduled = (sched, newDate) =>
    addScheduledWorkout?.({
      date: newDate,
      name: sched.name,
      exercises: sched.exercises || [],
      templateId: sched.templateId || null,
      notes: sched.notes || "",
    });
  // Manual builder (works on desktop AND mobile) — empty plan, editable name.
  const openBuilder = () => setPreview({ plan: [], source: "builder" });

  // ---- routines (templates as first-class cards) ---------------------------
  const editRoutine = (t) =>
    setPreview({
      plan: t.exercises || [],
      source: "builder",
      name: t.name,
      templateId: t.id,
    });
  const scheduleRoutine = (t) =>
    setPreview({ plan: t.exercises || [], source: "routine", name: t.name });
  const duplicateRoutine = (t) =>
    addTemplate?.(
      createWorkoutTemplate({ name: `${t.name} copy`, exercises: t.exercises || [] })
    );
  const addStarterRoutine = (r) =>
    addTemplate?.(
      createWorkoutTemplate({ name: r.name, exercises: enrichWithLibrary(r.exercises) })
    );
  // Build today's session from the last completed one ("same as last time").
  const repeatLast = () => {
    if (!workouts.length) return;
    setPreview({
      plan: workoutToTemplatePlan(workouts[0].exercises),
      source: "repeat",
    });
  };

  const scheduleApi = {
    list: scheduledWorkouts,
    onStart: startScheduled,
    onEdit: editScheduled,
    onMove: moveScheduled,
    onDuplicate: duplicateScheduled,
    onDelete: (id) => deleteScheduledWorkout?.(id),
    onCreate: openBuilder,
    onRepeatLast: workouts.length ? repeatLast : null,
  };

  const PREVIEW_COPY = {
    imported: { eyebrow: "Imported from your notes", title: "Review your workout" },
    builder: { eyebrow: "Workout builder", title: "New workout" },
    repeat: { eyebrow: "Based on your last session", title: "Repeat last workout" },
    routine: { eyebrow: "From your routines", title: "Schedule or start" },
    generated: { eyebrow: "Generated for you", title: "Today's workout" },
  };
  const previewCopy = PREVIEW_COPY[preview?.source] || PREVIEW_COPY.generated;

  const previewEl = preview && (
    <WorkoutPreview
      profile={{ ...profile, availableEquipment: sessionEquipment }}
      initialPlan={preview.plan}
      initialName={preview.name || ""}
      initialDate={preview.date || null}
      nameEditable={preview.source === "builder"}
      eyebrow={previewCopy.eyebrow}
      title={previewCopy.title}
      onRegenerate={preview.source === "generated" ? buildPlan : null}
      onStart={startFromPlan}
      onSaveTemplate={handleSaveTemplate}
      onSchedule={addScheduledWorkout ? handleSchedule : null}
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
          {isMobile ? "Today" : "Plan"}
        </button>
        <button className={view === "routines" ? "active" : ""} onClick={() => setView("routines")}>
          Routines
        </button>
        <button className={view === "browse" ? "active" : ""} onClick={() => setView("browse")}>
          Exercises
        </button>
        <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>
          Progress
        </button>
        <button className={view === "fuel" ? "active" : ""} onClick={() => setView("fuel")}>
          Fuel
        </button>
      </div>

      {resumeBanner}

      {view === "routines" && (
        <RoutinesPanel
          templates={templates}
          onStart={startFromTemplate}
          onSchedule={scheduleRoutine}
          onEdit={editRoutine}
          onDuplicate={duplicateRoutine}
          onDelete={(id) => deleteTemplate?.(id)}
          onNew={openBuilder}
          onAddStarter={addStarterRoutine}
        />
      )}

      {view === "fuel" && (
        <NutritionPanel
          meals={meals}
          waterLog={waterLog}
          addMeal={addMeal}
          removeMeal={removeMeal}
          addWater={addWater}
          trainedToday={workouts.some((w) => w.date === todayKey())}
        />
      )}

      {view === "progress" && (
        <FitnessProgress
          profile={profile}
          workouts={workouts}
          updateFitnessProfile={updateFitnessProfile}
        />
      )}

      {view === "browse" && (
        <ExerciseBrowser
          equipment={sessionEquipment}
          onPick={(exId) => startWithExercise(exId)}
        />
      )}

      {view === "hub" && (isMobile ? (
        <MobileWorkoutHome
          todaysSplit={todaysSplit}
          todaysGroups={todaysGroups}
          sessionEquipment={sessionEquipment}
          onOpenEquip={onOpenEquip}
          onStart={onStartWorkout}
          onGenerate={onGenerate}
          onLogFree={startFree}
          onLogSport={onLogSport}
          weekCount={weekCount}
          target={target}
          streak={streak}
          weekVolume={weekVolume}
          unit={unit}
          recent={recent}
          recentPRs={recentPRs}
          relDate={relDate}
          fmtDuration={fmtDuration}
          schedule={scheduleApi}
          onImported={(plan) => setPreview({ plan, source: "imported" })}
        />
      ) : (
        <DesktopWorkoutHub
          weeklyPlan={weeklyPlan}
          setDayPlan={setDayPlan}
          profile={profile}
          onImported={(plan) => setPreview({ plan, source: "imported" })}
          todaysSplit={todaysSplit}
          todaysGroups={todaysGroups}
          sessionEquipment={sessionEquipment}
          onOpenEquip={onOpenEquip}
          onStart={onStartWorkout}
          onGenerate={onGenerate}
          onLogFree={startFree}
          weekCount={weekCount}
          target={target}
          streak={streak}
          weekVolume={weekVolume}
          unit={unit}
          recent={recent}
          recentPRs={recentPRs}
          relDate={relDate}
          fmtDuration={fmtDuration}
          workoutVolume={workoutVolume}
          schedule={scheduleApi}
        />
      ))}

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
                {onLogSport && (
                  <button
                    className="fit-start-opt"
                    onClick={() => {
                      setChoosing(false);
                      onLogSport();
                    }}
                  >
                    <span className="fit-start-opt-ic"><Icon.Spark /></span>
                    <span className="fit-start-opt-text">
                      <span className="fit-start-opt-name">Log a sport</span>
                      <span className="fit-start-opt-desc">Tennis, basketball, a hike. It all counts.</span>
                    </span>
                  </button>
                )}
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
