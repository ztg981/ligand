import { useEffect, useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import Select from "../components/Select.jsx";
import { todayKey } from "../lib/model.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import {
  summarizeWeek,
  weekLine,
  reconcileKeptWeeks,
  DEFAULT_TARGET,
  TARGET_CHOICES,
} from "../lib/showingUp.js";

/* ShowUpWeek — a flexible weekly showing-up target ("4 of 7 days").

   The middle ground between a fragile daily streak and no structure at
   all: the user picks how many days a week counts as "their week", and
   simply opening the app fills a day. A missed Monday can't kill the
   week — there's always a live, reachable target (see showingUp.js for
   the research notes). Weeks that fall short are skipped, not lost;
   kept weeks bank forever. */

const DAY_LETTERS = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };

const STATE_KEY = "ligand.showUpWeek";
const DEFAULT_STATE = { target: DEFAULT_TARGET, keptWeeks: 0, lastCountedWeek: null };

export default function ShowUpWeek({ visitDates = [] }) {
  const today = todayKey();
  const [state, setState] = useLocalStorage(STATE_KEY, DEFAULT_STATE);
  const target = state?.target ?? DEFAULT_TARGET;

  // Bank any weeks completed since the last visit. Runs at most once per
  // change of week/history; reconcile is idempotent so re-runs are safe.
  useEffect(() => {
    const { state: next, newlyKept } = reconcileKeptWeeks(state, visitDates, today);
    if (newlyKept > 0 || next.lastCountedWeek !== state?.lastCountedWeek) {
      setState((prev) => ({ ...next, target: prev?.target ?? next.target }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, visitDates.length]);

  const week = useMemo(
    () => summarizeWeek({ visitDates, target, todayStr: today }),
    [visitDates, target, today]
  );
  const line = weekLine(week);
  const keptWeeks = state?.keptWeeks ?? 0;

  return (
    <div className={"card showup-card" + (week.met ? " met" : "")}>
      <div className="card-head">
        <div className="card-title"><Icon.Calendar /> Your week</div>
        <Select
          className="showup-target"
          ariaLabel="Days per week that make your week"
          align="right"
          value={target}
          onChange={(v) =>
            setState((prev) => ({ ...(prev || DEFAULT_STATE), target: Number(v) }))
          }
          options={TARGET_CHOICES.map((n) => ({ value: n, label: `${n} days/week` }))}
        />
      </div>

      <div className="showup-stat">
        <span className="showup-num mono">{week.count}</span>
        <span className="showup-unit">of {target} days this week</span>
        {week.met && <span className="showup-met-chip"><Icon.Check width={11} height={11} /> week made</span>}
      </div>

      <div className="jstreak-week" role="img"
        aria-label={`This week: ${week.count} of ${target} target days. ${line}`}>
        {week.days.map((d) => {
          const date = new Date(`${d.key}T00:00:00`);
          return (
            <div className="jstreak-col" key={d.key}>
              <span
                className={"jstreak-dot" + (d.visited ? " on" : "") + (d.isToday ? " today" : "")}
                title={`${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${d.visited ? "showed up" : d.isFuture ? "still open" : "quiet day"}`}
              >
                {d.visited && <Icon.Check width={11} height={11} />}
              </span>
              <span className={"jstreak-lbl" + (d.isToday ? " today" : "")}>
                {DAY_LETTERS[date.getDay()]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="jstreak-foot">
        {line}
        {keptWeeks > 0 && (
          <span className="showup-kept"> · {keptWeeks} week{keptWeeks === 1 ? "" : "s"} banked</span>
        )}
      </p>

      <ul className="visually-hidden">
        {week.days.map((d) => (
          <li key={d.key}>
            {d.key}: {d.visited ? "showed up" : d.isFuture ? "still open" : "quiet day"}
          </li>
        ))}
      </ul>
    </div>
  );
}
