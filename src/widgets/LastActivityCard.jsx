import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { activitiesOn, categoryOf, lastActivityLine } from "../lib/activities.js";
import { todayKey } from "../lib/model.js";

/* LastActivityCard — the phone-check landing pad.

   The reflex this app wants to absorb: pick up phone → open Ligand → log
   the last thing you did → see the day taking shape. This card is that
   loop's front door on Home: the most recent log (so re-opening shows
   progress, not emptiness) and one big "log it" button. */

export default function LastActivityCard({ activities = [], onLogActivity, onOpenDay }) {
  const today = todayKey();
  const todays = useMemo(() => activitiesOn(activities, today), [activities, today]);
  // Store is newest-first; today's first entry is the latest log.
  const last = todays[0] || null;
  const line = lastActivityLine(last);

  return (
    <div className="card lastact">
      <div className="card-head">
        <div className="card-title"><Icon.Spark /> Just did something?</div>
        {todays.length > 0 && onOpenDay && (
          <button className="btn ghost sm" onClick={onOpenDay}>
            Day →
          </button>
        )}
      </div>

      {last ? (
        <div className="lastact-last">
          <span
            className="lastact-dot"
            style={{ background: categoryOf(last.category).color }}
          />
          <div className="lastact-text">
            <div className="lastact-line">{line}</div>
            <div className="lastact-sub">
              {todays.length === 1
                ? "First log of the day."
                : `${todays.length} things logged today.`}
            </div>
          </div>
        </div>
      ) : (
        <p className="lastact-empty">
          Tennis, a game, a chore, a scroll — whatever the last hour was,
          give it a row. Your day builds itself from these.
        </p>
      )}

      <button className="btn primary lastact-btn" onClick={onLogActivity}>
        <Icon.Plus width={14} height={14} /> Log what I just did
      </button>
    </div>
  );
}
