import { Icon } from "../components/Icons.jsx";

/* ProgressTracker - a calm overview of task progress overall and per goal.
   Uses a simple bar; never frames an empty bar as failure. */
function Bar({ pct }) {
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
          background: "linear-gradient(90deg, oklch(0.72 0.10 var(--accent-h)), var(--accent))",
          transition: "width 0.5s var(--ease)",
        }}
      />
    </div>
  );
}

export default function ProgressTracker({ goals, tasks }) {
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const perGoal = goals
    .filter((g) => g.status !== "archived")
    .map((g) => {
      const gt = tasks.filter((t) => t.goalId === g.id);
      const gd = gt.filter((t) => t.done).length;
      return { ...g, total: gt.length, done: gd, pct: gt.length ? Math.round((gd / gt.length) * 100) : 0 };
    });

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Target /> Progress
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {total ? `${done}/${total}` : "-"}
        </span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Bar pct={pct} />
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>
          {total === 0
            ? "No tasks yet - your list is wide open."
            : `${pct}% of your tasks are done. Every bit counts.`}
        </div>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        {perGoal.map((g) => (
          <div key={g.id}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <span className="row" style={{ gap: 6, fontSize: 12.5 }}>
                <span className="swatch" style={{ width: 7, height: 7, borderRadius: 999, background: g.color, display: "inline-block" }} />
                {g.name}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {g.total ? `${g.done}/${g.total}` : "no tasks"}
              </span>
            </div>
            <Bar pct={g.pct} />
          </div>
        ))}
      </div>
    </div>
  );
}
