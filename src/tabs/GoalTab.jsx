import { useEffect, useRef, useState } from "react";
import { GOAL_TYPES } from "../lib/model.js";
import HabitChecker from "../widgets/HabitChecker.jsx";
import GoalProgress from "../widgets/GoalProgress.jsx";
import Reflections from "../widgets/Reflections.jsx";
import CountUp from "../widgets/CountUp.jsx";
import { Icon } from "../components/Icons.jsx";

function niceAchievable(value) {
  if (value === "easy") return "Easy";
  if (value === "stretch") return "Stretch";
  if (value === "balanced") return "Balanced";
  return "Not chosen yet";
}

function GoalDetails({ goal }) {
  const smart = goal.smartFields || {};
  const details = [
    ["Specific", smart.specific],
    ["Measurable", smart.measurable],
    ["Achievable", niceAchievable(smart.achievable)],
    ["Relevant", smart.relevant],
    ["Time-bound", smart.timeBound || goal.deadline],
  ];
  const hasDetails = details.some(([, value]) => value && value !== "Not chosen yet");
  const [open, setOpen] = useState(hasDetails);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row between" style={{ gap: 12 }}>
        <div>
          <div className="card-title">
            <Icon.Target /> Goal details
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
            {hasDetails
              ? "Your SMART notes are saved here. You can adjust this later."
              : "No SMART details yet. Older goals still work normally."}
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="grid grid-12" style={{ marginTop: 12 }}>
          {details.map(([label, value]) => (
            <div key={label} className={label === "Relevant" ? "col-12" : "col-6"}>
              <div className="tag" style={{ marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>
                {value || "Not filled in yet."}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* GoalTab — the preset layout shown for any goal.
   The built-in "Productivity" goal uses the very same layout; it just
   can't be deleted or renamed. Composition (left = do/track, right =
   feel/reflect) keeps the most actionable things first for an ADHD flow. */

export default function GoalTab({
  goal,
  tasks,
  countUps,
  updateGoal,
  onArchiveGoal,
  addHabit,
  checkInHabit,
  removeHabit,
  addReflection,
  removeReflection,
  confirmBeforeDelete = true,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!goal) return null;
  const builtIn = goal.type === GOAL_TYPES.BUILT_IN;

  const startRename = () => {
    setDraft(goal.name);
    setEditing(true);
  };
  const saveRename = () => {
    const name = draft.trim();
    if (name && name !== goal.name) updateGoal(goal.id, { name });
    setEditing(false);
  };

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {builtIn ? "Built-in goal" : "Your goal"}
            {goal.deadline ? ` · due ${goal.deadline}` : ""}
          </div>

          {editing ? (
            <input
              ref={inputRef}
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={saveRename}
              style={{ fontSize: 22, fontWeight: 600, maxWidth: 360, marginTop: 2 }}
            />
          ) : (
            <h1 className="page-title row" style={{ gap: 8, alignItems: "center" }}>
              <span
                className="swatch"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: goal.color,
                  display: "inline-block",
                  flex: "none",
                }}
              />
              {goal.name}
              {!builtIn && (
                <span className="row" style={{ gap: 2 }}>
                  <button
                    className="iconbtn"
                    title="Rename goal"
                    onClick={startRename}
                    style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                  >
                    <Icon.Edit />
                  </button>
                  <button
                    className="iconbtn"
                    title="Archive goal"
                    onClick={() => onArchiveGoal(goal.id)}
                    style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                  >
                    <Icon.Trash />
                  </button>
                </span>
              )}
            </h1>
          )}

          <p className="page-sub">
            {builtIn
              ? "Forgiving habits, goal progress, and a place to reflect."
              : "Habits, progress, and reflection for this goal."}
          </p>
        </div>
      </div>

      <GoalDetails key={goal.id} goal={goal} />

      <div className="grid grid-12">
        {/* Left: do & track */}
        <div className="col-8 stack" style={{ gap: 12, minWidth: 0 }}>
          <HabitChecker
            goal={goal}
            addHabit={addHabit}
            checkInHabit={checkInHabit}
            removeHabit={removeHabit}
            confirmBeforeDelete={confirmBeforeDelete}
          />
          <GoalProgress goal={goal} tasks={tasks} />
        </div>

        {/* Right: feel & reflect */}
        <div className="col-4 stack" style={{ gap: 12, minWidth: 0 }}>
          <CountUp countUp={countUps && countUps[0]} />
          <Reflections
            goal={goal}
            addReflection={addReflection}
            removeReflection={removeReflection}
            confirmBeforeDelete={confirmBeforeDelete}
          />
        </div>
      </div>
    </>
  );
}
