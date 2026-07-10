import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey } from "../lib/model.js";

/* FocusTrend — a seven-day bar chart of focused minutes.

   Focus sessions already get logged ({ date, minutes, goalId }); this turns
   that quiet history into a shape you can feel. Bars grow in on mount, today's
   bar is highlighted, and the weekly total counts up. It draws only real data,
   shows an honest empty state before you've focused, and goes still under
   reduced-motion (the CSS gates the animations). */

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// The last 7 local days, oldest → today, each summed from the focus log.
function buildDays(focusLog, todayStr) {
  const totals = new Map();
  for (const e of focusLog) {
    if (!e?.date) continue;
    totals.set(e.date, (totals.get(e.date) || 0) + (e.minutes || 0));
  }
  const out = [];
  const base = new Date(`${todayStr}T00:00:00`);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    // Local date key (matches todayKey / the rest of the app — never UTC,
    // which would shift the buckets by a day in most timezones).
    const key = todayKey(d);
    out.push({
      key,
      minutes: totals.get(key) || 0,
      letter: DAY_LETTERS[d.getDay()],
      isToday: i === 0,
    });
  }
  return out;
}

// Ease a number from 0 → target over ~700ms. All setState happens inside rAF
// callbacks (never synchronously in the effect body), and reduced motion / a
// zero target jump straight to the value.
function useCountUp(target) {
  const [val, setVal] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    const dur = 700;
    // Safety net so the final number is correct even if rAF is throttled
    // (e.g. the tab was in the background when this mounted).
    const settle = setTimeout(() => setVal(target), dur + 60);
    const reduce =
      typeof document !== "undefined" &&
      (document.documentElement.getAttribute("data-reduce-motion") === "true" ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    if (reduce || target === 0) {
      rafRef.current = requestAnimationFrame(() => setVal(target));
      return () => { cancelAnimationFrame(rafRef.current); clearTimeout(settle); };
    }
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(settle); };
  }, [target]);
  return val;
}

// All-time totals from the full focus log: lifetime minutes and the single
// best day. Cheap (one pass) and only shown once there's history worth a nod.
function buildLifetime(focusLog) {
  const perDay = new Map();
  let lifetime = 0;
  for (const e of focusLog) {
    if (!e?.date) continue;
    const m = e.minutes || 0;
    lifetime += m;
    perDay.set(e.date, (perDay.get(e.date) || 0) + m);
  }
  let bestDay = 0;
  for (const v of perDay.values()) bestDay = Math.max(bestDay, v);
  return { lifetime, bestDay };
}

export default function FocusTrend({ focusLog = [], onOpenPomodoro }) {
  const today = todayKey();
  const days = useMemo(() => buildDays(focusLog, today), [focusLog, today]);
  const { lifetime, bestDay } = useMemo(() => buildLifetime(focusLog), [focusLog]);

  const total = days.reduce((n, d) => n + d.minutes, 0);
  const best = days.reduce((m, d) => Math.max(m, d.minutes), 0);
  const todayMin = days[days.length - 1]?.minutes || 0;
  const activeDays = days.filter((d) => d.minutes > 0).length;
  // Scale so a modest session still reads as meaningful, but a big day dominates.
  const scaleMax = Math.max(best, 25);

  // Trigger the grow-in just after first paint so the transition runs. A timer
  // (not rAF) so it still fires if the tab mounts while backgrounded.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const countedTotal = useCountUp(total);

  return (
    <div className="card focustrend-card">
      <div className="card-head">
        <div className="card-title"><Icon.Bolt /> Focus this week</div>
        {onOpenPomodoro && (
          <button className="btn ghost sm" onClick={onOpenPomodoro} title="Start a focus session">
            Focus <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>

      <div className="focustrend-stat">
        <span className="focustrend-num mono">{countedTotal}</span>
        <span className="focustrend-unit">min focused</span>
        {best > 0 && (
          <span className="focustrend-badge" title="Days with any focus this week">
            {activeDays}/7 days
          </span>
        )}
      </div>

      <div className={"focustrend-bars" + (mounted ? " in" : "")} role="img"
        aria-label={`Focus minutes over the last 7 days, ${total} total`}>
        {days.map((d, i) => {
          const pct = best > 0 ? Math.max(6, Math.round((d.minutes / scaleMax) * 100)) : 0;
          return (
            <div className="focustrend-col" key={d.key}>
              <div className="focustrend-track">
                <div
                  className={"focustrend-fill" + (d.isToday ? " today" : "") + (d.minutes === 0 ? " empty" : "")}
                  style={{ height: `${pct}%`, transitionDelay: `${i * 55}ms` }}
                  title={`${d.minutes} min`}
                >
                  {d.minutes > 0 && <span className="focustrend-val">{d.minutes}</span>}
                </div>
              </div>
              <div className={"focustrend-lbl" + (d.isToday ? " today" : "")}>{d.letter}</div>
            </div>
          );
        })}
      </div>

      {total === 0 ? (
        <p className="focustrend-empty">
          No focus logged yet. Run a Pomodoro and your week fills in here.
        </p>
      ) : (
        <p className="focustrend-foot">
          {todayMin > 0
            ? `${todayMin} min today — nice, keep the chain going.`
            : "Nothing today yet. Even one session counts."}
        </p>
      )}

      {/* All-time stats — only once there's history beyond this week, so it
          adds a sense of progress without repeating the weekly number. */}
      {lifetime > total && (
        <div className="focustrend-lifetime">
          <span title="Total focused minutes, all time">
            <strong>{fmtMins(lifetime)}</strong> all-time
          </span>
          {bestDay > 0 && (
            <span title="Your best single day">
              best day <strong>{fmtMins(bestDay)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Minutes → "45 min" or "3h 20m" once it passes an hour.
function fmtMins(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
