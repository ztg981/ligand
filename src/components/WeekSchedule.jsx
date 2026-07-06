import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { todayKey, shiftDay } from "../lib/model.js";

/* WeekSchedule — the 7-day planning calendar for scheduled workout INSTANCES
   (dated plans, distinct from reusable templates). Shows Mon–Sun of the
   selected week with today highlighted; each entry can be started, edited,
   moved to another day, duplicated to another day, or removed (removing an
   instance never touches templates or history). */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Monday of the week containing `key`, shifted by `offsetWeeks`.
function weekStartKey(key, offsetWeeks = 0) {
  const d = new Date(key + "T00:00:00");
  const dayIdx = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  return shiftDay(key, -dayIdx + offsetWeeks * 7);
}

export default function WeekSchedule({
  scheduledWorkouts = [],
  onStart, // (sched) => void
  onEdit, // (sched) => void
  onMove, // (id, newDate) => void
  onDuplicate, // (sched, newDate) => void
  onDelete, // (id) => void
}) {
  const [offset, setOffset] = useState(0); // weeks from current
  const [openId, setOpenId] = useState(null); // expanded entry
  const [dateFor, setDateFor] = useState(null); // { id, mode: "move"|"dup", value }

  const today = todayKey();
  const start = weekStartKey(today, offset);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(start, i));

  const byDate = {};
  for (const s of scheduledWorkouts) {
    if (s.status === "done") continue; // completed instances live in history
    (byDate[s.date] ||= []).push(s);
  }

  const monthLabel = new Date(start + "T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="card wksch">
      <div className="card-head">
        <div className="card-title"><Icon.Calendar /> This week</div>
        <div className="wksch-nav">
          <button className="iconbtn" title="Previous week" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </button>
          <span className="wksch-month">{monthLabel}</span>
          <button className="iconbtn" title="Next week" onClick={() => setOffset((o) => o + 1)}>
            ›
          </button>
          {offset !== 0 && (
            <button className="btn ghost sm" onClick={() => setOffset(0)}>
              Today
            </button>
          )}
        </div>
      </div>

      <div className="wksch-grid">
        {days.map((dayKey, i) => {
          const isToday = dayKey === today;
          const entries = byDate[dayKey] || [];
          return (
            <div key={dayKey} className={"wksch-day" + (isToday ? " today" : "")}>
              <div className="wksch-day-head">
                <span className="wksch-day-name">{DAY_LABELS[i]}</span>
                <span className="wksch-day-num">{Number(dayKey.slice(8, 10))}</span>
              </div>
              {entries.length === 0 ? (
                <div className="wksch-rest">–</div>
              ) : (
                entries.map((s) => (
                  <div key={s.id} className="wksch-entry">
                    <button
                      className="wksch-entry-main"
                      onClick={() => setOpenId(openId === s.id ? null : s.id)}
                      aria-expanded={openId === s.id}
                      title={`${s.name} · ${(s.exercises || []).length} exercises`}
                    >
                      <span className="wksch-entry-name">{s.name}</span>
                      <span className="wksch-entry-n">{(s.exercises || []).length} ex</span>
                    </button>
                    {openId === s.id && (
                      <div className="wksch-entry-actions">
                        <button className="btn primary sm" onClick={() => onStart?.(s)}>
                          Start
                        </button>
                        <button className="btn ghost sm" onClick={() => onEdit?.(s)}>
                          Edit
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() =>
                            setDateFor({ id: s.id, mode: "move", value: s.date, sched: s })
                          }
                        >
                          Move
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() =>
                            setDateFor({ id: s.id, mode: "dup", value: shiftDay(s.date, 1), sched: s })
                          }
                        >
                          Duplicate
                        </button>
                        <button
                          className="btn ghost sm wksch-danger"
                          onClick={() => {
                            onDelete?.(s.id);
                            setOpenId(null);
                          }}
                        >
                          Remove
                        </button>
                        {dateFor?.id === s.id && (
                          <div className="wksch-daterow">
                            <input
                              className="input"
                              type="date"
                              value={dateFor.value}
                              onChange={(e) => setDateFor((d) => ({ ...d, value: e.target.value }))}
                            />
                            <button
                              className="btn sm"
                              disabled={!dateFor.value}
                              onClick={() => {
                                if (dateFor.mode === "move") onMove?.(s.id, dateFor.value);
                                else onDuplicate?.(s, dateFor.value);
                                setDateFor(null);
                                setOpenId(null);
                              }}
                            >
                              {dateFor.mode === "move" ? "Move" : "Copy"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
