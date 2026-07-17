import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import ScheduleImportSheet from "../components/ScheduleImportSheet.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { todayKey } from "../lib/model.js";
import {
  WEEKDAY_MIN,
  itemsForDate,
  monthDensity,
  monthGrid,
  monthKey,
  monthLabel,
  shiftMonth,
} from "../lib/calendar.js";

/* Calendar — the wide-angle view of what's scheduled.

   A calm month grid (busy days show small colored dots, nothing shouts),
   with a day panel beside/below it listing that day's blocks, planned
   workouts, dated tasks, alarms, and goal target dates. Selecting a day and
   "Open in Day planner" hands off to the close-up tab for real timeboxing —
   this tab never tries to BE the planner.

   "Import schedule" reads a screenshot (or pasted text) into reviewed,
   user-confirmed blocks — see ScheduleImportSheet. */

const KIND_ICON = {
  block: (p) => <Icon.Timer {...p} />,
  workout: (p) => <Icon.Dumbbell {...p} />,
  task: (p) => <Icon.Check {...p} />,
  alarm: (p) => <Icon.Bell {...p} />,
  deadline: (p) => <Icon.Target {...p} />,
};

function dayTitle(key) {
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function Calendar({
  dayBlocks = [],
  scheduledWorkouts = [],
  tasks = [],
  alarms = [],
  goals = [],
  addDayBlock,
  onOpenDay, // (dateKey) => void — jump into the Day planner on that date
}) {
  const isMobile = useIsMobile(768);
  const today = todayKey();
  const [mKey, setMKey] = useState(() => monthKey());
  const [selected, setSelected] = useState(today);
  const [importOpen, setImportOpen] = useState(false);

  const stores = useMemo(
    () => ({ dayBlocks, scheduledWorkouts, tasks, alarms, goals }),
    [dayBlocks, scheduledWorkouts, tasks, alarms, goals]
  );
  const grid = useMemo(() => monthGrid(mKey), [mKey]);
  const density = useMemo(() => monthDensity(stores, mKey), [stores, mKey]);
  const dayItems = useMemo(() => itemsForDate(stores, selected), [stores, selected]);

  const goToday = () => {
    setMKey(monthKey());
    setSelected(today);
  };

  const monthPanel = (
    <div className="card cal-card">
      <div className="cal-head">
        <div className="cal-month">{monthLabel(mKey)}</div>
        <div className="cal-nav">
          {mKey !== monthKey() && (
            <button className="btn ghost sm" onClick={goToday}>
              Today
            </button>
          )}
          <button className="iconbtn" title="Previous month" onClick={() => setMKey(shiftMonth(mKey, -1))}>
            ‹
          </button>
          <button className="iconbtn" title="Next month" onClick={() => setMKey(shiftMonth(mKey, 1))}>
            ›
          </button>
        </div>
      </div>

      <div className="cal-grid" role="grid" aria-label={monthLabel(mKey)}>
        {WEEKDAY_MIN.map((d, i) => (
          <div key={"h" + i} className="cal-dow" aria-hidden="true">
            {d}
          </div>
        ))}
        {grid.flat().map((cell) => {
          const dens = density[cell.key];
          const isToday = cell.key === today;
          const isSel = cell.key === selected;
          return (
            <button
              key={cell.key}
              type="button"
              className={
                "cal-cell" +
                (cell.inMonth ? "" : " out") +
                (isToday ? " today" : "") +
                (isSel ? " sel" : "")
              }
              aria-pressed={isSel}
              aria-label={`${dayTitle(cell.key)}${dens ? `, ${dens.count} scheduled` : ""}`}
              onClick={() => setSelected(cell.key)}
            >
              <span className="cal-cell-num">{Number(cell.key.slice(8))}</span>
              <span className="cal-cell-dots" aria-hidden="true">
                {(dens?.colors || []).map((c, i) => (
                  <span key={i} className="cal-dot" style={{ background: c }} />
                ))}
                {dens && dens.count > 3 && <span className="cal-dot-more">+</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const dayPanel = (
    <div className="card cal-day">
      <div className="card-head">
        <div className="card-title">
          <Icon.Calendar /> {selected === today ? "Today" : dayTitle(selected)}
        </div>
        <span className="cal-day-count">
          {dayItems.length ? `${dayItems.length} scheduled` : ""}
        </span>
      </div>

      {dayItems.length === 0 ? (
        <p className="dp-empty">
          Nothing scheduled. A clear day is a fine plan too, or open it in
          the planner and shape it.
        </p>
      ) : (
        <div className="cal-items">
          {dayItems.map((it) => {
            const Ic = KIND_ICON[it.kind] || KIND_ICON.block;
            return (
              <div key={it.id} className={"cal-item" + (it.done ? " done" : "")}>
                <span className="cal-item-time mono">{it.timeLabel || "—"}</span>
                <span className="cal-item-ic" style={{ "--cat": it.color }}>
                  <Ic width={12} height={12} />
                </span>
                <span className="cal-item-title">{it.title}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="cal-day-actions">
        <button className="btn primary sm" onClick={() => onOpenDay?.(selected)}>
          <Icon.Timer width={13} height={13} /> Open in Day planner
        </button>
        <button className="btn ghost sm" onClick={() => setImportOpen(true)}>
          <Icon.Image width={13} height={13} /> Import schedule
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">
            The month at a glance. Pick a day to see what's on it; the Day
            planner stays the close-up.
          </p>
        </div>
      </div>

      {isMobile ? (
        <>
          {monthPanel}
          {dayPanel}
        </>
      ) : (
        <div className="grid grid-12">
          <div className="col-7" style={{ minWidth: 0 }}>{monthPanel}</div>
          <div className="col-5" style={{ minWidth: 0 }}>{dayPanel}</div>
        </div>
      )}

      <ScheduleImportSheet
        key={importOpen ? "schimp-open" : "schimp-closed"}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        isMobile={isMobile}
        addDayBlock={addDayBlock}
        defaultDate={selected}
      />
    </>
  );
}
