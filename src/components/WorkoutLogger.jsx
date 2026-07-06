import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { ding } from "../lib/uiSounds.js";
import {
  createWorkout,
  createWorkoutExercise,
  createSet,
  workoutVolume,
  completedSetCount,
  exercisePR,
  lastExercisePerformance,
  estimateWorkoutMinutes,
  platesFor,
} from "../lib/model.js";
import { searchExercises, findExercise, MUSCLE_LABEL } from "../lib/exercises.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

/* WorkoutLogger - the in-gym flow. A full-screen layer (not a centered modal)
   so it works one-handed on a phone at the rack. Add exercises from the
   library, log sets (reps × weight, or a duration for cardio), tap a set to
   mark it complete, then Finish to save a session + see a summary.

   Stage B: manual free logging + set completion + finish summary.
   (Stage C layers the auto rest timer and PR celebration on top of this.) */

function fmtElapsed(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// "Last time" reference line for an exercise, from its most recent prior set.
function fmtLast(p, unit) {
  if (!p) return null;
  if (p.durationSec) return `Last time: ${Math.round(p.durationSec / 60)} min`;
  if (p.weight != null) return `Last time: ${p.weight} ${unit} × ${p.reps ?? "-"}`;
  return null;
}

// A short "focus" recap from the muscle groups a session covers.
function focusLabel(exercises) {
  const groups = [...new Set((exercises || []).map((e) => e.muscleGroup))].filter(
    (g) => g && g !== "other"
  );
  if (!groups.length) return "";
  const labels = groups.map((g) => (MUSCLE_LABEL[g] || g).toLowerCase());
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export default function WorkoutLogger({
  profile,
  goalId = null,
  initialExercises = null,
  initialType = "strength",
  priorWorkouts = [],
  workoutName = "Today's workout",
  onFinish,
  onCancel,
  onSaveTemplate, // (name, exercises) => void
  onSnapshot, // (snapshot|null) => void — persist the live session (resume support)
  resume = null, // saved snapshot to restore: { exercises, currentIdx, guidedStarted, startedAt }
}) {
  const unit = profile?.weightUnit || "lbs";
  const restStrength = profile?.restStrengthSec || 90;
  const restCardio = profile?.restCardioSec || 30;
  const isMobile = useIsMobile(768);

  // All-time best weight for an exercise coming INTO this session - the
  // baseline a completed set must beat to count as a personal record.
  const priorBestFor = (exerciseId) => exercisePR(priorWorkouts, exerciseId);
  const celebratedRef = useRef(new Set()); // exerciseIds already celebrated this session

  // Seed from a restored mid-session snapshot first, then a template/generated
  // plan, else start empty.
  const wasSeeded = Boolean(
    (resume?.exercises?.length || 0) > 0 || (initialExercises && initialExercises.length)
  );
  const [exercises, setExercises] = useState(() =>
    resume?.exercises?.length ? resume.exercises : wasSeeded ? initialExercises : []
  );
  const [showPicker, setShowPicker] = useState(!wasSeeded);
  // Session overview shown at the start of a seeded (planned) session — the
  // "here's what's ahead" briefing a trainer would give before you begin.
  // A resumed session skips it (you're mid-workout, not starting).
  const [showOverview, setShowOverview] = useState(wasSeeded && !resume);

  // Guided mode: on a phone, a seeded/planned workout runs one exercise at a
  // time (execution) instead of the full scrolling list (which stays for
  // desktop and for free logging). All data lives in the shared `exercises`
  // state, so moving between exercises never loses anything.
  const guided = isMobile && wasSeeded;
  const [guidedStarted, setGuidedStarted] = useState(Boolean(resume?.guidedStarted));
  const [currentIdx, setCurrentIdx] = useState(resume?.currentIdx || 0);
  const [showPlan, setShowPlan] = useState(false); // full-plan overlay in guided mode

  // Prior best-per-exercise, so each movement can show "Last time: 135 × 8".
  const lastPerf = (exerciseId) =>
    exerciseId ? lastExercisePerformance(priorWorkouts, exerciseId) : null;
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState(null); // set on finish
  const [tmplName, setTmplName] = useState("");
  const [tmplSaved, setTmplSaved] = useState(false);

  const startRef = useRef(resume?.startedAt || Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Persist the live session (debounced) so a reload / app close never loses
  // completed sets. Cleared explicitly on finish and cancel. onSnapshot is a
  // stable setState-style setter, so it's safe in the dependency array.
  useEffect(() => {
    if (!onSnapshot || summary) return undefined;
    if (!exercises.length) return undefined; // nothing worth restoring yet
    const t = setTimeout(() => {
      onSnapshot({
        exercises,
        currentIdx,
        guidedStarted,
        startedAt: startRef.current,
        workoutName,
        savedAt: Date.now(),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [exercises, currentIdx, guidedStarted, summary, workoutName, onSnapshot]);
  useEffect(() => {
    if (summary) return; // stop ticking once finished
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [summary]);

  // Rest timer: { remaining, total, name } while resting, else null.
  const [rest, setRest] = useState(null);
  useEffect(() => {
    if (!rest) return undefined;
    if (rest.remaining <= 0) {
      // Gentle buzz on phones when the rest is up; best-effort.
      try {
        navigator.vibrate?.([180, 90, 180]);
      } catch {
        /* not supported - fine */
      }
      try {
        ding();
      } catch {
        /* sound best-effort */
      }
      setRest(null);
      return undefined;
    }
    // Paused holds the countdown in place (effect stays mounted, no tick).
    if (rest.paused) return undefined;
    const t = setTimeout(
      () => setRest((r) => (r ? { ...r, remaining: r.remaining - 1 } : null)),
      1000
    );
    return () => clearTimeout(t);
  }, [rest]);

  const startRest = (exercise) => {
    // Per-exercise rest (from the plan/builder) wins over the profile default.
    const dur =
      exercise.restSec ?? (exercise.type === "cardio" ? restCardio : restStrength);
    setRest({ remaining: dur, total: dur, name: exercise.name, paused: false });
  };
  const toggleRestPause = () =>
    setRest((r) => (r ? { ...r, paused: !r.paused } : null));
  const adjustRest = (delta) =>
    setRest((r) =>
      r ? { ...r, remaining: Math.max(0, r.remaining + delta), total: r.total + delta } : null
    );
  const skipRest = () => setRest(null);

  // PR celebration: { name, weight } when a set beats the all-time best, else null.
  const [prMoment, setPrMoment] = useState(null);

  const results = useMemo(() => searchExercises(query, 40), [query]);

  const addExercise = (libEx) => {
    setExercises((list) => [
      ...list,
      createWorkoutExercise({
        exerciseId: libEx.id,
        name: libEx.name,
        muscleGroup: libEx.muscleGroup,
        type: libEx.type,
        sets: [createSet(libEx.type === "cardio" ? { durationSec: 0 } : {})],
      }),
    ]);
    setShowPicker(false);
    setQuery("");
  };

  const removeExercise = (exId) =>
    setExercises((list) => list.filter((e) => e.id !== exId));

  const addSet = (exId) =>
    setExercises((list) =>
      list.map((e) => {
        if (e.id !== exId) return e;
        // Copy the previous set's reps/weight as a sensible starting point.
        const prev = e.sets[e.sets.length - 1];
        const seed =
          e.type === "cardio"
            ? { durationSec: prev?.durationSec || 0 }
            : { reps: prev?.reps ?? null, weight: prev?.weight ?? null };
        return { ...e, sets: [...e.sets, createSet(seed)] };
      })
    );

  const removeSet = (exId, setId) =>
    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : { ...e, sets: e.sets.length > 1 ? e.sets.filter((s) => s.id !== setId) : e.sets }
      )
    );

  const patchSet = (exId, setId, patch) =>
    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            }
      )
    );

  const toggleSetDone = (exId, setId) => {
    // Decide effects from the CURRENT snapshot (not inside the state updater —
    // functional updaters run during render, so a side effect there wouldn't
    // have happened yet by the time we read it).
    const exercise = exercises.find((e) => e.id === exId);
    const set = exercise?.sets.find((s) => s.id === setId);
    if (!exercise || !set) return;
    const willBeDone = !set.done;

    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, done: willBeDone } : s
              ),
            }
      )
    );

    if (!willBeDone) return; // un-completing a set: no timer, no PR

    // Auto-start the rest countdown (the integrated in-gym clock).
    startRest(exercise);

    // Personal record: a strength set that beats the all-time best weight for
    // this exercise, celebrated at most once per exercise per session.
    if (
      exercise.type !== "cardio" &&
      exercise.exerciseId &&
      set.weight != null &&
      set.weight > 0 &&
      !celebratedRef.current.has(exercise.exerciseId)
    ) {
      const best = priorBestFor(exercise.exerciseId);
      if (!best || set.weight > best.weight) {
        celebratedRef.current.add(exercise.exerciseId);
        setPrMoment({ name: exercise.name, weight: set.weight });
      }
    }
  };

  const anyCompleted = exercises.some((e) => e.sets.some((s) => s.done));

  // ---- guided-mode helpers -------------------------------------------------
  // Adjust the current (first not-done) set of the current exercise by +/- a
  // step, seeding from the last-session value when the field is still empty.
  const adjustCur = (field, delta) => {
    const cur = exercises[currentIdx];
    if (!cur) return;
    const idx = cur.sets.findIndex((s) => !s.done);
    if (idx < 0) return;
    const s = cur.sets[idx];
    const lp = lastPerf(cur.exerciseId);
    let base = s[field];
    if (base == null) {
      base =
        field === "weight" ? lp?.weight ?? 0 : field === "reps" ? lp?.reps ?? 8 : 0;
    }
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    patchSet(cur.id, s.id, { [field]: next });
  };

  // Log the current set: fill any empty values (from last time), mark it done,
  // start rest, and celebrate a PR — all in one snapshot so nothing is lost.
  const guidedLogSet = () => {
    const cur = exercises[currentIdx];
    if (!cur) return;
    const idx = cur.sets.findIndex((s) => !s.done);
    if (idx < 0) return;
    const s = cur.sets[idx];
    const lp = lastPerf(cur.exerciseId);
    const isCardio = cur.type === "cardio";
    const weight = isCardio ? null : s.weight ?? lp?.weight ?? 0;
    const reps = isCardio ? null : s.reps ?? lp?.reps ?? 8;
    setExercises((list) =>
      list.map((e) =>
        e.id !== cur.id
          ? e
          : {
              ...e,
              sets: e.sets.map((x, xi) => {
                if (x.id === s.id) {
                  return isCardio ? { ...x, done: true } : { ...x, weight, reps, done: true };
                }
                // Carry this set's numbers forward to later, not-yet-logged sets
                // (standard gym-logger behavior: your adjustment sticks).
                if (!isCardio && xi > idx && !x.done) return { ...x, weight, reps };
                return x;
              }),
            }
      )
    );
    startRest(cur);
    if (
      !isCardio &&
      cur.exerciseId &&
      weight > 0 &&
      !celebratedRef.current.has(cur.exerciseId)
    ) {
      const best = priorBestFor(cur.exerciseId);
      if (!best || weight > best.weight) {
        celebratedRef.current.add(cur.exerciseId);
        setPrMoment({ name: cur.name, weight });
      }
    }
  };

  const goToExercise = (i) => {
    setRest(null); // moving exercises cancels any running rest
    setCurrentIdx(Math.max(0, Math.min(exercises.length - 1, i)));
    setShowPlan(false);
  };

  const finish = () => {
    const durationSec = Math.floor((Date.now() - startRef.current) / 1000);
    // Keep only exercises that had at least one completed set.
    const kept = exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length > 0);
    const types = new Set(kept.map((e) => e.type));
    const type = types.size > 1 ? "mixed" : [...types][0] || initialType;
    const workout = createWorkout({
      type,
      exercises: kept,
      durationSec,
      goalId,
    });
    setSummary({
      workout,
      volume: workoutVolume(workout),
      sets: completedSetCount(workout),
      durationSec,
      focus: focusLabel(kept),
    });
    try { ding(); } catch { /* best-effort */ }
    try { navigator.vibrate?.([30, 40, 120]); } catch { /* fine */ }
    onSnapshot?.(null); // the session is over — clear the resume snapshot
    onFinish?.(workout);
  };

  // "What's coming next" during rest — a specific set within the exercise, or
  // the next exercise, when in guided mode; the exercise name otherwise.
  let restNextLabel = rest ? `Next up: ${rest.name}` : "";
  if (guided && rest) {
    const cur = exercises[currentIdx];
    const nextSetIdx = cur ? cur.sets.findIndex((s) => !s.done) : -1;
    if (nextSetIdx > -1) {
      restNextLabel = `Next: set ${nextSetIdx + 1} of ${cur.sets.length}`;
    } else {
      const nextEx = exercises[currentIdx + 1];
      restNextLabel = nextEx ? `Next: ${nextEx.name}` : "Last set — finish strong";
    }
  }

  // Shared overlays (rest timer + PR celebration) rendered in both list and
  // guided modes so their behavior can't drift.
  const restOverlay = rest && (
    <div className="wl-rest" role="status" aria-live="polite">
      <div
        className="wl-rest-bar"
        style={{ width: `${(rest.remaining / Math.max(1, rest.total)) * 100}%` }}
        aria-hidden="true"
      />
      <div className="wl-rest-inner">
        <div className={"wl-rest-ring" + (rest.paused ? " paused" : "")}>
          <svg viewBox="0 0 60 60" aria-hidden="true">
            <circle className="wl-rest-ring-track" cx="30" cy="30" r="26" />
            <circle
              className="wl-rest-ring-fill"
              cx="30"
              cy="30"
              r="26"
              style={{
                strokeDasharray: 2 * Math.PI * 26,
                strokeDashoffset:
                  2 * Math.PI * 26 * (1 - rest.remaining / Math.max(1, rest.total)),
              }}
            />
          </svg>
          <span className="wl-rest-count mono">{fmtElapsed(rest.remaining)}</span>
        </div>
        <div className="wl-rest-mid">
          <span className="wl-rest-lbl">{rest.paused ? "Paused" : "Rest"}</span>
          <span className="wl-rest-ex">{restNextLabel}</span>
        </div>
        <div className="wl-rest-actions">
          <button className="wl-rest-adj" onClick={() => adjustRest(-15)} title="Subtract 15 seconds">
            −15
          </button>
          <button
            className="wl-rest-pause"
            onClick={toggleRestPause}
            title={rest.paused ? "Resume" : "Pause"}
          >
            {rest.paused ? <Icon.Play /> : <Icon.Pause />}
          </button>
          <button className="wl-rest-adj" onClick={() => adjustRest(15)} title="Add 15 seconds">
            +15
          </button>
          <button className="wl-rest-skip" onClick={skipRest}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );

  const prOverlay = prMoment && (
    <div
      className="wl-pr-scrim"
      role="dialog"
      aria-modal="true"
      onClick={() => setPrMoment(null)}
    >
      <div className="wl-pr-card" onClick={(e) => e.stopPropagation()}>
        <div className="wl-pr-ic"><Icon.Trophy /></div>
        <div className="wl-pr-eyebrow">New personal record</div>
        <div className="wl-pr-weight">
          {prMoment.weight}<span className="wl-pr-unit">{unit}</span>
        </div>
        <div className="wl-pr-ex">{prMoment.name}</div>
        <button className="btn primary wl-pr-btn" onClick={() => setPrMoment(null)} autoFocus>
          Let's go
        </button>
      </div>
    </div>
  );

  // ---- Finished: summary screen ----
  if (summary) {
    return createPortal(
      <div className="workout-logger" role="dialog" aria-modal="true">
        <div className="wl-summary">
          <div className="wl-summary-ic wl-summary-cele"><Icon.Check /></div>
          <h2 className="wl-summary-title">Workout complete</h2>
          <p className="wl-summary-cheer">
            {summary.focus
              ? `Strong work on ${summary.focus}. That's in the bank.`
              : "Strong work. That's in the bank."}
          </p>
          <div className="wl-summary-stats">
            <div className="wl-sum-stat">
              <span className="wl-sum-num">{fmtElapsed(summary.durationSec)}</span>
              <span className="wl-sum-lbl">duration</span>
            </div>
            <div className="wl-sum-stat">
              <span className="wl-sum-num">{summary.sets}</span>
              <span className="wl-sum-lbl">sets done</span>
            </div>
            <div className="wl-sum-stat">
              <span className="wl-sum-num">
                {summary.volume ? summary.volume.toLocaleString() : "-"}
              </span>
              <span className="wl-sum-lbl">{unit} lifted</span>
            </div>
          </div>
          <div className="wl-summary-exs">
            {summary.workout.exercises.map((e) => (
              <div key={e.id} className="wl-summary-ex">
                <span>{e.name}</span>
                <span className="wl-summary-ex-sets">{e.sets.length} sets</span>
              </div>
            ))}
          </div>

          {/* Save this session as a reusable template. */}
          {onSaveTemplate && !tmplSaved && (
            <div className="wl-tmpl-save">
              <input
                className="input"
                placeholder="Save as template (name it)…"
                value={tmplName}
                onChange={(e) => setTmplName(e.target.value)}
              />
              <button
                className="btn"
                disabled={!tmplName.trim()}
                style={{ opacity: tmplName.trim() ? 1 : 0.5, flex: "none" }}
                onClick={() => {
                  onSaveTemplate(tmplName.trim(), summary.workout.exercises);
                  setTmplSaved(true);
                }}
              >
                <Icon.Pin2 width={13} height={13} /> Save
              </button>
            </div>
          )}
          {tmplSaved && (
            <div className="wl-tmpl-saved">
              <Icon.Check width={13} height={13} /> Saved as a template
            </div>
          )}

          <button className="btn primary wl-summary-done" onClick={onCancel}>
            Done
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ---- Guided mobile execution (pre-start briefing) ----
  if (guided && !guidedStarted) {
    const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
    return createPortal(
      <div className="workout-logger wl-guided" role="dialog" aria-modal="true">
        <div className="wl-gi">
          <button className="wl-gi-close" onClick={onCancel} title="Cancel">
            <Icon.Close width={16} height={16} />
          </button>
          <div className="wl-gi-eyebrow">Ready to train</div>
          <h1 className="wl-gi-title">{workoutName}</h1>
          <div className="wl-gi-meta">
            <div className="wl-gi-stat"><b>{exercises.length}</b><span>exercises</span></div>
            <div className="wl-gi-stat"><b>~{estimateWorkoutMinutes(exercises, restStrength)}</b><span>min</span></div>
            <div className="wl-gi-stat"><b>{totalSets}</b><span>sets</span></div>
          </div>
          {focusLabel(exercises) && (
            <div className="wl-gi-focus">Focus: {focusLabel(exercises)}</div>
          )}
          <div className="wl-gi-list">
            {exercises.map((e, i) => (
              <div key={e.id} className="wl-gi-ex">
                <span className="wl-gi-ex-n">{i + 1}</span>
                <span className="wl-gi-ex-name">{e.name}</span>
                <span className="wl-gi-ex-sets">{e.sets.length} sets</span>
              </div>
            ))}
          </div>
          <button className="btn primary wl-gi-start" onClick={() => setGuidedStarted(true)}>
            <Icon.Play width={16} height={16} /> Start workout
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ---- Guided mobile execution (one exercise at a time) ----
  if (guided) {
    const cur = exercises[currentIdx];
    const curSetIdx = cur ? cur.sets.findIndex((s) => !s.done) : -1;
    const exComplete = curSetIdx === -1;
    const isLastEx = currentIdx === exercises.length - 1;
    const activeSet = exComplete ? null : cur.sets[curSetIdx];
    const lp = lastPerf(cur?.exerciseId);
    const lastLine = fmtLast(lp, unit);
    const libEx = findExercise(cur?.exerciseId);
    const isBarbell = cur?.type !== "cardio" && libEx?.equipment?.includes("barbell");
    const topW = Math.max(0, ...(cur?.sets || []).map((s) => s.weight || 0), lp?.weight || 0);
    const plates = isBarbell ? platesFor(topW, unit) : null;
    const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
    const progressPct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

    return createPortal(
      <div className="workout-logger wl-guided" role="dialog" aria-modal="true">
        <div className="wl-g-head">
          <button className="btn ghost sm" onClick={onCancel} title="Discard workout">
            <Icon.Close width={14} height={14} /> Cancel
          </button>
          <span className="wl-timer mono">{fmtElapsed(elapsed)}</span>
          <button className="btn ghost sm" onClick={() => setShowPlan(true)} title="View full plan">
            <Icon.Grid width={14} height={14} /> Plan
          </button>
        </div>

        <div className="wl-g-progress">
          <div className="wl-g-prog-bar">
            <div className="wl-g-prog-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="wl-g-prog-text">
            Exercise {currentIdx + 1} of {exercises.length}
          </div>
        </div>

        <div className="wl-g-body">
          <div className="wl-g-ex-name">{cur.name}</div>
          {lastLine && <div className="wl-g-lasttime">{lastLine}</div>}
          {cur.notes && <div className="wl-g-exnote">“{cur.notes}”</div>}

          {!exComplete ? (
            <>
              <div className="wl-g-setlabel">Set {curSetIdx + 1} of {cur.sets.length}</div>

              {cur.type === "cardio" ? (
                <div className="wl-g-fields">
                  <div className="wl-g-field">
                    <div className="wl-g-field-lbl">minutes</div>
                    <div className="wl-g-stepper">
                      <button onClick={() => adjustCur("durationSec", -60)} aria-label="Less">−</button>
                      <div className="wl-g-val">{Math.round((activeSet.durationSec || 0) / 60)}</div>
                      <button onClick={() => adjustCur("durationSec", 60)} aria-label="More">+</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="wl-g-fields">
                  <div className="wl-g-field">
                    <div className="wl-g-field-lbl">{unit}</div>
                    <div className="wl-g-stepper">
                      <button onClick={() => adjustCur("weight", -2.5)} aria-label="Less weight">−</button>
                      <div className="wl-g-val">{activeSet.weight ?? lp?.weight ?? 0}</div>
                      <button onClick={() => adjustCur("weight", 2.5)} aria-label="More weight">+</button>
                    </div>
                  </div>
                  <div className="wl-g-field">
                    <div className="wl-g-field-lbl">reps</div>
                    <div className="wl-g-stepper">
                      <button onClick={() => adjustCur("reps", -1)} aria-label="Fewer reps">−</button>
                      <div className="wl-g-val">{activeSet.reps ?? lp?.reps ?? 8}</div>
                      <button onClick={() => adjustCur("reps", 1)} aria-label="More reps">+</button>
                    </div>
                  </div>
                </div>
              )}

              {plates && topW > 0 && (
                <div className="wl-plates wl-g-plates" title="Plates per side of the bar">
                  <span className="wl-plates-lbl">Per side</span>
                  <span className="wl-plates-list">
                    {plates.perSide.length
                      ? plates.perSide.map((p, i) => <span key={i} className="wl-plate">{p}</span>)
                      : <span className="wl-plates-bar">just the bar</span>}
                    {plates.leftover > 0 && <span className="wl-plates-extra">+{plates.leftover}</span>}
                  </span>
                </div>
              )}

              <button className="btn primary wl-g-log" onClick={guidedLogSet}>
                <Icon.Check width={16} height={16} /> Log set {curSetIdx + 1}
              </button>
            </>
          ) : (
            <div className="wl-g-complete">
              <div className="wl-g-complete-ic"><Icon.Check width={22} height={22} /></div>
              <div className="wl-g-complete-title">{cur.name} done</div>
              {!isLastEx ? (
                <>
                  <div className="wl-g-next">Next: {exercises[currentIdx + 1].name}</div>
                  <button className="btn primary wl-g-continue" onClick={() => goToExercise(currentIdx + 1)}>
                    Continue <Icon.Arrow width={15} height={15} />
                  </button>
                </>
              ) : (
                <>
                  <div className="wl-g-next">That's the last one.</div>
                  <button className="btn primary wl-g-continue" onClick={finish}>
                    <Icon.Check width={15} height={15} /> Finish workout
                  </button>
                </>
              )}
            </div>
          )}

          {/* Sets already logged for this exercise — tap one to re-open/correct. */}
          {cur.sets.some((s) => s.done) && (
            <div className="wl-g-done-sets">
              {cur.sets.map((s, i) =>
                s.done ? (
                  <button
                    key={s.id}
                    className="wl-g-done-set"
                    onClick={() => toggleSetDone(cur.id, s.id)}
                    title="Tap to re-open this set"
                  >
                    <span className="wl-g-done-n">Set {i + 1}</span>
                    <span className="wl-g-done-v">
                      {cur.type === "cardio"
                        ? `${Math.round((s.durationSec || 0) / 60)} min`
                        : `${s.weight ?? 0} ${unit} × ${s.reps ?? 0}`}
                    </span>
                    <Icon.Check width={12} height={12} />
                  </button>
                ) : null
              )}
            </div>
          )}
        </div>

        <div className="wl-g-nav">
          <button
            className="wl-g-navbtn"
            disabled={currentIdx === 0}
            onClick={() => goToExercise(currentIdx - 1)}
          >
            <Icon.Arrow width={14} height={14} className="wl-g-navback" /> Back
          </button>
          <button className="wl-g-navbtn wl-g-finish" onClick={finish} disabled={!anyCompleted}>
            Finish early
          </button>
          <button
            className="wl-g-navbtn"
            disabled={currentIdx === exercises.length - 1}
            onClick={() => goToExercise(currentIdx + 1)}
          >
            Skip <Icon.Arrow width={14} height={14} />
          </button>
        </div>

        {restOverlay}
        {prOverlay}

        {/* Full-plan overlay — review/jump without leaving guided mode. */}
        {showPlan && (
          <div className="wl-plan-scrim" onClick={() => setShowPlan(false)}>
            <div className="wl-plan-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="wl-plan-head">
                <span>Workout plan</span>
                <button className="btn ghost sm" onClick={() => setShowPlan(false)}>Close</button>
              </div>
              <div className="wl-plan-list">
                {exercises.map((e, i) => {
                  const done = e.sets.filter((s) => s.done).length;
                  return (
                    <button
                      key={e.id}
                      className={"wl-plan-item" + (i === currentIdx ? " current" : "")}
                      onClick={() => goToExercise(i)}
                    >
                      <span className="wl-plan-item-n">{i + 1}</span>
                      <span className="wl-plan-item-name">{e.name}</span>
                      <span className="wl-plan-item-sets">
                        {done}/{e.sets.length}
                        {done === e.sets.length && <Icon.Check width={12} height={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body
    );
  }

  // ---- Active logging (list — desktop & free logging) ----
  return createPortal(
    <div className="workout-logger" role="dialog" aria-modal="true">
      <div className="wl-head">
        <button className="btn ghost sm" onClick={onCancel} title="Discard workout">
          <Icon.Close width={14} height={14} /> Cancel
        </button>
        <span className="wl-timer mono">{fmtElapsed(elapsed)}</span>
        <button
          className="btn primary sm"
          onClick={finish}
          disabled={!anyCompleted}
          style={{ opacity: anyCompleted ? 1 : 0.5 }}
          title={anyCompleted ? "Finish and save" : "Complete a set first"}
        >
          <Icon.Check width={14} height={14} /> Finish
        </button>
      </div>

      <div className="wl-body">
        {/* Session overview — the pre-workout briefing for a planned session. */}
        {showOverview && exercises.length > 0 && (
          <div className="wl-overview">
            <div className="wl-overview-eyebrow">Today's session</div>
            <div className="wl-overview-line">
              {exercises.length} exercise{exercises.length === 1 ? "" : "s"}
              {" · "}~{estimateWorkoutMinutes(exercises, restStrength)} min
              {focusLabel(exercises) ? ` · focus: ${focusLabel(exercises)}` : ""}
            </div>
            <button className="wl-overview-go" onClick={() => setShowOverview(false)}>
              Let's go
            </button>
          </div>
        )}

        {exercises.length === 0 && (
          <div className="wl-empty">
            <span className="wl-empty-ic"><Icon.Dumbbell /></span>
            <div className="wl-empty-title">Add your first exercise</div>
            <div className="wl-empty-sub">Search the library below to get started.</div>
          </div>
        )}

        {exercises.map((ex) => {
          const lp = lastPerf(ex.exerciseId);
          const lastLine = fmtLast(lp, unit);
          // Plate math for barbell lifts: what to load per side for the
          // heaviest weight in play (entered, or last-time as a starting point).
          const libEx = findExercise(ex.exerciseId);
          const isBarbell = ex.type !== "cardio" && libEx?.equipment?.includes("barbell");
          const topWeight = Math.max(
            0,
            ...ex.sets.map((s) => s.weight || 0),
            lp?.weight || 0
          );
          const plates = isBarbell ? platesFor(topWeight, unit) : null;
          // "Beat last time": did a completed set this session top the prior best?
          const bestDone = Math.max(0, ...ex.sets.filter((s) => s.done).map((s) => s.weight || 0));
          const beatLast = lp?.weight != null && bestDone > lp.weight;
          return (
          <div key={ex.id} className="wl-ex card" data-cardio={ex.type === "cardio" ? "true" : "false"}>
            <div className="wl-ex-head">
              <div className="wl-ex-head-main">
                <div className="wl-ex-name">{ex.name}</div>
                {lastLine && (
                  <div className="wl-ex-lasttime">
                    {lastLine}
                    {beatLast && <span className="wl-ex-beat">↑ up from last time</span>}
                  </div>
                )}
              </div>
              <button
                className="iconbtn sm"
                onClick={() => removeExercise(ex.id)}
                title="Remove exercise"
                style={{ color: "var(--ink-4)" }}
              >
                <Icon.Trash width={13} height={13} />
              </button>
            </div>

            <div className="wl-sets">
              <div className="wl-set-labels">
                <span className="wl-set-col-n">#</span>
                {ex.type === "cardio" ? (
                  <span className="wl-set-col">Minutes</span>
                ) : (
                  <>
                    <span className="wl-set-col">{unit}</span>
                    <span className="wl-set-col">Reps</span>
                  </>
                )}
                <span className="wl-set-col-check" />
              </div>

              {ex.sets.map((s, i) => (
                <div key={s.id} className={"wl-set" + (s.done ? " done" : "")}>
                  <span className="wl-set-n">{i + 1}</span>
                  {ex.type === "cardio" ? (
                    <input
                      className="input wl-set-input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={s.durationSec ? Math.round(s.durationSec / 60) : ""}
                      onChange={(e) =>
                        patchSet(ex.id, s.id, {
                          durationSec: (Number(e.target.value) || 0) * 60,
                        })
                      }
                    />
                  ) : (
                    <>
                      <input
                        className="input wl-set-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        placeholder={lp?.weight != null ? String(lp.weight) : "0"}
                        value={s.weight ?? ""}
                        onChange={(e) =>
                          patchSet(ex.id, s.id, {
                            weight: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                      <input
                        className="input wl-set-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder={lp?.reps != null ? String(lp.reps) : "0"}
                        value={s.reps ?? ""}
                        onChange={(e) =>
                          patchSet(ex.id, s.id, {
                            reps: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </>
                  )}
                  <button
                    className="wl-set-check"
                    aria-pressed={s.done}
                    onClick={() => toggleSetDone(ex.id, s.id)}
                    title={s.done ? "Mark set not done" : "Mark set complete"}
                  >
                    {s.done && <Icon.Check width={13} height={13} />}
                  </button>
                  <button
                    className="wl-set-del"
                    onClick={() => removeSet(ex.id, s.id)}
                    title="Remove set"
                  >
                    <Icon.Close width={11} height={11} />
                  </button>
                </div>
              ))}

              {plates && topWeight > 0 && (
                <div className="wl-plates" title="Plates to load on each side of the bar">
                  <span className="wl-plates-lbl">Per side</span>
                  <span className="wl-plates-list">
                    {plates.perSide.length
                      ? plates.perSide.map((p, i) => (
                          <span key={i} className="wl-plate">{p}</span>
                        ))
                      : <span className="wl-plates-bar">just the bar</span>}
                    {plates.leftover > 0 && (
                      <span className="wl-plates-extra">+{plates.leftover}</span>
                    )}
                  </span>
                </div>
              )}

              <button className="wl-add-set" onClick={() => addSet(ex.id)}>
                <Icon.Plus width={13} height={13} /> Add set
              </button>
            </div>
          </div>
          );
        })}

        <button className="btn wl-add-ex" onClick={() => setShowPicker(true)}>
          <Icon.Plus width={14} height={14} /> Add exercise
        </button>
      </div>

      {/* Rest timer + PR celebration (shared with guided mode). */}
      {restOverlay}
      {prOverlay}

      {/* Exercise picker */}
      {showPicker && (
        <div className="wl-picker">
          <div className="wl-picker-head">
            <div className="notes-search" style={{ flex: 1 }}>
              <Icon.Search />
              <input
                className="notes-search-input"
                autoFocus
                placeholder="Search exercises…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className="btn ghost sm"
              onClick={() => {
                setShowPicker(false);
                setQuery("");
              }}
            >
              Close
            </button>
          </div>
          <div className="wl-picker-list">
            {results.map((r) => (
              <button key={r.id} className="wl-picker-item" onClick={() => addExercise(r)}>
                <span className="wl-picker-name">{r.name}</span>
                <span className="wl-picker-group">{r.muscleGroup}</span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="wl-picker-empty">No exercises match “{query.trim()}”.</div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// Re-export for callers that want to resolve a library exercise by id.
export { findExercise };
