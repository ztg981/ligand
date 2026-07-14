import { Icon } from "../components/Icons.jsx";
import { COMFORTABLE_GOALS } from "../lib/goalTriage.js";

/* GoalLoad — "your plate": a segmented capacity bar of active goals.

   Goal-competition research (Fishbach & Dhar; goal-dilution effects):
   every live goal quietly taxes every other one, and past a handful the
   whole plan slows down. This makes that load VISIBLE — one block per
   goal, a tinted comfortable zone, and a kind nudge (plus a door into
   the fresh-start reset) once the plate is genuinely heavy. It never
   scolds: a full plate is described as heavy, not wrong. */

export default function GoalLoad({ goals = [], onStartFreshStart }) {
  const active = goals.filter((g) => g.status === "active" && g.type !== "recovery");
  const n = active.length;
  if (n === 0) return null;

  const heavy = n > COMFORTABLE_GOALS;
  const slots = Math.max(n, COMFORTABLE_GOALS);

  const line = heavy
    ? `${n} goals is a heavy plate — most brains push 3–5 well. Lightening it is allowed.`
    : n >= 3
    ? `${n} goals in motion. A solid, workable plate.`
    : `${n} goal${n === 1 ? "" : "s"} in motion. Focused is a fine way to be.`;

  return (
    <div className="card goalload-card">
      <div className="card-head">
        <div className="card-title"><Icon.Grid /> Your plate</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {n} active
        </span>
      </div>

      <div
        className="goalload-bar"
        role="img"
        aria-label={`${n} active goals; a comfortable load is up to ${COMFORTABLE_GOALS}.`}
      >
        {Array.from({ length: slots }, (_, i) => {
          const goal = active[i];
          return (
            <span
              key={goal ? goal.id : `empty-${i}`}
              className={
                "goalload-seg" +
                (goal ? " filled" : "") +
                (i >= COMFORTABLE_GOALS ? " over" : "")
              }
              title={goal ? goal.name : "room for one"}
              style={goal?.color ? { "--seg": goal.color } : undefined}
            />
          );
        })}
      </div>
      <div className="goalload-zone-lbl">
        <span>comfortable up to {COMFORTABLE_GOALS}</span>
      </div>

      <p className="goalload-line">{line}</p>

      {heavy && onStartFreshStart && (
        <button className="btn ghost sm" onClick={onStartFreshStart}>
          <Icon.Reset width={13} height={13} /> Lighten it with a reset
        </button>
      )}
    </div>
  );
}
