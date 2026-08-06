import { useState } from "react";
import { Icon } from "./Icons.jsx";
import {
  countUpHistory,
  countUpProgress,
  lastLiveCountUpEvent,
  readCountUpMetric,
} from "../lib/countUpGoal.js";

/* The count-up control for a count-up goal.

   Core to the goal rather than a widget: without it the goal cannot be
   updated at all, so it sits under the header and isn't removable. It reads
   the derived value, never a stored total.

   With no target there is deliberately no bar and no percentage — an
   open-ended count says how many, not how far. */

function relTime(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.valueOf())) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CountUpControl({ goal, onAdjust, onUndo, onEditMetric }) {
  const metric = readCountUpMetric(goal);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  if (!metric) return null;

  const progress = countUpProgress(goal);
  const history = countUpHistory(goal, 10);
  const canUndo = Boolean(lastLiveCountUpEvent(goal));
  const step = metric.step;
  const atFloor = metric.min !== null && progress.value <= metric.min;

  const adjust = (delta, adjustNote = "") => {
    if (!delta) return;
    // A fresh id per press: the same tap replayed by a retry or a sync lands
    // once, but two real presses are two events.
    onAdjust?.(goal.id, { delta, note: adjustNote });
  };

  const applyCustom = () => {
    const delta = Math.round(Number(custom));
    if (!Number.isFinite(delta) || delta === 0) return;
    adjust(delta, note.trim());
    setCustom("");
    setNote("");
  };

  return (
    <section className="countup" aria-labelledby="countup-title">
      <div className="countup-main">
        <div className="countup-readout">
          <div className="eyebrow" id="countup-title">
            {metric.name}
          </div>
          <div className="countup-value">
            <strong aria-live="polite">{progress.value}</strong>
            {progress.target !== null && (
              <span className="countup-target">/ {progress.target}</span>
            )}
            {metric.unit && <span className="countup-unit">{metric.unit}</span>}
          </div>
          {progress.openEnded ? (
            <button type="button" className="btn ghost sm" onClick={onEditMetric}>
              Set a target
            </button>
          ) : (
            <div
              className="countup-bar"
              role="progressbar"
              aria-valuenow={progress.value}
              aria-valuemin={metric.start}
              aria-valuemax={progress.target}
            >
              <span style={{ width: `${progress.fraction * 100}%` }} />
            </div>
          )}
        </div>

        <div className="countup-buttons">
          <button
            type="button"
            className="btn ghost countup-step"
            onClick={() => adjust(-step)}
            disabled={atFloor}
            aria-label={`Subtract ${step} ${metric.name}`}
          >
            <Icon.Minus />
          </button>
          <button
            type="button"
            className="btn primary countup-step"
            onClick={() => adjust(step)}
            aria-label={`Add ${step} ${metric.name}`}
          >
            <Icon.Plus />
          </button>
        </div>
      </div>

      <div className="countup-more">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <input
            className="input countup-custom"
            type="number"
            placeholder="+/-"
            value={custom}
            aria-label={`Custom adjustment for ${metric.name}`}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
          />
          <input
            className="input countup-note"
            placeholder="Note (optional)"
            value={note}
            aria-label="Note for this adjustment"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
          />
          <button type="button" className="btn ghost sm" onClick={applyCustom}>
            Apply
          </button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => onUndo?.(goal.id)}
            disabled={!canUndo}
          >
            <Icon.Reset /> Undo
          </button>
          {history.length > 0 && (
            <button
              type="button"
              className="btn ghost sm"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((open) => !open)}
            >
              History
            </button>
          )}
          {onEditMetric && (
            <button type="button" className="iconbtn sm" title="Edit metric" onClick={onEditMetric}>
              <Icon.Gear />
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <ul className="countup-history">
          {history.map((event) => (
            <li key={event.id} className={event.reversedAt ? "is-reversed" : ""}>
              <span className="countup-history-delta">
                {event.delta > 0 ? `+${event.delta}` : event.delta}
              </span>
              <span className="countup-history-note">{event.note || metric.name}</span>
              <span className="countup-history-at">
                {event.reversedAt ? "undone" : relTime(event.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
