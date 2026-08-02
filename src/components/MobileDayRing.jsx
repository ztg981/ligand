import { useEffect, useState } from "react";
import { DAY_MIN, categoryById, fmtDuration, scheduledMinutes } from "../lib/dayPlanner.js";

/* MobileDayRing — the shape of the day, at a glance, on a phone.

   Not the desktop dial shrunk down. That instrument is built for a pointer:
   ticks every fifteen minutes, hour numbers, dotted leader lines out to block
   labels, drag-to-create. All of it turns to noise at 200px and none of it can
   be driven by a thumb.

   What survives the shrink is the one thing the dial is actually FOR — seeing
   at a glance how full the day is and where the gaps are. So this is the ring
   and nothing else: coloured arcs for the blocks, a dot for now, and the total
   in the middle. No ticks, no numbers, no labels. The agenda list underneath
   carries every detail, and that's the part a thumb is good at.

   Tapping an arc opens that block. Pure presentation — the parent owns the
   data and the editor. */

const SIZE = 200;
const C = SIZE / 2;
const R = 78; // ring radius (the stroke straddles it)
const TRACK = 13;

/** Minute of the day → a point on the ring. Midnight at the top. */
function pointAt(min, radius) {
  const a = ((((min % DAY_MIN) + DAY_MIN) % DAY_MIN) / DAY_MIN) * Math.PI * 2 - Math.PI / 2;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

/* An arc from one minute to another.

   The sweep is taken from the actual minute span, not from the two endpoints:
   a block that runs past midnight has an end beyond 1440 (11pm–1am is
   1380 → 1500), and the endpoints alone would describe it as the 22 hours the
   long way round. */
function arcPath(startMin, endMin, radius) {
  const span = Math.max(1, Math.min(DAY_MIN, endMin - startMin));
  const [x1, y1] = pointAt(startMin, radius);
  // A full-day block would land exactly back on its start, which SVG draws as
  // nothing at all; stop a minute short so it reads as a closed ring.
  const [x2, y2] = pointAt(startMin + (span >= DAY_MIN ? DAY_MIN - 1 : span), radius);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${span > DAY_MIN / 2 ? 1 : 0} 1 ${x2} ${y2}`;
}

export default function MobileDayRing({
  blocks = [],
  isToday = false,
  onSelect,
  selectedId = null,
}) {
  // Re-render each minute so the now-dot stays honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const total = scheduledMinutes(blocks);
  const [nx, ny] = pointAt(nowMin, R);

  // What's on right now, or the next thing — the one line worth the middle.
  const current = isToday && blocks.find((b) => b.start <= nowMin && nowMin < b.end);
  const next = isToday && !current && blocks.find((b) => b.start > nowMin);

  return (
    <div className="mdr">
      <svg
        className="mdr-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          total > 0
            ? `${fmtDuration(total)} scheduled across ${blocks.length} block${blocks.length === 1 ? "" : "s"}`
            : "Nothing scheduled today"
        }
      >
        {/* The empty day. */}
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="var(--panel-3)"
          strokeWidth={TRACK}
        />

        {blocks.map((b) => {
          const cat = categoryById(b.category);
          const selected = b.id === selectedId;
          return (
            <path
              key={b.id}
              d={arcPath(b.start, b.end, R)}
              fill="none"
              stroke={cat.color}
              strokeWidth={selected ? TRACK + 4 : TRACK}
              strokeLinecap="round"
              opacity={b.done ? 0.4 : 1}
              className="mdr-arc"
              onClick={() => onSelect?.(b.id)}
            >
              <title>{b.title}</title>
            </path>
          );
        })}

        {/* Now. A dot, not a needle — a needle across a bare ring reads as a
            gauge pointing at a value, which this isn't. */}
        {isToday && (
          <>
            <circle cx={nx} cy={ny} r="6" fill="var(--panel)" />
            <circle cx={nx} cy={ny} r="3.5" fill="oklch(0.62 0.19 25)" />
          </>
        )}

        <text x={C} y={C - 4} textAnchor="middle" className="mdr-total">
          {total > 0 ? fmtDuration(total) : "Free"}
        </text>
        <text x={C} y={C + 14} textAnchor="middle" className="mdr-sub">
          {total > 0 ? "planned" : "nothing planned"}
        </text>
      </svg>

      {/* One line of context, below the ring rather than crowded inside it. */}
      {(current || next) && (
        <button
          type="button"
          className="mdr-now"
          onClick={() => onSelect?.((current || next).id)}
        >
          <span
            className="mdr-now-dot"
            style={{ background: categoryById((current || next).category).color }}
          />
          <span className="mdr-now-label">
            {current ? "Now" : "Next"} · {(current || next).title}
          </span>
        </button>
      )}
    </div>
  );
}
