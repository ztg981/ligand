import { useMemo, useState } from "react";
import { todayKey, shiftDay, isCheckedOn, currentStreak } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

/* HabitChecker — a FORGIVING habit tracker.
   - Shows the last 7 days as toggleable cells.
   - We only ever store completed days; an empty cell is just "no data",
     never a recorded miss, so a gap can't shame you.
   - Streaks PAUSE rather than shatter (see currentStreak in model.js). */

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
  removeHabit,
  confirmBeforeDelete = true,
}) {
  const [name, setName] = useState("");
  const days = useMemo(() => last7(), []);
  const today = todayKey();
  const habits = goal.habits || [];

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    addHabit(goal.id, { name: n });
    setName("");
  };

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
        <button type="button" className="btn primary" onClick={submit} style={{ flex: "none" }}>
          <Icon.Plus /> Add
        </button>
      </div>

      {habits.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No habits yet — add one small thing you'd like to return to. Missing a
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
            return (
              <div key={h.id} className="habit-row">
                <div className="habit-name">
                  <span className="row" style={{ gap: 6, alignItems: "center" }}>
                    {h.name}
                    <ConfirmButton
                      className="iconbtn sm"
                      title="Remove habit"
                      onConfirm={() => removeHabit(goal.id, h.id)}
                      requireConfirmation={confirmBeforeDelete}
                      style={{ width: 22, height: 22, color: "var(--ink-4)" }}
                      icon={<Icon.Trash width={12} height={12} />}
                    />
                  </span>
                  <span className="sub">
                    {streak > 0
                      ? `${streak}-day streak${streak >= 3 ? " — lovely" : ""}`
                      : "Ready when you are"}
                  </span>
                </div>
                {days.map((d) => {
                  const on = isCheckedOn(h, d);
                  const isToday = d === today;
                  return (
                    <button
                      type="button"
                      key={d}
                      className={[
                        "habit-cell",
                        on && "done",
                        isToday && "today",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={`${h.name} · ${d}`}
                      onClick={() => checkInHabit(goal.id, h.id, d)}
                    >
                      {on ? <Icon.Check width={11} height={11} /> : ""}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
