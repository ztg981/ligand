import { useMemo } from "react";
import { todayKey, shiftDay, isCheckedOn } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";

/* ============================================================
   HabitHeatmap — a gentle, GitHub-contributions-style view of
   each habit's check-ins over the last several weeks. Columns
   are weeks (Sun→Sat rows). A checked day glows in the accent;
   every other day is a calm neutral square — never red — so a
   quiet day reads as rest, not failure (the forgiving model).
   ============================================================ */

const DOW_LABELS = ["", "M", "", "W", "", "F", ""]; // sparse row labels

function buildWeekColumns(weeksCount, today) {
  const dow = new Date(today + "T00:00:00").getDay(); // 0=Sun
  // Start at the Sunday (weeksCount-1) weeks before this week.
  const startSunday = shiftDay(today, -dow - 7 * (weeksCount - 1));
  const cols = [];
  for (let w = 0; w < weeksCount; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) col.push(shiftDay(startSunday, w * 7 + d));
    cols.push(col);
  }
  return cols;
}

export default function HabitHeatmap({ goal, widgetSize = "medium" }) {
  const today = todayKey();
  const habits = goal?.habits || [];
  const weeksCount = widgetSize === "compact" ? 8 : 12;
  const columns = useMemo(
    () => buildWeekColumns(weeksCount, today),
    [weeksCount, today]
  );

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Flame /> Habit heatmap
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {weeksCount}w
        </span>
      </div>

      {habits.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No habits yet. Add one in the Habits widget and your check-ins will
          show up here — quiet days stay neutral, never red.
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {habits.map((h) => {
            const total = columns.reduce(
              (sum, col) =>
                sum + col.filter((d) => d <= today && isCheckedOn(h, d)).length,
              0
            );
            return (
              <div key={h.id}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{h.name}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                    {total} in {weeksCount}w
                  </span>
                </div>
                <div className="heatmap">
                  {/* sparse weekday labels */}
                  <div className="heatmap-col heatmap-labels">
                    {DOW_LABELS.map((l, i) => (
                      <span key={i} className="heatmap-daylabel">{l}</span>
                    ))}
                  </div>
                  {columns.map((col, ci) => (
                    <div key={ci} className="heatmap-col">
                      {col.map((d) => {
                        const future = d > today;
                        const on = !future && isCheckedOn(h, d);
                        return (
                          <span
                            key={d}
                            className={[
                              "heatmap-cell",
                              on && "on",
                              future && "future",
                              d === today && "today",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={future ? d : `${h.name} · ${d}${on ? " · done" : ""}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
