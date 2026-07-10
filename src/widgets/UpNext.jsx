import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey } from "../lib/model.js";
import { minutesToLabel, categoryById } from "../lib/dayPlanner.js";
import { nextBlockForDay, nextAlarmToday, suggestedTask } from "../lib/agenda.js";

/* UpNext — a single "what's next" glance that folds the day dial, alarms,
   and task list into three plain lines. It answers the one question an
   ADHD brain keeps re-asking — "what am I meant to be doing?" — without
   making you read a chart. Re-ticks every minute so "Next at 2:30" flips
   to "Now · …" on its own. */

function nowMinutes(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

export default function UpNext({
  dayBlocks = [],
  alarms = [],
  tasks = [],
  onOpenDay,
  onOpenTasks,
  onGoToTasks,
}) {
  // A ticking clock so the card stays honest as time passes.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const today = todayKey(now);
  const nowMin = nowMinutes(now);
  const jsWeekday = now.getDay();

  const blockPick = useMemo(
    () => nextBlockForDay(dayBlocks, today, nowMin),
    [dayBlocks, today, nowMin]
  );
  const alarmPick = useMemo(
    () => nextAlarmToday(alarms, nowMin, jsWeekday),
    [alarms, nowMin, jsWeekday]
  );
  const taskPick = useMemo(() => suggestedTask(tasks), [tasks]);

  const rows = [];

  if (blockPick) {
    const { block, state } = blockPick;
    const cat = categoryById(block.category);
    rows.push({
      key: "block",
      icon: <Icon.Timer />,
      lead: state === "now" ? "Now" : "Next",
      leadTone: state === "now" ? "live" : "",
      title: block.title,
      meta:
        state === "now"
          ? `until ${minutesToLabel(block.end)}`
          : `at ${minutesToLabel(block.start)}`,
      tint: cat?.color,
      onClick: onOpenDay,
    });
  }

  if (alarmPick) {
    rows.push({
      key: "alarm",
      icon: <Icon.Bell />,
      lead: "Alarm",
      title: alarmPick.label || "Alarm",
      meta: minutesToLabel(alarmPick.min),
      onClick: onOpenDay,
    });
  }

  if (taskPick) {
    rows.push({
      key: "task",
      icon: <Icon.Check />,
      lead: "Do",
      title: taskPick.text,
      meta: taskPick.label && taskPick.label !== "General" ? taskPick.label : "",
      onClick: onGoToTasks || onOpenTasks,
    });
  }

  return (
    <div className="card upnext-card">
      <div className="card-head">
        <div className="card-title"><Icon.Bolt /> Up next</div>
        {onOpenDay && (
          <button className="btn ghost sm" onClick={onOpenDay} title="Open the day planner">
            Plan <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="upnext-empty">
          Nothing scheduled and no open tasks. Enjoy the open space — or plan a block.
        </p>
      ) : (
        <div className="upnext-list">
          {rows.map((r) => (
            <button
              key={r.key}
              className="upnext-row"
              onClick={r.onClick}
              disabled={!r.onClick}
              data-mute-click
            >
              <span
                className="upnext-ic"
                style={r.tint ? { color: r.tint } : undefined}
              >
                {r.icon}
              </span>
              <span className="upnext-body">
                <span className={"upnext-lead" + (r.leadTone === "live" ? " live" : "")}>
                  {r.lead}
                </span>
                <span className="upnext-title">{r.title}</span>
              </span>
              {r.meta && <span className="upnext-meta">{r.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
