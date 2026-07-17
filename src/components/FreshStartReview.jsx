import { useMemo, useState, useEffect } from "react";
import { Icon } from "./Icons.jsx";
import { todayKey, shiftDay, daysBetween } from "../lib/model.js";
import { reasonLine, reviewIntroLine } from "../lib/goalTriage.js";

/* FreshStartReview — the guided "reshape your goals" wizard.

   Shown when returning after a gap to a pile of out-of-date goals (or on
   demand from Home). One goal per step — never the whole pile at once —
   with four BIG moves per goal instead of a free-form editor:

     Shrink it        → one tiny first step (+ optional new date)
     Move the date    → quick chips or a custom date
     Shelve it        → archived safely, restorable from Settings
     It's fine as is  → keep untouched (quiet the nags for 2 weeks)

   Decisions are collected locally and applied in ONE batch when the user
   taps Finish — so Back always works and nothing changes until the end.
   The summary step offers picking up to 3 "focus" goals (goal-competition
   research: fewer live goals → more finished goals).

   Tone rules apply: reshaping is framed as information, never failure. */

const ACTIONS = {
  SHRINK: "shrink",
  MOVE: "move",
  SHELVE: "shelve",
  KEEP: "keep",
};

const MAX_FOCUS = 3;

/* Quick target-date chips. */
function dateChips(today) {
  return [
    { id: "+1w", label: "+1 week", date: shiftDay(today, 7) },
    { id: "+2w", label: "+2 weeks", date: shiftDay(today, 14) },
    { id: "+1m", label: "+1 month", date: shiftDay(today, 30) },
  ];
}

/* ---- Timeline bar: created ──── today ──── target ─────────────────
   Makes "this goal's window has passed" visible at a glance instead of
   asking the user to do date math. Overdue goals show the overshoot. */
function GoalTimeline({ signals, today }) {
  const { createdKey, target } = signals;
  if (!createdKey) return null;

  if (!target) {
    return (
      <div className="fsr-timeline">
        <div className="fsr-timeline-track no-target">
          <span className="fsr-timeline-fill" style={{ width: "100%" }} />
          <span className="fsr-timeline-now" style={{ left: "100%" }} title="Today" />
        </div>
        <div className="fsr-timeline-labels">
          <span>set {createdKey}</span>
          <span>no target date</span>
        </div>
      </div>
    );
  }

  const total = Math.max(1, daysBetween(createdKey, target));
  const used = daysBetween(createdKey, today);
  const overdue = used > total;
  // With overshoot, the target sits at (total/used) of the track width.
  const pct = overdue ? 100 : Math.max(0, Math.min(100, (used / total) * 100));
  const targetPct = overdue ? (total / used) * 100 : 100;

  return (
    <div className="fsr-timeline">
      <div className={"fsr-timeline-track" + (overdue ? " overdue" : "")}>
        <span className="fsr-timeline-fill" style={{ width: `${pct}%` }} />
        <span className="fsr-timeline-target" style={{ left: `${targetPct}%` }} title={`Target: ${target}`} />
        <span className="fsr-timeline-now" style={{ left: `${pct}%` }} title="Today" />
      </div>
      <div className="fsr-timeline-labels">
        <span>set {createdKey}</span>
        <span className={overdue ? "fsr-overdue-lbl" : ""}>
          {overdue ? `target ${target} · passed` : `target ${target}`}
        </span>
      </div>
    </div>
  );
}

