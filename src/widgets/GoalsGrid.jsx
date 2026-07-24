import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey, shiftDay, isCheckedOn } from "../lib/model.js";
import { goalHealth } from "../lib/goalHealth.js";
import { recoveryDays } from "../lib/recovery.js";

/* GoalsGrid - one compact, health-colored card per goal (habit progress this
   week, task progress, health pill, "Go to goal ->"). Lives on Home now; was
   the goals pane of the old Overview tab. Shared markup so the Home desktop
   grid and the mobile stack render identically. */

// The 7 day-keys for the current rolling week (oldest -> today).
function weekDays(today = todayKey()) {
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, -(6 - i)));
}

export default function GoalsGrid({ goals = [], tasks = [], onOpenGoal }) {
  const today = todayKey();
  const week = useMemo(() => weekDays(today), [today]);

  // Focus goals (picked in the fresh-start review) come first with a chip —
  // a spotlight, not a filter: everything else stays visible below.
  const ordered = useMemo(() => {
    const pinned = goals.filter((g) => g.pinned);
    return pinned.length ? [...pinned, ...goals.filter((g) => !g.pinned)] : goals;
  }, [goals]);

  if (goals.length === 0) {
    return (
      <div className="card" style={{ color: "var(--ink-3)", fontSize: 13 }}>
        No goals yet. Add one from the goal pills above whenever you're ready.
      </div>
    );
  }

  return (
    <div className="ov-goals-grid">
      {ordered.map((g) => {
        const habits = g.habits || [];
        const checkedThisWeek = habits.filter((h) =>
          week.some((d) => isCheckedOn(h, d))
        ).length;
        const goalTasks = tasks.filter((t) => t.goalId === g.id);
        const doneTasks = goalTasks.filter((t) => t.done).length;
        const isRecovery = g.type === "recovery";
        const days = isRecovery ? recoveryDays(g.recoveryData?.startDate) : null;
        const health = goalHealth(g, tasks, today);

        return (
          <div key={g.id} className="card ov-goal-card" data-health={health.level}>
            <div className="ov-goal-head">
              <span className="ov-goal-name">
                {isRecovery ? (
                  <span className="ov-goal-leaf">
                    <Icon.Leaf />
                  </span>
                ) : (
                  <span className="ov-goal-dot" style={{ background: g.color }} />
                )}
                {g.name}
              </span>
              <span className="row" style={{ gap: 5, flex: "none" }}>
                {g.pinned && (
                  <span className="ov-focus-chip" title="A focus goal, picked in your last reset">
                    <Icon.Target width={10} height={10} /> Focus
                  </span>
                )}
                <span className={"ov-health-pill " + health.level}>{health.label}</span>
              </span>
            </div>

            <div className="ov-goal-stats">
              {isRecovery ? (
                <div className="ov-stat">
                  <span className="ov-stat-num">{days}</span>
                  <span className="ov-stat-lbl">day{days === 1 ? "" : "s"} free</span>
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
              onClick={() => onOpenGoal?.(g.id)}
            >
              Go to goal <Icon.Arrow width={13} height={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
