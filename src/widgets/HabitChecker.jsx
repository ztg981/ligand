import { useMemo, useRef, useState } from "react";
import {
  todayKey,
  shiftDay,
  currentStreak,
  MAX_HABIT_DAILY_TARGET,
  MIN_HABIT_DAILY_TARGET,
} from "../lib/model.js";
import { habitDailyTarget, readHabitDay } from "../lib/habitProgress.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

/* HabitChecker - a FORGIVING habit tracker.
   - Shows the last 7 days as toggleable cells.
   - We only ever store completed days; an empty cell is just "no data",
     never a recorded miss, so a gap can't shame you.
   - Streaks PAUSE rather than shatter (see currentStreak in model.js).

   A habit can need doing more than once a day ("brush teeth", target 3). Each
   tap adds one occurrence and the cell fills by that fraction, so 1/3 reads
   as visibly different from 3/3 and only a finished day gets the completed
   styling. The fraction is carried as a CSS variable and ALSO printed as a
   number, so partial progress is never conveyed by colour alone. */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function last7() {
  const today = todayKey();
  // oldest -> newest, ending today
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, -(6 - i)));
}

export default function HabitChecker({
  goal,
  addHabit,
  checkInHabit,
  updateHabit,
  removeHabit,
  confirmBeforeDelete = true,
  showStreaks = true,
}) {
  const [name, setName] = useState("");
  const [newTarget, setNewTarget] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editTarget, setEditTarget] = useState(1);
  // Set true by Escape so the unmount-triggered onBlur skips the save.
  const cancelEditRef = useRef(false);
  // Ref attached to the container <span> wrapping both edit inputs so that
  // onBlur can check whether focus is moving to a sibling within the editor
  // (e.g. the +/- spinner) rather than leaving it entirely.
  const editContainerRef = useRef(null);
  const days = useMemo(() => last7(), []);
  const today = todayKey();
  const habits = goal.habits || [];

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    addHabit(goal.id, { name: n, dailyTarget: newTarget });
    setName("");
    setNewTarget(1);
  };

  const startEdit = (habit) => {
    setEditingId(habit.id);
    setEditText(habit.name);
    setEditTarget(habitDailyTarget(habit));
  };

  const commitEdit = () => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setEditingId(null);
      setEditText("");
      return;
    }
    if (editingId) {
      const t = editText.trim();
      // Only the target for FUTURE days changes; each recorded day keeps the
      // target it was kept under, so history is not rewritten.
      if (t) updateHabit?.(goal.id, editingId, { name: t, dailyTarget: editTarget });
    }
    setEditingId(null);
    setEditText("");
  };

  // Guard called from onBlur of either edit input. Commits the edit only when
  // focus is genuinely leaving the inline editor. The key check is
  // e.relatedTarget: the element that will receive focus next. If it lives
  // inside the editor container (e.g. the user clicked the +/- spinner on the
  // target number input, or tabbed between the two fields), focus is just
  // moving between siblings — don't commit yet and don't close the editor.
  const handleEditBlur = (e) => {
    const container = editContainerRef.current;
    if (container && container.contains(e.relatedTarget)) return;
    commitEdit();
  };

  const clampTarget = (value) =>
    Math.min(MAX_HABIT_DAILY_TARGET, Math.max(MIN_HABIT_DAILY_TARGET, Number(value) || 1));

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Check /> Habits
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {habits.length || ""}
        </span>
      </div>

      {/* Add a habit */}
      <div className="row" style={{ gap: 8, marginBottom: habits.length ? 12 : 4 }}>
        <input
          className="input"
          placeholder="Add a gentle habit…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ flex: 1 }}
        />
        <label className="habit-target-field" title="Times per day">
          <span className="sr-only">Times per day</span>
          <input
            className="input habit-target-input"
            type="number"
            min={MIN_HABIT_DAILY_TARGET}
            max={MAX_HABIT_DAILY_TARGET}
            value={newTarget}
            onChange={(e) => setNewTarget(clampTarget(e.target.value))}
          />
          <span aria-hidden="true">/day</span>
        </label>
        <button type="button" className="btn primary" onClick={submit} style={{ flex: "none" }}>
          <Icon.Plus /> Add
        </button>
      </div>

      {habits.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No habits yet. Add one small thing you'd like to return to. Missing a
          day never breaks anything here.
        </div>
      ) : (
        <>
          {/* Day-of-week header aligned to the 7 cells */}
          <div className="habit-row" style={{ padding: "0 4px 4px" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Last 7 days</span>
            {days.map((d) => (
              <span
                key={d}
                style={{
                  fontSize: 10,
                  color: "var(--ink-4)",
                  textAlign: "center",
                }}
              >
                {DOW[new Date(d + "T00:00:00").getDay()]}
              </span>
            ))}
          </div>

          {habits.map((h) => {
            const streak = currentStreak(h, today);
            const target = habitDailyTarget(h);
            const multi = target > 1;
            const todayCount = readHabitDay(h, today).count;
            return (
              <div key={h.id} className="habit-row">
                <div className="habit-name">
                  {editingId === h.id ? (
                    <span className="row" ref={editContainerRef} style={{ gap: 6 }}>
                      <input
                        className="input habit-edit-input"
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit();
                          }
                          if (e.key === "Escape") {
                            cancelEditRef.current = true;
                            setEditingId(null);
                          }
                        }}
                        onBlur={handleEditBlur}
                      />
                      <input
                        className="input habit-target-input"
                        type="number"
                        min={MIN_HABIT_DAILY_TARGET}
                        max={MAX_HABIT_DAILY_TARGET}
                        value={editTarget}
                        aria-label={`Times per day for ${h.name}`}
                        title="Times per day"
                        onChange={(e) => setEditTarget(clampTarget(e.target.value))}
                        // Commit when focus leaves the target field to somewhere
                        // outside the editor; clicking the spinner buttons keeps
                        // focus inside the container so handleEditBlur skips it.
                        onBlur={handleEditBlur}
                      />
                    </span>
                  ) : (
                    <span className="row habit-name-row" style={{ gap: 4, alignItems: "center" }}>
                      <span className="habit-label-text">{h.name}</span>
                      {updateHabit && (
                        <button
                          type="button"
                          className="iconbtn sm habit-edit-btn"
                          title="Edit habit name"
                          onClick={() => startEdit(h)}
                          style={{ width: 22, height: 22, color: "var(--ink-4)" }}
                        >
                          <Icon.Pencil width={12} height={12} />
                        </button>
                      )}
                      <ConfirmButton
                        className="iconbtn sm habit-del-btn"
                        title="Remove habit"
                        onConfirm={() => removeHabit(goal.id, h.id)}
                        requireConfirmation={confirmBeforeDelete}
                        style={{ width: 22, height: 22, color: "var(--ink-4)" }}
                        icon={<Icon.Trash width={12} height={12} />}
                      />
                    </span>
                  )}
                  <span className="sub">
                    {multi && `${todayCount}/${target} today`}
                    {multi && " · "}
                    {!showStreaks
                      ? "Tracking quietly"
                      : streak > 0
                      ? `${streak}-day streak${streak >= 3 ? " - lovely" : ""}`
                      : "Ready when you are"}
                  </span>
                </div>
                {days.map((d) => {
                  // Each day reports the target IT was kept under, so a day
                  // finished back when the target was 1 still reads as done.
                  const day = readHabitDay(h, d);
                  const fraction = day.target > 0 ? Math.min(1, day.count / day.target) : 0;
                  const isToday = d === today;
                  const label = day.target > 1
                    ? `${h.name}, ${d}: ${day.count} of ${day.target}`
                    : `${h.name}, ${d}: ${day.done ? "done" : "not done"}`;
                  return (
                    <button
                      type="button"
                      key={d}
                      className={[
                        "habit-cell",
                        day.done && "done",
                        !day.done && day.count > 0 && "partial",
                        isToday && "today",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      // The fill is driven from here so the indicator matches
                      // the real fraction rather than snapping to thirds.
                      style={{ "--habit-fill": fraction }}
                      title={label}
                      aria-label={label}
                      onClick={() => checkInHabit(goal.id, h.id, d)}
                    >
                      {day.done ? (
                        <Icon.Check width={11} height={11} />
                      ) : day.count > 0 ? (
                        // A number, not a half-check: it stays honest for any
                        // target, and doesn't rely on colour to be understood.
                        <span className="habit-cell-count">{day.count}</span>
                      ) : (
                        ""
                      )}
                    </button>
                  );
                })}
                {multi && (
                  <button
                    type="button"
                    className="iconbtn sm habit-undo-btn"
                    title={`Undo one ${h.name}`}
                    aria-label={`Undo one occurrence of ${h.name} today`}
                    disabled={todayCount === 0}
                    onClick={() => checkInHabit(goal.id, h.id, today, -1)}
                  >
                    <Icon.Minus width={12} height={12} />
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
