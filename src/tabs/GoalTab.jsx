import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GOAL_TYPES,
  TASK_TERMS,
  currentStreak,
  daysBetween,
  goalTargetDate,
  isGoalOverdue,
  todayKey,
} from "../lib/model.js";
import { fetchAiInsight } from "../lib/aiApi.js";
import HabitChecker from "../widgets/HabitChecker.jsx";
import GoalProgress from "../widgets/GoalProgress.jsx";
import Reflections from "../widgets/Reflections.jsx";
import CountUps from "../widgets/CountUps.jsx";
import UpcomingDeadlines from "../widgets/UpcomingDeadlines.jsx";
import HabitHeatmap from "../widgets/HabitHeatmap.jsx";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";
import { flashElement } from "../lib/scrollFlash.js";

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
        <button type="button" className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
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
  const [insight, setInsight] = useState(null);

  useEffect(() => {
    if (!goal?.id) return;
    let active = true;
    const context = {
      name: goal?.name,
      targetDate: target,
      activitySummary: `Past target date by ${daysBetween(target, todayKey())} days.`
    };
    fetchAiInsight(goal.id, "overdue-advice", context).then(res => {
      if (active) setInsight(res);
    }).catch(() => {});
    return () => { active = false; };
  }, [goal?.id, goal?.name, target]);

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
            {insight?.text || "Plans change. Want to clean this up? You can keep it, revise it, or let it go."}
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
            Target date: {target}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost sm" onClick={() => onSnoozeGoal?.(goal.id)}>
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
              type="button"
              className="btn ghost sm"
              onClick={() => draft && onReviseGoalDate?.(goal.id, draft)}
            >
              Revise target date
            </button>
            {canArchive && (
              <button
                type="button"
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

const LAYOUT_PRESETS = [
  {
    key: "default",
    label: "Default",
    order: [
      "overdueReview",
      "goalDetails",
      "habits",
      "progress",
      "goalTasks",
      "countUp",
      "reflections",
      "encouragement",
      "pomodoroQuickStart",
    ],
    sizes: {},
    hidden: {},
  },
  {
    key: "focus",
    label: "Focus",
    order: [
      "overdueReview",
      "goalTasks",
      "progress",
      "habits",
      "pomodoroQuickStart",
      "encouragement",
      "goalDetails",
      "countUp",
      "reflections",
    ],
    sizes: {
      goalTasks: "large",
      progress: "medium",
      habits: "medium",
      pomodoroQuickStart: "compact",
      encouragement: "compact",
      goalDetails: "compact",
    },
    hidden: { countUp: true, reflections: true },
  },
  {
    key: "journal",
    label: "Journal",
    order: [
      "overdueReview",
      "goalDetails",
      "reflections",
      "countUp",
      "encouragement",
      "habits",
      "progress",
      "goalTasks",
      "pomodoroQuickStart",
    ],
    sizes: {
      goalDetails: "wide",
      reflections: "large",
      countUp: "medium",
      encouragement: "medium",
      habits: "medium",
      progress: "compact",
      goalTasks: "medium",
    },
    hidden: { pomodoroQuickStart: true },
  },
  {
    key: "minimal",
    label: "Minimal",
    order: [
      "overdueReview",
      "goalDetails",
      "progress",
      "goalTasks",
      "habits",
      "countUp",
      "reflections",
      "encouragement",
      "pomodoroQuickStart",
    ],
    sizes: {
      goalDetails: "compact",
      progress: "compact",
      goalTasks: "medium",
    },
    hidden: {
      habits: true,
      countUp: true,
      reflections: true,
      encouragement: true,
      pomodoroQuickStart: true,
    },
  },
  {
    key: "dashboard",
    label: "Dashboard",
    order: [
      "overdueReview",
      "goalDetails",
      "progress",
      "countUp",
      "habits",
      "goalTasks",
      "reflections",
      "encouragement",
      "pomodoroQuickStart",
    ],
    sizes: {
      overdueReview: "large",
      goalDetails: "wide",
      progress: "medium",
      countUp: "compact",
      habits: "medium",
      goalTasks: "wide",
      reflections: "medium",
      encouragement: "medium",
      pomodoroQuickStart: "medium",
    },
    hidden: {},
  },
];

const WIDGET_REGISTRY = {
  overdueReview: {
    type: "overdueReview",
    title: "Goals to review",
    sub: "Keep, revise, or archive an overdue goal.",
    icon: <Icon.Heart />,
    defaultSize: "wide",
    allowedSizes: WIDGET_SIZE_VARIANTS,
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
    allowedSizes: WIDGET_SIZE_VARIANTS,
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
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: true,
    locked: true,
    render: ({ goal, addHabit, checkInHabit, updateHabit, removeHabit, confirmBeforeDelete, showStreaks }) => (
      <HabitChecker
        goal={goal}
        addHabit={addHabit}
        checkInHabit={checkInHabit}
        updateHabit={updateHabit}
        removeHabit={removeHabit}
        confirmBeforeDelete={confirmBeforeDelete}
        showStreaks={showStreaks}
      />
    ),
  },
  goalTasks: {
    type: "goalTasks",
    title: "Goal tasks",
    sub: "Add and manage goal-linked tasks.",
    icon: <Icon.Pin />,
    defaultSize: "wide",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: true,
    locked: true,
    render: ({ goal, tasks, addTask, updateTask, toggleTask, removeTask, confirmBeforeDelete, widgetSize, onGoToTasks }) => (
      <GoalTasks
        goal={goal}
        tasks={tasks}
        addTask={addTask}
        updateTask={updateTask}
        toggleTask={toggleTask}
        removeTask={removeTask}
        confirmBeforeDelete={confirmBeforeDelete}
        widgetSize={widgetSize}
        onGoToTasks={onGoToTasks}
      />
    ),
  },
  progress: {
    type: "progress",
    title: "Progress tracker",
    sub: "See task progress and weekly check-ins.",
    icon: <Icon.Target />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: true,
    locked: true,
    render: ({ goal, tasks, widgetSize, weekStartsMonday, focusLog }) => (
      <GoalProgress goal={goal} tasks={tasks} widgetSize={widgetSize} weekStartsMonday={weekStartsMonday} focusLog={focusLog} />
    ),
  },
  countUp: {
    type: "countUp",
    title: "What I'm proud of",
    sub: "Gentle count-up trackers you can add, rename, and reset.",
    icon: <Icon.Flame />,
    defaultSize: "compact",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: true,
    locked: true,
    render: ({ countUps, addCountUp, updateCountUp, removeCountUp, confirmBeforeDelete }) => (
      <CountUps
        countUps={countUps}
        addCountUp={addCountUp}
        updateCountUp={updateCountUp}
        removeCountUp={removeCountUp}
        confirmBeforeDelete={confirmBeforeDelete}
      />
    ),
  },
  reflections: {
    type: "reflections",
    title: "Journal/reflection",
    sub: "Save notes and gentle reflections.",
    icon: <Icon.Book />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: true,
    locked: true,
    render: ({ goal, tasks, addReflection, removeReflection, updateGoal, confirmBeforeDelete, widgetSize }) => (
      <Reflections
        goal={goal}
        tasks={tasks}
        addReflection={addReflection}
        removeReflection={removeReflection}
        updateGoal={updateGoal}
        confirmBeforeDelete={confirmBeforeDelete}
        widgetSize={widgetSize}
      />
    ),
  },
  encouragement: {
    type: "encouragement",
    title: "Encouraging message",
    sub: "A small supportive nudge.",
    icon: <Icon.Spark />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
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
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: true,
    locked: false,
    render: ({ onGoToPomodoro }) => <PomodoroQuickStart onGoToPomodoro={onGoToPomodoro} />,
  },
  nextTinyStep: {
    type: "nextTinyStep",
    title: "Next tiny step",
    sub: "Shows one small unfinished task.",
    icon: <Icon.Arrow />,
    defaultSize: "compact",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goal, tasks, toggleTask, widgetSize }) => (
      <NextTinyStepWidget goal={goal} tasks={tasks} toggleTask={toggleTask} widgetSize={widgetSize} />
    ),
  },
  deadlineTimeline: {
    type: "deadlineTimeline",
    title: "Goal deadline",
    sub: "A calm look at the target date.",
    icon: <Icon.Calendar />,
    defaultSize: "compact",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goal, widgetSize }) => <DeadlineTimelineWidget goal={goal} widgetSize={widgetSize} />,
  },
  upcomingDeadlines: {
    type: "upcomingDeadlines",
    title: "Upcoming dates",
    sub: "Target dates across all your goals, soonest first.",
    icon: <Icon.Calendar />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goals, onOpenGoal, widgetSize }) => (
      <UpcomingDeadlines goals={goals} onOpenGoal={onOpenGoal} widgetSize={widgetSize} />
    ),
  },
  habitStreakSummary: {
    type: "habitStreakSummary",
    title: "Habit streak summary",
    sub: "Shows current habit streaks without shame.",
    icon: <Icon.Flame />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goal, widgetSize }) => <HabitStreakSummaryWidget goal={goal} widgetSize={widgetSize} />,
  },
  habitHeatmap: {
    type: "habitHeatmap",
    title: "Habit heatmap",
    sub: "A calm 12-week grid of each habit's check-ins.",
    icon: <Icon.Flame />,
    defaultSize: "wide",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goal, widgetSize }) => <HabitHeatmap goal={goal} widgetSize={widgetSize} />,
  },
  recentWins: {
    type: "recentWins",
    title: "Recent wins",
    sub: "Completed tasks and reflections for this goal.",
    icon: <Icon.Trophy />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goal, tasks, widgetSize }) => (
      <RecentWinsWidget goal={goal} tasks={tasks} widgetSize={widgetSize} />
    ),
  },
  aiSummaryPlaceholder: {
    type: "aiSummaryPlaceholder",
    title: "At a glance",
    sub: "A quick, plain-language read on where this goal stands.",
    icon: <Icon.Target />,
    defaultSize: "medium",
    allowedSizes: WIDGET_SIZE_VARIANTS,
    preset: false,
    locked: false,
    render: ({ goal, tasks }) => <GoalSummaryWidget goal={goal} tasks={tasks} />,
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
  return widgets.map((widget, index) => ({ ...widget, order: (index + 1) * 10 }));
}

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
  widgetSize = "medium",
  onGoToTasks,
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
    const limit =
      widgetSize === "compact"
        ? 2
        : widgetSize === "medium"
        ? 3
        : widgetSize === "wide"
        ? 5
        : scoped.length;
    const visible = scoped.slice(0, limit);
    const hiddenCount = Math.max(0, scoped.length - visible.length);
    if (scoped.length === 0) {
      return (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          Nothing here yet.
        </div>
      );
    }

    return (
      <div className="stack" style={{ gap: 6 }}>
        {visible.map((task) => (
          <div key={task.id} className={"taskrow" + (task.done ? " done" : "")}>
            <button
              type="button"
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
              type="button"
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
        {hiddenCount > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--ink-4)", paddingLeft: 2 }}>
            {hiddenCount} more task{hiddenCount === 1 ? "" : "s"} visible in a larger size.
          </div>
        )}
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
            type="button"
            className={term === TASK_TERMS.SHORT ? "active" : ""}
            onClick={() => setTerm(TASK_TERMS.SHORT)}
          >
            Short
          </button>
          <button
            type="button"
            className={term === TASK_TERMS.LONG ? "active" : ""}
            onClick={() => setTerm(TASK_TERMS.LONG)}
          >
            Long
          </button>
        </div>
        <button type="button" className="btn primary" onClick={submit} style={{ flex: "none" }}>
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

      {onGoToTasks && (
        <div
          className="row"
          style={{ justifyContent: "flex-end", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line)" }}
        >
          <button type="button" className="btn ghost sm" onClick={onGoToTasks}>
            See all in Tasks tab <Icon.Arrow width={13} height={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function WidgetPicker({ widgets = [], onAdd, onRestore, onClose }) {
  const hiddenWidgets = widgets.filter((widget) => widget.hidden && WIDGET_REGISTRY[widget.type]);
  const pickerGroups = [
    {
      title: "Core widgets",
      types: [
        "habits",
        "goalTasks",
        "progress",
        "countUp",
        "reflections",
        "encouragement",
        "pomodoroQuickStart",
      ],
    },
    {
      title: "Helpful extras",
      types: [
        "nextTinyStep",
        "deadlineTimeline",
        "upcomingDeadlines",
        "habitStreakSummary",
        "habitHeatmap",
        "recentWins",
        "aiSummaryPlaceholder",
      ],
    },
  ];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="scrim widget-picker-scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal widget-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-picker-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="widget-picker-head">
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
            <button type="button" className="iconbtn" title="Close" onClick={onClose}>
              <Icon.Close />
            </button>
          </div>
        </div>

        <div className="widget-picker-body">
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
                      type="button"
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

          {pickerGroups.map((group) => (
            <div key={group.title}>
              <div className="tag" style={{ marginTop: 16, marginBottom: 8 }}>
                {group.title}
              </div>
              <div className="grid grid-12">
                {group.types.map((type) => {
                  const item = WIDGET_REGISTRY[type];
                  const visibleWidget = widgets.find((widget) => widget.type === type && !widget.hidden);
                  const hiddenWidget = widgets.find((widget) => widget.type === type && widget.hidden);
                  const disabled = Boolean(visibleWidget);
                  return (
                    <button
                      type="button"
                      key={type}
                      className="widget-picker-card card hover col-6"
                      onClick={() => (hiddenWidget ? onRestore(hiddenWidget.id) : !disabled && onAdd(type))}
                      disabled={disabled}
                      style={{
                        textAlign: "left",
                        cursor: disabled ? "default" : "pointer",
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      <div className="card-title">
                        {item.icon} {item.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.45 }}>
                        {disabled
                          ? "Already visible in this layout."
                          : hiddenWidget
                          ? "Hidden right now. Click to restore it."
                          : item.sub}
                      </div>
                      <div className="chip" style={{ marginTop: 10 }}>
                        {WIDGET_SIZE_LABELS[item.defaultSize] || item.defaultSize}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
      <button type="button" className="btn primary" onClick={onGoToPomodoro}>
        <Icon.Play /> Open timer
      </button>
    </div>
  );
}

function NextTinyStepWidget({ goal, tasks, toggleTask, widgetSize }) {
  const nextTask = tasks
    .filter((task) => task.goalId === goal.id && !task.done)
    .sort((a, b) => taskTerm(a).localeCompare(taskTerm(b)) || a.id.localeCompare(b.id))[0];

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Arrow /> Next tiny step
        </div>
      </div>
      {nextTask ? (
        <>
          <div style={{ fontSize: widgetSize === "compact" ? 13 : 15, color: "var(--ink)", lineHeight: 1.45 }}>
            {nextTask.text}
          </div>
          {widgetSize !== "compact" && (
            <div style={{ marginTop: 8 }}>
              <TermChip term={taskTerm(nextTask)} />
            </div>
          )}
          <button type="button" className="btn primary" onClick={() => toggleTask(nextTask.id)} style={{ marginTop: 12 }}>
            <Icon.Check /> Done
          </button>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.45 }}>
          Nothing urgent here. Add a tiny task when you know the next move.
        </div>
      )}
    </div>
  );
}

function DeadlineTimelineWidget({ goal, widgetSize }) {
  const target = goalTargetDate(goal);
  const today = todayKey();
  const delta = target ? daysBetween(today, target) : null;
  const label = !target
    ? "No target date"
    : delta < 0
    ? "Ready to review"
    : delta === 0
    ? "Today"
    : `${delta} day${delta === 1 ? "" : "s"} left`;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Calendar /> Goal deadline
        </div>
      </div>
      <div className="mono" style={{ fontSize: widgetSize === "compact" ? 20 : 28, color: "var(--ink)" }}>
        {label}
      </div>
      {widgetSize !== "compact" && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.45, marginTop: 6 }}>
          {target
            ? `Target date: ${target}. Plans can move; this is here to help you choose, not to judge.`
            : "SMART goals can have an optional target date. Older goals are fine without one."}
        </div>
      )}
    </div>
  );
}

function HabitStreakSummaryWidget({ goal, widgetSize }) {
  const habits = goal.habits || [];
  const streaks = habits.map((habit) => ({ habit, streak: currentStreak(habit) }));
  const best = streaks.reduce((max, item) => Math.max(max, item.streak), 0);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Flame /> Habit streaks
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {habits.length || ""}
        </span>
      </div>
      <div className="counter" style={{ fontSize: widgetSize === "compact" ? 30 : undefined }}>
        {best}
        <span className="unit">best streak</span>
      </div>
      {widgetSize !== "compact" && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          {streaks.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              Add a habit when you're ready. Gaps do not count as failure.
            </div>
          ) : (
            streaks.slice(0, 4).map(({ habit, streak }) => (
              <div key={habit.id} className="row between">
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{habit.name}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {streak}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RecentWinsWidget({ goal, tasks, widgetSize }) {
  const doneTasks = tasks
    .filter((task) => task.goalId === goal.id && task.done)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const reflections = goal.reflections || [];
  const winCount = doneTasks.length + reflections.length;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Trophy /> Recent wins
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {winCount || ""}
        </span>
      </div>
      {winCount === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.45 }}>
          Wins will show up here as you finish tasks or leave reflections.
        </div>
      ) : widgetSize === "compact" ? (
        <div className="counter" style={{ fontSize: 30 }}>
          {winCount}
          <span className="unit">wins</span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 7 }}>
          {doneTasks.slice(0, 3).map((task) => (
            <div key={task.id} className="row" style={{ gap: 7, color: "var(--ink-2)" }}>
              <Icon.Check width={12} height={12} />
              <span style={{ fontSize: 12.5 }}>{task.text}</span>
            </div>
          ))}
          {reflections.length > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {reflections.length} reflection{reflections.length === 1 ? "" : "s"} saved for this goal.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalSummaryWidget({ goal, tasks }) {
  const goalTasks = tasks.filter((task) => task.goalId === goal.id);
  const done = goalTasks.filter((task) => task.done).length;
  const habits = goal.habits || [];
  const bestStreak = habits.reduce((m, h) => Math.max(m, currentStreak(h)), 0);
  const target = goalTargetDate(goal);
  const daysActive = goal.createdAt ? daysBetween(goal.createdAt, todayKey()) : 0;

  const lines = [];
  lines.push(
    goalTasks.length
      ? `${done} of ${goalTasks.length} linked task${goalTasks.length === 1 ? "" : "s"} complete`
      : "No linked tasks yet — add one below to get rolling."
  );
  if (habits.length) {
    lines.push(
      `${habits.length} habit${habits.length === 1 ? "" : "s"} in motion` +
        (bestStreak > 0 ? `, best streak ${bestStreak} day${bestStreak === 1 ? "" : "s"}` : "")
    );
  }
  if (target) lines.push(`Target date ${target}`);
  if (daysActive > 0) lines.push(`This goal has been in view for ${daysActive} day${daysActive === 1 ? "" : "s"}`);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Target /> At a glance
        </div>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7 }}>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
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
  dragHandleProps,
  setActivatorNodeRef,
  confirmBeforeDelete,
}) {
  const registry = WIDGET_REGISTRY[widget.type];
  const allowedSizes = registry?.allowedSizes || WIDGET_SIZE_VARIANTS;
  const removable = widget.source === "user" && !widget.locked;
  const size = normalizeWidgetSize(widget.size, widget.type);

  return (
    <div className="goal-widget-editbar">
      <span
        ref={setActivatorNodeRef}
        className="goal-widget-grip"
        title="Drag to reorder"
        aria-label="Drag to reorder widget"
        {...(dragHandleProps || {})}
      >
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
            type="button"
            className="btn ghost sm"
            onClick={() => onMove(widget.id, -1)}
            disabled={index === 0}
            style={{ opacity: index === 0 ? 0.45 : 1 }}
          >
            Up
          </button>
          <button
            type="button"
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
            type="button"
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
        <button type="button" className="btn ghost sm" onClick={() => onHide(widget.id)}>
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
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !editing });

  const registry = WIDGET_REGISTRY[widget.type];
  if (!registry) return null;
  const size = normalizeWidgetSize(widget.size, widget.type);
  const content = registry.render({ ...context, widget, widgetSize: size });

  return (
    <div
      ref={setNodeRef}
      className={[
        "goal-widget-shell",
        `goal-widget-size-${size}`,
        editing && "is-editing",
        isDragging && "is-dragging",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        minWidth: 0,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
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
          dragHandleProps={{ ...attributes, ...listeners }}
          setActivatorNodeRef={setActivatorNodeRef}
          confirmBeforeDelete={context.confirmBeforeDelete}
        />
      )}
      {content}
    </div>
  );
}

/* The card that floats under the cursor while dragging. dnd-kit's
   DragOverlay measures the source node and sizes this to match, so it
   lines up exactly — we just add the lift (scale + shadow). */
function WidgetOverlayCard({ widget, context }) {
  const registry = widget ? WIDGET_REGISTRY[widget.type] : null;
  if (!registry) return null;
  const size = normalizeWidgetSize(widget.size, widget.type);
  const content = registry.render({ ...context, widget, widgetSize: size });
  return (
    <div
      className={["goal-widget-shell", `goal-widget-size-${size}`, "goal-widget-overlay"].join(" ")}
      style={{ minWidth: 0 }}
    >
      {content}
    </div>
  );
}

function GoalWidgetGrid({
  goal,
  goals = [],
  onOpenGoal,
  focusLog = [],
  tasks,
  countUps,
  addCountUp,
  updateCountUp,
  removeCountUp,
  builtIn,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  addHabit,
  checkInHabit,
  updateHabit,
  removeHabit,
  addReflection,
  removeReflection,
  onSnoozeGoal,
  onReviseGoalDate,
  onArchiveGoal,
  onGoToPomodoro,
  onGoToTasks,
  updateGoal,
  confirmBeforeDelete,
  showStreaks = true,
  weekStartsMonday = false,
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);
  const layout = useMemo(() => resolveWidgetLayoutV2(goal), [goal]);

  // Pointer drag needs a little movement before it kicks in, so taps on the
  // grip's neighbouring buttons still register as clicks. Keyboard sensor
  // lets the grip be focused and reordered with arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
  const resetLayout = () => saveWidgets(defaultWidgetLayout());
  const restoreDefaultWidgets = () => {
    const presetIds = new Set(PRESET_WIDGETS.map((widget) => widget.id));
    saveWidgets(
      layout.widgets.map((widget) =>
        presetIds.has(widget.id) || widget.source === "preset" ? { ...widget, hidden: false } : widget
      )
    );
  };
  const applyLayoutPreset = (presetKey) => {
    const preset = LAYOUT_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;

    const userWidgets = layout.widgets.filter((widget) => widget.source === "user");
    const defaultWidgets = defaultWidgetLayout();
    const orderedPresetWidgets = preset.order
      .map((type, index) => {
        const existing =
          layout.widgets.find((widget) => widget.type === type && widget.source !== "user") ||
          defaultWidgets.find((widget) => widget.type === type);
        if (!existing) return null;
        return {
          ...existing,
          size: normalizeWidgetSize(preset.sizes[type] || existing.size, type),
          hidden: Boolean(preset.hidden[type]),
          order: (index + 1) * 10,
        };
      })
      .filter(Boolean);
    const presetIds = new Set(orderedPresetWidgets.map((widget) => widget.id));
    const remainingPresetWidgets = layout.widgets
      .filter((widget) => widget.source !== "user" && !presetIds.has(widget.id))
      .map((widget) => ({ ...widget, hidden: Boolean(preset.hidden[widget.type]) }));

    saveWidgets([...orderedPresetWidgets, ...remainingPresetWidgets, ...userWidgets]);
  };

  const context = {
    goal,
    goals,
    onOpenGoal,
    focusLog,
    tasks,
    countUps,
    addCountUp,
    updateCountUp,
    removeCountUp,
    builtIn,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    addHabit,
    checkInHabit,
    updateHabit,
    removeHabit,
    addReflection,
    removeReflection,
    onSnoozeGoal,
    onReviseGoalDate,
    onArchiveGoal,
    onGoToPomodoro,
    onGoToTasks,
    updateGoal,
    confirmBeforeDelete,
    showStreaks,
    weekStartsMonday,
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
  const handleDragStart = (event) => {
    setActiveDragId(event.active.id);
  };
  const handleDragCancel = () => setActiveDragId(null);
  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    // Reorder the full (normalized) list by the dragged & target ids. Both are
    // visible widgets; hidden widgets keep their relative spots via arrayMove.
    const ordered = normalizeWidgetOrders(layout.widgets);
    const oldIndex = ordered.findIndex((widget) => widget.id === active.id);
    const newIndex = ordered.findIndex((widget) => widget.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    saveWidgets(arrayMove(ordered, oldIndex, newIndex));
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
          <button type="button" className="btn" onClick={() => setPickerOpen(true)}>
            <Icon.Plus /> Add widget
          </button>
          <button
            type="button"
            className={editing ? "btn primary" : "btn"}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? <Icon.Check /> : <Icon.More />} {editing ? "Done" : "Edit layout"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="goal-layout-tools">
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <ConfirmButton
              className="btn ghost sm"
              confirmLabel="Reset?"
              title="Reset this goal layout"
              onConfirm={resetLayout}
              requireConfirmation={confirmBeforeDelete}
              icon={
                <>
                  <Icon.Reset width={13} height={13} /> Reset default
                </>
              }
            />
            <button type="button" className="btn ghost sm" onClick={restoreDefaultWidgets}>
              <Icon.Plus /> Restore defaults
            </button>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="tag">Preset</span>
            {LAYOUT_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.key}
                className="btn ghost sm"
                onClick={() => applyLayoutPreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={visibleWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
          <div
            className={[
              "goal-widget-grid",
              editing && "is-editing",
              activeDragId && "is-reordering",
            ]
              .filter(Boolean)
              .join(" ")}
          >
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
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeDragId ? (
            <WidgetOverlayCard
              widget={layout.widgets.find((widget) => widget.id === activeDragId)}
              context={context}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing && hiddenWidgets.length > 0 && (
        <div className="goal-hidden-widgets">
          <span className="tag">Hidden widgets</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {hiddenWidgets.map((widget) => {
              const item = WIDGET_REGISTRY[widget.type];
              return (
                <button type="button" key={widget.id} className="btn ghost sm" onClick={() => restoreWidget(widget.id)}>
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

/* GoalTab — the preset layout shown for any goal.
   The built-in "Productivity" goal uses the very same layout; it just
   can't be deleted or renamed. Composition (left = do/track, right =
   feel/reflect) keeps the most actionable things first for an ADHD flow. */

export default function GoalTab({
  goal,
  goals = [],
  onOpenGoal,
  focusLog = [],
  tasks,
  countUps,
  addCountUp,
  updateCountUp,
  removeCountUp,
  updateGoal,
  onArchiveGoal,
  addTask,
  updateTask,
  toggleTask,
  removeTask,
  addHabit,
  checkInHabit,
  updateHabit,
  removeHabit,
  addReflection,
  removeReflection,
  onSnoozeGoal,
  onReviseGoalDate,
  onGoToPomodoro,
  onGoToTasks,
  confirmBeforeDelete = true,
  showStreaks = true,
  weekStartsMonday = false,
  scrollTo = null,
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

  // A count-up search result lands here; scroll to and flash that tracker row
  // (rendered by the "What I'm proud of" widget).
  useEffect(() => {
    if (!scrollTo?.id) return;
    flashElement("countup-" + scrollTo.id);
  }, [scrollTo?.nonce, scrollTo?.id]);

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
                    type="button"
                    className="iconbtn"
                    title="Rename goal"
                    onClick={startRename}
                    style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                  >
                    <Icon.Edit />
                  </button>
                  <button
                    type="button"
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
        goals={goals}
        onOpenGoal={onOpenGoal}
        focusLog={focusLog}
        tasks={tasks}
        countUps={countUps}
        addCountUp={addCountUp}
        updateCountUp={updateCountUp}
        removeCountUp={removeCountUp}
        builtIn={builtIn}
        addTask={addTask}
        updateTask={updateTask}
        toggleTask={toggleTask}
        removeTask={removeTask}
        addHabit={addHabit}
        checkInHabit={checkInHabit}
        updateHabit={updateHabit}
        removeHabit={removeHabit}
        addReflection={addReflection}
        removeReflection={removeReflection}
        onSnoozeGoal={onSnoozeGoal}
        onReviseGoalDate={onReviseGoalDate}
        onArchiveGoal={onArchiveGoal}
        updateGoal={updateGoal}
        confirmBeforeDelete={confirmBeforeDelete}
        onGoToPomodoro={onGoToPomodoro}
        onGoToTasks={onGoToTasks}
        showStreaks={showStreaks}
        weekStartsMonday={weekStartsMonday}
      />
    </>
  );
}
