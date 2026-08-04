import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icons.jsx";
import Select from "../components/Select.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";
import { TASK_TERMS, repeatLabel, todayKey, shiftDay } from "../lib/model.js";
import { flashElement } from "../lib/scrollFlash.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SORT_OPTIONS,
  DEFAULT_SORT,
  taskComparator,
  normalizeSort,
  directionLabel,
  supportsDirection,
} from "../lib/taskSort.js";

/* ============================================================
   Tasks tab
   Add / edit / complete / delete tasks, with labels + filters.
   Pure UI over the store - all persistence handled by useStore.
   ============================================================ */

const BASE_LABELS = ["Today", "Urgent", "General"];

// Chrome's nine tab-group colors, for the chip on a task linked to a group
// from the browser extension.
const TAB_GROUP_COLORS = {
  grey: "#8a8f98", blue: "#4f7bd8", red: "#d85f57", yellow: "#d9a441",
  green: "#4fa06a", pink: "#d2609a", purple: "#8a6fd0", cyan: "#3fa3ad",
  orange: "#d98040",
};
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;
const COMPLETION_BURST_MS = 560;

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
function TaskFormFields({
  pick,
  setPick,
  term,
  setTerm,
  repeat,
  setRepeat,
  assistantPrivate,
  setAssistantPrivate,
  goals,
  sched,
  setSched,
}) {
  const today = todayKey();
  const tomorrow = shiftDay(today, 1);
  return (
    <>
      <Select
        ariaLabel="Label or goal"
        value={pick}
        onChange={setPick}
        options={[
          ...BASE_LABELS.map((l) => ({ value: `label:${l}`, label: l })),
          ...goals.map((g) => ({ value: `goal:${g.id}`, label: g.name, sub: "Goal" })),
        ]}
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
      <Select
        ariaLabel="Repeat this task"
        value={repeat}
        onChange={setRepeat}
        options={[
          { value: "none", label: "No repeat" },
          { value: "daily", label: "Every day" },
          ...["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({
            value: `weekly:${i}`,
            label: `Every ${d}`,
          })),
        ]}
      />
      {/* When: put this task on a day. Quick chips for the two most common
         choices (Today / Tomorrow); the date field covers "Sunday" or any
         other day. A scheduled task shows up in that day's "Today's focus"
         and on that day's plan. Adding times also carves a real block. */}
      <div className="task-sched" title="Schedule this task onto a day">
        <span className="task-sched-lbl">
          <Icon.Calendar width={13} height={13} /> When
        </span>
        <button
          type="button"
          className={"chip" + (sched.date === today ? " accent" : "")}
          onClick={() => setSched({ ...sched, date: sched.date === today ? "" : today })}
          aria-pressed={sched.date === today}
        >
          Today
        </button>
        <button
          type="button"
          className={"chip" + (sched.date === tomorrow ? " accent" : "")}
          onClick={() =>
            setSched({ ...sched, date: sched.date === tomorrow ? "" : tomorrow })
          }
          aria-pressed={sched.date === tomorrow}
        >
          Tomorrow
        </button>
        <input
          className="input"
          type="date"
          value={sched.date}
          onChange={(e) => setSched({ ...sched, date: e.target.value })}
          aria-label="Scheduled day (optional)"
        />
        {sched.date && (
          <>
            <input
              className="input"
              type="time"
              value={sched.start}
              onChange={(e) => setSched({ ...sched, start: e.target.value })}
              aria-label="Start time (optional)"
            />
            <span className="task-sched-dash">–</span>
            <input
              className="input"
              type="time"
              value={sched.end}
              onChange={(e) => setSched({ ...sched, end: e.target.value })}
              aria-label="End time (optional)"
            />
          </>
        )}
      </div>
      <button
        type="button"
        className={"task-private-toggle" + (assistantPrivate ? " active" : "")}
        onClick={() => setAssistantPrivate(!assistantPrivate)}
        aria-pressed={assistantPrivate}
        title={
          assistantPrivate
            ? "Private from ChatGPT and other assistants"
            : "Allow assistants when this task's goal is shared"
        }
      >
        {assistantPrivate ? <Icon.Lock /> : <Icon.Eye />}
        <span>{assistantPrivate ? "Private" : "Assistant visible"}</span>
      </button>
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
  addDayBlock,
  taskOrder = [],
  setTaskOrder,
  confirmBeforeDelete = true,
  scrollTo = null,
}) {
  const isMobile = useIsMobile(640);

  // --- add bar state (shared by the desktop inline bar and the mobile sheet) ---
  const [text, setText] = useState("");
  const [pick, setPick] = useState("label:General"); // encodes label or goal
  const [term, setTerm] = useState(TASK_TERMS.SHORT);
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly:0..6
  const [assistantPrivate, setAssistantPrivate] = useState(false);
  // Optional schedule: date alone shows on the calendar; date + times also
  // carves a linked block into that day's plan.
  const [sched, setSched] = useState({ date: "", start: "", end: "" });

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

  // Filtering to a category is a statement about what you're working on, so a
  // task added while that filter is up should land THERE. Previously it went to
  // General and immediately vanished from the list you were looking at.
  // Only follows the filter — you can still override the picker per task.
  useEffect(() => {
    if (filter !== "all") setPick(filter);
  }, [filter]);

  // Sort order is remembered PER filter tab: "Today" usually wants what's due
  // soonest, while a goal's backlog often wants oldest-first so nothing rots
  // at the bottom. Keyed by the filter string ("all", "label:Today", "goal:x").
  const [sortByFilter, setSortByFilter] = useLocalStorage("ligand.taskSort", {});
  const sort = normalizeSort(sortByFilter[filter] || DEFAULT_SORT);
  const setSort = (patch) =>
    setSortByFilter((prev) => ({ ...prev, [filter]: { ...sort, ...patch } }));
  const filterName =
    filter === "all"
      ? "All"
      : filter.startsWith("goal:")
        ? goals.find((g) => g.id === filter.slice(5))?.name || "this goal"
        : filter.slice(6);

  // When search sends us to a specific task, clear the filters so it's
  // guaranteed visible, then scroll to and flash it.
  useEffect(() => {
    if (!scrollTo?.id) return;
    const timer = window.setTimeout(() => {
      setStatus("all");
      setFilter("all");
      flashElement("task-" + scrollTo.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scrollTo?.nonce, scrollTo?.id]);

  // --- inline edit state ---
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  // --- mobile long-press-to-edit state ---
  const [pressingId, setPressingId] = useState(null);
  const pressTimer = useRef(null);
  const pressStart = useRef({ x: 0, y: 0 });

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  // --- completion burst (Section 2): a transient class drives the green
  // spring/flash/bounce when a task is checked (or a quiet bounce on uncheck).
  const [burst, setBurst] = useState(null); // { id, kind: 'check' | 'uncheck' }
  const burstTimer = useRef(null);
  useEffect(() => () => clearTimeout(burstTimer.current), []);
  const handleToggle = (task) => {
    const kind = task.done ? "uncheck" : "check";
    toggleTask(task.id);
    clearTimeout(burstTimer.current);
    setBurst({ id: task.id, kind });
    burstTimer.current = setTimeout(() => setBurst(null), COMPLETION_BURST_MS);
  };

  const parseRepeat = (v) => {
    if (v === "daily") return { type: "daily" };
    if (v.startsWith("weekly:")) return { type: "weekly", weekday: Number(v.slice(7)) };
    return null;
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    const rep = parseRepeat(repeat);
    const scheduledFor = sched.date || null;
    const base = { text: t, term, repeat: rep, assistantPrivate, scheduledFor };
    let saved;
    if (pick.startsWith("goal:")) {
      const id = pick.slice(5);
      const goal = goals.find((g) => g.id === id);
      saved = addTask({ ...base, label: goal ? goal.name : "General", goalId: id });
    } else {
      saved = addTask({ ...base, label: pick.slice(6) });
    }
    // Date + times = a real block on that day's plan, linked to the task so
    // checking the block off completes the task too.
    const toMin = (hhmm) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const startMin = toMin(sched.start);
    let endMin = toMin(sched.end);
    if (scheduledFor && startMin != null && addDayBlock && saved?.id) {
      if (endMin == null || endMin <= startMin) endMin = Math.min(24 * 60, startMin + 60);
      addDayBlock({
        date: scheduledFor,
        start: startMin,
        end: endMin,
        title: t.slice(0, 60),
        category: "focus",
        linkType: "task",
        linkId: saved.id,
      });
    }
    setText("");
    setAssistantPrivate(false);
    setSched({ date: "", start: "", end: "" });
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

  // Filter + sort: matches first, active before done, then this tab's order.
  // Keyed on the two fields rather than the object: `sort` is rebuilt every
  // render by normalizeSort, so depending on it would rebuild the comparator
  // (and re-sort) on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const compare = useMemo(() => taskComparator(sort, taskOrder), [sort.by, sort.dir, taskOrder]);

  // Dragging a row rearranges the list and switches this tab to "My order", so
  // the arrangement you just made is the one you keep seeing. A pointer needs
  // to travel a few px before a drag starts, otherwise tapping a row to edit it
  // would be swallowed by the drag sensor.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = visible.map((t) => t.id);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    // Merge the reordered visible rows back over the full saved order, so
    // rearranging inside one filter never disturbs tasks hidden by it.
    const reordered = arrayMove(ids, from, to);
    const rest = (taskOrder || []).filter((id) => !ids.includes(id));
    setTaskOrder?.([...reordered, ...rest]);
    if (sort.by !== "manual") setSort({ by: "manual" });
  };
  /* Which burst, if any, belongs to this task.

     Written out rather than inlined as `burst?.id === t.id && burst.kind`,
     which LOOKS safe and isn't. The optional chain guards the first read but
     not the second, and it relies on the `&&` short-circuiting to protect it —
     which it does, right up until a task turns up with no id. Then
     `undefined === undefined` is true, execution carries on to `burst.kind`,
     and that reads off null. One id-less task — from a half-written record, an
     import, or a stale sync blob — took the entire Tasks tab down with it.

     Requiring a real id on both sides makes the comparison mean what it says. */
  const burstKindFor = (id) =>
    id != null && burst && burst.id === id ? burst.kind : null;

  const visible = useMemo(() => {
    return tasks
      .filter((t) => {
        const kind = burstKindFor(t.id);
        const leavingActive = kind === "check" && status === "active";
        const leavingDone = kind === "uncheck" && status === "done";
        if (leavingActive || leavingDone) return true;
        return status === "all" ? true : status === "done" ? t.done : !t.done;
      })
      .filter((t) => {
        if (filter === "all") return true;
        if (filter.startsWith("goal:")) return t.goalId === filter.slice(5);
        if (filter.startsWith("label:")) return !t.goalId && t.label === filter.slice(6);
        return true;
      })
      .sort((a, b) => {
        const effectiveDone = (t) => {
          const kind = burstKindFor(t.id);
          if (kind === "check" && status === "active") return false;
          if (kind === "uncheck" && status === "done") return true;
          return t.done;
        };
        // Done always sinks below open work, whatever the chosen order.
        return (
          Number(effectiveDone(a)) - Number(effectiveDone(b)) || compare(a, b)
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, status, filter, burst, sort.by, sort.dir]);

  const counts = useMemo(
    () => ({
      total: tasks.length,
      active: tasks.filter((t) => !t.done).length,
      done: tasks.filter((t) => t.done).length,
    }),
    [tasks]
  );

  // The Active/Done/All status toggle. Rendered next to the mobile "Add task"
  // button on phones, and inside the filter bar on desktop (the wrapper class
  // controls which copy shows — see .tasks-status-seg-* in index.css).
  const renderStatusSeg = (cls) => (
    <div className={"seg " + cls}>
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
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">To-do</div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            Everything you want to get to, labelled and filterable. One at a time is plenty.
          </p>
        </div>
      </div>

      {/* Mobile: a compact trigger that opens the full form in a bottom
         sheet, so the task list gets almost the whole screen instead of a
         3-row form eating the top. The status toggle rides alongside it here
         (freeing the filter row below for full-width chips). Desktop keeps the
         inline bar + in-row toggle below. */}
      <div className="tasks-mobile-actions">
        <button
          type="button"
          className="tasks-add-mobile-btn"
          onClick={() => setShowAddSheet(true)}
        >
          <Icon.Plus /> Add task
        </button>
        {renderStatusSeg("tasks-status-seg-mobile")}
      </div>

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
            assistantPrivate={assistantPrivate}
            setAssistantPrivate={setAssistantPrivate}
            goals={goals}
            sched={sched}
            setSched={setSched}
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
                    assistantPrivate={assistantPrivate}
                    setAssistantPrivate={setAssistantPrivate}
                    goals={goals}
                    sched={sched}
                    setSched={setSched}
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
        {/* Chips scroll horizontally; the wrapper's right-edge fade hints at
            more off-screen (see .tasks-filter-chips-wrap in index.css). */}
        <div className="tasks-filter-chips-wrap">
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
        </div>

        {renderStatusSeg("tasks-status-seg-desktop")}
      </div>

      {/* Order, remembered per tab. The trailing note says whose order this is,
         because a setting that silently differs between tabs is confusing
         otherwise. */}
      <div className="tasks-sort-bar">
        <Icon.Sort width={13} height={13} />
        <Select
          ariaLabel="Sort tasks by"
          value={sort.by}
          onChange={(by) => setSort({ by })}
          options={SORT_OPTIONS}
        />
        {/* Just an arrow — the label lives in the tooltip, the way every other
           app does it. A full-width labelled button for a flip was too loud. */}
        {supportsDirection(sort.by) ? (
          <button
            type="button"
            className={"iconbtn sm tasks-sort-dir" + (sort.dir === "asc" ? " up" : "")}
            onClick={() => setSort({ dir: sort.dir === "asc" ? "desc" : "asc" })}
            title={directionLabel(sort.by, sort.dir) + " — click to flip"}
            aria-label={directionLabel(sort.by, sort.dir)}
          >
            <Icon.Arrow width={13} height={13} />
          </button>
        ) : (
          <span className="tasks-sort-scope">{directionLabel(sort.by)}</span>
        )}
        <span className="tasks-sort-scope">for {filterName}</span>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>
          <div style={{ fontSize: 13 }}>
            {counts.total === 0
              ? "No tasks yet. Add the first thing on your mind above."
              : "Nothing here with this filter. That's okay."}
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
        <SortableContext items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visible.map((task) => {
            const burstKind = burstKindFor(task.id);
            const leaving =
              (burstKind === "check" && status === "active") ||
              (burstKind === "uncheck" && status === "done");
            return (
              <SortableTaskRow
                key={task.id}
                id={task.id}
                domId={"task-" + task.id}
                className={
                  "taskrow" +
                  (task.done ? " done" : "") +
                  (pressingId === task.id ? " pressing" : "") +
                  (burstKind === "check"
                    ? " check-burst"
                    : burstKind === "uncheck"
                      ? " uncheck-burst"
                      : "") +
                  (leaving ? " leaving-burst" : "")
                }
              >
                <button
                  className="checkbox"
                  onClick={() => handleToggle(task)}
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

                <span className="taskrow-chips row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                  {task.assistantPrivate && (
                    <span className="chip task-private-chip" title="Private from assistants">
                      <Icon.Lock width={11} height={11} />
                      Private
                    </span>
                  )}
                  {task.tabGroup?.title && (
                    <span
                      className="chip"
                      title={`Worked in the "${task.tabGroup.title}" tab group`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <span
                        className="swatch"
                        style={{
                          background: TAB_GROUP_COLORS[task.tabGroup.color] || "var(--ink-4)",
                          boxShadow: "none",
                        }}
                      />
                      {task.tabGroup.title}
                    </span>
                  )}
                  <LabelChip task={task} goals={goals} />
                  <TermChip term={taskTerm(task)} />
                </span>

                <span className="taskrow-actions">
                  <button
                    className={"taskrow-icon-btn" + (task.assistantPrivate ? " active" : "")}
                    onClick={() =>
                      updateTask(task.id, { assistantPrivate: !task.assistantPrivate })
                    }
                    title={
                      task.assistantPrivate
                        ? "Allow assistants to see this task"
                        : "Keep this task private from assistants"
                    }
                    aria-label={
                      task.assistantPrivate
                        ? `Allow assistants to see ${task.text}`
                        : `Keep ${task.text} private from assistants`
                    }
                  >
                    {task.assistantPrivate ? (
                      <Icon.Lock width={14} height={14} />
                    ) : (
                      <Icon.Eye width={14} height={14} />
                    )}
                  </button>
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
              </SortableTaskRow>
            );
          })}
        </SortableContext>
        </DndContext>
      )}
    </>
  );
}

/* One draggable row.

   The drag listeners go on the ROW, not a separate handle: a dedicated grip
   would cost horizontal room the row doesn't have on a phone. The pointer
   sensor's small activation distance is what keeps a tap (edit) distinct from
   a drag (reorder), and the row's own buttons stop propagation anyway. */
function SortableTaskRow({ id, domId, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      id={domId}
      className={className + (isDragging ? " dragging" : "")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
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
