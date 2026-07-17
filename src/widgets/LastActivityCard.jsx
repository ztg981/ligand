import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import {
  ACTIVITY_CATEGORIES,
  QUICK_CATEGORIES,
  activitiesOn,
  categoryOf,
  lastActivityLine,
} from "../lib/activities.js";
import { todayKey } from "../lib/model.js";

/* LastActivityCard — the phone-check landing pad, now a launcher.

   A row of big, colorful one-tap category buttons ("I just played…",
   "I just scrolled…") opens the logger with that answer already chosen —
   two taps total to a saved log. The most recent log shows underneath so
   re-opening the app shows a day in progress, not a blank. */

export default function LastActivityCard({ activities = [], onLogActivity, onOpenDay }) {
  const today = todayKey();
  const todays = useMemo(() => activitiesOn(activities, today), [activities, today]);
  // Store is newest-first; today's first entry is the latest log.
  const last = todays[0] || null;
  const line = lastActivityLine(last);

  const quick = QUICK_CATEGORIES.map((id) => categoryOf(id));
  const more = ACTIVITY_CATEGORIES.length > quick.length;

  return (
    <div className="card lastact">
      <div className="card-head">
        <div className="card-title"><Icon.Spark /> What did you just do?</div>
        {todays.length > 0 && onOpenDay && (
          <button className="btn ghost sm" onClick={onOpenDay}>
            Day →
          </button>
        )}
      </div>

      <div className="lastact-launch" role="group" aria-label="Log an activity">
        {quick.map((c) => (
          <button
            key={c.id}
            type="button"
            className="lastact-cat"
            style={{ "--cat": c.color }}
            onClick={() => onLogActivity?.(c.id)}
            title={`Log ${c.name.toLowerCase()}`}
          >
            <span className="lastact-cat-circle" aria-hidden="true">{c.emoji}</span>
            <span className="lastact-cat-name">{c.name}</span>
          </button>
        ))}
        {more && (
          <button
            type="button"
            className="lastact-cat"
            onClick={() => onLogActivity?.(null)}
            title="More kinds"
          >
            <span className="lastact-cat-circle more" aria-hidden="true">
              <Icon.Plus width={16} height={16} />
            </span>
            <span className="lastact-cat-name">More</span>
          </button>
        )}
      </div>

      {last ? (
        <div className="lastact-last">
          <span
            className="lastact-dot"
            style={{ background: categoryOf(last.category).color }}
          />
          <span className="lastact-line">{line}</span>
          <span className="lastact-sub">
            {todays.length === 1 ? "· first log today" : `· ${todays.length} today`}
          </span>
        </div>
      ) : (
        <p className="lastact-empty">
          Tap what the last hour was — that's the whole log.
        </p>
      )}
    </div>
  );
}
