import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";
import { TASK_TERMS, repeatLabel } from "../lib/model.js";
import { flashElement } from "../lib/scrollFlash.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

/* ============================================================
   Tasks tab
   Add / edit / complete / delete tasks, with labels + filters.
   Pure UI over the store - all persistence handled by useStore.
   ============================================================ */

const BASE_LABELS = ["Today", "Urgent", "General"];
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;
const COMPLETE_ANIM_MS = 450;

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

function taskTerm(task) {
  return task.term || task.taskScope || TASK_TERMS.SHORT;
}

function TermChip({ term }) {
  const long = term === TASK_TERMS.LONG || term === "long";
  return <span className={long ? "chip lav" : "chip mint"}>{long ? "Long-term" : "Short-term"}</span>;
}

// The label/goal + short/long + repeat fields, shared by the desktop inline
// bar and the mobile bottom sheet so the two never drift apart.
function TaskFormFields({ pick, setPick, term, setTerm, repeat, setRepeat, goals }) {
  return (
    <>
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
      <select
        className="input"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        title="Repeat this task"
        style={{ width: "auto", flex: "none" }}
      >
        <option value="none">No repeat</option>
        <option value="daily">Every day</option>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
          <option key={d} value={`weekly:${i}`}>
            Every {d}
          </option>
        ))}
      </select>
    </>
  );
}

