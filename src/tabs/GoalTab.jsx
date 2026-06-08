import { useEffect, useMemo, useRef, useState } from "react";
import { GOAL_TYPES, TASK_TERMS } from "../lib/model.js";
import HabitChecker from "../widgets/HabitChecker.jsx";
import GoalProgress from "../widgets/GoalProgress.jsx";
import Reflections from "../widgets/Reflections.jsx";
import CountUp from "../widgets/CountUp.jsx";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

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

function taskTerm(task) {
  return task.term || task.taskScope || TASK_TERMS.SHORT;
}

function TermChip({ term }) {
  const long = term === TASK_TERMS.LONG || term === "long";
  return <span className={long ? "chip lav" : "chip mint"}>{long ? "Long-term" : "Short-term"}</span>;
}

function GoalTasks({
  goal,
  tasks,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  confirmBeforeDelete,
}) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState(TASK_TERMS.SHORT);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const goalTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.goalId === goal.id)
        .sort((a, b) => Number(a.done) - Number(b.done) || b.id.localeCompare(a.id)),
    [tasks, goal.id]
  );

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    addTask({ text: t, label: goal.name, goalId: goal.id, term });
    setText("");
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditText(task.text);
  };

  const commitEdit = () => {
    if (editingId) {
      const t = editText.trim();
      if (t) updateTask(editingId, { text: t });
    }
    setEditingId(null);
    setEditText("");
  };

  const renderTasks = (scope) => {
    const scoped = goalTasks.filter((task) => taskTerm(task) === scope);
    if (scoped.length === 0) {
      return (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          Nothing here yet.
        </div>
      );
    }

    return (
      <div className="stack" style={{ gap: 6 }}>
        {scoped.map((task) => (
          <div key={task.id} className={"taskrow" + (task.done ? " done" : "")}>
            <button
              className="checkbox"
              onClick={() => toggleTask(task.id)}
              title={task.done ? "Mark not done" : "Mark done"}
            >
              {task.done && <Icon.Check />}
            </button>

            {editingId === task.id ? (
              <input
                className="input"
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditText("");
                  }
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span
                className="task-name"
                onClick={() => startEdit(task)}
                title="Click to edit"
                style={{ cursor: "text" }}
              >
                {task.text}
              </span>
            )}

            <TermChip term={taskTerm(task)} />

            <button
              onClick={() => startEdit(task)}
              title="Edit"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: 4,
                display: "inline-flex",
              }}
            >
              <Icon.Edit width={14} height={14} />
            </button>

            <ConfirmButton
              onConfirm={() => removeTask(task.id)}
              requireConfirmation={confirmBeforeDelete}
              title="Delete"
              className=""
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: 4,
                display: "inline-flex",
              }}
              icon={<Icon.Trash width={14} height={14} />}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Check /> Goal tasks
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {goalTasks.length || ""}
        </span>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Add a task for this goal..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ flex: "1 1 220px" }}
        />
        <div className="seg" style={{ flex: "none" }}>
          <button
            className={term === TASK_TERMS.SHORT ? "active" : ""}
            onClick={() => setTerm(TASK_TERMS.SHORT)}
          >
            Short
          </button>
          <button
            className={term === TASK_TERMS.LONG ? "active" : ""}
            onClick={() => setTerm(TASK_TERMS.LONG)}
          >
            Long
          </button>
        </div>
        <button className="btn primary" onClick={submit} style={{ flex: "none" }}>
          <Icon.Plus /> Add
        </button>
      </div>

      {goalTasks.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No tasks linked here yet. Add one small next step, or a longer-term thing to keep in view.
        </div>
      ) : (
        <div className="grid grid-12">
          <div className="col-12 stack" style={{ gap: 8, minWidth: 0 }}>
            <div className="tag">Short-term</div>
            {renderTasks(TASK_TERMS.SHORT)}
          </div>
          <div className="col-12 stack" style={{ gap: 8, minWidth: 0 }}>
            <div className="tag">Long-term</div>
            {renderTasks(TASK_TERMS.LONG)}
          </div>
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
  addTask,
  updateTask,
  toggleTask,
  removeTask,
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
          <GoalTasks
            goal={goal}
            tasks={tasks}
            addTask={addTask}
            updateTask={updateTask}
            toggleTask={toggleTask}
            removeTask={removeTask}
            confirmBeforeDelete={confirmBeforeDelete}
          />
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
