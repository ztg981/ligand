import { useMemo, useState, useEffect } from "react";
import { todayKey, shiftDay, isCheckedOn } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";
import { fetchAiInsight, clearAiCache } from "../lib/aiApi.js";

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

export default function GoalProgress({ goal, tasks, widgetSize = "medium", weekStartsMonday = false }) {
  const goalTasks = useMemo(
    () => (tasks || []).filter((t) => t?.goalId === goal?.id),
    [tasks, goal?.id]
  );
  const done = goalTasks.filter((t) => t.done).length;
  const total = goalTasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Habit check-ins recorded so far this calendar week (a gentle count of
  // showing up). The week boundary honors the "Week starts on" setting.
  const weekCheckIns = useMemo(() => {
    const today = todayKey();
    const dow = new Date(today + "T00:00:00").getDay(); // 0=Sun … 6=Sat
    const back = weekStartsMonday ? (dow === 0 ? 6 : dow - 1) : dow;
    const week = Array.from({ length: back + 1 }, (_, i) => shiftDay(today, -i));
    return (goal.habits || []).reduce(
      (sum, h) => sum + week.filter((d) => isCheckedOn(h, d)).length,
      0
    );
  }, [goal.habits, weekStartsMonday]);

  const [insight, setInsight] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!goal?.id) return;
    let active = true;
    const context = {
      name: goal?.name,
      targetDate: goal?.targetDate,
      tasks: (goalTasks || []).slice(-5).map(t => ({ text: t?.text, done: t?.done })),
      habits: (goal?.habits || []).map(h => h?.name)
    };
    fetchAiInsight(goal.id, "goal-summary", context).then(res => {
      if (active) setInsight(res);
    }).catch(() => {
      // Handled internally by gracefully falling back
    });
    return () => { active = false; };
  }, [goal?.id, goal?.name, goal?.targetDate, goalTasks, goal?.habits]);

  const handleRefreshInsight = () => {
    if (isRefreshing || !goal?.id) return;
    setIsRefreshing(true);
    clearAiCache(goal.id, "goal-summary");
    const context = {
      name: goal?.name,
      targetDate: goal?.targetDate,
      tasks: (goalTasks || []).slice(-5).map(t => ({ text: t?.text, done: t?.done })),
      habits: (goal?.habits || []).map(h => h?.name)
    };
    fetchAiInsight(goal.id, "goal-summary", context)
      .then(res => {
        setInsight(res);
        setIsRefreshing(false);
      })
      .catch(() => setIsRefreshing(false));
  };

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

      {insight && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--panel-3)", borderRadius: "var(--r-md)", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <div className="row" style={{ gap: 6, color: "var(--accent)", fontWeight: 550, fontSize: 11.5 }}>
              <Icon.Spark width={14} height={14} /> AI Insight
              {insight.source === "fallback" && (
                <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }} title="Standard fallback text">
                  (Fallback)
                </span>
              )}
            </div>
            <button 
              className="btn ghost icon-only" 
              style={{ width: 24, height: 24, opacity: isRefreshing ? 0.5 : 1 }}
              onClick={handleRefreshInsight}
              disabled={isRefreshing}
              title="Refresh insight"
            >
              <Icon.Reset width={12} height={12} />
            </button>
          </div>
          <div style={{ opacity: isRefreshing ? 0.5 : 1, transition: "opacity 0.2s" }}>
            {insight.text}
          </div>
        </div>
      )}

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
