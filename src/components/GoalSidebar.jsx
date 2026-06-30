import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { Icon } from "./Icons.jsx";
import { goalHealth } from "../lib/goalHealth.js";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* GoalSidebar — the DESKTOP-only (≥768px) primary goal navigation.
   A calm vertical list on the left: each goal shows its type icon (leaf for
   recovery, a color dot otherwise), its name, and a small health dot. The
   whole row is drag-to-reorder (vertical dragging via dnd-kit is far more
   reliable than the old horizontal pills). Collapsible to an icons-only rail.
   Hidden on mobile via CSS — phones get the top dropdown (Section 3). */

function GoalRow({ goal, tasks, selected, collapsed, onSelect, onArchive }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const isRecovery = goal.type === "recovery";
  const health = goalHealth(goal, tasks);

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={"gs-row" + (selected ? " selected" : "")}
      onClick={() => onSelect(goal.id)}
      title={goal.name}
    >
      <span className="gs-row-icon" aria-hidden="true">
        {isRecovery ? (
          <span className="gs-leaf">
            <Icon.Leaf />
          </span>
        ) : (
          <span className="gs-dot" style={{ background: goal.color }} />
        )}
      </span>
      {!collapsed && <span className="gs-row-name">{goal.name}</span>}
      <span
        className={"gs-health " + health.level}
        title={health.label}
        aria-label={health.label}
      />
      {!collapsed && goal.type !== "built-in" && onArchive && (
        <span
          className="gs-row-x"
          role="button"
          tabIndex={0}
          title={`Archive ${goal.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onArchive(goal.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onArchive(goal.id);
            }
          }}
        >
          <Icon.Close />
        </span>
      )}
    </button>
  );
}

export default function GoalSidebar({
  goals = [],
  tasks = [],
  selectedId = null,
  onSelect,
  onAddGoal,
  onArchiveGoal,
  setGoalOrder,
}) {
  const [collapsed, setCollapsed] = useLocalStorage(
    "ligand.goalSidebarCollapsed",
    false
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const ids = goals.map((g) => g.id);
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      setGoalOrder?.(arrayMove(ids, oldIndex, newIndex));
    }
  };

  return (
    <aside className="goal-sidebar" data-collapsed={collapsed ? "true" : "false"}>
      <div className="gs-head">
        {!collapsed && <span className="gs-title">Goals</span>}
        <button
          type="button"
          className="iconbtn sm gs-collapse"
          title={collapsed ? "Expand goals" : "Collapse goals"}
          aria-label={collapsed ? "Expand goal sidebar" : "Collapse goal sidebar"}
          aria-pressed={collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {/* Arrow points right; flip it when expanded to mean "collapse ‹". */}
          <span
            className="gs-collapse-ic"
            style={{
              display: "inline-flex",
              transform: collapsed ? "none" : "rotate(180deg)",
              transition: "transform 0.2s var(--ease)",
            }}
          >
            <Icon.Arrow />
          </span>
        </button>
      </div>

      <div className="gs-scroll">
        {goals.length === 0 ? (
          !collapsed && (
            <div className="gs-empty">No goals yet — add one below.</div>
          )
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={goals.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {goals.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  tasks={tasks}
                  selected={selectedId === g.id}
                  collapsed={collapsed}
                  onSelect={onSelect}
                  onArchive={onArchiveGoal}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <button
        type="button"
        className="gs-add"
        onClick={onAddGoal}
        title="New goal"
      >
        <Icon.Plus />
        {!collapsed && <span>New goal</span>}
      </button>
    </aside>
  );
}
