import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey } from "../lib/model.js";

/* JournalStreak — a gentle "days written" stat for the journal habit.

   The headline is the current streak (consecutive days ending today or, if you
   haven't written yet today, ending yesterday so an unfinished today never
   reads as a broken chain). A 7-dot row shows the past week at a glance, and a
   secondary count covers the calendar month. Binary presence only — journaling
   is show-up-or-not, so there's no magnitude ramp here. */

const WEEK = 7;
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// Set of local day-keys that have at least one entry.
function daySet(journal) {
  const set = new Set();
  for (const e of journal) {
    const ts = e?.createdAt || e?.date;
    if (!ts) continue;
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) set.add(todayKey(d));
  }
  return set;
}

function computeStreak(set, todayStr) {
  const base = new Date(`${todayStr}T00:00:00`);
  // If nothing today, allow the streak to end yesterday (today's still open).
  let start = set.has(todayStr) ? 0 : 1;
  if (start === 1) {
    const y = new Date(base);
    y.setDate(y.getDate() - 1);
    if (!set.has(todayKey(y))) return 0; // nothing yesterday either → no streak
  }
  let n = 0;
  for (let i = start; i < 400; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    if (set.has(todayKey(d))) n++;
    else break;
  }
  return n;
}

export default function JournalStreak({ journal = [], onOpenJournal }) {
  const today = todayKey();
  const set = useMemo(() => daySet(journal), [journal]);

  const streak = useMemo(() => computeStreak(set, today), [set, today]);

  const week = useMemo(() => {
    const base = new Date(`${today}T00:00:00`);
    const out = [];
    for (let i = WEEK - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      out.push({
        key: todayKey(d),
        written: set.has(todayKey(d)),
        letter: DAY_LETTERS[d.getDay()],
        isToday: i === 0,
        label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      });
    }
    return out;
  }, [set, today]);

  const monthCount = useMemo(() => {
    const prefix = today.slice(0, 7); // YYYY-MM
    let n = 0;
    set.forEach((k) => { if (k.startsWith(prefix)) n++; });
    return n;
  }, [set, today]);

  const wroteToday = set.has(today);

  return (
    <div className="card jstreak-card">
      <div className="card-head">
        <div className="card-title"><Icon.Book /> Journaling streak</div>
        {onOpenJournal && (
          <button className="btn ghost sm" onClick={onOpenJournal} title="Open journal">
            Write <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>

      <div className="jstreak-stat">
        <span className="jstreak-num mono">{streak}</span>
        <span className="jstreak-unit">day{streak === 1 ? "" : "s"} in a row</span>
      </div>

      <div className="jstreak-week" role="img"
        aria-label={`This week: ${week.filter((d) => d.written).length} of 7 days written.`}>
        {week.map((d) => (
          <div className="jstreak-col" key={d.key}>
            <span
              className={"jstreak-dot" + (d.written ? " on" : "") + (d.isToday ? " today" : "")}
              title={`${d.label}: ${d.written ? "written" : "no entry"}`}
            >
              {d.written && <Icon.Check width={11} height={11} />}
            </span>
            <span className={"jstreak-lbl" + (d.isToday ? " today" : "")}>{d.letter}</span>
          </div>
        ))}
      </div>

      <p className="jstreak-foot">
        {monthCount > 0
          ? `${monthCount} ${monthCount === 1 ? "day" : "days"} written this month${wroteToday ? " · today's done ✓" : ""}`
          : "Start with a line today. That's a streak of one."}
      </p>

      <ul className="visually-hidden">
        {week.map((d) => (
          <li key={d.key}>{d.label}: {d.written ? "written" : "no entry"}</li>
        ))}
      </ul>
    </div>
  );
}
