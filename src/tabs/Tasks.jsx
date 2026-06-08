import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";

/* ============================================================
   Tasks tab
   Add / edit / complete / delete tasks, with labels + filters.
   Pure UI over the store — all persistence handled by useStore.
   ============================================================ */

const BASE_LABELS = ["Today", "Urgent", "General"];

// Map a label/goal to a chip style so the list reads at a glance.
function LabelChip({ task, goals }) {
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : null;
  if (goal) {
    return (
      <span className="chip">
        <span className="swatch" style={{ background: goal.color, boxShadow: "none" }} />
        {goal.name}
      </span>
    );
  }
  const cls =
    task.label === "Urgent" ? "chip rose" : task.label === "Today" ? "chip accent" : "chip";
  return <span className={cls}>{task.label}</span>;
}

export default function Tasks({ tasks, goals, addTask, updateTask, toggleTask, removeTask }) {
  // --- add bar state ---
  const [text, setText] = useState("");
  const [pick, setPick] = useState("label:General"); // encodes label or goal

  // --- filter state ---
  const [status, setStatus] = useState("active"); // all | active | done
  const [filter, setFilter] = useState("all"); // all | label:* | goal:*

  // --- inline edit state ---
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (pick.startsWith("goal:")) {
      const id = pick.slice(5);
      const goal = goals.find((g) => g.id === id);
      addTask({ text: t, label: goal ? goal.name : "General", goalId: id });
    } else {
      addTask({ text: t, label: pick.slice(6) });
    }
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

  // Filter + sort: matches first, active before done, newest first.
  const visible = useMemo(() => {
    return tasks
      .filter((t) => (status === "all" ? true : status === "done" ? t.done : !t.done))
      .filter((t) => {
        if (filter === "all") return true;
        if (filter.startsWith("goal:")) return t.goalId === filter.slice(5);
        if (filter.startsWith("label:")) return !t.goalId && t.label === filter.slice(6);
        return true;
      })
      .sort((a, b) => Number(a.done) - Number(b.done) || b.id.localeCompare(a.id));
  }, [tasks, status, filter]);

  const counts = useMemo(
    () => ({
      total: tasks.length,
      active: tasks.filter((t) => !t.done).length,
      done: tasks.filter((t) => t.done).length,
    }),
    [tasks]
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">To-do</div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            Everything you want to get to — labelled and filterable. One at a time is plenty.
          </p>
        </div>
      </div>

      {/* Add bar */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="Add a task…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ flex: 1 }}
          />
          <select
            className="input"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            style={{ width: "auto", flex: "none" }}
          >
            {BASE_LABELS.map((l) => (
              <option key={l} value={`label:${l}`}>
                {l}
              </option>
            ))}
            {goals.length > 0 && (
              <optgroup label="Goals">
                {goals.map((g) => (
                  <option key={g.id} value={`goal:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button className="btn primary" onClick={submit} style={{ flex: "none" }}>
            <Icon.Plus />
            Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="row between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          {BASE_LABELS.map((l) => (
            <FilterChip
              key={l}
              active={filter === `label:${l}`}
              onClick={() => setFilter(`label:${l}`)}
            >
              {l}
            </FilterChip>
          ))}
          {goals.map((g) => (
            <FilterChip
              key={g.id}
              active={filter === `goal:${g.id}`}
              onClick={() => setFilter(`goal:${g.id}`)}
            >
              <span className="swatch" style={{ background: g.color, boxShadow: "none" }} />
              {g.name}
            </FilterChip>
          ))}
        </div>

        <div className="seg">
          {[
            ["active", `Active${counts.active ? " · " + counts.active : ""}`],
            ["done", `Done${counts.done ? " · " + counts.done : ""}`],
            ["all", "All"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={status === v ? "active" : ""}
              onClick={() => setStatus(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>
          <div style={{ fontSize: 13 }}>
            {counts.total === 0
              ? "No tasks yet — add the first thing on your mind above."
              : "Nothing here with this filter. That's okay."}
          </div>
        </div>
      ) : (
        <div>
          {visible.map((task) => (
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

              <LabelChip task={task} goals={goals} />

              <button
                onClick={() => startEdit(task)}
                title="Edit"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "inline-flex" }}
              >
                <Icon.Edit width={14} height={14} />
              </button>

              <button
                onClick={() => removeTask(task.id)}
                title="Delete"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "inline-flex" }}
              >
                <Icon.Trash width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      className={"chip" + (active ? " accent" : "")}
      onClick={onClick}
      style={{ cursor: "pointer", border: active ? "1px solid transparent" : undefined }}
    >
      {children}
    </button>
  );
}
