import { useState } from "react";
import { Icon } from "./Icons.jsx";
import ConfirmButton from "./ConfirmButton.jsx";
import { GOAL_TYPES } from "../lib/model.js";
import {
  GOAL_PROGRESS_MODES,
  createCountUpMetric,
  isCountUpGoal,
  readCountUpMetric,
} from "../lib/countUpGoal.js";
import {
  MILESTONE_TRIGGERS,
  archivedMilestones,
  goalTimeline,
  readMilestones,
} from "../lib/milestones.js";

/* Set up a goal's progress mode and its milestones.

   Opened from the timeline's Edit button, or from "Add milestones" on a goal
   that has none. Everything here is optional — a goal is perfectly allowed to
   have no timeline at all, which is why none of this lives in goal creation. */

const BLANK = {
  title: "",
  triggerType: MILESTONE_TRIGGERS.MANUAL,
  target: "",
  habitId: "",
  taskIds: [],
  targetDate: "",
  rewardTitle: "",
  rewardBudget: "",
};

/** Which triggers make sense for this goal, given what it actually has. */
function triggerOptions(goal, goalTasks) {
  const options = [{ value: MILESTONE_TRIGGERS.MANUAL, label: "I'll mark it myself" }];
  if (isCountUpGoal(goal)) {
    options.push({ value: MILESTONE_TRIGGERS.COUNT_UP_THRESHOLD, label: "Count reaches" });
  }
  if ((goal.habits || []).length) {
    options.push(
      { value: MILESTONE_TRIGGERS.HABIT_OCCURRENCE_TOTAL, label: "Habit done N times" },
      { value: MILESTONE_TRIGGERS.HABIT_COMPLETED_DAYS, label: "Habit full on N days" },
      { value: MILESTONE_TRIGGERS.HABIT_STREAK, label: "Habit streak reaches" }
    );
  }
  options.push({ value: MILESTONE_TRIGGERS.GOAL_TASK_COUNT, label: "N goal tasks done" });
  if (goalTasks.length) {
    options.push({ value: MILESTONE_TRIGGERS.SPECIFIC_TASKS, label: "Specific tasks done" });
  }
  if (goal.type === GOAL_TYPES.FITNESS) {
    options.push(
      { value: MILESTONE_TRIGGERS.WORKOUT_SESSIONS, label: "N workouts logged" },
      { value: MILESTONE_TRIGGERS.WORKOUT_VOLUME, label: "Weekly volume reaches" }
    );
  }
  return options;
}

const NEEDS_HABIT = new Set([
  MILESTONE_TRIGGERS.HABIT_OCCURRENCE_TOTAL,
  MILESTONE_TRIGGERS.HABIT_COMPLETED_DAYS,
  MILESTONE_TRIGGERS.HABIT_STREAK,
]);
const NEEDS_NUMBER = new Set([
  MILESTONE_TRIGGERS.COUNT_UP_THRESHOLD,
  MILESTONE_TRIGGERS.HABIT_OCCURRENCE_TOTAL,
  MILESTONE_TRIGGERS.HABIT_COMPLETED_DAYS,
  MILESTONE_TRIGGERS.HABIT_STREAK,
  MILESTONE_TRIGGERS.GOAL_TASK_COUNT,
  MILESTONE_TRIGGERS.WORKOUT_SESSIONS,
  MILESTONE_TRIGGERS.WORKOUT_VOLUME,
]);

