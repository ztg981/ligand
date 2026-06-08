import { Icon } from "../components/Icons.jsx";

/* EncouragingMsg — a warm line from the placeholder AI (src/lib/ai.js).
   Purely supportive; never a nag. */
export default function EncouragingMsg({ message, sub }) {
  return (
    <div className="card" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <span
          style={{
            flex: "none",
            width: 26,
            height: 26,
            borderRadius: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--panel)",
            color: "var(--accent-ink)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <Icon.Heart />
        </span>
        <div>
          <div style={{ fontSize: 13.5, color: "var(--accent-ink)", fontWeight: 500, lineHeight: 1.4 }}>
            {message}
          </div>
          {sub && (
            <div style={{ fontSize: 11.5, color: "var(--accent-ink)", opacity: 0.75, marginTop: 4 }}>
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
