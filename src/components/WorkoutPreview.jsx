import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { alternativesFor } from "../lib/workoutGen.js";
import { todayKey } from "../lib/model.js";

/* WorkoutPreview - the editable review step for a generated (or template)
   session, shown before you start. Swap any exercise for another that hits
   the same muscle group, tweak sets/reps/weight, drop exercises, regenerate
   the whole thing, save it as a template, or start logging it. */

export default function WorkoutPreview({
  profile,
  initialPlan = [],
  onStart,
  onRegenerate, // () => freshPlan
  onSaveTemplate, // (name, plan) => void
  onSchedule, // (dateKey, plan) => void — plan it for a calendar day
  onClose,
  eyebrow = "Generated for you",
  title = "Today's workout",
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [tmplName, setTmplName] = useState("");
  const [savingTmpl, setSavingTmpl] = useState(false);
  const [tmplSaved, setTmplSaved] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [schedDate, setSchedDate] = useState(() => todayKey());
  const [scheduled, setScheduled] = useState(false);
  const unit = profile?.weightUnit || "lbs";

  const patch = (idx, p) =>
    setPlan((list) => list.map((e, i) => (i === idx ? { ...e, ...p } : e)));
  const remove = (idx) => setPlan((list) => list.filter((_, i) => i !== idx));

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

  return createPortal(
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal wp-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="wp-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2 className="page-title" style={{ fontSize: 20 }}>{title}</h2>
          </div>
          <button className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>

        <div className="wp-body">
          {plan.length === 0 && (
            <div className="wp-empty">
              Nothing to show - try regenerating.
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
                  <button className="wp-ex-btn" onClick={() => swap(idx)} title="Swap exercise">
                    <Icon.Reset width={13} height={13} /> Swap
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
            </div>
          ))}
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
                  onSchedule?.(schedDate, plan);
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
                onClick={() => setSavingTmpl(true)}
                disabled={plan.length === 0 || tmplSaved}
                style={{ opacity: plan.length === 0 || tmplSaved ? 0.5 : 1 }}
              >
                <Icon.Pin2 width={13} height={13} /> {tmplSaved ? "Saved" : "Save as template"}
              </button>
              <button
                className="btn primary wp-start"
                onClick={() => onStart?.(plan)}
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
