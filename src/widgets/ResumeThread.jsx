import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey, daysBetween } from "../lib/model.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";

/* ResumeThread — "pick up the thread": a concrete where-you-left-off cue
   shown after 2+ days away.

   Interrupted-work research (Mark; Altmann & Trafton on resumption lag):
   the cost of coming back isn't doing the work, it's REBUILDING CONTEXT —
   remembering what was in flight. A generic "welcome back" doesn't help
   with that; a specific cue ("3 tasks open in Today · last focus was
   Tuesday") does. Each line is a one-tap jump back into that surface.

   Dismissible for the day, and it never lists more than three threads —
   a re-entry aid, not a backlog audit. */

function lastKeyOf(list, getKey) {
  let latest = null;
  for (const item of list) {
    const k = getKey(item);
    if (k && (!latest || k > latest)) latest = k;
  }
  return latest;
}

function agoLabel(dayKey, today) {
  const d = daysBetween(dayKey, today);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export default function ResumeThread({
  daysAway = 0,
  tasks = [],
  focusLog = [],
  journal = [],
  onGoToTasks,
  onOpenPomodoro,
  onOpenJournal,
}) {
  const today = todayKey();
  const [hiddenOn, setHiddenOn] = useLocalStorage("ligand.resumeHiddenDate", null);

  const threads = useMemo(() => {
    const out = [];

    const openToday = tasks.filter((t) => !t.done && t.label === "Today").length;
    const openTotal = tasks.filter((t) => !t.done).length;
    if (openToday > 0 || openTotal > 0) {
      out.push({
        id: "tasks",
        icon: <Icon.Check />,
        text:
          openToday > 0
            ? `${openToday} task${openToday === 1 ? "" : "s"} still open in Today`
            : `${openTotal} open task${openTotal === 1 ? "" : "s"} waiting, no rush`,
        cta: "Open tasks",
        onGo: onGoToTasks,
      });
    }

    const lastFocus = lastKeyOf(focusLog, (f) => f.date);
    if (lastFocus) {
      const min = focusLog
        .filter((f) => f.date === lastFocus)
        .reduce((n, f) => n + (f.minutes || 0), 0);
      out.push({
        id: "focus",
        icon: <Icon.Timer />,
        text: `Last focus: ${agoLabel(lastFocus, today)}${min ? ` (${min} min)` : ""}`,
        cta: "Start one",
        onGo: onOpenPomodoro,
      });
    }

    const lastEntry = lastKeyOf(journal, (e) => {
      const ts = e?.createdAt || e?.date;
      return ts ? String(ts).slice(0, 10) : null;
    });
    if (lastEntry) {
      out.push({
        id: "journal",
        icon: <Icon.Book />,
        text: `Last journal entry: ${agoLabel(lastEntry, today)}`,
        cta: "Write a line",
        onGo: onOpenJournal,
      });
    }

    return out.slice(0, 3);
  }, [tasks, focusLog, journal, today, onGoToTasks, onOpenPomodoro, onOpenJournal]);

  if (daysAway < 2 || hiddenOn === today || threads.length === 0) return null;

  return (
    <div className="card resume-card">
      <div className="card-head">
        <div className="card-title"><Icon.Spark /> Pick up the thread</div>
        <button
          className="pick-one-hide"
          onClick={() => setHiddenOn(today)}
          title="Hide for today"
          aria-label="Hide for today"
        >
          <Icon.Close width={14} height={14} />
        </button>
      </div>
      <p className="resume-sub">
        No catching up required — here's exactly where things stand.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        {threads.map((t) => (
          <div key={t.id} className="resume-row">
            <span className="resume-ic">{t.icon}</span>
            <span className="resume-text">{t.text}</span>
            {t.onGo && (
              <button className="btn ghost sm" onClick={t.onGo} style={{ flex: "none" }}>
                {t.cta} <Icon.Arrow width={12} height={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