export default function MilestoneEditor({
  goal,
  tasks = [],
  workouts = [],
  updateGoal,
  addMilestone,
  updateMilestone,
  archiveMilestone,
  restoreMilestone,
  removeMilestone,
  reorderMilestones,
  toggleMilestones,
  confirmBeforeDelete = true,
  onClose,
}) {
  const goalTasks = tasks.filter((task) => task.goalId === goal.id);
  const [form, setForm] = useState(BLANK);
  const [showArchived, setShowArchived] = useState(false);
  const metric = readCountUpMetric(goal);
  const countUp = isCountUpGoal(goal);
  const timeline = goalTimeline(goal, { tasks, workouts });
  const archived = archivedMilestones(goal, { tasks, workouts });
  const options = triggerOptions(goal, goalTasks);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    const title = form.title.trim();
    if (!title) return;
    const config = {};
    if (NEEDS_NUMBER.has(form.triggerType)) config.target = Number(form.target) || 0;
    if (NEEDS_HABIT.has(form.triggerType)) config.habitId = form.habitId || (goal.habits || [])[0]?.id;
    if (form.triggerType === MILESTONE_TRIGGERS.SPECIFIC_TASKS) config.taskIds = form.taskIds;

    addMilestone(goal.id, {
      title,
      trigger: { type: form.triggerType, config },
      targetDate: form.targetDate || null,
      reward: form.rewardTitle.trim()
        ? {
            title: form.rewardTitle.trim(),
            budget: form.rewardBudget === "" ? null : Number(form.rewardBudget),
          }
        : null,
    });
    setForm(BLANK);
  };

  const move = (id, delta) => {
    const ids = timeline.map((milestone) => milestone.id);
    const index = ids.indexOf(id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorderMilestones(goal.id, ids);
  };

  /* Switching a goal to count-up gives it a metric if it hasn't got one.
     Switching back leaves the metric and its history in place, so the toggle
     is reversible and nothing is thrown away. */
  const setMode = (mode) => {
    const patch = { progressMode: mode };
    if (mode === GOAL_PROGRESS_MODES.COUNT_UP && !goal.countUp) {
      patch.countUp = createCountUpMetric({ name: "Count", target: null });
      patch.countUpEvents = goal.countUpEvents || [];
    }
    updateGoal(goal.id, patch);
  };

  const patchMetric = (patch) =>
    updateGoal(goal.id, { countUp: { ...(goal.countUp || createCountUpMetric({})), ...patch } });

  return (
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal ms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ms-body">
          <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="eyebrow">{goal.name}</div>
              <h2 id="ms-title" className="page-title" style={{ fontSize: 20 }}>
                Progress &amp; milestones
              </h2>
            </div>
            <button className="iconbtn" title="Close" onClick={onClose}>
              <Icon.Close />
            </button>
          </div>

          {/* ---- progress mode ---- */}
          <div className="ms-section">
            <div className="eyebrow">How this goal measures progress</div>
            <div className="seg" style={{ marginTop: 6 }}>
              <button
                className={!countUp ? "active" : ""}
                onClick={() => setMode(GOAL_PROGRESS_MODES.STANDARD)}
              >
                Standard
              </button>
              <button
                className={countUp ? "active" : ""}
                onClick={() => setMode(GOAL_PROGRESS_MODES.COUNT_UP)}
              >
                Count-up
              </button>
            </div>

            {countUp && metric && (
              <div className="ms-grid" style={{ marginTop: 10 }}>
                <label>
                  <span>Name</span>
                  <input
                    className="input"
                    value={metric.name}
                    onChange={(e) => patchMetric({ name: e.target.value })}
                  />
                </label>
                <label>
                  <span>Unit</span>
                  <input
                    className="input"
                    value={metric.unit}
                    placeholder="optional"
                    onChange={(e) => patchMetric({ unit: e.target.value })}
                  />
                </label>
                <label>
                  <span>Target</span>
                  <input
                    className="input"
                    type="number"
                    value={metric.target ?? ""}
                    placeholder="none"
                    onChange={(e) =>
                      patchMetric({ target: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Step</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={metric.step}
                    onChange={(e) => patchMetric({ step: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
              </div>
            )}
          </div>

          {/* ---- milestones ---- */}
          <div className="ms-section">
            <div className="row between" style={{ alignItems: "center" }}>
              <div className="eyebrow">Milestones</div>
              {readMilestones(goal).length > 0 && (
                <label className="ms-toggle">
                  <input
                    type="checkbox"
                    checked={goal.milestonesEnabled !== false}
                    onChange={(e) => toggleMilestones(goal.id, e.target.checked)}
                  />
                  <span>Show timeline</span>
                </label>
              )}
            </div>

            {timeline.length === 0 && (
              <p className="ms-empty">No milestones yet.</p>
            )}

            <ol className="ms-list">
              {timeline.map((milestone, index) => (
                <li key={milestone.id}>
                  <span className="ms-list-order">{index + 1}</span>
                  <input
                    className="input ms-list-title"
                    value={milestone.title}
                    onChange={(e) =>
                      updateMilestone(goal.id, milestone.id, { title: e.target.value })
                    }
                  />
                  <input
                    className="input ms-list-date"
                    type="date"
                    value={milestone.targetDate || ""}
                    aria-label={`Target date for ${milestone.title}`}
                    onChange={(e) =>
                      updateMilestone(goal.id, milestone.id, { targetDate: e.target.value || null })
                    }
                  />
                  <span className="ms-list-kind">
                    {milestone.automatic ? "auto" : "manual"}
                  </span>
                  <span className="ms-list-actions">
                    <button
                      type="button"
                      className="iconbtn sm"
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => move(milestone.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="iconbtn sm"
                      title="Move down"
                      disabled={index === timeline.length - 1}
                      onClick={() => move(milestone.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="iconbtn sm"
                      title="Archive"
                      onClick={() => archiveMilestone(goal.id, milestone.id)}
                    >
                      <Icon.EyeOff width={12} height={12} />
                    </button>
                    {/* The only destructive control here, and the only one
                        that asks first — archiving is reversible, this isn't. */}
                    <ConfirmButton
                      className="iconbtn sm"
                      title="Delete permanently"
                      requireConfirmation={confirmBeforeDelete}
                      onConfirm={() => removeMilestone(goal.id, milestone.id)}
                      icon={<Icon.Trash width={12} height={12} />}
                    />
                  </span>
                </li>
              ))}
            </ol>

            {archived.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived((open) => !open)}
                >
                  Archived ({archived.length})
                </button>
                {showArchived && (
                  <ol className="ms-list ms-list--archived">
                    {archived.map((milestone) => (
                      <li key={milestone.id}>
                        <span className="ms-list-title-static">{milestone.title}</span>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => restoreMilestone(goal.id, milestone.id)}
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>

          {/* ---- add one ---- */}
          <div className="ms-section ms-add">
            <div className="eyebrow">Add a milestone</div>
            <input
              className="input"
              placeholder="What's the checkpoint?"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <div className="ms-grid">
              <label>
                <span>Completes when</span>
                <select
                  className="input"
                  value={form.triggerType}
                  onChange={(e) => set({ triggerType: e.target.value })}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {NEEDS_HABIT.has(form.triggerType) && (
                <label>
                  <span>Habit</span>
                  <select
                    className="input"
                    value={form.habitId}
                    onChange={(e) => set({ habitId: e.target.value })}
                  >
                    {(goal.habits || []).map((habit) => (
                      <option key={habit.id} value={habit.id}>
                        {habit.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {NEEDS_NUMBER.has(form.triggerType) && (
                <label>
                  <span>Value</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={form.target}
                    onChange={(e) => set({ target: e.target.value })}
                  />
                </label>
              )}

              <label>
                <span>Date (optional)</span>
                <input
                  className="input"
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => set({ targetDate: e.target.value })}
                />
              </label>
            </div>

            {form.triggerType === MILESTONE_TRIGGERS.SPECIFIC_TASKS && (
              <div className="ms-tasks">
                {goalTasks.map((task) => (
                  <label key={task.id}>
                    <input
                      type="checkbox"
                      checked={form.taskIds.includes(task.id)}
                      onChange={(e) =>
                        set({
                          taskIds: e.target.checked
                            ? [...form.taskIds, task.id]
                            : form.taskIds.filter((id) => id !== task.id),
                        })
                      }
                    />
                    <span>{task.text}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="ms-grid">
              <label>
                <span>Reward (optional)</span>
                <input
                  className="input"
                  placeholder="e.g. new shoes"
                  value={form.rewardTitle}
                  onChange={(e) => set({ rewardTitle: e.target.value })}
                />
              </label>
              <label>
                <span>Budget</span>
                <input
                  className="input"
                  type="number"
                  placeholder="optional"
                  value={form.rewardBudget}
                  onChange={(e) => set({ rewardBudget: e.target.value })}
                />
              </label>
            </div>

            <button
              type="button"
              className="btn primary"
              onClick={submit}
              disabled={!form.title.trim()}
            >
              <Icon.Plus /> Add milestone
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
