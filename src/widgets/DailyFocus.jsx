import { useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey, isCheckedOn, isGoalOverdue } from "../lib/model.js";

/* DailyFocus - "what needs attention today" across every goal: habits not
   yet checked in (with inline quick check-in), Today/Urgent tasks not done,
   and overdue goals. Originally part of Overview; extracted so the mobile
   Home screen can show the same calm, single-section daily-focus view as
   its primary content instead of a dense multi-card dashboard. */
export default function DailyFocus({
  goals = [],
  tasks = [],
  checkInHabit,
  updateHabit,
  onOpenGoal,
}) {
  const today = todayKey();

  // Inline habit-name editing for the quick check-in list.
  const [editingHabit, setEditingHabit] = useState(null); // { goalId, habitId }
  const [editText, setEditText] = useState("");
  const cancelEditRef = useRef(false);

  const startEditHabit = (goalId, habit) => {
    setEditingHabit({ goalId, habitId: habit.id });
    setEditText(habit.name);
  };
  const commitEditHabit = () => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setEditingHabit(null);
      setEditText("");
      return;
    }
    if (editingHabit) {
      const t = editText.trim();
      if (t) updateHabit?.(editingHabit.goalId, editingHabit.habitId, { name: t });
    }
    setEditingHabit(null);
    setEditText("");
  };

  // Habits across all goals not yet checked in today (each gets a quick check).
  const openHabits = [];
  goals.forEach((g) => {
    (g.habits || []).forEach((h) => {
      if (!isCheckedOn(h, today)) {
        openHabits.push({ goalId: g.id, goalName: g.name, habit: h });
      }
    });
  });

  // Tasks labeled Today/Urgent that aren't done yet.
  const focusTasks = tasks.filter(
    (t) => !t.done && (t.label === "Today" || t.label === "Urgent")
  );

  const overdue = goals.filter((g) => isGoalOverdue(g));

  const allCaughtUp =
    openHabits.length === 0 && focusTasks.length === 0 && overdue.length === 0;

  return (
    <div className="card ov-focus-card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Spark /> Today's focus
        </div>
      </div>

      {allCaughtUp ? (
        <div className="ov-caught-up">
          <span className="ov-caught-ic">
            <Icon.Check />
          </span>
          <div>
            <div className="ov-caught-title">You're all caught up.</div>
            <div className="ov-caught-sub">Great work today.</div>
          </div>
        </div>
      ) : (
        <div className="ov-focus-grid">
          {/* Quick habit check-in */}
          {openHabits.length > 0 && (
            <div className="ov-focus-col">
              <div className="ov-focus-label">
                Habits to check in
                <span className="ov-count">{openHabits.length}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {openHabits.map(({ goalId, goalName, habit }) => {
                  const isEditing =
                    editingHabit &&
                    editingHabit.goalId === goalId &&
                    editingHabit.habitId === habit.id;
                  if (isEditing) {
                    return (
                      <div
                        key={goalId + "-" + habit.id}
                        className="ov-habit-row is-editing"
                      >
                        <span className="ov-habit-box" aria-hidden="true" />
                        <input
                          className="input ov-habit-edit-input"
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEditHabit();
                            }
                            if (e.key === "Escape") {
                              cancelEditRef.current = true;
                              setEditingHabit(null);
                            }
                          }}
                          onBlur={commitEditHabit}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={goalId + "-" + habit.id} className="ov-habit-row">
                      <button
                        type="button"
                        className="ov-habit-check"
                        onClick={() => checkInHabit(goalId, habit.id, today)}
                        title={`Check in "${habit.name}"`}
                      >
                        <span className="ov-habit-box" aria-hidden="true" />
                        <span className="ov-habit-text">
                          <span className="ov-habit-name">{habit.name}</span>
                          <span className="ov-habit-goal">{goalName}</span>
                        </span>
                      </button>
                      {updateHabit && (
                        <button
                          type="button"
                          className="ov-habit-edit"
                          title="Edit habit name"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditHabit(goalId, habit);
                          }}
                        >
                          <Icon.Pencil width={13} height={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today / Urgent tasks */}
          {focusTasks.length > 0 && (
            <div className="ov-focus-col">
              <div className="ov-focus-label">
                Today &amp; urgent tasks
                <span className="ov-count">{focusTasks.length}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {focusTasks.map((t) => (
                  <div key={t.id} className="ov-task-row">
                    <span
                      className={"chip " + (t.label === "Urgent" ? "rose" : "")}
                      style={{ flex: "none" }}
                    >
                      {t.label}
                    </span>
                    <span className="ov-task-text">{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue goals */}
          {overdue.length > 0 && (
            <div className="ov-focus-col">
              <div className="ov-focus-label">
                Goals to review
                <span className="ov-count">{overdue.length}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {overdue.map((g) => (
                  <button
                    type="button"
                    key={g.id}
                    className="ov-task-row ov-overdue-row"
                    onClick={() => onOpenGoal(g.id)}
                  >
                    <span style={{ color: "var(--accent-ink)", flex: "none" }}>
                      <Icon.Calendar width={13} height={13} />
                    </span>
                    <span className="ov-task-text">{g.name}</span>
                    <Icon.Arrow width={13} height={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