export default function Tasks({
  tasks,
  goals,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  confirmBeforeDelete = true,
  scrollTo = null,
}) {
  const isMobile = useIsMobile(640);

  // --- add bar state (shared by the desktop inline bar and the mobile sheet) ---
  const [text, setText] = useState("");
  const [pick, setPick] = useState("label:General"); // encodes label or goal
  const [term, setTerm] = useState(TASK_TERMS.SHORT);
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly:0..6

  // --- mobile add sheet ---
  const [showAddSheet, setShowAddSheet] = useState(false);
  const sheetInputRef = useRef(null);
  const [sheetDrag, setSheetDrag] = useState(0);
  const dragStartY = useRef(null);

  useEffect(() => {
    if (!showAddSheet) return;
    const t = setTimeout(() => sheetInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAddSheet]);

  const closeSheet = () => {
    setShowAddSheet(false);
    setSheetDrag(0);
    dragStartY.current = null;
  };
  const onHandleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onHandleTouchMove = (e) => {
    if (dragStartY.current == null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setSheetDrag(delta);
  };
  const onHandleTouchEnd = () => {
    if (sheetDrag > 80) {
      closeSheet();
    } else {
      setSheetDrag(0);
      dragStartY.current = null;
    }
  };

  // --- filter state ---
  const [status, setStatus] = useState("active"); // all | active | done
  const [filter, setFilter] = useState("all"); // all | label:* | goal:*

  // When search sends us to a specific task, clear the filters so it's
  // guaranteed visible, then scroll to and flash it.
  useEffect(() => {
    if (!scrollTo?.id) return;
    setStatus("all");
    setFilter("all");
    flashElement("task-" + scrollTo.id);
  }, [scrollTo?.nonce, scrollTo?.id]);

  // --- inline edit state ---
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  // --- mobile long-press-to-edit state ---
  const [pressingId, setPressingId] = useState(null);
  const [taskMotion, setTaskMotion] = useState({});
  const pressTimer = useRef(null);
  const pressStart = useRef({ x: 0, y: 0 });
  const motionTimers = useRef({});

  useEffect(
    () => () => {
      clearTimeout(pressTimer.current);
      Object.values(motionTimers.current).forEach(clearTimeout);
    },
    []
  );

  const parseRepeat = (v) => {
    if (v === "daily") return { type: "daily" };
    if (v.startsWith("weekly:")) return { type: "weekly", weekday: Number(v.slice(7)) };
    return null;
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    const rep = parseRepeat(repeat);
    if (pick.startsWith("goal:")) {
      const id = pick.slice(5);
      const goal = goals.find((g) => g.id === id);
      addTask({ text: t, label: goal ? goal.name : "General", goalId: id, term, repeat: rep });
    } else {
      addTask({ text: t, label: pick.slice(6), term, repeat: rep });
    }
    setText("");
  };

  const submitFromSheet = () => {
    if (!text.trim()) return;
    submit();
    closeSheet();
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

  const markTaskMotion = (taskId, mode) => {
    clearTimeout(motionTimers.current[taskId]);
    setTaskMotion((current) => ({ ...current, [taskId]: mode }));
    motionTimers.current[taskId] = setTimeout(() => {
      setTaskMotion((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      delete motionTimers.current[taskId];
    }, COMPLETE_ANIM_MS);
  };

  const handleTaskToggle = (task) => {
    markTaskMotion(task.id, task.done ? "unchecking" : "completing");
    toggleTask(task.id);
  };

  // Long-press (mobile only): a short tap does nothing but a subtle
  // highlight; holding for LONG_PRESS_MS opens inline edit. Prevents the
  // "tapped a task while scrolling and accidentally started editing it"
  // problem, since Edit/Delete are always available as explicit buttons.
  const handlePressStart = (task) => (e) => {
    if (!isMobile) return;
    const pt = e.touches ? e.touches[0] : e;
    pressStart.current = { x: pt.clientX, y: pt.clientY };
    setPressingId(task.id);
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      startEdit(task);
      setPressingId(null);
    }, LONG_PRESS_MS);
  };
  const handlePressMove = (e) => {
    if (!pressTimer.current) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = Math.abs(pt.clientX - pressStart.current.x);
    const dy = Math.abs(pt.clientY - pressStart.current.y);
    if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      setPressingId(null);
    }
  };
  const handlePressEnd = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressingId(null);
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
            Everything you want to get to - labelled and filterable. One at a time is plenty.
          </p>
        </div>
      </div>

      {/* Mobile: a compact trigger that opens the full form in a bottom
         sheet, so the task list gets almost the whole screen instead of a
         3-row form eating the top. Desktop keeps the inline bar below. */}
      <button
        type="button"
        className="tasks-add-mobile-btn"
        onClick={() => setShowAddSheet(true)}
      >
        <Icon.Plus /> Add task
      </button>

      {/* Add bar - desktop/tablet only (hidden on mobile via CSS). */}
      <div className="card tasks-addbar-desktop" style={{ marginBottom: 14 }}>
        <div className="row tasks-addbar" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="Add a task…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ flex: 1 }}
          />
          <TaskFormFields
            pick={pick}
            setPick={setPick}
            term={term}
            setTerm={setTerm}
            repeat={repeat}
            setRepeat={setRepeat}
            goals={goals}
          />
          <button className="btn primary" onClick={submit} style={{ flex: "none" }}>
            <Icon.Plus />
            Add
          </button>
        </div>
      </div>

      {/* Mobile add-task bottom sheet */}
      {showAddSheet &&
        createPortal(
          <div className="sheet-scrim" role="presentation" onClick={closeSheet}>
            <div
              className="bottom-sheet"
              role="dialog"
              aria-modal="true"
              style={{ transform: sheetDrag ? `translateY(${sheetDrag}px)` : undefined }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="sheet-drag-area"
                onTouchStart={onHandleTouchStart}
                onTouchMove={onHandleTouchMove}
                onTouchEnd={onHandleTouchEnd}
              >
                <span className="sheet-handle" />
              </div>
              <div className="sheet-body">
                <div className="sheet-title">Add a task</div>
                <input
                  ref={sheetInputRef}
                  className="input"
                  placeholder="Add a task…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFromSheet()}
                />
                <div className="sheet-fields-row">
                  <TaskFormFields
                    pick={pick}
                    setPick={setPick}
                    term={term}
                    setTerm={setTerm}
                    repeat={repeat}
                    setRepeat={setRepeat}
                    goals={goals}
                  />
                </div>
                <button className="btn primary sheet-submit" onClick={submitFromSheet}>
                  <Icon.Plus /> Add task
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Filters */}
      <div className="row between tasks-filter-bar" style={{ marginBottom: 12, gap: 10 }}>
        <div className="row tasks-filter-chips" style={{ gap: 6 }}>
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
              ? "No tasks yet - add the first thing on your mind above."
              : "Nothing here with this filter. That's okay."}
          </div>
        </div>
      ) : (
        <div>
          {visible.map((task) => (
            <div
              key={task.id}
              id={"task-" + task.id}
              className={
                "taskrow" +
                (task.done ? " done" : "") +
                (taskMotion[task.id] ? " " + taskMotion[task.id] : "") +
                (pressingId === task.id ? " pressing" : "")
              }
            >
              <button
                className="checkbox"
                onClick={() => handleTaskToggle(task)}
                title={task.done ? "Mark not done" : "Mark done"}
              >
                {(task.done || taskMotion[task.id]) && <Icon.Check />}
              </button>

              <span className="taskrow-main">
                {editingId === task.id ? (
                  <input
                    className="input taskrow-edit-input"
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
                    onClick={() => !isMobile && startEdit(task)}
                    onTouchStart={handlePressStart(task)}
                    onTouchMove={handlePressMove}
                    onTouchEnd={handlePressEnd}
                    onTouchCancel={handlePressEnd}
                    title={isMobile ? "Hold to edit" : "Click to edit"}
                    style={{ cursor: isMobile ? "default" : "text" }}
                  >
                    {task.text}
                  </span>
                )}

                <span className="taskrow-chips row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {task.repeat && (
                    <span
                      className="chip"
                      title={repeatLabel(task.repeat)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <Icon.Reset width={11} height={11} />
                      {task.repeat.type === "daily"
                        ? "Daily"
                        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][task.repeat.weekday]}
                    </span>
                  )}
                  <LabelChip task={task} goals={goals} />
                  <TermChip term={taskTerm(task)} />
                </span>
              </span>

              <span className="taskrow-actions">
                <button
                  className="taskrow-icon-btn"
                  onClick={() => startEdit(task)}
                  title="Edit"
                >
                  <Icon.Edit width={14} height={14} />
                </button>

                <ConfirmButton
                  onConfirm={() => removeTask(task.id)}
                  requireConfirmation={confirmBeforeDelete}
                  title="Delete"
                  className="taskrow-icon-btn"
                  icon={<Icon.Trash width={14} height={14} />}
                />
              </span>
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