/* ---- One goal's decision card ---- */
function GoalStep({ item, today, decision, onDecide }) {
  const { goal, reasons, signals } = item;
  const chips = dateChips(today);
  const action = decision?.action || null;

  // Local drafts for the expandable actions.
  const [stepText, setStepText] = useState(
    decision?.stepText ?? `Spend 10 minutes on "${goal.name}"`
  );
  const [newDate, setNewDate] = useState(decision?.newDate ?? null);
  const [customDate, setCustomDate] = useState("");

  const decide = (a, extra = {}) => onDecide({ action: a, ...extra });

  const pickDate = (d) => {
    setNewDate(d);
    if (action === ACTIONS.SHRINK) decide(ACTIONS.SHRINK, { stepText, newDate: d });
    else decide(ACTIONS.MOVE, { newDate: d });
  };

  return (
    <div className="fsr-goal">
      <div className="fsr-goal-head">
        <span className="fsr-goal-dot" style={{ background: goal.color || "var(--accent)" }} />
        <h3 className="fsr-goal-name">{goal.name}</h3>
      </div>

      <GoalTimeline signals={signals} today={today} />

      <ul className="fsr-reasons">
        {reasons.map((r) => (
          <li key={r}>{reasonLine(r, signals)}</li>
        ))}
        <li className="fsr-fact">
          {signals.tasksDone > 0
            ? `${signals.tasksDone} step${signals.tasksDone === 1 ? "" : "s"} done so far`
            : "No steps recorded yet, so there's nothing to lose by reshaping it"}
        </li>
      </ul>

      <div className="fsr-choices">
        <button
          className={"fsr-choice" + (action === ACTIONS.SHRINK ? " picked" : "")}
          onClick={() => decide(ACTIONS.SHRINK, { stepText, newDate })}
        >
          <span className="fsr-choice-ic"><Icon.Spark /></span>
          <span className="fsr-choice-body">
            <span className="fsr-choice-name">Shrink it</span>
            <span className="fsr-choice-sub">Keep the goal, restart with one tiny step</span>
          </span>
        </button>
        {action === ACTIONS.SHRINK && (
          <div className="fsr-choice-detail">
            <label className="fsr-detail-lbl">Your tiny first step</label>
            <input
              className="input"
              value={stepText}
              maxLength={120}
              onChange={(e) => {
                setStepText(e.target.value);
                decide(ACTIONS.SHRINK, { stepText: e.target.value, newDate });
              }}
            />
            <label className="fsr-detail-lbl">New target date (optional)</label>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {chips.map((c) => (
                <button
                  key={c.id}
                  className={"btn sm" + (newDate === c.date ? " primary" : " ghost")}
                  onClick={() => pickDate(c.date)}
                >
                  {c.label}
                </button>
              ))}
              <button
                className={"btn sm" + (newDate === null ? " primary" : " ghost")}
                onClick={() => pickDate(null)}
              >
                No date
              </button>
            </div>
          </div>
        )}

        <button
          className={"fsr-choice" + (action === ACTIONS.MOVE ? " picked" : "")}
          onClick={() => decide(ACTIONS.MOVE, { newDate: newDate || chips[1].date })}
        >
          <span className="fsr-choice-ic"><Icon.Calendar /></span>
          <span className="fsr-choice-body">
            <span className="fsr-choice-name">Move the date</span>
            <span className="fsr-choice-sub">The goal is right, the timing wasn't</span>
          </span>
        </button>
        {action === ACTIONS.MOVE && (
          <div className="fsr-choice-detail">
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {chips.map((c) => (
                <button
                  key={c.id}
                  className={"btn sm" + (newDate === c.date ? " primary" : " ghost")}
                  onClick={() => pickDate(c.date)}
                >
                  {c.label}
                </button>
              ))}
              <input
                type="date"
                className="input"
                value={customDate}
                min={today}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (e.target.value) pickDate(e.target.value);
                }}
                style={{ width: 140, flex: "none" }}
              />
            </div>
          </div>
        )}

        <button
          className={"fsr-choice" + (action === ACTIONS.SHELVE ? " picked" : "")}
          onClick={() => decide(ACTIONS.SHELVE)}
        >
          <span className="fsr-choice-ic"><Icon.Book /></span>
          <span className="fsr-choice-body">
            <span className="fsr-choice-name">Shelve it for now</span>
            <span className="fsr-choice-sub">
              Tucked into the archive — restore it any time from Settings
            </span>
          </span>
        </button>

        <button
          className={"fsr-choice quiet" + (action === ACTIONS.KEEP ? " picked" : "")}
          onClick={() => decide(ACTIONS.KEEP)}
        >
          <span className="fsr-choice-ic"><Icon.Check /></span>
          <span className="fsr-choice-body">
            <span className="fsr-choice-name">It's fine as is</span>
            <span className="fsr-choice-sub">Leave it untouched and quiet the nudges for 2 weeks</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/* ---- The wizard shell ---- */
