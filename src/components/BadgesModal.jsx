import { BADGES } from "../lib/badges.js";
import { Icon } from "./Icons.jsx";

/* The Badges view — all milestones in a grid, earned ones lit up with the
   date, the rest shown as gentle "keep going" placeholders. Opened from the
   avatar menu. */
export default function BadgesModal({ unlocked = [], onClose }) {
  const earnedAt = new Map(unlocked.map((u) => [u.id, u.at]));
  const earnedCount = BADGES.filter((b) => earnedAt.has(b.id)).length;

  const when = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal badges-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="badges-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="badges-head">
          <div>
            <div className="eyebrow">Milestones</div>
            <h2 id="badges-title" className="page-title" style={{ fontSize: 21 }}>
              Badges
            </h2>
            <p className="page-sub" style={{ margin: "4px 0 0" }}>
              {earnedCount} of {BADGES.length} earned — gentle nudges, never pressure.
            </p>
          </div>
          <button type="button" className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>

        <div className="badges-grid">
          {BADGES.map((b) => {
            const at = earnedAt.get(b.id);
            const IconCmp = Icon[b.icon] || Icon.Star;
            return (
              <div key={b.id} className={"badge-card" + (at ? " earned" : "")}>
                <span className="badge-ic">
                  <IconCmp />
                </span>
                <div className="badge-name">{b.name}</div>
                <div className="badge-desc">{b.desc}</div>
                <div className="badge-status">
                  {at ? `Earned ${when(at)}` : "Locked"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
