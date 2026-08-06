import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { MILESTONE_STATUS, goalTimeline, milestoneSummary } from "../lib/milestones.js";

/* The goal timeline.

   Deliberately NOT a dashboard widget: it has no .card, no edit bar, no
   resize handle, and it never appears in Add Widget. It runs full width
   between the goal header and the widget grid — a roadmap across the top of
   the goal, which is a different kind of thing from the cards below it.

   Desktop lays the milestones along a horizontal rail. Under 720px the same
   list becomes vertical, in the same order, with the rail down the left.

   Status is never carried by colour alone: reached milestones get a tick,
   the current one a ringed marker, and every marker states its progress in
   words underneath. */

function markerFor(milestone) {
  if (milestone.reached) return <Icon.Check />;
  if (milestone.status === MILESTONE_STATUS.IN_PROGRESS) return <span className="gt-dot" />;
  return null;
}

function progressLabel(milestone) {
  if (milestone.reached) {
    const on = milestone.reachedAt
      ? new Date(milestone.reachedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
    return on ? `Reached ${on}` : "Reached";
  }
  if (milestone.automatic && milestone.target > 0) {
    return `${milestone.current} / ${milestone.target}`;
  }
  if (milestone.targetDate) return milestone.targetDate;
  return "Not yet";
}

export default function GoalTimeline({
  goal,
  tasks = [],
  workouts = [],
  onEdit,
  onComplete,
  onUndoComplete,
  onClaimReward,
}) {
  const [openId, setOpenId] = useState(null);
  const context = { tasks, workouts };
  const timeline = goalTimeline(goal, context);
  const summary = milestoneSummary(goal, context);
  if (!timeline.length) return null;

  const open = timeline.find((milestone) => milestone.id === openId) || null;
  const nextId = summary.next?.id || null;

  return (
    <section className="goal-timeline" aria-label="Goal timeline">
      <header className="gt-head">
        <div className="eyebrow">Timeline</div>
        <div className="gt-count">
          {summary.reached} of {summary.total}
        </div>
        {onEdit && (
          <button type="button" className="btn ghost sm gt-edit" onClick={onEdit}>
            <Icon.Pencil width={12} height={12} /> Edit
          </button>
        )}
      </header>

      <ol className="gt-rail">
        {timeline.map((milestone) => {
          const isNext = milestone.id === nextId;
          return (
            <li
              key={milestone.id}
              className={[
                "gt-node",
                milestone.reached && "is-reached",
                isNext && "is-next",
                milestone.overdue && "is-overdue",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="gt-node-btn"
                aria-expanded={open?.id === milestone.id}
                // Spelled out for screen readers; the visual version is split
                // across the marker and the two lines of text.
                aria-label={`${milestone.title}. ${progressLabel(milestone)}${
                  milestone.overdue ? ". Past its date" : ""
                }`}
                onClick={() => setOpenId(open?.id === milestone.id ? null : milestone.id)}
              >
                <span className="gt-marker" aria-hidden="true">
                  {markerFor(milestone)}
                </span>
                <span className="gt-title">{milestone.title}</span>
                <span className="gt-meta">{progressLabel(milestone)}</span>
                {milestone.rewardUnlocked && !milestone.rewardClaimed && (
                  <span className="gt-reward-flag">
                    <Icon.Star width={10} height={10} /> Reward
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {open && (
        <div className="gt-detail">
          <div className="gt-detail-main">
            <strong>{open.title}</strong>
            {open.description && <p className="gt-detail-desc">{open.description}</p>}
            <span className="gt-detail-meta">
              {progressLabel(open)}
              {open.targetDate && !open.reached && ` · due ${open.targetDate}`}
              {open.automatic ? " · updates itself" : " · marked by you"}
            </span>
          </div>

          <div className="gt-detail-actions">
            {!open.automatic &&
              (open.reached ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => onUndoComplete?.(goal.id, open.id)}
                >
                  Undo
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => onComplete?.(goal.id, open.id)}
                >
                  <Icon.Check /> Mark reached
                </button>
              ))}
          </div>

          {open.rewardUnlocked && (
            <div className="gt-reward">
              <span className="gt-reward-ic" aria-hidden="true">
                <Icon.Star />
              </span>
              <div className="gt-reward-text">
                <strong>{open.rewardClaimed ? "Reward claimed" : "Reward unlocked"}</strong>
                <span>
                  {open.reward.title}
                  {open.reward.budget != null && ` · up to ${open.reward.budget} ${open.reward.currency}`}
                </span>
              </div>
              {!open.rewardClaimed && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => onClaimReward?.(goal.id, open.id)}
                >
                  Claim
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