export default function FreshStartReview({
  items = [],
  daysAway = 0,
  onFinish, // (decisions: {goalId: {action, stepText?, newDate?}}, focusIds: string[]) => void
  onSnooze, // "not now" — re-offer in a few days
  onClose,  // plain close (X / Escape) — treated as snooze by the caller
}) {
  const today = todayKey();
  // -1 = intro, 0..items.length-1 = goals, items.length = summary
  const [step, setStep] = useState(-1);
  const [decisions, setDecisions] = useState({});
  const [focusIds, setFocusIds] = useState([]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summaryStep = items.length;
  const current = step >= 0 && step < summaryStep ? items[step] : null;

  const counts = useMemo(() => {
    const c = { shrink: 0, move: 0, shelve: 0, keep: 0 };
    for (const d of Object.values(decisions)) if (d?.action) c[d.action]++;
    return c;
  }, [decisions]);

  // Goals that stay active after this review (eligible as focus picks).
  const keepers = useMemo(
    () =>
      items.filter((it) => {
        const a = decisions[it.goal.id]?.action;
        return a && a !== ACTIONS.SHELVE;
      }),
    [items, decisions]
  );

  const toggleFocus = (id) =>
    setFocusIds((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < MAX_FOCUS
        ? [...ids, id]
        : ids
    );

  const decided = current ? Boolean(decisions[current.goal.id]?.action) : false;

  return (
    <div className="scrim" role="presentation">
      <div
        className="modal fsr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fsr-title"
      >
        <div className="fsr-head">
          <div>
            <div className="eyebrow">Fresh start</div>
            <h2 id="fsr-title" className="page-title" style={{ fontSize: 20 }}>
              {step === -1
                ? "A two-minute reset"
                : step === summaryStep
                ? "That's the reset done"
                : `Goal ${step + 1} of ${items.length}`}
            </h2>
          </div>
          <button type="button" className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>

        {/* Progress dots — intro and summary excluded, one per goal. */}
        {items.length > 1 && step >= 0 && (
          <div className="fsr-dots" aria-hidden="true">
            {items.map((it, i) => (
              <span
                key={it.goal.id}
                className={
                  "fsr-dot" +
                  (i === step ? " current" : "") +
                  (decisions[it.goal.id]?.action ? " done" : "")
                }
              />
            ))}
          </div>
        )}

        <div className="fsr-body">
          {step === -1 && (
            <div className="fsr-intro">
              <p className="fsr-intro-lead">{reviewIntroLine(items.length, daysAway)}</p>
              <p className="fsr-intro-sub">
                You'll see one goal at a time with four easy moves: shrink it,
                move its date, shelve it, or keep it. Nothing changes until you
                finish, and shelved goals are never deleted.
              </p>
              <p className="fsr-intro-why">
                Why this helps: research on goal re-engagement finds that
                reshaping goals that stopped fitting predicts <em>more</em>{" "}
                follow-through, not less. Letting go makes room.
              </p>
              <div className="row" style={{ gap: 8, marginTop: 18 }}>
                <button className="btn primary" onClick={() => setStep(0)}>
                  Start the reset <Icon.Arrow width={13} height={13} />
                </button>
                <button className="btn ghost" onClick={onSnooze}>
                  Not now
                </button>
              </div>
            </div>
          )}

          {current && (
            <GoalStep
              key={current.goal.id}
              item={current}
              today={today}
              decision={decisions[current.goal.id]}
              onDecide={(d) =>
                setDecisions((prev) => ({ ...prev, [current.goal.id]: d }))
              }
            />
          )}

          {step === summaryStep && (
            <div className="fsr-summary">
              <p className="fsr-summary-intro">
                Here's exactly what happens when you hit Apply — nothing has
                changed yet:
              </p>
              <ul className="fsr-summary-counts">
                {items
                  .filter((it) => decisions[it.goal.id]?.action)
                  .map((it) => {
                    const d = decisions[it.goal.id];
                    const icon =
                      d.action === ACTIONS.SHRINK ? <Icon.Spark />
                      : d.action === ACTIONS.MOVE ? <Icon.Calendar />
                      : d.action === ACTIONS.SHELVE ? <Icon.Book />
                      : <Icon.Check />;
                    const outcome =
                      d.action === ACTIONS.SHRINK
                        ? `tiny step added${d.newDate ? ` · new date ${d.newDate}` : " · target date cleared"}`
                        : d.action === ACTIONS.MOVE
                        ? `new target date ${d.newDate}`
                        : d.action === ACTIONS.SHELVE
                        ? "shelved (restore anytime from Settings)"
                        : "kept as-is · nudges quiet for 2 weeks";
                    return (
                      <li key={it.goal.id}>
                        {icon}
                        <span className="fsr-summary-goal">{it.goal.name}</span>
                        <span className="fsr-summary-outcome">{outcome}</span>
                      </li>
                    );
                  })}
              </ul>
              <p className="fsr-summary-line">
                {counts.shelve > 0
                  ? "Letting some go is what makes the rest possible. This plan fits the life you actually have."
                  : "Your plan matches your life again. That's the whole point."}
              </p>

              {keepers.length > 1 && (
                <div className="fsr-focus">
                  <div className="fsr-focus-title">
                    <Icon.Target /> Which matter most right now?
                  </div>
                  <p className="fsr-focus-sub">
                    Pick up to {MAX_FOCUS}. They'll sit first on your dashboard —
                    the others stay, just quieter.
                  </p>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {keepers.map((it) => (
                      <button
                        key={it.goal.id}
                        className={
                          "btn sm" +
                          (focusIds.includes(it.goal.id) ? " primary" : " ghost")
                        }
                        onClick={() => toggleFocus(it.goal.id)}
                      >
                        {it.goal.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {step >= 0 && (
          <div className="fsr-foot">
            <button className="btn ghost sm" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            {step < summaryStep ? (
              <span className="row" style={{ gap: 10, alignItems: "center" }}>
                {!decided && (
                  <button
                    className="fsr-skip"
                    onClick={() => setStep((s) => s + 1)}
                    title="No decision — this goal stays exactly as it is"
                  >
                    Decide later
                  </button>
                )}
                <button
                  className="btn primary sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!decided}
                  title={decided ? "" : "Pick one of the moves above"}
                >
                  {step === summaryStep - 1 ? "Review" : "Next"}{" "}
                  <Icon.Arrow width={13} height={13} />
                </button>
              </span>
            ) : (
              <button
                className="btn primary sm"
                onClick={() => onFinish?.(decisions, focusIds)}
              >
                <Icon.Check width={13} height={13} /> Apply changes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
