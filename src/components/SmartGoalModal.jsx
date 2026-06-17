import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { todayKey } from "../lib/model.js";

const STEPS = [
  "Goal name",
  "Specific",
  "Measurable",
  "Achievable",
  "Relevant",
  "Time-bound",
  "Starter habits",
];

const ACHIEVABLE = [
  { value: "easy", label: "Easy" },
  { value: "balanced", label: "Balanced" },
  { value: "stretch", label: "Stretch" },
];

const BLANK_FORM = {
  name: "",
  specific: "",
  measurable: "",
  achievable: "balanced",
  relevant: "",
  deadline: "",
  habits: ["", "", ""],
};

const REC_STEPS = ["What", "Since when", "Why"];

export default function SmartGoalModal({ onCreate, onClose }) {
  // kind: null = chooser, "smart" = SMART wizard, "recovery" = recovery flow
  const [kind, setKind] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(BLANK_FORM);
  const [rec, setRec] = useState({ label: "", startDate: todayKey(), why: "" });

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const updateHabit = (index, value) =>
    update({ habits: form.habits.map((h, i) => (i === index ? value : h)) });

  const isLast = step === STEPS.length - 1;
  const canContinue = step !== 0 || form.name.trim().length > 0;

  const submit = () => {
    const name = form.name.trim();
    if (!name) {
      setStep(0);
      return;
    }
    onCreate({
      name,
      smartFields: {
        specific: form.specific.trim(),
        measurable: form.measurable.trim(),
        achievable: form.achievable,
        relevant: form.relevant.trim(),
        timeBound: form.deadline,
      },
      deadline: form.deadline || null,
      starterHabits: form.habits.map((h) => h.trim()).filter(Boolean).slice(0, 3),
    });
  };

  const next = () => {
    if (!canContinue) return;
    if (isLast) submit();
    else setStep((s) => s + 1);
  };

  // --- recovery flow ---
  const recLast = step === REC_STEPS.length - 1;
  const recCanContinue = step !== 0 || rec.label.trim().length > 0;
  const submitRecovery = () => {
    const label = rec.label.trim();
    if (!label) {
      setStep(0);
      return;
    }
    onCreate({
      name: label,
      type: "recovery",
      color: "oklch(0.62 0.11 150)", // a calm green, distinct from goal blues
      recoveryData: {
        startDate: rec.startDate || todayKey(),
        label,
        why: rec.why.trim(),
        milestonesReached: [],
      },
    });
  };
  const recNext = () => {
    if (!recCanContinue) return;
    if (recLast) submitRecovery();
    else setStep((s) => s + 1);
  };

  const backToChooser = () => {
    setKind(null);
    setStep(0);
  };

  return (
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-create-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: "100%" }}
      >
        <div style={{ padding: 18 }}>
          {/* ---------- Chooser ---------- */}
          {kind === null && (
            <>
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div className="eyebrow">New</div>
                  <h2 id="goal-create-title" className="page-title" style={{ fontSize: 21 }}>
                    What would you like to add?
                  </h2>
                </div>
                <button className="iconbtn" title="Close" onClick={onClose}>
                  <Icon.Close />
                </button>
              </div>
              <div className="goal-kind-grid" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="goal-kind-card"
                  onClick={() => { setKind("smart"); setStep(0); }}
                >
                  <span className="goal-kind-ic"><Icon.Target /></span>
                  <span className="goal-kind-name">A goal</span>
                  <span className="goal-kind-desc">
                    Plan something you want to achieve, with optional SMART details and habits.
                  </span>
                </button>
                <button
                  type="button"
                  className="goal-kind-card"
                  onClick={() => { setKind("recovery"); setStep(0); }}
                >
                  <span className="goal-kind-ic recovery"><Icon.Leaf /></span>
                  <span className="goal-kind-name">A recovery tracker</span>
                  <span className="goal-kind-desc">
                    Count the days you've been free from something. A private, gentle space.
                  </span>
                </button>
              </div>
            </>
          )}

          {/* ---------- SMART wizard ---------- */}
          {kind === "smart" && (
            <>
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div className="eyebrow">Step {step + 1} of {STEPS.length} · {STEPS[step]}</div>
                  <h2 className="page-title" style={{ fontSize: 21 }}>Create a goal</h2>
                  <p className="page-sub" style={{ margin: "5px 0 0" }}>
                    Keep it simple. One sentence is enough. You can adjust this later.
                  </p>
                </div>
                <button className="iconbtn" title="Close" onClick={onClose}>
                  <Icon.Close />
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                {step === 0 && (
                  <Field label="What do you want to achieve?" hint="A short name is perfect."
                    value={form.name} onChange={(v) => update({ name: v })} autoFocus
                    placeholder="Get fit, launch a side project, plan college..." />
                )}
                {step === 1 && (
                  <Field label="What exactly would success look like?" hint="Specific does not have to mean complicated."
                    value={form.specific} onChange={(v) => update({ specific: v })}
                    placeholder="Example: Work out three times a week." multiline />
                )}
                {step === 2 && (
                  <Field label="How will you track progress?" hint="A number, rhythm, checklist, or finish line all count."
                    value={form.measurable} onChange={(v) => update({ measurable: v })}
                    placeholder="Example: 3 workouts per week, 10 applications, 5 chapters." multiline />
                )}
                {step === 3 && (
                  <div>
                    <div className="card-title" style={{ marginBottom: 6 }}>Is this realistic for right now?</div>
                    <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                      Choose the energy level that feels kind to future-you.
                    </p>
                    <div className="seg">
                      {ACHIEVABLE.map((o) => (
                        <button key={o.value} className={form.achievable === o.value ? "active" : ""}
                          onClick={() => update({ achievable: o.value })}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {step === 4 && (
                  <Field label="Why does this matter to you?" hint="One sentence is enough."
                    value={form.relevant} onChange={(v) => update({ relevant: v })}
                    placeholder="Example: I want more energy and confidence." multiline />
                )}
                {step === 5 && (
                  <div>
                    <label className="card-title" htmlFor="smart-deadline">Optional target date</label>
                    <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>
                      Helpful if there is a real deadline. Skip it if that adds pressure.
                    </p>
                    <input id="smart-deadline" className="input" type="date"
                      value={form.deadline} onChange={(e) => update({ deadline: e.target.value })} />
                  </div>
                )}
                {step === 6 && (
                  <div>
                    <div className="card-title" style={{ marginBottom: 6 }}>Add starter habits</div>
                    <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                      Optional. Add 1-3 tiny habits that support this goal.
                    </p>
                    <div className="stack" style={{ gap: 8 }}>
                      {form.habits.map((habit, index) => (
                        <input key={index} className="input" value={habit}
                          onChange={(e) => updateHabit(index, e.target.value)}
                          placeholder={`Starter habit ${index + 1}`} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="row between" style={{ marginTop: 18 }}>
                <button className="btn ghost"
                  onClick={() => (step === 0 ? backToChooser() : setStep((s) => s - 1))}>
                  Back
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost" onClick={onClose}>Cancel</button>
                  <button className="btn primary" onClick={next} disabled={!canContinue}
                    style={{ opacity: canContinue ? 1 : 0.55 }}>
                    {isLast ? (<><Icon.Check /> Create goal</>) : (<>Next <Icon.Arrow /></>)}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ---------- Recovery flow ---------- */}
          {kind === "recovery" && (
            <>
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div className="eyebrow">Recovery · step {step + 1} of {REC_STEPS.length}</div>
                  <h2 className="page-title" style={{ fontSize: 21 }}>A space that's yours</h2>
                  <p className="page-sub" style={{ margin: "5px 0 0" }}>
                    Private to you, on this device. You can change any of this later.
                  </p>
                </div>
                <button className="iconbtn" title="Close" onClick={onClose}>
                  <Icon.Close />
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                {step === 0 && (
                  <Field
                    label="What are you working on being free from?"
                    hint="In your own words. Only you will see this."
                    value={rec.label}
                    onChange={(v) => setRec((r) => ({ ...r, label: v }))}
                    autoFocus
                    placeholder=""
                  />
                )}
                {step === 1 && (
                  <div>
                    <label className="card-title" htmlFor="rec-start">When did your current streak start?</label>
                    <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>
                      Defaults to today. Pick an earlier date if your streak already began.
                    </p>
                    <input
                      id="rec-start"
                      className="input"
                      type="date"
                      max={todayKey()}
                      value={rec.startDate}
                      onChange={(e) => setRec((r) => ({ ...r, startDate: e.target.value }))}
                    />
                  </div>
                )}
                {step === 2 && (
                  <Field
                    label="Why does this matter to you?"
                    hint="Optional. We'll show this back to you as a gentle reminder."
                    value={rec.why}
                    onChange={(v) => setRec((r) => ({ ...r, why: v }))}
                    placeholder="For my family, my health, the person I'm becoming..."
                    multiline
                  />
                )}
              </div>

              <div className="row between" style={{ marginTop: 18 }}>
                <button className="btn ghost"
                  onClick={() => (step === 0 ? backToChooser() : setStep((s) => s - 1))}>
                  Back
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost" onClick={onClose}>Cancel</button>
                  <button className="btn primary" onClick={recNext} disabled={!recCanContinue}
                    style={{ opacity: recCanContinue ? 1 : 0.55 }}>
                    {recLast ? (<><Icon.Check /> Begin</>) : (<>Next <Icon.Arrow /></>)}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, value, onChange, placeholder, multiline = false, autoFocus = false }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label className="card-title" htmlFor={id}>{label}</label>
      {hint && (
        <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>{hint}</p>
      )}
      {multiline ? (
        <textarea id={id} className="input" rows={4} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoFocus={autoFocus} style={{ resize: "vertical", lineHeight: 1.5 }} />
      ) : (
        <input id={id} className="input" value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
      )}
    </div>
  );
}
