import { useMemo } from "react";
import { Icon } from "./Icons.jsx";
import ConfirmButton from "./ConfirmButton.jsx";
import { buildDayStory, daySummary, fmtMinutes } from "../lib/activities.js";
import { todayKey } from "../lib/model.js";

/* DayStory — what actually happened on a date, as one chronological thread.

   The plan (dial blocks) says what the day was supposed to be; this is the
   reality track: logged activities, workouts, meals, journal entries, wake
   time, and focus totals, merged and time-ordered. Browsing back a day at a
   time answers "what did I do yesterday?" — the exact question that
   otherwise sends the thumb to a feed.

   Empty days are described neutrally. A day with no rows is a day with no
   DATA, and the copy says exactly that and nothing more. */

const KIND_ICON = {
  sleep: (p) => <Icon.Moon {...p} />,
  workout: (p) => <Icon.Dumbbell {...p} />,
  meal: (p) => <Icon.Heart {...p} />,
  journal: (p) => <Icon.Book {...p} />,
  focus: (p) => <Icon.Timer {...p} />,
  activity: (p) => <Icon.Spark {...p} />,
};

export default function DayStory({
  date = todayKey(),
  activities = [],
  workouts = [],
  focusLog = [],
  journal = [],
  meals = [],
  sleepLog = [],
  onLogActivity, // () => void — open the activity sheet for this date
  onRemoveActivity, // (id) => void
  confirmBeforeDelete = true,
  compact = false, // journal/home embed: chips only, no delete affordances
}) {
  const events = useMemo(
    () =>
      buildDayStory(
        { activities, workouts, focusLog, journal, meals, sleepLog },
        date
      ),
    [activities, workouts, focusLog, journal, meals, sleepLog, date]
  );
  const sum = useMemo(() => daySummary(events), [events]);
  const isToday = date === todayKey();

  const summaryBits = [
    sum.movingMin > 0 && `${fmtMinutes(sum.movingMin)} moving`,
    sum.focusedMin > 0 && `${fmtMinutes(sum.focusedMin)} focused`,
    sum.restMin > 0 && `${fmtMinutes(sum.restMin)} resting`,
    sum.screenMin > 0 && `${fmtMinutes(sum.screenMin)} scrolling`,
  ].filter(Boolean);

  if (compact) {
    if (!events.length) return null;
    return (
      <div className="dstory-chips" aria-label="Logged that day">
        {events.slice(0, 6).map((e) => (
          <span key={e.kind + e.id} className="dstory-chip" style={{ "--cat": e.color }}>
            <span className="dstory-chip-dot" />
            {e.title}
            {e.durationMin > 0 ? ` · ${fmtMinutes(e.durationMin)}` : ""}
          </span>
        ))}
        {events.length > 6 && (
          <span className="dstory-chip more">+{events.length - 6} more</span>
        )}
      </div>
    );
  }

  return (
    <div className="card dstory">
      <div className="card-head">
        <div className="card-title">
          <Icon.Book /> {isToday ? "Today's story" : "That day's story"}
        </div>
        {onLogActivity && (
          <button className="btn ghost sm" onClick={onLogActivity}>
            <Icon.Plus width={13} height={13} /> Log activity
          </button>
        )}
      </div>

      {summaryBits.length > 0 && (
        <div className="dstory-summary">{summaryBits.join(" · ")}</div>
      )}

      {events.length === 0 ? (
        <p className="dp-empty">
          {isToday
            ? "Nothing logged yet. When you finish something — tennis, a game, a chore — log it here and watch the day take shape."
            : "Nothing was logged this day. Days without data are just quiet, not blank."}
        </p>
      ) : (
        <div className="dstory-list">
          {events.map((e) => {
            const Ic = KIND_ICON[e.kind] || KIND_ICON.activity;
            return (
              <div key={e.kind + e.id} className="dstory-row">
                <span className="dstory-time mono">{e.timeLabel || "—"}</span>
                <span className="dstory-ic" style={{ "--cat": e.color }}>
                  <Ic width={13} height={13} />
                </span>
                <span className="dstory-main">
                  <span className="dstory-title">{e.title}</span>
                  {e.meta && <span className="dstory-meta">{e.meta}</span>}
                  {e.note && <span className="dstory-note">{e.note}</span>}
                </span>
                {e.kind === "activity" && onRemoveActivity && (
                  <ConfirmButton
                    className="iconbtn sm dstory-del"
                    title="Delete this log"
                    onConfirm={() => onRemoveActivity(e.id)}
                    requireConfirmation={confirmBeforeDelete}
                    icon={<Icon.Trash width={12} height={12} />}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
