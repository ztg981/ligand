import { useMemo, useRef, useState } from "react";
import { sleepDurationMin, durationLabel, minutesOfDay } from "../lib/sleep.js";
import "./SleepRing.css";

/* SleepRing — a draggable 24-hour dial for the sleep window (the control
   dedicated sleep apps get right). Midnight sits at the top, the arc is the
   time in bed, and there are three ways to move it:

     · drag the moon handle  → lights-out
     · drag the sun handle   → wake
     · drag the arc itself   → slide the whole window, length preserved

   All pointer-based (mouse + touch), snapping to 5 minutes. Purely
   presentational state lives here; every change is reported up as
   ("bed" | "wake" | "both", "HH:MM" | {bed, wake}). The parent keeps the
   plain time inputs alongside for exact entry / accessibility — the ring
   is the fast, visual path, not the only path. */

const SNAP_MIN = 5;

function pad(n) {
  return String(n).padStart(2, "0");
}
function toHHMM(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
/* minutes-of-day → angle in degrees, midnight at top, clockwise. */
function minToAngle(min) {
  return (min / 1440) * 360 - 90;
}
function angleToMin(deg) {
  const norm = (((deg + 90) % 360) + 360) % 360;
  const raw = (norm / 360) * 1440;
  return (Math.round(raw / SNAP_MIN) * SNAP_MIN) % 1440;
}
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

const TICK_LABELS = [
  { min: 0, label: "12AM" },
  { min: 360, label: "6AM" },
  { min: 720, label: "12PM" },
  { min: 1080, label: "6PM" },
];

export default function SleepRing({ bedTime, wakeTime, onChange, size = 250 }) {
  const svgRef = useRef(null);
  // What's being dragged: null | "bed" | "wake" | { grab: minutesOffsetFromBed }
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(null); // mirrors dragRef for styling

  const bedMin = minutesOfDay(bedTime) ?? 23 * 60;
  const wakeMin = minutesOfDay(wakeTime) ?? 7 * 60;
  const span = (wakeMin - bedMin + 1440) % 1440 || 1;

  const c = size / 2;
  const rTrack = c - 26;
  const rLabels = c - 6;

  const geom = useMemo(() => {
    const a0 = minToAngle(bedMin);
    const a1 = minToAngle(wakeMin);
    const [x0, y0] = polar(c, c, rTrack, a0);
    const [x1, y1] = polar(c, c, rTrack, a1);
    const largeArc = span > 720 ? 1 : 0;
    return {
      arc: `M ${x0} ${y0} A ${rTrack} ${rTrack} 0 ${largeArc} 1 ${x1} ${y1}`,
      bed: [x0, y0],
      wake: [x1, y1],
    };
  }, [bedMin, wakeMin, span, c, rTrack]);

  const minutesAt = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * size;
    const y = ((clientY - rect.top) / rect.height) * size;
    return angleToMin((Math.atan2(y - c, x - c) * 180) / Math.PI);
  };

  const beginDrag = (e, what) => {
    e.preventDefault();
    e.stopPropagation();
    if (what === "arc") {
      // Remember where inside the window the user grabbed, so the window
      // slides under the finger instead of jumping.
      const m = minutesAt(e.clientX, e.clientY);
      dragRef.current = { grab: (m - bedMin + 1440) % 1440 };
      setDragging("arc");
    } else {
      dragRef.current = what;
      setDragging(what);
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const m = minutesAt(e.clientX, e.clientY);
    if (d === "bed") {
      if (m !== wakeMin) onChange?.("bed", toHHMM(m));
    } else if (d === "wake") {
      if (m !== bedMin) onChange?.("wake", toHHMM(m));
    } else {
      const newBed = (m - d.grab + 1440) % 1440;
      onChange?.("both", { bed: toHHMM(newBed), wake: toHHMM(newBed + span) });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };

  const durMin = sleepDurationMin(toHHMM(bedMin), toHHMM(wakeMin));

  return (
    <div className={"sleepring" + (dragging ? " dragging" : "")} style={{ width: size }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="slider"
        aria-label={`Sleep window from ${toHHMM(bedMin)} to ${toHHMM(wakeMin)}. Drag the moon for lights-out, the sun for wake.`}
        aria-valuetext={`${toHHMM(bedMin)} to ${toHHMM(wakeMin)}`}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <linearGradient id="sleepring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* hour ticks */}
        {Array.from({ length: 24 }, (_, h) => {
          const a = minToAngle(h * 60);
          const major = h % 6 === 0;
          const [x0, y0] = polar(c, c, rTrack + (major ? 15 : 13), a);
          const [x1, y1] = polar(c, c, rTrack + 19, a);
          return (
            <line
              key={h}
              x1={x0} y1={y0} x2={x1} y2={y1}
              className={"sleepring-tick" + (major ? " major" : "")}
            />
          );
        })}
        {TICK_LABELS.map((t) => {
          const [x, y] = polar(c, c, rLabels, minToAngle(t.min));
          return (
            <text key={t.min} x={x} y={y} className="sleepring-ticklbl"
              textAnchor="middle" dominantBaseline="middle">
              {t.label}
            </text>
          );
        })}

        {/* track + draggable window arc */}
        <circle cx={c} cy={c} r={rTrack} className="sleepring-track" />
        <path
          d={geom.arc}
          className="sleepring-arc"
          stroke="url(#sleepring-grad)"
          onPointerDown={(e) => beginDrag(e, "arc")}
        />

        {/* handles */}
        <g
          className={"sleepring-handle" + (dragging === "bed" ? " active" : "")}
          transform={`translate(${geom.bed[0]}, ${geom.bed[1]})`}
          onPointerDown={(e) => beginDrag(e, "bed")}
        >
          <circle r="15" className="sleepring-handle-bg" />
          <path
            className="sleepring-glyph"
            transform="translate(-6.5,-6.5) scale(0.8)"
            d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"
          />
        </g>
        <g
          className={"sleepring-handle" + (dragging === "wake" ? " active" : "")}
          transform={`translate(${geom.wake[0]}, ${geom.wake[1]})`}
          onPointerDown={(e) => beginDrag(e, "wake")}
        >
          <circle r="15" className="sleepring-handle-bg" />
          <g className="sleepring-glyph sun" transform="scale(0.8)">
            <circle cx="0" cy="0" r="3.2" fill="none" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * 45 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={5.2 * Math.cos(a)} y1={5.2 * Math.sin(a)}
                  x2={7 * Math.cos(a)} y2={7 * Math.sin(a)}
                />
              );
            })}
          </g>
        </g>
      </svg>

      <div className="sleepring-center" aria-hidden="true">
        <span className="sleepring-dur">{durationLabel(durMin)}</span>
        <span className="sleepring-sub">in bed</span>
      </div>
    </div>
  );
}
