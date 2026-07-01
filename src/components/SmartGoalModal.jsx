import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { todayKey } from "../lib/model.js";
import { EQUIPMENT_OPTIONS } from "../lib/exercises.js";

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

// Fitness onboarding: a name, then the 3 profile steps from the brief.
const FIT_STEPS = ["Name", "Experience", "Equipment", "Your plan"];
const FIT_EXPERIENCE = [
  { value: "beginner", label: "Beginner", desc: "New to training, or back after a long break. We'll keep volume gentle." },
  { value: "intermediate", label: "Intermediate", desc: "Comfortable with the basics and training somewhat regularly." },
  { value: "advanced", label: "Advanced", desc: "Years of consistent training; you know your lifts and can handle more." },
];
const FIT_GOAL_TYPES = [
  { value: "strength", label: "Build strength" },
  { value: "hypertrophy", label: "Build muscle" },
  { value: "endurance", label: "Improve endurance" },
  { value: "loseweight", label: "Lose weight" },
  { value: "general", label: "General fitness" },
];
const FIT_DAYS = [2, 3, 4, 5];
const BLANK_FIT = {
  name: "",
  experienceLevel: "beginner",
  availableEquipment: ["bodyweight"],
  goalType: "general",
  workoutDaysPerWeek: 3,
  weightUnit: "lbs",
};

export default function SmartGoalModal({ onCreate, onClose }) {
  // kind: null = chooser, "smart" = SMART wizard, "recovery" = recovery flow,
  // "fitness" = fitness goal + onboarding
  const [kind, setKind] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(BLANK_FORM);
  const [rec, setRec] = useState({ label: "", startDate: todayKey(), why: "" });
  const [fit, setFit] = useState(BLANK_FIT);

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

  // --- fitness flow ---
  const fitLast = step === FIT_STEPS.length - 1;
  const fitCanContinue = step !== 0 || fit.name.trim().length > 0;
  const toggleEquip = (id) =>
    setFit((f) => {
      const has = f.availableEquipment.includes(id);
      const next = has
        ? f.availableEquipment.filter((e) => e !== id)
        : [...f.availableEquipment, id];
      // Never let the selection become empty - bodyweight is the floor.
      return { ...f, availableEquipment: next.length ? next : ["bodyweight"] };
    });
  const submitFitness = () => {
    const name = fit.name.trim();
    if (!name) {
      setStep(0);
      return;
    }
    onCreate({
      name,
      type: "fitness",
      color: "oklch(0.66 0.17 45)", // energetic orange, distinct from goal blues/greens
      // Carried alongside the goal; App strips this off and persists it via
      // updateFitnessProfile (the profile is app-wide, one lifter).
      fitnessProfile: {
        experienceLevel: fit.experienceLevel,
        availableEquipment: fit.availableEquipment,
        goalType: fit.goalType,
        workoutDaysPerWeek: fit.workoutDaysPerWeek,
        weightUnit: fit.weightUnit,
      },
    });
  };
  const fitNext = () => {
    if (!fitCanContinue) return;
    if (fitLast) submitFitness();
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
                <button
                  type="button"
                  className="goal-kind-card"
                  onClick={() => { setKind("fitness"); setStep(0); }}
                >
                  <span className="goal-kind-ic fitness"><Icon.Dumbbell /></span>
                  <span className="goal-kind-name">A fitness goal</span>
                  <span className="goal-kind-desc">
                    Log workouts, track PRs, and get sessions built for you. Includes a rest timer.
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

          {/* ---------- Fitness flow ---------- */}
          {kind === "fitness" && (
            <>
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div className="eyebrow">Fitness · step {step + 1} of {FIT_STEPS.length} · {FIT_STEPS[step]}</div>
                  <h2 className="page-title" style={{ fontSize: 21 }}>Set up your training</h2>
                  <p className="page-sub" style={{ margin: "5px 0 0" }}>
                    A few quick questions so we can build workouts that fit you. Change any of this later.
                  </p>
                </div>
                <button className="iconbtn" title="Close" onClick={onClose}>
                  <Icon.Close />
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                {step === 0 && (
                  <Field
                    label="What do you want to call this?"
                    hint="Example: Get stronger, Build muscle, Marathon prep."
                    value={fit.name}
                    onChange={(v) => setFit((f) => ({ ...f, name: v }))}
                    autoFocus
                    placeholder="Get stronger"
                  />
                )}

                {step === 1 && (
                  <div>
                    <div className="card-title" style={{ marginBottom: 6 }}>How much training experience do you have?</div>
                    <div className="stack fit-choice-list" style={{ gap: 8, marginTop: 10 }}>
                      {FIT_EXPERIENCE.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={"fit-choice" + (fit.experienceLevel === o.value ? " active" : "")}
                          onClick={() => setFit((f) => ({ ...f, experienceLevel: o.value }))}
                        >
                          <span className="fit-choice-name">{o.label}</span>
                          <span className="fit-choice-desc">{o.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="card-title" style={{ marginBottom: 6 }}>What equipment can you use?</div>
                    <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                      Pick everything you have access to. Bodyweight is always included.
                    </p>
                    <div className="fit-equip-grid">
                      {EQUIPMENT_OPTIONS.map((opt) => {
                        const on = fit.availableEquipment.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={"fit-equip-chip" + (on ? " active" : "")}
                            aria-pressed={on}
                            onClick={() => toggleEquip(opt.id)}
                          >
                            {on && <Icon.Check width={13} height={13} />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="stack" style={{ gap: 16 }}>
                    <div>
                      <div className="card-title" style={{ marginBottom: 8 }}>How many days a week?</div>
                      <div className="seg">
                        {FIT_DAYS.map((d) => (
                          <button
                            key={d}
                            className={fit.workoutDaysPerWeek === d ? "active" : ""}
                            onClick={() => setFit((f) => ({ ...f, workoutDaysPerWeek: d }))}
                          >
                            {d} days
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="card-title" style={{ marginBottom: 8 }}>What's your main focus?</div>
                      <div className="fit-equip-grid">
                        {FIT_GOAL_TYPES.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            className={"fit-equip-chip" + (fit.goalType === o.value ? " active" : "")}
                            aria-pressed={fit.goalType === o.value}
                            onClick={() => setFit((f) => ({ ...f, goalType: o.value }))}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="card-title" style={{ marginBottom: 8 }}>Weight unit</div>
                      <div className="seg" style={{ width: "fit-content" }}>
                        {["lbs", "kg"].map((u) => (
                          <button
                            key={u}
                            className={fit.weightUnit === u ? "active" : ""}
                            onClick={() => setFit((f) => ({ ...f, weightUnit: u }))}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
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
                  <button className="btn primary" onClick={fitNext} disabled={!fitCanContinue}
                    style={{ opacity: fitCanContinue ? 1 : 0.55 }}>
                    {fitLast ? (<><Icon.Check /> Create</>) : (<>Next <Icon.Arrow /></>)}
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
