import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey, shiftDay, isCheckedOn } from "../lib/model.js";
import { goalHealth } from "../lib/goalHealth.js";
import { recoveryDays } from "../lib/recovery.js";
import DailyFocus from "../widgets/DailyFocus.jsx";

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
      <DailyFocus
        goals={goals}
        tasks={tasks}
        checkInHabit={checkInHabit}
        updateHabit={updateHabit}
        onOpenGoal={onOpenGoal}
      />
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
