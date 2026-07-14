import { useMemo } from "react";
import { Icon } from "../components/Icons.jsx";
import { nearestBadges, remainingLabel } from "../lib/badgeProgress.js";

/* NextBadge — "almost there": the one or two badges the user is closest
   to earning, with real progress bars (goal-gradient effect — a near,
   visible finish line pulls harder than an abstract someday-reward; see
   badgeProgress.js). Renders nothing when there's no meaningful progress
   to show, so it never nags a brand-new or fully-decorated user. */

export default function NextBadge({ badgeStats, unlockedIds = [], onOpenBadges }) {
  const rows = useMemo(
    () => nearestBadges(badgeStats, unlockedIds, 2),
    [badgeStats, unlockedIds]
  );

  if (!rows.length) return null;

  return (
    <div className="card nextbadge-card">
      <div className="card-head">
        <div className="card-title"><Icon.Trophy /> Almost there</div>
        {onOpenBadges && (
          <button className="btn ghost sm" onClick={onOpenBadges} title="See all badges">
            All badges <Icon.Arrow width={13} height={13} />
          </button>
        )}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        {rows.map((row) => {
          const BadgeIcon = Icon[row.badge.icon] || Icon.Star;
          const pct = Math.round(row.pct * 100);
          return (
            <div className="nextbadge-row" key={row.badge.id}>
              <span className="nextbadge-ic"><BadgeIcon width={16} height={16} /></span>
              <div className="nextbadge-body">
                <div className="nextbadge-top">
                  <span className="nextbadge-name">{row.badge.name}</span>
                  <span className="nextbadge-remaining">{remainingLabel(row)}</span>
                </div>
                <div
                  className="nextbadge-track"
                  role="progressbar"
                  aria-valuenow={row.now}
                  aria-valuemin={0}
                  aria-valuemax={row.target}
                  aria-label={`${row.badge.name}: ${row.now} of ${row.target}`}
                >
                  <span className="nextbadge-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="nextbadge-req">{row.badge.req}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
