import { MUSCLE_GROUPS, MUSCLE_LABEL } from "../lib/exercises.js";

/* WorkoutPlanner — the desktop planning workspace.

   Fitness on the PC is about PLANNING: stepping back and deciding your week.
   This is a training-split matrix — muscle groups down the side, the seven days
   across the top — where you toggle which groups you'll train each day. It's
   the classic way lifters lay out a Push/Pull/Legs or Upper/Lower split, and it
   reads at a glance: full columns are hard days, empty columns are rest.

   The plan lives on the fitness profile (profile.weeklyPlan: { 0: ["chest",
   "triceps"], ... } keyed Mon=0..Sun=6) so it syncs with everything else, and
   the mobile side reads today's column to show a "ready for the gym" cue. */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Groups worth planning a day around (cardio is planned as its own kind of day).
const PLAN_GROUPS = MUSCLE_GROUPS;

export function todayWeekday() {
  return (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
}

// A short human name for a day's group set, so each column reads as a "day type".
export function splitLabel(groups = []) {
  const g = new Set(groups);
  if (g.size === 0) return "Rest";
  const has = (...xs) => xs.every((x) => g.has(x));
  const only = (...xs) => g.size === xs.length && xs.every((x) => g.has(x));
  if (only("cardio")) return "Cardio";
  if (has("chest", "shoulders", "triceps") && !g.has("back")) return "Push";
  if (has("back", "biceps") && !g.has("chest")) return "Pull";
  if (only("legs") || (g.has("legs") && g.size <= 2 && !g.has("chest") && !g.has("back")))
    return "Legs";
  if (has("chest", "back")) return "Upper";
  if (g.size >= 4) return "Full body";
  // Otherwise name it after the first group.
  return MUSCLE_LABEL[groups[0]] || "Training";
}

export default function WorkoutPlanner({ plan = {}, onChange }) {
  const today = todayWeekday();

  const groupsFor = (d) => plan[d] || [];
  const isOn = (d, g) => groupsFor(d).includes(g);

  const toggle = (d, g) => {
    const cur = groupsFor(d);
    const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g];
    onChange?.(d, next);
  };
  const clearDay = (d) => onChange?.(d, []);

  const dayVolume = (d) => groupsFor(d).length;

  return (
    <div className="card wk-planner">
      <div className="card-head">
        <div className="card-title">📅 Weekly plan</div>
      </div>
      <p className="wk-planner-sub">
        Map your week. Tap a cell to train that muscle group on that day. Your
        phone picks up whatever today lands on.
      </p>

      <div className="wk-plan-grid" role="grid">
        {/* Header row: day names */}
        <div className="wk-plan-corner" />
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={"wk-plan-dayhead" + (i === today ? " today" : "")}
          >
            <span className="wk-plan-dayname">{d}</span>
            <span className="wk-plan-daytype">{splitLabel(groupsFor(i))}</span>
          </div>
        ))}

        {/* One row per muscle group */}
        {PLAN_GROUPS.map((g) => (
          <div key={g} className="wk-plan-row" style={{ display: "contents" }}>
            <div className="wk-plan-rowlabel">{MUSCLE_LABEL[g] || g}</div>
            {DAYS.map((_, d) => (
              <button
                key={d}
                type="button"
                className={
                  "wk-plan-cell" +
                  (isOn(d, g) ? " on" : "") +
                  (d === today ? " today-col" : "")
                }
                aria-pressed={isOn(d, g)}
                title={`${MUSCLE_LABEL[g] || g} on ${DAYS[d]}`}
                onClick={() => toggle(d, g)}
              />
            ))}
          </div>
        ))}

        {/* Footer row: per-day volume + clear */}
        <div className="wk-plan-footlabel" />
        {DAYS.map((_, d) => (
          <div key={d} className={"wk-plan-foot" + (d === today ? " today-col" : "")}>
            {dayVolume(d) > 0 ? (
              <button
                type="button"
                className="wk-plan-clear"
                title={`Clear ${DAYS[d]}`}
                onClick={() => clearDay(d)}
              >
                ✕
              </button>
            ) : (
              <span className="wk-plan-rest">rest</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
