import { useEffect, useMemo, useRef, useState } from "react";
import { GOAL_TYPES, TASK_TERMS, goalTargetDate, isGoalOverdue } from "../lib/model.js";
import HabitChecker from "../widgets/HabitChecker.jsx";
import GoalProgress from "../widgets/GoalProgress.jsx";
import Reflections from "../widgets/Reflections.jsx";
import CountUp from "../widgets/CountUp.jsx";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

function niceAchievable(value) {
  if (value === "easy") return "Easy";
  if (value === "stretch") return "Stretch";
  if (value === "balanced") return "Balanced";
  return "Not chosen yet";
}

function GoalDetails({ goal }) {
  const smart = goal.smartFields || {};
  const details = [
    ["Specific", smart.specific],
    ["Measurable", smart.measurable],
    ["Achievable", niceAchievable(smart.achievable)],
    ["Relevant", smart.relevant],
    ["Time-bound", goalTargetDate(goal)],
  ];
  const hasDetails = details.some(([, value]) => value && value !== "Not chosen yet");
  const [open, setOpen] = useState(hasDetails);

  return (
    <div className="card">
      <div className="row between" style={{ gap: 12 }}>
        <div>
          <div className="card-title">
            <Icon.Target /> Goal details
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
            {hasDetails
              ? "Your SMART notes are saved here. You can adjust this later."
              : "No SMART details yet. Older goals still work normally."}
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="grid grid-12" style={{ marginTop: 12 }}>
          {details.map(([label, value]) => (
            <div key={label} className={label === "Relevant" ? "col-12" : "col-6"}>
              <div className="tag" style={{ marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>
                {value || "Not filled in yet."}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverdueGoalBanner({
  goal,
  onSnoozeGoal,
  onReviseGoalDate,
  onArchiveGoal,
  canArchive,
}) {
  const target = goalTargetDate(goal);
  const [draft, setDraft] = useState(target || "");

  if (!isGoalOverdue(goal)) return null;

  return (
    <div
      className="card"
      style={{
        background: "var(--accent-soft)",
        borderColor: "transparent",
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: "var(--accent-ink)", flex: "none", marginTop: 1 }}>
          <Icon.Heart />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--accent-ink)", fontSize: 13.5, lineHeight: 1.45 }}>
            Plans change. Want to clean this up? You can keep it, revise it, or let it go.
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
            Target date: {target}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={() => onSnoozeGoal?.(goal.id)}>
              Keep goal
            </button>
            <input
              type="date"
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ width: 140, flex: "none" }}
            />
            <button
              className="btn ghost sm"
              onClick={() => draft && onReviseGoalDate?.(goal.id, draft)}
            >
              Revise target date
            </button>
            {canArchive && (
              <button
                className="btn ghost sm"
                onClick={() => onArchiveGoal?.(goal.id)}
                style={{ color: "oklch(0.55 0.16 20)" }}
              >
                Archive goal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function taskTerm(task) {
  return task.term || task.taskScope || TASK_TERMS.SHORT;
}

function TermChip({ term }) {
  const long = term === TASK_TERMS.LONG || term === "long";
  return <span className={long ? "chip lav" : "chip mint"}>{long ? "Long-term" : "Short-term"}</span>;
}

const WIDGET_LAYOUT_VERSION = 2;
const WIDGET_SIZE_VARIANTS = ["compact", "medium", "wide", "tall", "large"];
const WIDGET_SIZE_LABELS = {
  compact: "Compact",
  medium: "Medium",
  wide: "Wide",
  tall: "Tall",
  large: "Large",
};
const LEGACY_WIDGET_SIZE_MAP = { small: "compact", medium: "medium", large: "wide" };
const LEGACY_WIDGET_TYPE_MAP = {
  habits: "habits",
  tasks: "goalTasks",
  progress: "progress",
  countup: "countUp",
  reflections: "reflections",
  encouragement: "encouragement",
  pomodoro: "pomodoroQuickStart",
};

const PRESET_WIDGETS = [
  {
    id: "core-overdue-review",
    type: "overdueReview",
    size: "wide",
    order: 0,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-goal-details",
    type: "goalDetails",
    size: "wide",
    order: 10,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-habits",
    type: "habits",
    size: "medium",
    order: 20,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-progress",
    type: "progress",
    size: "medium",
    order: 30,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-goal-tasks",
    type: "goalTasks",
    size: "wide",
    order: 40,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-count-up",
    type: "countUp",
    size: "compact",
    order: 50,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-reflections",
    type: "reflections",
    size: "medium",
    order: 60,
    hidden: false,
    locked: true,
    source: "preset",
  },
  {
    id: "core-encouragement",
    type: "encouragement",
    size: "medium",
    order: 70,
    hidden: false,
    locked: false,
    source: "preset",
  },
  {
    id: "core-pomodoro",
    type: "pomodoroQuickStart",
    size: "medium",
    order: 80,
    hidden: false,
    locked: false,
    source: "preset",
  },
];

const WIDGET_REGISTRY = {
  overdueReview: {
    type: "overdueReview",
    title: "Goals to review",
    sub: "Keep, revise, or archive an overdue goal.",
    icon: <Icon.Heart />,
    defaultSize: "wide",
    allowedSizes: ["wide", "large"],
    preset: true,
    locked: true,
    condition: ({ goal }) => isGoalOverdue(goal),
    render: ({ goal, onSnoozeGoal, onReviseGoalDate, onArchiveGoal, builtIn }) => (
      <OverdueGoalBanner
        goal={goal}
        onSnoozeGoal={onSnoozeGoal}
        onReviseGoalDate={onReviseGoalDate}
        onArchiveGoal={onArchiveGoal}
        canArchive={!builtIn}
      />
    ),
  },
  goalDetails: {
    type: "goalDetails",
    title: "Goal details",
    sub: "Review the SMART notes for this goal.",
    icon: <Icon.Target />,
    defaultSize: "wide",
    allowedSizes: ["medium", "wide", "large"],
    preset: true,
    locked: true,
    render: ({ goal }) => <GoalDetails key={goal.id} goal={goal} />,
  },
  habits: {
    type: "habits",
    title: "Habit checker",
    sub: "Track forgiving habits for this goal.",
    icon: <Icon.Check />,
    defaultSize: "medium",
    allowedSizes: ["medium", "wide", "tall", "large"],
    preset: true,
    locked: true,
    render: ({ goal, addHabit, checkInHabit, removeHabit, confirmBeforeDelete }) => (
      <HabitChecker
        goal={goal}
        addHabit={addHabit}
        checkInHabit={checkInHabit}
        removeHabit={removeHabit}
        confirmBeforeDelete={confirmBeforeDelete}
      />
    ),
  },
  goalTasks: {
    type: "goalTasks",
    title: "Goal tasks",
    sub: "Add and manage goal-linked tasks.",
    icon: <Icon.Pin />,
    defaultSize: "wide",
    allowedSizes: ["medium", "wide", "tall", "large"],
    preset: true,
    locked: true,
    render: ({ goal, tasks, addTask, updateTask, toggleTask, removeTask, confirmBeforeDelete }) => (
      <GoalTasks
        goal={goal}
        tasks={tasks}
        addTask={addTask}
        updateTask={updateTask}
        toggleTask={toggleTask}
        removeTask={removeTask}
        confirmBeforeDelete={confirmBeforeDelete}
      />
    ),
  },
  progress: {
    type: "progress",
    title: "Progress tracker",
    sub: "See task progress and weekly check-ins.",
    icon: <Icon.Target />,
    defaultSize: "medium",
    allowedSizes: ["compact", "medium", "wide"],
    preset: true,
    locked: true,
    render: ({ goal, tasks }) => <GoalProgress goal={goal} tasks={tasks} />,
  },
  countUp: {
    type: "countUp",
    title: "What I'm proud of",
    sub: "A gentle count-up streak card.",
    icon: <Icon.Flame />,
    defaultSize: "compact",
    allowedSizes: ["compact", "medium", "wide"],
    preset: true,
    locked: true,
    render: ({ countUps }) => <CountUp countUp={countUps && countUps[0]} />,
  },
  reflections: {
    type: "reflections",
    title: "Journal/reflection",
    sub: "Save notes and gentle reflections.",
    icon: <Icon.Book />,
    defaultSize: "medium",
    allowedSizes: ["medium", "wide", "tall", "large"],
    preset: true,
    locked: true,
    render: ({ goal, addReflection, removeReflection, confirmBeforeDelete }) => (
      <Reflections
        goal={goal}
        addReflection={addReflection}
        removeReflection={removeReflection}
        confirmBeforeDelete={confirmBeforeDelete}
      />
    ),
  },
  encouragement: {
    type: "encouragement",
    title: "Encouraging message",
    sub: "A small supportive nudge.",
    icon: <Icon.Spark />,
    defaultSize: "medium",
    allowedSizes: ["compact", "medium", "wide"],
    preset: true,
    locked: false,
    render: ({ goal, tasks }) => <EncouragingWidget goal={goal} tasks={tasks} />,
  },
  pomodoroQuickStart: {
    type: "pomodoroQuickStart",
    title: "Pomodoro quick-start",
    sub: "Jump to the focus timer.",
    icon: <Icon.Timer />,
    defaultSize: "medium",
    allowedSizes: ["compact", "medium", "wide"],
    preset: true,
    locked: false,
    render: ({ onGoToPomodoro }) => <PomodoroQuickStart onGoToPomodoro={onGoToPomodoro} />,
  },
};

function normalizeWidgetType(type) {
  return LEGACY_WIDGET_TYPE_MAP[type] || type;
}

function normalizeWidgetSize(size, type) {
  const registry = WIDGET_REGISTRY[type];
  const mapped = LEGACY_WIDGET_SIZE_MAP[size] || size || registry?.defaultSize || "medium";
  const allowed = registry?.allowedSizes || WIDGET_SIZE_VARIANTS;
  return allowed.includes(mapped) ? mapped : registry?.defaultSize || "medium";
}

function normalizeWidgetOrder(widget, fallbackOrder) {
  return Number.isFinite(widget?.order) ? widget.order : fallbackOrder;
}

function normalizeWidget(widget, fallbackOrder = 100, fallbackSource = "user") {
  const type = normalizeWidgetType(widget?.type);
  const registry = WIDGET_REGISTRY[type];
  if (!registry) return null;
  return {
    id: widget.id || widgetId(),
    type,
    size: normalizeWidgetSize(widget.size, type),
    order: normalizeWidgetOrder(widget, fallbackOrder),
    hidden: Boolean(widget.hidden),
    locked: widget.locked ?? registry.locked ?? false,
    source: widget.source || fallbackSource,
    settings: widget.settings || undefined,
  };
}

function defaultWidgetLayout() {
  return PRESET_WIDGETS.map((widget) => normalizeWidget(widget, widget.order, "preset")).filter(Boolean);
}

function legacyWidgetsForV2(goal) {
  if (!Array.isArray(goal?.widgetLayout)) return [];
  return goal.widgetLayout
    .map((widget, index) =>
      normalizeWidget(
        {
          ...widget,
          id: widget.id || `legacy-widget-${index}`,
          type: normalizeWidgetType(widget.type),
          order: 100 + index * 10,
          locked: false,
          source: "user",
        },
        100 + index * 10,
        "user"
      )
    )
    .filter(Boolean);
}

function resolveWidgetLayoutV2(goal) {
  const presets = defaultWidgetLayout();
  const stored = goal?.widgetLayoutV2;
  const storedWidgets = Array.isArray(stored?.widgets)
    ? stored.widgets
        .map((widget, index) => normalizeWidget(widget, (index + 1) * 10, widget.source || "user"))
        .filter(Boolean)
    : null;

  if (storedWidgets) {
    const ids = new Set(storedWidgets.map((widget) => widget.id));
    const missingPresets = presets.filter((widget) => !ids.has(widget.id));
    return {
      version: WIDGET_LAYOUT_VERSION,
      widgets: [...storedWidgets, ...missingPresets].sort((a, b) => a.order - b.order),
    };
  }

  return {
    version: WIDGET_LAYOUT_VERSION,
    widgets: [...presets, ...legacyWidgetsForV2(goal)].sort((a, b) => a.order - b.order),
  };
}

function normalizeWidgetOrders(widgets) {
  return [...widgets]
    .sort((a, b) => a.order - b.order)
    .map((widget, index) => ({ ...widget, order: (index + 1) * 10 }));
}

const WIDGET_SIZES = ["small", "medium", "large"];
const WIDGET_COLS = { small: "col-4", medium: "col-6", large: "col-12" };
const WIDGET_TYPES = [
  {
    type: "habits",
    title: "Habit checker",
    sub: "Track forgiving habits for this goal.",
    icon: <Icon.Check />,
  },
  {
    type: "tasks",
    title: "Task list",
    sub: "Add and manage goal-linked tasks.",
    icon: <Icon.Pin />,
  },
  {
    type: "progress",
    title: "Progress tracker",
    sub: "See task progress and weekly check-ins.",
    icon: <Icon.Target />,
  },
  {
    type: "countup",
    title: "What I'm proud of",
    sub: "A gentle count-up streak card.",
    icon: <Icon.Flame />,
  },
  {
    type: "reflections",
    title: "Journal/reflection",
    sub: "Save notes and gentle reflections.",
    icon: <Icon.Book />,
  },
  {
    type: "encouragement",
    title: "Encouraging message",
    sub: "A small supportive nudge.",
    icon: <Icon.Spark />,
  },
  {
    type: "pomodoro",
    title: "Pomodoro quick-start",
    sub: "Jump to the focus timer.",
    icon: <Icon.Timer />,
  },
];

function widgetId() {
  return `widget_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function GoalTasks({
  goal,
  tasks,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  confirmBeforeDelete,
}) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState(TASK_TERMS.SHORT);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const goalTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.goalId === goal.id)
        .sort((a, b) => Number(a.done) - Number(b.done) || b.id.localeCompare(a.id)),
    [tasks, goal.id]
  );

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    addTask({ text: t, label: goal.name, goalId: goal.id, term });
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

  const renderTasks = (scope) => {
    const scoped = goalTasks.filter((task) => taskTerm(task) === scope);
    if (scoped.length === 0) {
      return (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          Nothing here yet.
        </div>
      );
    }

    return (
      <div className="stack" style={{ gap: 6 }}>
        {scoped.map((task) => (
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

            <TermChip term={taskTerm(task)} />

            <button
              onClick={() => startEdit(task)}
              title="Edit"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: 4,
                display: "inline-flex",
              }}
            >
              <Icon.Edit width={14} height={14} />
            </button>

            <ConfirmButton
              onConfirm={() => removeTask(task.id)}
              requireConfirmation={confirmBeforeDelete}
              title="Delete"
              className=""
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: 4,
                display: "inline-flex",
              }}
              icon={<Icon.Trash width={14} height={14} />}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Check /> Goal tasks
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {goalTasks.length || ""}
        </span>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Add a task for this goal..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ flex: "1 1 220px" }}
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
        <button className="btn primary" onClick={submit} style={{ flex: "none" }}>
          <Icon.Plus /> Add
        </button>
      </div>

      {goalTasks.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No tasks linked here yet. Add one small next step, or a longer-term thing to keep in view.
        </div>
      ) : (
        <div className="grid grid-12">
          <div className="col-12 stack" style={{ gap: 8, minWidth: 0 }}>
            <div className="tag">Short-term</div>
            {renderTasks(TASK_TERMS.SHORT)}
          </div>
          <div className="col-12 stack" style={{ gap: 8, minWidth: 0 }}>
            <div className="tag">Long-term</div>
            {renderTasks(TASK_TERMS.LONG)}
          </div>
        </div>
      )}
    </div>
  );
}

function WidgetPicker({ widgets = [], onAdd, onRestore, onClose }) {
  const hiddenWidgets = widgets.filter((widget) => widget.hidden && WIDGET_REGISTRY[widget.type]);
  const addableTypes = [
    "habits",
    "goalTasks",
    "progress",
    "countUp",
    "reflections",
    "encouragement",
    "pomodoroQuickStart",
  ];

  return (
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-picker-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 560 }}
      >
        <div style={{ padding: 18 }}>
          <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="eyebrow">Customize this goal</div>
              <h2 id="widget-picker-title" className="page-title" style={{ fontSize: 21 }}>
                Add a widget
              </h2>
              <p className="page-sub" style={{ margin: "5px 0 0" }}>
                Choose one helpful piece. You can resize, hide, or move it after.
              </p>
            </div>
            <button className="iconbtn" title="Close" onClick={onClose}>
              <Icon.Close />
            </button>
          </div>

          {hiddenWidgets.length > 0 && (
            <>
              <div className="tag" style={{ marginTop: 16, marginBottom: 8 }}>
                Hidden widgets
              </div>
              <div className="grid grid-12">
                {hiddenWidgets.map((widget) => {
                  const item = WIDGET_REGISTRY[widget.type];
                  return (
                    <button
                      key={widget.id}
                      className="card hover col-6"
                      onClick={() => onRestore(widget.id)}
                      style={{ textAlign: "left", cursor: "pointer" }}
                    >
                      <div className="card-title">
                        {item.icon} {item.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.45 }}>
                        Restore this widget to the grid.
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="tag" style={{ marginTop: 16, marginBottom: 8 }}>
            Add another widget
          </div>
          <div className="grid grid-12">
            {addableTypes.map((type) => {
              const item = WIDGET_REGISTRY[type];
              return (
                <button
                  key={type}
                  className="card hover col-6"
                  onClick={() => onAdd(type)}
                  style={{ textAlign: "left", cursor: "pointer" }}
                >
                  <div className="card-title">
                    {item.icon} {item.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.45 }}>
                    {item.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EncouragingWidget({ goal, tasks }) {
  const goalTasks = tasks.filter((t) => t.goalId === goal.id);
  const done = goalTasks.filter((t) => t.done).length;
  const active = goalTasks.length - done;
  const line =
    done > 0
      ? `${done} step${done === 1 ? "" : "s"} done here already. That counts.`
      : active > 0
      ? "Pick one small next step. You do not have to carry the whole goal at once."
      : "This goal is waiting calmly. Add one tiny action when it feels useful.";

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Spark /> Encouragement
        </div>
      </div>
      <div style={{ fontSize: 14, color: "var(--accent-ink)", lineHeight: 1.5 }}>
        {line}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 8 }}>
        Gentle progress beats perfect plans.
      </div>
    </div>
  );
}

function PomodoroQuickStart({ onGoToPomodoro }) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Timer /> Pomodoro quick-start
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.45, marginBottom: 10 }}>
        Ready for a focus block? Open the timer and do one gentle round.
      </div>
      <button className="btn primary" onClick={onGoToPomodoro}>
        <Icon.Play /> Open timer
      </button>
    </div>
  );
}

function widgetIsVisible(widget, context) {
  const registry = WIDGET_REGISTRY[widget.type];
  if (!registry || widget.hidden) return false;
  return registry.condition ? registry.condition(context) : true;
}

function WidgetEditControls({
  widget,
  index,
  total,
  onResize,
  onHide,
  onRemove,
  onMove,
  confirmBeforeDelete,
}) {
  const registry = WIDGET_REGISTRY[widget.type];
  const allowedSizes = registry?.allowedSizes || WIDGET_SIZE_VARIANTS;
  const removable = widget.source === "user" && !widget.locked;
  const size = normalizeWidgetSize(widget.size, widget.type);

  return (
    <div className="goal-widget-editbar">
      <span className="goal-widget-grip" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="tag" style={{ flex: "1 1 auto", minWidth: 80 }}>
        {registry?.title || "Widget"}
      </span>
      {onMove && (
        <span className="row" style={{ gap: 4, flex: "none" }}>
          <button
            className="btn ghost sm"
            onClick={() => onMove(widget.id, -1)}
            disabled={index === 0}
            style={{ opacity: index === 0 ? 0.45 : 1 }}
          >
            Up
          </button>
          <button
            className="btn ghost sm"
            onClick={() => onMove(widget.id, 1)}
            disabled={index === total - 1}
            style={{ opacity: index === total - 1 ? 0.45 : 1 }}
          >
            Down
          </button>
        </span>
      )}
      <span className="seg goal-widget-size-control">
        {allowedSizes.map((option) => (
          <button
            key={option}
            className={option === size ? "active" : ""}
            onClick={() => onResize(widget.id, option)}
            title={`Set ${WIDGET_SIZE_LABELS[option] || option} size`}
          >
            {WIDGET_SIZE_LABELS[option] || option}
          </button>
        ))}
      </span>
      {removable ? (
        <ConfirmButton
          className="btn ghost sm"
          confirmLabel="Remove?"
          title="Remove widget"
          onConfirm={() => onRemove(widget.id)}
          requireConfirmation={confirmBeforeDelete}
          style={{ color: "oklch(0.55 0.16 20)" }}
          icon={<Icon.Trash width={13} height={13} />}
        />
      ) : (
        <button className="btn ghost sm" onClick={() => onHide(widget.id)}>
          Hide
        </button>
      )}
    </div>
  );
}

function GoalWidgetShell({
  widget,
  context,
  editing,
  index,
  total,
  onResize,
  onHide,
  onRemove,
  onMove,
}) {
  const registry = WIDGET_REGISTRY[widget.type];
  if (!registry) return null;
  const size = normalizeWidgetSize(widget.size, widget.type);
  const content = registry.render({ ...context, widget, widgetSize: size });
  return (
    <div
      className={`goal-widget-shell goal-widget-size-${size}${editing ? " is-editing" : ""}`}
      style={{ minWidth: 0 }}
    >
      {editing && (
        <WidgetEditControls
          widget={widget}
          index={index}
          total={total}
          onResize={onResize}
          onHide={onHide}
          onRemove={onRemove}
          onMove={onMove}
          confirmBeforeDelete={context.confirmBeforeDelete}
        />
      )}
      {content}
    </div>
  );
}

function GoalWidgetGrid({
  goal,
  tasks,
  countUps,
  builtIn,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  addHabit,
  checkInHabit,
  removeHabit,
  addReflection,
  removeReflection,
  onSnoozeGoal,
  onReviseGoalDate,
  onArchiveGoal,
  onGoToPomodoro,
  updateGoal,
  confirmBeforeDelete,
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const layout = useMemo(() => resolveWidgetLayoutV2(goal), [goal]);

  const saveWidgets = (widgets) => {
    updateGoal(goal.id, {
      widgetLayoutV2: {
        version: WIDGET_LAYOUT_VERSION,
        widgets: normalizeWidgetOrders(widgets),
      },
    });
  };

  const addWidget = (type) => {
    const registry = WIDGET_REGISTRY[type];
    if (!registry) return;
    const maxOrder = layout.widgets.reduce((max, widget) => Math.max(max, widget.order), 0);
    saveWidgets([
      ...layout.widgets,
      {
        id: widgetId(),
        type,
        size: registry.defaultSize,
        order: maxOrder + 10,
        hidden: false,
        locked: false,
        source: "user",
      },
    ]);
    setPickerOpen(false);
  };

  const resizeWidget = (id, size) => {
    saveWidgets(
      layout.widgets.map((widget) =>
        widget.id === id ? { ...widget, size: normalizeWidgetSize(size, widget.type) } : widget
      )
    );
  };

  const hideWidget = (id) => {
    saveWidgets(layout.widgets.map((widget) => (widget.id === id ? { ...widget, hidden: true } : widget)));
  };

  const restoreWidget = (id) => {
    saveWidgets(layout.widgets.map((widget) => (widget.id === id ? { ...widget, hidden: false } : widget)));
    setPickerOpen(false);
  };

  const removeWidget = (id) => {
    saveWidgets(layout.widgets.filter((widget) => widget.id !== id || widget.locked || widget.source !== "user"));
  };

  const context = {
    goal,
    tasks,
    countUps,
    builtIn,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    addHabit,
    checkInHabit,
    removeHabit,
    addReflection,
    removeReflection,
    onSnoozeGoal,
    onReviseGoalDate,
    onArchiveGoal,
    onGoToPomodoro,
    confirmBeforeDelete,
  };
  const visibleWidgets = layout.widgets.filter((widget) => widgetIsVisible(widget, context));
  const hiddenWidgets = layout.widgets.filter((widget) => widget.hidden && WIDGET_REGISTRY[widget.type]);
  const moveWidget = (id, delta) => {
    const ordered = normalizeWidgetOrders(layout.widgets);
    const orderedVisible = ordered.filter((widget) => widgetIsVisible(widget, context));
    const visibleIndex = orderedVisible.findIndex((widget) => widget.id === id);
    const targetVisible = orderedVisible[visibleIndex + delta];
    if (visibleIndex < 0 || !targetVisible) return;

    const currentIndex = ordered.findIndex((widget) => widget.id === id);
    const targetIndex = ordered.findIndex((widget) => widget.id === targetVisible.id);
    if (currentIndex < 0 || targetIndex < 0) return;

    const next = [...ordered];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    saveWidgets(next);
  };

  return (
    <>
      <div className="goal-layout-toolbar">
        <div>
          <div className="eyebrow">Goal dashboard</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
            Arrange the pieces that help this goal feel doable.
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setPickerOpen(true)}>
            <Icon.Plus /> Add widget
          </button>
          <button
            className={editing ? "btn primary" : "btn"}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? <Icon.Check /> : <Icon.More />} {editing ? "Done" : "Edit layout"}
          </button>
        </div>
      </div>

      <div className={`goal-widget-grid${editing ? " is-editing" : ""}`}>
        {visibleWidgets.map((widget, index) => (
          <GoalWidgetShell
            key={widget.id}
            widget={widget}
            context={context}
            editing={editing}
            index={index}
            total={visibleWidgets.length}
            onResize={resizeWidget}
            onHide={hideWidget}
            onRemove={removeWidget}
            onMove={moveWidget}
          />
        ))}
      </div>

      {editing && hiddenWidgets.length > 0 && (
        <div className="goal-hidden-widgets">
          <span className="tag">Hidden widgets</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {hiddenWidgets.map((widget) => {
              const item = WIDGET_REGISTRY[widget.type];
              return (
                <button key={widget.id} className="btn ghost sm" onClick={() => restoreWidget(widget.id)}>
                  {item?.icon} Restore {item?.title || "widget"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pickerOpen && (
        <WidgetPicker
          widgets={layout.widgets}
          onAdd={addWidget}
          onRestore={restoreWidget}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function GoalWidgets({
  goal,
  tasks,
  countUps,
  updateGoal,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  addHabit,
  checkInHabit,
  removeHabit,
  addReflection,
  removeReflection,
  confirmBeforeDelete,
  onGoToPomodoro,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const widgets = Array.isArray(goal.widgetLayout)
    ? goal.widgetLayout.filter((w) => WIDGET_TYPES.some((item) => item.type === w.type))
    : [];

  const saveWidgets = (next) => updateGoal(goal.id, { widgetLayout: next });
  const addWidget = (type) => {
    saveWidgets([...widgets, { id: widgetId(), type, size: "medium" }]);
    setPickerOpen(false);
  };
  const removeWidget = (id) => saveWidgets(widgets.filter((w) => w.id !== id));
  const moveWidget = (index, delta) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    saveWidgets(next);
  };
  const resizeWidget = (id) =>
    saveWidgets(
      widgets.map((w) => {
        if (w.id !== id) return w;
        const current = WIDGET_SIZES.includes(w.size) ? w.size : "medium";
        const size = WIDGET_SIZES[(WIDGET_SIZES.indexOf(current) + 1) % WIDGET_SIZES.length];
        return { ...w, size };
      })
    );

  const renderWidget = (widget) => {
    switch (widget.type) {
      case "habits":
        return (
          <HabitChecker
            goal={goal}
            addHabit={addHabit}
            checkInHabit={checkInHabit}
            removeHabit={removeHabit}
            confirmBeforeDelete={confirmBeforeDelete}
          />
        );
      case "tasks":
        return (
          <GoalTasks
            goal={goal}
            tasks={tasks}
            addTask={addTask}
            updateTask={updateTask}
            toggleTask={toggleTask}
            removeTask={removeTask}
            confirmBeforeDelete={confirmBeforeDelete}
          />
        );
      case "progress":
        return <GoalProgress goal={goal} tasks={tasks} />;
      case "countup":
        return <CountUp countUp={countUps && countUps[0]} />;
      case "reflections":
        return (
          <Reflections
            goal={goal}
            addReflection={addReflection}
            removeReflection={removeReflection}
            confirmBeforeDelete={confirmBeforeDelete}
          />
        );
      case "encouragement":
        return <EncouragingWidget goal={goal} tasks={tasks} />;
      case "pomodoro":
        return <PomodoroQuickStart onGoToPomodoro={onGoToPomodoro} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="row between" style={{ marginBottom: 10, gap: 12, alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Custom widgets</div>
          <h2 className="page-title" style={{ fontSize: 18 }}>
            Add what helps
          </h2>
        </div>
        <button className="btn primary" onClick={() => setPickerOpen(true)}>
          <Icon.Plus /> Add widget
        </button>
      </div>

      {widgets.length === 0 ? (
        <div className="card" style={{ color: "var(--ink-3)" }}>
          Add optional widgets here without changing the main layout above.
        </div>
      ) : (
        <div className="grid grid-12">
          {widgets.map((widget, index) => {
            const size = WIDGET_SIZES.includes(widget.size) ? widget.size : "medium";
            return (
              <div
                key={widget.id}
                className={WIDGET_COLS[size]}
                style={{ minWidth: 0 }}
              >
                <div
                  className="row between"
                  style={{
                    gap: 8,
                    marginBottom: 5,
                    padding: "0 4px",
                    color: "var(--ink-3)",
                  }}
                >
                  <span className="tag">
                    {(WIDGET_TYPES.find((item) => item.type === widget.type)?.title || "Widget")} · {size}
                  </span>
                  <span className="row" style={{ gap: 4, flex: "none" }}>
                    <button
                      className="btn ghost sm"
                      onClick={() => moveWidget(index, -1)}
                      disabled={index === 0}
                      style={{ opacity: index === 0 ? 0.45 : 1 }}
                    >
                      Up
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={() => moveWidget(index, 1)}
                      disabled={index === widgets.length - 1}
                      style={{ opacity: index === widgets.length - 1 ? 0.45 : 1 }}
                    >
                      Down
                    </button>
                    <button className="btn ghost sm" onClick={() => resizeWidget(widget.id)}>
                      Size
                    </button>
                    <ConfirmButton
                      className="btn ghost sm"
                      confirmLabel="Remove?"
                      title="Remove widget"
                      onConfirm={() => removeWidget(widget.id)}
                      requireConfirmation={confirmBeforeDelete}
                      style={{ color: "oklch(0.55 0.16 20)" }}
                      icon={<Icon.Trash width={13} height={13} />}
                    />
                  </span>
                </div>
                {renderWidget(widget)}
              </div>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <WidgetPicker
          existingTypes={widgets.map((w) => w.type)}
          onAdd={addWidget}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* GoalTab — the preset layout shown for any goal.
   The built-in "Productivity" goal uses the very same layout; it just
   can't be deleted or renamed. Composition (left = do/track, right =
   feel/reflect) keeps the most actionable things first for an ADHD flow. */

export default function GoalTab({
  goal,
  tasks,
  countUps,
  updateGoal,
  onArchiveGoal,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  addHabit,
  checkInHabit,
  removeHabit,
  addReflection,
  removeReflection,
  onSnoozeGoal,
  onReviseGoalDate,
  onGoToPomodoro,
  confirmBeforeDelete = true,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!goal) return null;
  const builtIn = goal.type === GOAL_TYPES.BUILT_IN;

  const startRename = () => {
    setDraft(goal.name);
    setEditing(true);
  };
  const saveRename = () => {
    const name = draft.trim();
    if (name && name !== goal.name) updateGoal(goal.id, { name });
    setEditing(false);
  };

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {builtIn ? "Built-in goal" : "Your goal"}
            {goal.deadline ? ` · due ${goal.deadline}` : ""}
          </div>

          {editing ? (
            <input
              ref={inputRef}
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={saveRename}
              style={{ fontSize: 22, fontWeight: 600, maxWidth: 360, marginTop: 2 }}
            />
          ) : (
            <h1 className="page-title row" style={{ gap: 8, alignItems: "center" }}>
              <span
                className="swatch"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: goal.color,
                  display: "inline-block",
                  flex: "none",
                }}
              />
              {goal.name}
              {!builtIn && (
                <span className="row" style={{ gap: 2 }}>
                  <button
                    className="iconbtn"
                    title="Rename goal"
                    onClick={startRename}
                    style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                  >
                    <Icon.Edit />
                  </button>
                  <button
                    className="iconbtn"
                    title="Archive goal"
                    onClick={() => onArchiveGoal(goal.id)}
                    style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                  >
                    <Icon.Trash />
                  </button>
                </span>
              )}
            </h1>
          )}

          <p className="page-sub">
            {builtIn
              ? "Forgiving habits, goal progress, and a place to reflect."
              : "Habits, progress, and reflection for this goal."}
          </p>
        </div>
      </div>

      <GoalWidgetGrid
        goal={goal}
        tasks={tasks}
        countUps={countUps}
        builtIn={builtIn}
        addTask={addTask}
        updateTask={updateTask}
        toggleTask={toggleTask}
        removeTask={removeTask}
        addHabit={addHabit}
        checkInHabit={checkInHabit}
        removeHabit={removeHabit}
        addReflection={addReflection}
        removeReflection={removeReflection}
        onSnoozeGoal={onSnoozeGoal}
        onReviseGoalDate={onReviseGoalDate}
        onArchiveGoal={onArchiveGoal}
        updateGoal={updateGoal}
        confirmBeforeDelete={confirmBeforeDelete}
        onGoToPomodoro={onGoToPomodoro}
      />
    </>
  );
}
