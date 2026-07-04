import { daysSince } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";

/* CountUp - "what I'm proud of" day counter.
   Counts UP from a start date and is forgiving: it's just elapsed days,
   so nothing resets and there's nothing to feel bad about. */
export default function CountUp({ countUp, widgetSize = "medium" }) {
  if (!countUp) return null;
  const days = daysSince(countUp.startDate);
  const big = widgetSize === "large" || widgetSize === "tall";
  const compact = widgetSize === "compact";

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Flame /> What I'm proud of
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div
          className="mono"
          style={{
            fontSize: big ? 64 : compact ? 32 : 40,
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          {days}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
          {days === 1 ? "day" : "days"}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{countUp.label}</div>
      {!compact && (
        <div style={{ fontSize: big ? 13 : 11.5, color: "var(--ink-4)", marginTop: big ? 14 : 8 }}>
          Counts up gently. Quiet days never reset it.
        </div>
      )}
    </div>
  );
}
