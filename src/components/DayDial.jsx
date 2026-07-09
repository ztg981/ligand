import { useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_MIN,
  categoryById,
  minutesToLabel,
  scheduledMinutes,
  fmtDuration,
  hhmmToMinutes,
} from "../lib/dayPlanner.js";

/* DayDial — the large interactive 24-hour dial at the heart of the Day tab.

   Visual language (inspired by radial day-planner patterns; built from
   Ligand's own tokens): a fine tick ring, textured category wedges,
   hand-written center date, dotted leader lines out to block labels, a
   warm current-time needle. All geometry is pure SVG — no canvas, no
   animation loops; reduced-motion needs nothing special.

   Interactions:
   - drag on empty ring → create a block over that range (15-min snap)
   - click a wedge → select it (parent opens the editor)
   - everything is mirrored in the side list for keyboard/screen-reader use */

const SIZE = 760;
const C = SIZE / 2;
const R_OUT = 292;
const R_IN = 224;
const R_TICK = R_OUT + 10;
const R_NUM = R_OUT + 30;
const R_LABEL = R_OUT + 56;
const SNAP = 15;

const minToAngle = (min) => (min / DAY_MIN) * Math.PI * 2 - Math.PI / 2;
const pt = (min, r) => {
  const a = minToAngle(min);
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

// Annular sector between two minute marks (small angular padding keeps
// neighbouring wedges visually separate).
function sectorPath(startMin, endMin, rIn = R_IN, rOut = R_OUT, padMin = 2) {
  const s = startMin + padMin;
  const e = Math.max(s + 1, endMin - padMin);
  const large = e - s > DAY_MIN / 2 ? 1 : 0;
  const [x1, y1] = pt(s, rOut);
  const [x2, y2] = pt(e, rOut);
  const [x3, y3] = pt(e, rIn);
  const [x4, y4] = pt(s, rIn);
  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

// Distribute labels on each side so they never overlap (greedy push-down).
function layoutLabels(blocks) {
  const items = blocks.map((b) => {
    const mid = (b.start + b.end) / 2;
    const a = minToAngle(mid);
    const right = Math.cos(a) >= 0;
    const [ax, ay] = pt(mid, R_OUT + 4);
    return { b, mid, right, ax, ay, y: C + R_LABEL * Math.sin(a) };
  });
  for (const side of [true, false]) {
    const col = items.filter((i) => i.right === side).sort((p, q) => p.y - q.y);
    for (let i = 1; i < col.length; i++) {
      if (col[i].y - col[i - 1].y < 34) col[i].y = col[i - 1].y + 34;
    }
  }
  return items;
}

export default function DayDial({
  date, // YYYY-MM-DD being viewed
  isToday,
  blocks = [],
  alarms = [], // [{ id, label, minutes }]
  selectedId = null,
  textures = true,
  sleepStart = "23:00",
  sleepEnd = "07:00",
  showSleepBand = true,
  onSelect, // (id) => void
  onCreateRange, // (startMin, endMin) => void
}) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // { from, to }
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const minuteFromEvent = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const x = (e.clientX - rect.left) * scale - C;
    const y = (e.clientY - rect.top) * scale - C;
    let ang = Math.atan2(y, x) + Math.PI / 2; // 0 at top
    if (ang < 0) ang += Math.PI * 2;
    return Math.round(((ang / (Math.PI * 2)) * DAY_MIN) / SNAP) * SNAP;
  };

  const onBandDown = (e) => {
    e.preventDefault();
    const from = minuteFromEvent(e);
    setDrag({ from, to: from });
    const move = (ev) => setDrag({ from, to: minuteFromEvent(ev) });
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const to = minuteFromEvent(ev);
      setDrag(null);
      const [s, en] = from <= to ? [from, to] : [to, from];
      if (en - s >= SNAP) onCreateRange?.(s, Math.min(en, DAY_MIN));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const labels = useMemo(() => layoutLabels(blocks), [blocks]);
  const totalMin = scheduledMinutes(blocks);

  const dateObj = new Date(date + "T00:00:00");
  const weekday = dateObj.toLocaleDateString(undefined, { weekday: "long" });
  const dateScript = dateObj.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const sleepS = hhmmToMinutes(sleepStart) ?? 23 * 60;
  const sleepE = hhmmToMinutes(sleepEnd) ?? 7 * 60;

  return (
    <svg
      ref={svgRef}
      className="dial"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`${weekday} ${dateScript}: ${blocks.length} blocks, ${fmtDuration(totalMin)} scheduled`}
    >
      <defs>
        <pattern id="dp-waves" width="14" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4 Q 3.5 0, 7 4 T 14 4" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" />
        </pattern>
        <pattern id="dp-stripes" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" />
        </pattern>
        <pattern id="dp-dots" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.55)" />
        </pattern>
        <pattern id="dp-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
        </pattern>
      </defs>

      {/* base band */}
      <circle cx={C} cy={C} r={(R_OUT + R_IN) / 2} fill="none" stroke="var(--panel-2)" strokeWidth={R_OUT - R_IN} />
      <circle cx={C} cy={C} r={R_OUT} fill="none" stroke="var(--line)" strokeWidth="1" />
      <circle cx={C} cy={C} r={R_IN} fill="none" stroke="var(--line)" strokeWidth="1" />

      {/* sleep band (can wrap midnight) */}
      {showSleepBand &&
        (sleepS < sleepE ? (
          <path d={sectorPath(sleepS, sleepE, R_IN, R_OUT, 0)} fill="var(--panel-3)" opacity="0.7" />
        ) : (
          <>
            <path d={sectorPath(sleepS, DAY_MIN, R_IN, R_OUT, 0)} fill="var(--panel-3)" opacity="0.7" />
            <path d={sectorPath(0, sleepE, R_IN, R_OUT, 0)} fill="var(--panel-3)" opacity="0.7" />
          </>
        ))}
      {showSleepBand && textures && (
        <>
          {sleepS < sleepE ? (
            <path d={sectorPath(sleepS, sleepE, R_IN, R_OUT, 0)} fill="url(#dp-waves)" opacity="0.25" />
          ) : (
            <>
              <path d={sectorPath(sleepS, DAY_MIN, R_IN, R_OUT, 0)} fill="url(#dp-waves)" opacity="0.25" />
              <path d={sectorPath(0, sleepE, R_IN, R_OUT, 0)} fill="url(#dp-waves)" opacity="0.25" />
            </>
          )}
        </>
      )}

      {/* invisible drag-create band (under the wedges) */}
      <circle
        cx={C}
        cy={C}
        r={(R_OUT + R_IN) / 2}
        fill="none"
        stroke="transparent"
        strokeWidth={R_OUT - R_IN}
        style={{ cursor: "crosshair" }}
        onPointerDown={onBandDown}
      />

      {/* drag preview */}
      {drag && drag.from !== drag.to && (
        <path
          d={sectorPath(Math.min(drag.from, drag.to), Math.max(drag.from, drag.to), R_IN, R_OUT, 0)}
          fill="var(--accent)"
          opacity="0.35"
          pointerEvents="none"
        />
      )}

      {/* block wedges */}
      {blocks.map((b) => {
        const cat = categoryById(b.category);
        const selected = b.id === selectedId;
        return (
          <g
            key={b.id}
            onClick={() => onSelect?.(b.id)}
            style={{ cursor: "pointer" }}
            opacity={b.done ? 0.45 : 1}
          >
            <path d={sectorPath(b.start, b.end)} fill={cat.color} opacity="0.9" />
            {textures && cat.pattern && (
              <path d={sectorPath(b.start, b.end)} fill={`url(#dp-${cat.pattern})`} />
            )}
            {b.protected && (
              <path
                d={sectorPath(b.start, b.end)}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="1.6"
                strokeDasharray="5 4"
                opacity="0.8"
              />
            )}
            {selected && (
              <path d={sectorPath(b.start, b.end)} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
            )}
          </g>
        );
      })}

      {/* tick ring */}
      {Array.from({ length: 96 }, (_, i) => {
        const min = i * 15;
        const major = i % 4 === 0;
        const [x1, y1] = pt(min, R_TICK);
        const [x2, y2] = pt(min, R_TICK + (major ? 10 : 5));
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={major ? "var(--ink-3)" : "var(--ink-4)"}
            strokeWidth={major ? 1.5 : 1}
            opacity={major ? 0.8 : 0.5}
          />
        );
      })}
      {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
        const [x, y] = pt(h * 60, R_NUM);
        const lbl = h === 0 ? "12 am" : h === 12 ? "12 pm" : h < 12 ? `${h} am` : `${h - 12} pm`;
        return (
          <text key={h} x={x} y={y + 4} textAnchor="middle" className="dial-hour">
            {lbl}
          </text>
        );
      })}

      {/* alarms */}
      {alarms.map((a) => {
        const [x, y] = pt(a.minutes, R_OUT + 8);
        return (
          <g key={a.id}>
            <circle cx={x} cy={y} r="5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5">
              <title>{`${a.label} · ${minutesToLabel(a.minutes)}`}</title>
            </circle>
          </g>
        );
      })}

      {/* labels with dotted leaders */}
      {labels.map(({ b, right, ax, ay, y }) => {
        const lx = right ? C + R_LABEL : C - R_LABEL;
        const cat = categoryById(b.category);
        return (
          <g key={b.id} onClick={() => onSelect?.(b.id)} style={{ cursor: "pointer" }}>
            <polyline
              points={`${ax},${ay} ${lx + (right ? -8 : 8)},${y}`}
              fill="none"
              stroke="var(--ink-4)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <circle cx={lx + (right ? -2 : 2)} cy={y} r="3" fill={cat.color} />
            <text x={lx + (right ? 8 : -8)} y={y - 2} textAnchor={right ? "start" : "end"} className="dial-lbl">
              {b.done ? "✓ " : ""}{b.title}{b.protected ? " ·🔒" : ""}
            </text>
            <text x={lx + (right ? 8 : -8)} y={y + 12} textAnchor={right ? "start" : "end"} className="dial-lbl-time">
              {minutesToLabel(b.start)} – {minutesToLabel(b.end)}
            </text>
          </g>
        );
      })}

      {/* current time needle */}
      {isToday && (
        <g pointerEvents="none">
          {(() => {
            const [x1, y1] = pt(nowMin, R_IN - 16);
            const [x2, y2] = pt(nowMin, R_OUT + 6);
            return (
              <>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="oklch(0.62 0.19 25)" strokeWidth="2" />
                <circle cx={x2} cy={y2} r="4.5" fill="oklch(0.62 0.19 25)" />
              </>
            );
          })()}
        </g>
      )}

      {/* center */}
      <text x={C} y={C - 42} textAnchor="middle" className="dial-weekday">{weekday.toUpperCase()}</text>
      <text x={C} y={C + 8} textAnchor="middle" className="dial-date">{dateScript}</text>
      <text x={C} y={C + 34} textAnchor="middle" className="dial-year">{dateObj.getFullYear()}</text>
      <text x={C} y={C + 64} textAnchor="middle" className="dial-total">
        {totalMin > 0 ? `${fmtDuration(totalMin)} scheduled` : "nothing scheduled yet"}
      </text>
      {isToday && (
        <text x={C} y={C + 84} textAnchor="middle" className="dial-now">
          now · {minutesToLabel(nowMin)}
        </text>
      )}
    </svg>
  );
}
