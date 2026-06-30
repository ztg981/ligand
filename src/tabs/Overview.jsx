import { useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import {
  todayKey,
  shiftDay,
  isCheckedOn,
  isGoalOverdue,
} from "../lib/model.js";
import { goalHealth } from "../lib/goalHealth.js";
import { recoveryDays } from "../lib/recovery.js";

/* Overview — a bird's-eye view across ALL goals at once.
   Replaces the redundant built-in "Productivity" main-nav tab. Three parts:
   A) Daily Focus  — what needs attention today (habits, urgent tasks, overdue
      goals) with inline quick habit check-in;
   B) Goals grid   — one compact, health-colored card per goal;
   ...all calm and non-judgmental in tone. */

// The 7 day-keys for the current rolling week (oldest → today).
function weekDays(today = todayKey()) {
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, -(6 - i)));
}

export default function Overview({
  goals = [],
  tasks = [],
  checkInHabit,
  updateHabit,
  onOpenGoal,
}) {
  const today = todayKey();
  const week = useMemo(() => weekDays(today), [today]);

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

  // --- A) Daily focus data -------------------------------------------------
  // Habits across all goals not yet checked in today (each gets a quick check).
  const openHabits = useMemo(() => {
    const list = [];
    goals.forEach((g) => {
      (g.habits || []).forEach((h) => {
        if (!isCheckedOn(h, today)) {
          list.push({ goalId: g.id, goalName: g.name, habit: h });
        }
      });
    });
    return list;
  }, [goals, today]);

  // Tasks labeled Today/Urgent that aren't done yet.
  const focusTasks = useMemo(
    () =>
      tasks.filter(
        (t) => !t.done && (t.label === "Today" || t.label === "Urgent")
      ),
    [tasks]
  );

  const overdue = useMemo(
    () => goals.filter((g) => isGoalOverdue(g)),
    [goals]
  );

  const allCaughtUp =
    openHabits.length === 0 && focusTasks.length === 0 && overdue.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Across everything</div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">
            One calm place to see — and act on — what's going on across all your
            goals.
          </p>
        </div>
      </div>

      {/* On desktop these two panes sit side-by-side (focus left, goals right)
         so the goals overview is visible without scrolling past a tall habits
         list. On mobile/tablet .ov-layout collapses to a single column and the
         panes stack in this same order — unchanged from before. */}
      <div className="ov-layout">
      <div className="ov-pane-focus">
      {/* A) DAILY FOCUS ------------------------------------------------------ */}
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
            {/* Quick habit check-in (section D, folded into focus) */}
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
                          title={`Check in “${habit.name}”`}
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
                        className={
                          "chip " + (t.label === "Urgent" ? "rose" : "")
                        }
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
      </div>{/* /ov-pane-focus */}

      {/* B) GOALS GRID ------------------------------------------------------- */}
      <div className="ov-pane-goals">
      <div className="ov-section-label">
        <Icon.Target /> Your goals
      </div>
      {goals.length === 0 ? (
        <div className="card" style={{ color: "var(--ink-3)", fontSize: 13 }}>
          No goals yet. Add one from the goal pills above whenever you're ready.
        </div>
      ) : (
        <div className="ov-goals-grid">
          {goals.map((g) => {
            const habits = g.habits || [];
            const checkedThisWeek = habits.filter((h) =>
              week.some((d) => isCheckedOn(h, d))
            ).length;
            const goalTasks = tasks.filter((t) => t.goalId === g.id);
            const doneTasks = goalTasks.filter((t) => t.done).length;
            const isRecovery = g.type === "recovery";
            const days = isRecovery
              ? recoveryDays(g.recoveryData?.startDate)
              : null;
            const health = goalHealth(g, tasks, today);

            return (
              <div
                key={g.id}
                className="card ov-goal-card"
                data-health={health.level}
              >
                <div className="ov-goal-head">
                  <span className="ov-goal-name">
                    {isRecovery ? (
                      <span className="ov-goal-leaf">
                        <Icon.Leaf />
                      </span>
                    ) : (
                      <span
                        className="ov-goal-dot"
                        style={{ background: g.color }}
                      />
                    )}
                    {g.name}
                  </span>
                  <span className={"ov-health-pill " + health.level}>
                    {health.label}
                  </span>
                </div>

                <div className="ov-goal-stats">
                  {isRecovery ? (
                    <div className="ov-stat">
                      <span className="ov-stat-num">{days}</span>
                      <span className="ov-stat-lbl">
                        day{days === 1 ? "" : "s"} free
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="ov-stat">
                        <span className="ov-stat-num">
                          {checkedThisWeek}
                          <span className="ov-stat-den">/{habits.length}</span>
                        </span>
                        <span className="ov-stat-lbl">habits this week</span>
                      </div>
                      <div className="ov-stat">
                        <span className="ov-stat-num">
                          {doneTasks}
                          <span className="ov-stat-den">/{goalTasks.length}</span>
                        </span>
                        <span className="ov-stat-lbl">tasks done</span>
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className="ov-goal-link"
                  onClick={() => onOpenGoal(g.id)}
                >
                  Go to goal <Icon.Arrow width={13} height={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      </div>{/* /ov-pane-goals */}
      </div>{/* /ov-layout */}
    </>
  );
}
