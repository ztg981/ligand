import { useState } from "react";
import { Icon } from "./Icons.jsx";

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

export default function SmartGoalModal({ onCreate, onClose }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(BLANK_FORM);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const updateHabit = (index, value) =>
    update({
      habits: form.habits.map((h, i) => (i === index ? value : h)),
    });

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

  return (
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-goal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div style={{ padding: 18 }}>
          <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="eyebrow">
                Step {step + 1} of {STEPS.length} · {STEPS[step]}
              </div>
              <h2 id="smart-goal-title" className="page-title" style={{ fontSize: 21 }}>
                Create a SMART goal
              </h2>
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
              <Field
                label="What do you want to achieve?"
                hint="A short name is perfect."
                value={form.name}
                onChange={(value) => update({ name: value })}
                autoFocus
                placeholder="Get fit, launch a side project, plan college..."
              />
            )}

            {step === 1 && (
              <Field
                label="What exactly would success look like?"
                hint="Specific does not have to mean complicated."
                value={form.specific}
                onChange={(value) => update({ specific: value })}
                placeholder="Example: Work out three times a week."
                multiline
              />
            )}

            {step === 2 && (
              <Field
                label="How will you track progress?"
                hint="A number, rhythm, checklist, or finish line all count."
                value={form.measurable}
                onChange={(value) => update({ measurable: value })}
                placeholder="Example: 3 workouts per week, 10 applications, 5 chapters."
                multiline
              />
            )}

            {step === 3 && (
              <div>
                <div className="card-title" style={{ marginBottom: 6 }}>
                  Is this realistic for right now?
                </div>
                <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                  Choose the energy level that feels kind to future-you.
                </p>
                <div className="seg">
                  {ACHIEVABLE.map((option) => (
                    <button
                      key={option.value}
                      className={form.achievable === option.value ? "active" : ""}
                      onClick={() => update({ achievable: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <Field
                label="Why does this matter to you?"
                hint="One sentence is enough."
                value={form.relevant}
                onChange={(value) => update({ relevant: value })}
                placeholder="Example: I want more energy and confidence."
                multiline
              />
            )}

            {step === 5 && (
              <div>
                <label className="card-title" htmlFor="smart-deadline">
                  Optional target date
                </label>
                <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>
                  Helpful if there is a real deadline. Skip it if that adds pressure.
                </p>
                <input
                  id="smart-deadline"
                  className="input"
                  type="date"
                  value={form.deadline}
                  onChange={(e) => update({ deadline: e.target.value })}
                />
              </div>
            )}

            {step === 6 && (
              <div>
                <div className="card-title" style={{ marginBottom: 6 }}>
                  Add starter habits
                </div>
                <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                  Optional. Add 1-3 tiny habits that support this goal.
                </p>
                <div className="stack" style={{ gap: 8 }}>
                  {form.habits.map((habit, index) => (
                    <input
                      key={index}
                      className="input"
                      value={habit}
                      onChange={(e) => updateHabit(index, e.target.value)}
                      placeholder={`Starter habit ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="row between" style={{ marginTop: 18 }}>
            <button
              className="btn ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{ opacity: step === 0 ? 0.45 : 1 }}
            >
              Back
            </button>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={next}
                disabled={!canContinue}
                style={{ opacity: canContinue ? 1 : 0.55 }}
              >
                {isLast ? (
                  <>
                    <Icon.Check /> Create goal
                  </>
                ) : (
                  <>
                    Next <Icon.Arrow />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  multiline = false,
  autoFocus = false,
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label className="card-title" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea
          id={id}
          className="input"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{ resize: "vertical", lineHeight: 1.5 }}
        />
      ) : (
        <input
          id={id}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      )}
    </div>
  );
}
