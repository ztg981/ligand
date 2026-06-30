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

/* GoalSidebar — DESKTOP-only (≥768px) goal navigation on the RIGHT side.
   Each goal shows its type icon, name, and health dot. Rows are
   drag-to-reorder. A privacy toggle (eye button) blurs the goal list
   without changing the sidebar's footprint — useful in public. */

function GoalRow({ goal, tasks, selected, onSelect, onArchive }) {
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
      <span className="gs-row-name">{goal.name}</span>
      <span
        className={"gs-health " + health.level}
        title={health.label}
        aria-label={health.label}
      />
      {goal.type !== "built-in" && onArchive && (
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
  // Privacy mode: blurs goal names without moving content or shrinking the
  // sidebar — the footprint stays constant so the rest of the page never shifts.
  const [hidden, setHidden] = useLocalStorage("ligand.goalSidebarHidden", false);

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
    <aside className="goal-sidebar" data-hidden={hidden ? "true" : "false"}>
      <div className="gs-head">
        <span className="gs-title">Goals</span>
        <button
          type="button"
          className="iconbtn sm gs-privacy"
          title={hidden ? "Show goals" : "Hide goals (privacy)"}
          aria-label={hidden ? "Show goal list" : "Hide goal list for privacy"}
          aria-pressed={hidden}
          onClick={() => setHidden((h) => !h)}
        >
          {hidden ? <Icon.EyeOff /> : <Icon.Eye />}
        </button>
      </div>

      {/* gs-body is what gets blurred in privacy mode */}
      <div className="gs-body">
        <div className="gs-scroll">
          {goals.length === 0 ? (
            <div className="gs-empty">No goals yet — add one below.</div>
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
          <span>New goal</span>
        </button>
      </div>
    </aside>
  );
}
