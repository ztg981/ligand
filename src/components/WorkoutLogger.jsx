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
  onFinish,
  onCancel,
  onSaveTemplate, // (name, exercises) => void
}) {
  const unit = profile?.weightUnit || "lbs";
  const restStrength = profile?.restStrengthSec || 90;
  const restCardio = profile?.restCardioSec || 30;

  // All-time best weight for an exercise coming INTO this session - the
  // baseline a completed set must beat to count as a personal record.
  const priorBestFor = (exerciseId) => exercisePR(priorWorkouts, exerciseId);
  const celebratedRef = useRef(new Set()); // exerciseIds already celebrated this session

  // Seed from a template/generated plan if provided, else start empty.
  const wasSeeded = Boolean(initialExercises && initialExercises.length);
  const [exercises, setExercises] = useState(() =>
    wasSeeded ? initialExercises : []
  );
  const [showPicker, setShowPicker] = useState(!initialExercises);
  // Session overview shown at the start of a seeded (planned) session — the
  // "here's what's ahead" briefing a trainer would give before you begin.
  const [showOverview, setShowOverview] = useState(wasSeeded);

  // Prior best-per-exercise, so each movement can show "Last time: 135 × 8".
  const lastPerf = (exerciseId) =>
    exerciseId ? lastExercisePerformance(priorWorkouts, exerciseId) : null;
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState(null); // set on finish
  const [tmplName, setTmplName] = useState("");
  const [tmplSaved, setTmplSaved] = useState(false);

  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
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
    const dur = exercise.type === "cardio" ? restCardio : restStrength;
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
    onFinish?.(workout);
  };

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

  // ---- Active logging ----
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

      {/* Rest timer - auto-starts after each completed set. The integrated
          in-gym clock: big countdown, the exercise you just did, quick
          adjust, and skip. */}
      {rest && (
        <div className="wl-rest" role="status" aria-live="polite">
          <div
            className="wl-rest-bar"
            style={{ width: `${(rest.remaining / Math.max(1, rest.total)) * 100}%` }}
            aria-hidden="true"
          />
          <div className="wl-rest-inner">
            {/* Ring countdown (Pomodoro-style) with the remaining seconds in
               the center. */}
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
              <span className="wl-rest-ex">Next up: {rest.name}</span>
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
      )}

      {/* PR celebration */}
      {prMoment && (
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
      )}

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
