import { useMemo } from "react";
import { todayKey, shiftDay, isCheckedOn } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";

/* GoalProgress — a calm snapshot for ONE goal:
   - task completion (done / total)
   - this week's habit check-ins (a count, never framed as a shortfall) */

function Bar({ pct, color }) {
  return (
    <div
      style={{
        height: 8,
        borderRadius: 999,
        background: "var(--panel-3)",
        boxShadow: "var(--shadow-inset)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 999,
          background:
            color ||
            "linear-gradient(90deg, oklch(0.72 0.10 var(--accent-h)), var(--accent))",
          transition: "width 0.5s var(--ease)",
        }}
      />
    </div>
  );
}

export default function GoalProgress({ goal, tasks, widgetSize = "medium" }) {
  const goalTasks = useMemo(
    () => tasks.filter((t) => t.goalId === goal.id),
    [tasks, goal.id]
  );
  const done = goalTasks.filter((t) => t.done).length;
  const total = goalTasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Habit check-ins recorded in the last 7 days (a gentle count of showing up).
  const weekCheckIns = useMemo(() => {
    const today = todayKey();
    const week = Array.from({ length: 7 }, (_, i) => shiftDay(today, -i));
    return (goal.habits || []).reduce(
      (sum, h) => sum + week.filter((d) => isCheckedOn(h, d)).length,
      0
    );
  }, [goal.habits]);

  if (widgetSize === "compact") {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <Icon.Target /> Progress
          </div>
        </div>
        <div className="counter" style={{ fontSize: 30 }}>
          {pct}
          <span className="unit">%</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
          {total ? `${done}/${total} linked tasks done` : "No linked tasks yet"}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Target /> Progress
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {total ? `${done}/${total}` : "—"}
        </span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Bar pct={pct} color={goal.color} />
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>
          {total === 0
            ? "No tasks linked to this goal yet — add some from the Tasks tab."
            : `${pct}% of this goal's tasks are done. Every bit counts.`}
        </div>
      </div>

      <div className="row between">
        <span className="row" style={{ gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
          <Icon.Flame /> Check-ins this week
        </span>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          {weekCheckIns}
        </span>
      </div>

      {(widgetSize === "tall" || widgetSize === "large") && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div className="tag" style={{ marginBottom: 6 }}>
            Larger view
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.45 }}>
            {done > 0
              ? `${done} completed step${done === 1 ? "" : "s"} are already behind you.`
              : "A larger progress card gives this goal a little more breathing room."}
          </div>
        </div>
      )}
    </div>
  );
}
