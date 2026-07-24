import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { shiftDay, todayKey } from "../lib/model.js";
import { categoryById } from "../lib/dayPlanner.js";
import { categoryOf, hhmmToMin } from "../lib/activities.js";
import { minutesOfDay } from "../lib/sleep.js";

/* DayRing — a small "time visibility" dial for Home.

   Time blindness is easier to fight when the day is a finite SHAPE, not an
   endless list. This ring shows the 24-hour day with:
   - elapsed hours quietly filled (what's already gone),
   - arcs for workouts actually completed today (real createdAt + duration),
   - dots for today's upcoming alarms,
   - a current-time marker,
   - a center summary (focused minutes, next fixed point).

   It only draws REAL data the app has; nothing here pretends tasks have
   times. A visually-hidden list mirrors the content for screen readers, and
   there is no animation, so reduced-motion needs nothing special. */

const R = 74; // ring radius
const CX = 90;
const CY = 90;
const STROKE = 13;

// Angle for an hour-of-day (0..24). Midnight at top, clockwise.
function angleFor(hours) {
  return (hours / 24) * Math.PI * 2 - Math.PI / 2;
}

function pointFor(hours, radius = R) {
  const a = angleFor(hours);
  return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

// SVG arc path along the ring between two hour marks.
function arcPath(fromH, toH, radius = R) {
  const [x1, y1] = pointFor(fromH, radius);
  const [x2, y2] = pointFor(toH, radius);
  const large = toH - fromH > 12 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

function fmtHM(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function DayRing({
  workouts = [],
  alarms = [],
  focusLog = [],
  scheduledWorkouts = [],
  dayBlocks = [],
  activities = [],
  sleepLog = [],
  onOpenWorkout,
  onOpenAlarms,
}) {
  // Re-render every minute so the "now" marker and elapsed fill stay honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = todayKey();
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;

  const trainedArcs = useMemo(() => {
    return workouts
      .filter((w) => w.date === today && w.createdAt)
      .map((w) => {
        const end = new Date(w.createdAt);
        const endH = end.getHours() + end.getMinutes() / 60;
        const durH = Math.max((w.durationSec || 600) / 3600, 0.25); // ≥15min visible
        return { id: w.id, from: Math.max(0, endH - durH), to: endH };
      });
  }, [workouts, today]);

  // Logged activities with a real end time + duration paint the main ring in
  // their category color — the same "this actually happened" treatment as
  // workouts. Sport logs mirrored into a workout are skipped (the trained
  // arc already shows them).
  const activityArcs = useMemo(() => {
    return activities
      .filter(
        (a) =>
          a.date === today &&
          a.durationMin > 0 &&
          hhmmToMin(a.endTime) != null &&
          !(a.linkType === "workout" && a.linkId)
      )
      .map((a) => {
        const endH = hhmmToMin(a.endTime) / 60;
        const durH = Math.max(a.durationMin / 60, 0.25); // ≥15min visible
        return {
          id: a.id,
          from: Math.max(0, endH - durH),
          to: endH,
          color: categoryOf(a.category).color,
          title: a.title,
        };
      });
  }, [activities, today]);

  const sleepArcs = useMemo(() => {
    const out = [];
    const todayEntry = sleepLog.find((entry) => entry.date === today);
    const tomorrowEntry = sleepLog.find((entry) => entry.date === shiftDay(today, 1));
    if (todayEntry) {
      const bed = minutesOfDay(todayEntry.bedTime);
      const wake = minutesOfDay(todayEntry.wakeTime);
      if (bed != null && wake != null) {
        if (bed < wake) out.push({ id: `${todayEntry.id}-same`, from: bed / 60, to: wake / 60 });
        else if (wake > 0) out.push({ id: `${todayEntry.id}-am`, from: 0, to: wake / 60 });
      }
    }
    if (tomorrowEntry) {
      const bed = minutesOfDay(tomorrowEntry.bedTime);
      const wake = minutesOfDay(tomorrowEntry.wakeTime);
      if (bed != null && wake != null && bed > wake) {
        out.push({ id: `${tomorrowEntry.id}-pm`, from: bed / 60, to: 23.999 });
      }
    }
    return out;
  }, [sleepLog, today]);

  const todaysAlarms = useMemo(() => {
    const weekday = (now.getDay() + 6) % 7;
    return alarms
      .filter((a) => a.enabled && (!a.days?.length || a.days.includes(weekday)))
      .map((a) => {
        const [h, m] = a.time.split(":").map(Number);
        return { id: a.id, label: a.label, hours: h + m / 60, time: a.time };
      })
      .sort((a, b) => a.hours - b.hours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarms, today]);

  const focusMin = useMemo(
    () => focusLog.filter((f) => f.date === today).reduce((n, f) => n + (f.minutes || 0), 0),
    [focusLog, today]
  );
  const trainedMin = useMemo(
    () =>
      workouts
        .filter((w) => w.date === today)
        .reduce((n, w) => n + Math.round((w.durationSec || 0) / 60), 0),
    [workouts, today]
  );
  const plannedToday = scheduledWorkouts.filter(
    (s) => s.date === today && s.status !== "done"
  );

  const nextAlarm = todaysAlarms.find((a) => a.hours > nowH);

  // Blocks planned on the Day dial (desktop) show here too, so the phone
  // sees the same day-shape that was planned on the PC.
  const todaysBlocks = useMemo(
    () => dayBlocks.filter((b) => b.date === today),
    [dayBlocks, today]
  );
  const nextBlock = [...todaysBlocks]
    .filter((b) => !b.done && b.start / 60 > nowH)
    .sort((a, b) => a.start - b.start)[0];

  // Center line: the single most useful "what's fixed next" fact. A planned
  // block beats an alarm beats a dateless planned workout.
  const nextLine = nextBlock
    ? `Next: ${nextBlock.title} · ${fmtHM(nextBlock.start / 60)}`
    : nextAlarm
      ? `Next: ${nextAlarm.label} · ${fmtHM(nextAlarm.hours)}`
      : plannedToday.length
        ? `Planned: ${plannedToday[0].name}`
        : null;

  const hoursLeft = Math.max(0, 24 - nowH);

  return (
    <div className="card dayring-card">
      <div className="card-head">
        <div className="card-title"><Icon.Timer /> Your day</div>
        <span className="dayring-left">{Math.floor(hoursLeft)}h left today</span>
      </div>

      <div className="dayring-wrap">
        <svg
          className="dayring"
          viewBox="0 0 180 180"
          role="img"
          aria-label={`Day overview: ${Math.floor(hoursLeft)} hours left today${focusMin ? `, ${focusMin} minutes focused` : ""}${trainedMin ? `, ${trainedMin} minutes trained` : ""}${nextAlarm ? `, next alarm ${nextAlarm.label} at ${fmtHM(nextAlarm.hours)}` : ""}`}
        >
          {/* base track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--panel-3)" strokeWidth={STROKE} />
          {/* elapsed day — quietly filled so remaining time reads as space */}
          {nowH > 0.05 && (
            <path
              d={arcPath(0, Math.min(nowH, 23.95))}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          )}
          {/* planned day-dial blocks (thin inner arcs, category colored) */}
          {todaysBlocks.map((b) => (
            <path
              key={b.id}
              d={arcPath(b.start / 60, Math.max(b.start / 60 + 0.2, b.end / 60), R - STROKE / 2 - 5)}
              fill="none"
              stroke={categoryById(b.category).color}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={b.done ? 0.35 : 0.9}
            />
          ))}
          {/* Actual sleep is separate from the usual target band. It sits on
              its own inner lane so late-night activity remains visible. */}
          {sleepArcs.map((sleep) => (
            <path
              key={sleep.id}
              d={arcPath(sleep.from, sleep.to, R - 18)}
              fill="none"
              stroke="oklch(0.58 0.11 285)"
              strokeWidth={5}
              strokeLinecap="round"
            >
              <title>Actual sleep</title>
            </path>
          ))}
          {/* logged activity arcs — slim segments CASED in the panel color so
             they sit crisply ON the track instead of muddying into the gray
             elapsed fill (full-width flat arcs read as smears, not marks). */}
          {activityArcs.map((a) => (
            <g key={a.id}>
              <path
                d={arcPath(a.from, a.to)}
                fill="none"
                stroke="var(--panel)"
                strokeWidth={10}
                strokeLinecap="round"
              />
              <path
                d={arcPath(a.from, a.to)}
                fill="none"
                stroke={a.color}
                strokeWidth={6.5}
                strokeLinecap="round"
              >
                <title>{a.title}</title>
              </path>
            </g>
          ))}
          {/* trained arcs (real completed workouts) — same cased treatment,
             always green, drawn last so a workout wins any overlap */}
          {trainedArcs.map((a) => (
            <g key={a.id}>
              <path
                d={arcPath(a.from, a.to)}
                fill="none"
                stroke="var(--panel)"
                strokeWidth={10}
                strokeLinecap="round"
              />
              <path
                d={arcPath(a.from, a.to)}
                fill="none"
                stroke="oklch(0.65 0.14 150)"
                strokeWidth={6.5}
                strokeLinecap="round"
              />
            </g>
          ))}
          {/* hour ticks every 6h with tiny labels */}
          {[0, 6, 12, 18].map((h) => {
            const [tx, ty] = pointFor(h, R + STROKE / 2 + 9);
            return (
              <text key={h} x={tx} y={ty + 3} textAnchor="middle" className="dayring-tick">
                {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
              </text>
            );
          })}
          {/* alarm dots */}
          {todaysAlarms.map((a) => {
            const [ax, ay] = pointFor(a.hours);
            return (
              <circle
                key={a.id}
                cx={ax}
                cy={ay}
                r={4}
                fill="var(--accent)"
                stroke="var(--panel)"
                strokeWidth={1.5}
              >
                <title>{`${a.label} · ${a.time}`}</title>
              </circle>
            );
          })}
          {/* now marker */}
          {(() => {
            const [nx, ny] = pointFor(nowH);
            return (
              <circle cx={nx} cy={ny} r={5.5} fill="var(--ink)" stroke="var(--panel)" strokeWidth={2} />
            );
          })()}
          {/* center summary */}
          <text x={CX} y={CY - 10} textAnchor="middle" className="dayring-time">
            {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </text>
          <text x={CX} y={CY + 8} textAnchor="middle" className="dayring-sub">
            {focusMin > 0 ? `${focusMin}m focused` : "no focus yet"}
          </text>
          {trainedMin > 0 && (
            <text x={CX} y={CY + 22} textAnchor="middle" className="dayring-sub">
              {trainedMin}m trained
            </text>
          )}
        </svg>

        <div className="dayring-side">
          {nextLine && <div className="dayring-next">{nextLine}</div>}
          {plannedToday.length > 0 && (
            <button className="dayring-link" onClick={onOpenWorkout}>
              <Icon.Dumbbell width={13} height={13} /> {plannedToday[0].name} is ready
            </button>
          )}
          {todaysAlarms.length > 0 && (
            <button className="dayring-link" onClick={onOpenAlarms}>
              <Icon.Bell width={13} height={13} /> {todaysAlarms.length} alarm{todaysAlarms.length === 1 ? "" : "s"} today
            </button>
          )}
          {!nextLine && todaysAlarms.length === 0 && plannedToday.length === 0 && (
            <p className="dayring-empty">
              Nothing time-fixed today. The rest of the ring is yours.
            </p>
          )}
        </div>
      </div>

      {/* Screen-reader mirror of the visual content. */}
      <ul className="visually-hidden">
        {todaysAlarms.map((a) => (
          <li key={a.id}>Alarm {a.label} at {a.time}</li>
        ))}
        {plannedToday.map((p) => (
          <li key={p.id}>Planned workout: {p.name}</li>
        ))}
        <li>{focusMin} minutes focused today; {trainedMin} minutes trained.</li>
      </ul>
    </div>
  );
}
