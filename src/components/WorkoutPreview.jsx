import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { alternativesFor } from "../lib/workoutGen.js";
import { todayKey } from "../lib/model.js";
import { searchExercises } from "../lib/exercises.js";

/* WorkoutPreview - the editable review/build step for a session, shown before
   you start (or when creating one from scratch). Works as both:

   - the review surface for a generated / imported / template plan, and
   - the manual workout BUILDER (desktop and mobile): name it, search the
     library or add a custom movement, reorder with touch-friendly arrows,
     set sets/reps/weight/rest/notes per exercise.

   From here a plan can be started now, scheduled for a date, or saved as a
   reusable template. */

// Rough duration from target sets (~35s work + rest each) + setup per exercise.
function estimatePlanMinutes(plan, restDefault = 90) {
  let secs = 0;
  for (const ex of plan) {
    if (ex.type === "cardio") {
      secs += (ex.targetMinutes || 10) * 60 + 30;
    } else {
      const sets = ex.targetSets || 3;
      secs += sets * (35 + (ex.restSec ?? restDefault)) + 30;
    }
  }
  return Math.max(5, Math.round(secs / 60));
}

export default function WorkoutPreview({
  profile,
  initialPlan = [],
  initialName = "",
  initialDate = null, // preselect the schedule date (editing an instance)
  nameEditable = false,
  onStart, // (plan, name) => void
  onRegenerate, // () => freshPlan
  onSaveTemplate, // (name, plan) => void
  onSchedule, // (dateKey, plan, name) => void — plan it for a calendar day
  onClose,
  eyebrow = "Generated for you",
  title = "Today's workout",
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [name, setName] = useState(initialName);
  const [tmplName, setTmplName] = useState(initialName);
  const [savingTmpl, setSavingTmpl] = useState(false);
  const [tmplSaved, setTmplSaved] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [schedDate, setSchedDate] = useState(() => initialDate || todayKey());
  const [scheduled, setScheduled] = useState(false);
  const [adding, setAdding] = useState(initialPlan.length === 0 && nameEditable);
  const [query, setQuery] = useState("");
  const [openExtras, setOpenExtras] = useState({}); // idx -> bool (rest/notes row)
  const unit = profile?.weightUnit || "lbs";

  const patch = (idx, p) =>
    setPlan((list) => list.map((e, i) => (i === idx ? { ...e, ...p } : e)));
  const remove = (idx) => setPlan((list) => list.filter((_, i) => i !== idx));
  const move = (idx, dir) =>
    setPlan((list) => {
      const j = idx + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const results = useMemo(() => (adding ? searchExercises(query, 8) : []), [adding, query]);

  const addFromLibrary = (libEx) => {
    setPlan((list) => [
      ...list,
      {
        exerciseId: libEx.id,
        name: libEx.name,
        muscleGroup: libEx.muscleGroup,
        type: libEx.type,
        targetSets: 3,
        targetReps: libEx.type === "cardio" ? null : 8,
        targetWeight: null,
        targetMinutes: libEx.type === "cardio" ? 10 : null,
        restSec: null,
        notes: null,
      },
    ]);
    setQuery("");
  };

  const addCustom = () => {
    const n = query.trim().slice(0, 80);
    if (!n) return;
    setPlan((list) => [
      ...list,
      {
        exerciseId: null, // custom movement — still fully loggable
        name: n,
        muscleGroup: "other",
        type: "strength",
        targetSets: 3,
        targetReps: 8,
        targetWeight: null,
        targetMinutes: null,
        restSec: null,
        notes: null,
      },
    ]);
    setQuery("");
  };

  const swap = (idx) => {
    const ex = plan[idx];
    const excluded = plan.map((p) => p.exerciseId);
    const alts = alternativesFor(ex, profile, excluded);
    if (!alts.length) return;
    const next = alts[Math.floor(Math.random() * alts.length)];
    patch(idx, {
      exerciseId: next.id,
      name: next.name,
      muscleGroup: next.muscleGroup,
      type: next.type,
      targetWeight: null, // different lift - clear the carried-over load
      targetReps: next.type === "cardio" ? null : ex.targetReps,
    });
  };

  const regenerate = () => {
    const fresh = onRegenerate?.();
    if (fresh) {
      setPlan(fresh);
      setTmplSaved(false);
    }
  };

  const num = (v) => (v === "" ? null : Number(v));
  const estMin = estimatePlanMinutes(plan, profile?.restStrengthSec || 90);

  return createPortal(
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal wp-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="wp-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="eyebrow">{eyebrow}</div>
            {nameEditable ? (
              <input
                className="input wp-name-input"
                placeholder="Workout name…"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
              />
            ) : (
              <h2 className="page-title" style={{ fontSize: 20 }}>{title}</h2>
            )}
            {plan.length > 0 && (
              <div className="wp-est">
                {plan.length} exercises · ~{estMin} min
              </div>
            )}
          </div>
          <button className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>

        <div className="wp-body">
          {plan.length === 0 && !adding && (
            <div className="wp-empty">
              {onRegenerate ? "Nothing to show - try regenerating." : "No exercises yet - add one below."}
            </div>
          )}
          {plan.map((ex, idx) => (
            <div key={idx} className="wp-ex">
              <div className="wp-ex-top">
                <div className="wp-ex-name">
                  {ex.name}
                  <span className="wp-ex-group">{ex.muscleGroup}</span>
                </div>
                <div className="wp-ex-actions">
                  <button
                    className="wp-ex-btn"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                    aria-label={`Move ${ex.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    className="wp-ex-btn"
                    onClick={() => move(idx, 1)}
                    disabled={idx === plan.length - 1}
                    title="Move down"
                    aria-label={`Move ${ex.name} down`}
                  >
                    ↓
                  </button>
                  {ex.exerciseId && (
                    <button className="wp-ex-btn" onClick={() => swap(idx)} title="Swap exercise">
                      <Icon.Reset width={13} height={13} /> Swap
                    </button>
                  )}
                  <button
                    className="wp-ex-btn"
                    onClick={() => setOpenExtras((o) => ({ ...o, [idx]: !o[idx] }))}
                    title="Rest time and notes"
                    aria-expanded={Boolean(openExtras[idx])}
                  >
                    ⋯
                  </button>
                  <button
                    className="wp-ex-btn danger"
                    onClick={() => remove(idx)}
                    title="Remove"
                  >
                    <Icon.Close width={13} height={13} />
                  </button>
                </div>
              </div>
              <div className="wp-ex-fields">
                <label className="wp-field">
                  <span>Sets</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={ex.targetSets ?? ""}
                    onChange={(e) => patch(idx, { targetSets: num(e.target.value) })}
                  />
                </label>
                {ex.type === "cardio" ? (
                  <label className="wp-field">
                    <span>Minutes</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={ex.targetMinutes ?? ""}
                      onChange={(e) => patch(idx, { targetMinutes: num(e.target.value) })}
                    />
                  </label>
                ) : (
                  <>
                    <label className="wp-field">
                      <span>Reps</span>
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={ex.targetReps ?? ""}
                        onChange={(e) => patch(idx, { targetReps: num(e.target.value) })}
                      />
                    </label>
                    <label className="wp-field">
                      <span>{unit}</span>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        placeholder="-"
                        value={ex.targetWeight ?? ""}
                        onChange={(e) => patch(idx, { targetWeight: num(e.target.value) })}
                      />
                    </label>
                  </>
                )}
              </div>
              {openExtras[idx] && (
                <div className="wp-ex-extras">
                  <label className="wp-field">
                    <span>Rest (sec)</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="900"
                      placeholder={String(profile?.restStrengthSec || 90)}
                      value={ex.restSec ?? ""}
                      onChange={(e) => patch(idx, { restSec: num(e.target.value) })}
                    />
                  </label>
                  <label className="wp-field wp-field-wide">
                    <span>Note</span>
                    <input
                      className="input"
                      type="text"
                      maxLength={200}
                      placeholder="e.g. slow negatives, seat at 4"
                      value={ex.notes ?? ""}
                      onChange={(e) => patch(idx, { notes: e.target.value || null })}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}

          {adding ? (
            <div className="wp-add">
              <div className="wp-add-row">
                <input
                  className="input"
                  autoFocus
                  placeholder="Search exercises…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button className="btn ghost sm" onClick={() => { setAdding(false); setQuery(""); }}>
                  Done
                </button>
              </div>
              <div className="wp-add-results">
                {results.map((r) => (
                  <button key={r.id} className="wp-add-item" onClick={() => addFromLibrary(r)}>
                    <span className="wp-add-name">{r.name}</span>
                    <span className="wp-ex-group">{r.muscleGroup}</span>
                  </button>
                ))}
                {query.trim() && (
                  <button className="wp-add-item wp-add-custom" onClick={addCustom}>
                    <Icon.Plus width={13} height={13} /> Add “{query.trim()}” as a custom exercise
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button className="wp-add-toggle" onClick={() => setAdding(true)}>
              <Icon.Plus width={14} height={14} /> Add exercise
            </button>
          )}
        </div>

        <div className="wp-foot">
          {scheduling ? (
            <div className="wp-tmpl-row">
              <input
                className="input"
                type="date"
                autoFocus
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
              />
              <button
                className="btn"
                disabled={!schedDate}
                style={{ opacity: schedDate ? 1 : 0.5, flex: "none" }}
                onClick={() => {
                  onSchedule?.(schedDate, plan, name.trim());
                  setScheduling(false);
                  setScheduled(true);
                }}
              >
                Schedule
              </button>
              <button className="btn ghost" style={{ flex: "none" }} onClick={() => setScheduling(false)}>
                Cancel
              </button>
            </div>
          ) : savingTmpl ? (
            <div className="wp-tmpl-row">
              <input
                className="input"
                autoFocus
                placeholder="Template name…"
                value={tmplName}
                onChange={(e) => setTmplName(e.target.value)}
              />
              <button
                className="btn"
                disabled={!tmplName.trim()}
                style={{ opacity: tmplName.trim() ? 1 : 0.5, flex: "none" }}
                onClick={() => {
                  onSaveTemplate?.(tmplName.trim(), plan);
                  setSavingTmpl(false);
                  setTmplSaved(true);
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <div className="wp-foot-actions">
              {onRegenerate && (
                <button className="btn ghost" onClick={regenerate}>
                  <Icon.Reset width={14} height={14} /> Regenerate
                </button>
              )}
              {onSchedule && (
                <button
                  className="btn"
                  onClick={() => setScheduling(true)}
                  disabled={plan.length === 0 || scheduled}
                  style={{ opacity: plan.length === 0 || scheduled ? 0.5 : 1 }}
                >
                  <Icon.Calendar width={13} height={13} /> {scheduled ? "Scheduled" : "Schedule"}
                </button>
              )}
              <button
                className="btn"
                onClick={() => {
                  setTmplName((t) => t || name);
                  setSavingTmpl(true);
                }}
                disabled={plan.length === 0 || tmplSaved}
                style={{ opacity: plan.length === 0 || tmplSaved ? 0.5 : 1 }}
              >
                <Icon.Pin2 width={13} height={13} /> {tmplSaved ? "Saved" : "Save as template"}
              </button>
              <button
                className="btn primary wp-start"
                onClick={() => onStart?.(plan, name.trim())}
                disabled={plan.length === 0}
                style={{ opacity: plan.length === 0 ? 0.5 : 1 }}
              >
                <Icon.Bolt width={14} height={14} /> Start workout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
