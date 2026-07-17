import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { categoryById, fmtDuration, minutesToLabel } from "../lib/dayPlanner.js";

/* MobileDayTimeline — the phone's Day view.

   The radial dial is a desktop instrument: gorgeous with a pointer, cramped
   and undraggable under a thumb. Phones get what a thumb actually wants: a
   clean vertical agenda. Each block is a colored card in time order, free
   gaps are one tap to fill, a warm line marks "now", and tapping any card
   opens the same editor sheet. iPad and desktop keep the dial.

   Pure presentation — the parent owns all data and the editor. */

const MIN_GAP_MIN = 30; // gaps shorter than this aren't worth a button

export default function MobileDayTimeline({
  blocks = [], // today's, sorted by start
  isToday = false,
  onEdit, // (blockId) => void
  onAddRange, // (startMin, endMin) => void — prefilled editor
  onToggleDone, // (block) => void
}) {
  // Re-render each minute so the now-line stays honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Interleave blocks, tappable gaps, and the now marker into one list.
  const rows = useMemo(() => {
    const out = [];
    const dayStart = Math.min(7 * 60, blocks[0]?.start ?? 7 * 60);
    const dayEnd = Math.max(22 * 60, blocks.at(-1)?.end ?? 22 * 60);
    let cursor = dayStart;
    const pushNow = (upTo) => {
      if (isToday && nowMin >= cursor - 1 && nowMin < upTo) {
        out.push({ kind: "now", at: nowMin });
      }
    };
    for (const b of blocks) {
      if (b.start - cursor >= MIN_GAP_MIN) {
        pushNow(Math.min(b.start, nowMin + 1));
        out.push({ kind: "gap", start: cursor, end: b.start });
      } else {
        pushNow(b.start);
      }
      out.push({ kind: "block", block: b });
      cursor = Math.max(cursor, b.end);
    }
    if (dayEnd - cursor >= MIN_GAP_MIN) {
      pushNow(Math.min(dayEnd, nowMin + 1));
      out.push({ kind: "gap", start: cursor, end: dayEnd });
    } else {
      pushNow(dayEnd + 1);
    }
    return out;
  }, [blocks, isToday, nowMin]);

  if (!blocks.length) {
    return (
      <div className="mdt-empty">
        <p className="dp-empty" style={{ marginBottom: 10 }}>
          Nothing planned yet. Give the day one anchor and build around it.
        </p>
        <button
          className="btn primary"
          style={{ width: "100%" }}
          onClick={() => onAddRange(Math.max(9 * 60, nowMin), Math.max(10 * 60, nowMin + 60))}
        >
          <Icon.Plus width={14} height={14} /> Plan something
        </button>
      </div>
    );
  }

  return (
    <div className="mdt" role="list">
      {rows.map((row, i) => {
        if (row.kind === "now") {
          return (
            <div key={"now" + i} className="mdt-now" aria-label={`Now, ${minutesToLabel(row.at)}`}>
              <span className="mdt-now-time mono">{minutesToLabel(row.at)}</span>
              <span className="mdt-now-line" />
            </div>
          );
        }
        if (row.kind === "gap") {
          return (
            <button
              key={"gap" + i}
              type="button"
              className="mdt-gap"
              onClick={() => onAddRange(row.start, Math.min(row.end, row.start + 60))}
            >
              <span className="mdt-gap-time mono">
                {minutesToLabel(row.start)} – {minutesToLabel(row.end)}
              </span>
              <span className="mdt-gap-lbl">
                <Icon.Plus width={11} height={11} /> {fmtDuration(row.end - row.start)} free
              </span>
            </button>
          );
        }
        const b = row.block;
        const cat = categoryById(b.category);
        const past = isToday && b.end <= nowMin;
        const current = isToday && b.start <= nowMin && nowMin < b.end;
        return (
          <div
            key={b.id}
            role="listitem"
            className={
              "mdt-block" +
              (b.done ? " done" : "") +
              (past ? " past" : "") +
              (current ? " current" : "")
            }
            style={{ "--cat": cat.color }}
          >
            <button
              type="button"
              className={"mdt-check" + (b.done ? " on" : "")}
              aria-pressed={b.done}
              title={b.done ? "Mark not done" : "Mark done"}
              onClick={() => onToggleDone(b)}
            >
              {b.done && <Icon.Check width={13} height={13} />}
            </button>
            <button type="button" className="mdt-block-main" onClick={() => onEdit(b.id)}>
              <span className="mdt-block-title">
                {b.title}
                {b.protected && <span title="Protected"> 🔒</span>}
                {b.seriesId && (
                  <span className="mdt-block-repeat" title="Repeats">
                    <Icon.Reset width={10} height={10} />
                  </span>
                )}
              </span>
              <span className="mdt-block-time mono">
                {minutesToLabel(b.start)} – {minutesToLabel(b.end)} · {fmtDuration(b.end - b.start)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
