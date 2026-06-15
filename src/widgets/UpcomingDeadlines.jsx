import { goalTargetDate, isGoalOverdue, todayKey, daysBetween } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";

/* ============================================================
   UpcomingDeadlines — a calm, cross-goal look at what's coming.

   Lists every active goal that has a target date (the SMART
   "time-bound" field, or a legacy deadline), soonest first.
   Overdue goals float to the top with a gentle "Review" chip —
   no harsh red blocks, matching the tone used elsewhere. Goals
   without a target date simply don't appear.

   Used both as a goal-tab widget and as a card on the Home
   dashboard, so it keeps its own <div className="card"> wrapper.
   ============================================================ */

function relativeLabel(dateKey, today) {
  const d = daysBetween(today, dateKey); // +future / -past
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d > 1) return `In ${d} days`;
  if (d === -1) return "Yesterday";
  return `${Math.abs(d)} days ago`;
}

export default function UpcomingDeadlines({ goals = [], onOpenGoal, widgetSize }) {
  const today = todayKey();
  const items = goals
    .filter((g) => g && g.status !== "archived")
    .map((g) => ({ goal: g, date: goalTargetDate(g) }))
    .filter((x) => x.date) // no target date → excluded
    .map((x) => ({ ...x, overdue: isGoalOverdue(x.goal, today) }))
    .sort((a, b) => a.date.localeCompare(b.date)); // soonest first (overdue/past first)

  const limit = widgetSize === "compact" ? 3 : 6;
  const shown = items.slice(0, limit);
  const extra = items.length - shown.length;

  return (
    <div className="card upcoming-card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Calendar /> Upcoming
        </div>
        {items.length > 0 && (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="upcoming-empty">
          Nothing scheduled. Give a goal a target date (its SMART time-bound
          field) and it'll show up here, soonest first.
        </div>
      ) : (
        <div className="upcoming-list">
          {shown.map(({ goal, date, overdue }) => {
            const Tag = onOpenGoal ? "button" : "div";
            return (
              <Tag
                key={goal.id}
                className={"upcoming-row" + (overdue ? " overdue" : "")}
                onClick={onOpenGoal ? () => onOpenGoal(goal.id) : undefined}
                title={`Target date: ${date}`}
              >
                <span
                  className="upcoming-dot"
                  style={{ background: goal.color }}
                />
                <span className="upcoming-name">{goal.name}</span>
                <span className="upcoming-when">
                  {overdue && <span className="chip rose">Review</span>}
                  <span className="upcoming-date mono">
                    {relativeLabel(date, today)}
                  </span>
                </span>
              </Tag>
            );
          })}
          {extra > 0 && (
            <div className="upcoming-more">+{extra} more with dates</div>
          )}
        </div>
      )}
    </div>
  );
}
