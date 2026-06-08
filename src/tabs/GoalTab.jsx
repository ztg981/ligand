import { useEffect, useRef, useState } from "react";
import { GOAL_TYPES } from "../lib/model.js";
import HabitChecker from "../widgets/HabitChecker.jsx";
import GoalProgress from "../widgets/GoalProgress.jsx";
import Reflections from "../widgets/Reflections.jsx";
import CountUp from "../widgets/CountUp.jsx";
import { Icon } from "../components/Icons.jsx";

/* GoalTab — the preset layout shown for any goal.
   The built-in "Productivity" goal uses the very same layout; it just
   can't be deleted or renamed. Composition (left = do/track, right =
   feel/reflect) keeps the most actionable things first for an ADHD flow. */

export default function GoalTab({
  goal,
  tasks,
  countUps,
  updateGoal,
  onDeleteGoal,
  addHabit,
  checkInHabit,
  removeHabit,
  addReflection,
  removeReflection,
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
                    title="Delete goal"
                    onClick={() => onDeleteGoal(goal.id)}
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

      <div className="grid grid-12">
        {/* Left: do & track */}
        <div className="col-8 stack" style={{ gap: 12, minWidth: 0 }}>
          <HabitChecker
            goal={goal}
            addHabit={addHabit}
            checkInHabit={checkInHabit}
            removeHabit={removeHabit}
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
          />
        </div>
      </div>
    </>
  );
}
