import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { SCIENCE_STATS, dailyStatIndex } from "../lib/scienceStats.js";

/* DidYouKnow — a soft "Did you know?" card on the dashboard.
   Shows one science-backed stat, rotating once per calendar day. A
   subtle arrow lets the curious browse the rest manually without
   changing what tomorrow shows. */
export default function DidYouKnow() {
  // The day's starting stat (stable for the whole day).
  const base = useMemo(() => dailyStatIndex(), []);
  // Manual browsing offset — does not affect the daily rotation.
  const [offset, setOffset] = useState(0);

  const idx = (base + offset) % SCIENCE_STATS.length;
  const stat = SCIENCE_STATS[idx];

  return (
    <div className="card dyk-card">
      <div className="dyk-head">
        <span className="dyk-ic">
          <Icon.Spark />
        </span>
        <span className="dyk-label">Did you know?</span>
        <button
          className="dyk-next"
          onClick={() => setOffset((o) => o + 1)}
          title="Show me another"
          aria-label="Show another fact"
        >
          <Icon.Arrow />
        </button>
      </div>
      <p className="dyk-text">{stat}</p>
    </div>
  );
}
