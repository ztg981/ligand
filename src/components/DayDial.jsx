import { useEffect, useRef, useState } from "react";
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
const R_NUM = R_OUT + 38; // hour numbers — pushed out so they clear the ticks
const R_LABEL = R_OUT + 56;
const SNAP = 15;

// The default (linear, midnight-at-top) minute→angle map. The dial can supply
// a warped/rotated map instead (see angleOf in the component); every geometry
// helper takes an `angleFn` so all of them follow whichever map is active.
const minToAngle = (min) => (min / DAY_MIN) * Math.PI * 2 - Math.PI / 2;

const ptBase = (min, r, angleFn = minToAngle) => {
  const a = angleFn(min);
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

// Annular sector between two minute marks (small angular padding keeps
// neighbouring wedges visually separate). The large-arc flag is derived from
// the actual angular span, so it stays correct when the map is rotated or the
// sleep window compressed (the minute span alone would be wrong then).
function sectorPathBase(startMin, endMin, rIn = R_IN, rOut = R_OUT, padMin = 2, angleFn = minToAngle) {
  const s = startMin + padMin;
  const e = Math.max(s + 1, endMin - padMin);
  const TAU = Math.PI * 2;
  const da = (((angleFn(e) - angleFn(s)) % TAU) + TAU) % TAU;
  const large = da > Math.PI ? 1 : 0;
  const [x1, y1] = ptBase(s, rOut, angleFn);
  const [x2, y2] = ptBase(e, rOut, angleFn);
  const [x3, y3] = ptBase(e, rIn, angleFn);
  const [x4, y4] = ptBase(s, rIn, angleFn);
  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

// A single rounded arc for recorded reality. Planned time remains a filled
// block; real sleep and activities read as light strokes instead of looking
// like another draggable rectangle.
function arcLinePathBase(startMin, endMin, radius, padMin = 3, angleFn = minToAngle) {
  const s = startMin + padMin;
  const e = Math.max(s + 1, endMin - padMin);
  const TAU = Math.PI * 2;
  const da = (((angleFn(e) - angleFn(s)) % TAU) + TAU) % TAU;
  const large = da > Math.PI ? 1 : 0;
  const [x1, y1] = ptBase(s, radius, angleFn);
  const [x2, y2] = ptBase(e, radius, angleFn);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

// Distribute labels on each side so they never overlap (greedy push-down).
function layoutLabelsBase(blocks, angleFn = minToAngle) {
  const items = blocks.map((b) => {
    const mid = (b.start + b.end) / 2;
    const a = angleFn(mid);
    const right = Math.cos(a) >= 0;
    const [ax, ay] = ptBase(mid, R_OUT + 4, angleFn);
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

/* Floating time-range tooltip pinned beside an arc (drag feedback).

   `onRemove` adds an X to the corner of the card. That is here, rather than
   only out on the ring, because the tooltip is the thing your eye is already
   on when a block is selected — it's the only part of the dial that says which
   block you mean, in words. An X sitting on it needs no looking for. */
function RangeTipBase({ from, to, angleFn = minToAngle, onRemove = null, removeLabel = "Remove this block" }) {
  const [s, e] = from <= to ? [from, to] : [to, from];
  if (e - s < 1) return null;
  const mid = (s + e) / 2;
  const a = angleFn(mid);
  const right = Math.cos(a) >= 0;
  const [ax, ay] = ptBase(mid, R_OUT + 26, angleFn);
  /* The card grows to make room for the button rather than the button being
     laid over the text. Sized for the X, the text stays centred in what's LEFT
     of it — otherwise a centred label runs straight under the badge and eats
     its own last characters ("3:00 AI" instead of "3:00 AM"). */
  const PAD = onRemove ? 34 : 0;
  const w = 168 + PAD;
  const x = right ? Math.min(ax, SIZE - w - 6) : Math.max(ax - w, 6);
  const y = Math.max(30, Math.min(ay - 26, SIZE - 60));
  const textMid = x + (w - PAD) / 2;
  // Centred in the reserved strip, clear of the card's rounded corner.
  const cx = x + w - 20;
  const cy = y + 24;
  return (
    <g pointerEvents={onRemove ? "auto" : "none"}>
      <rect x={x} y={y} rx="12" width={w} height="48" className="dial-tip-bg" />
      <text x={textMid} y={y + 20} textAnchor="middle" className="dial-tip-range">
        {minutesToLabel(s)} – {minutesToLabel(e)}
      </text>
      <text x={textMid} y={y + 38} textAnchor="middle" className="dial-tip-dur">
        {fmtDuration(e - s)}
      </text>
      {onRemove && (
        <g
          className="dial-tip-x"
          style={{ cursor: "pointer" }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => { ev.stopPropagation(); onRemove(); }}
        >
          <title>{removeLabel}</title>
          {/* The same button as the scene's hold-still control (.pomo-still):
             a 26px translucent dark circle with a light glyph. Round, not a
             box, and sitting in its own reserved strip so it never covers the
             time it belongs to. */}
          <circle cx={cx} cy={cy} r="13" className="dial-tip-x-bg" />
          <path
            d={`M ${cx - 4} ${cy - 4} L ${cx + 4} ${cy + 4} M ${cx + 4} ${cy - 4} L ${cx - 4} ${cy + 4}`}
            className="dial-tip-x-mark"
          />
        </g>
      )}
    </g>
  );
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Tween a scalar toward `target` on requestAnimationFrame. Rotation passes
// forwardMod:24 so the dial always spins FORWARD to the next orientation
// (18→0 goes 18→24, not a jarring reverse). Respects reduced-motion.
function useTween(target, { duration = 560, forwardMod = 0 } = {}) {
  const [val, setVal] = useState(target);
  const rafRef = useRef(0);
  const fromRef = useRef(target); // last animated value (updated inside the rAF)
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    let to = target;
    if (forwardMod) {
      const d = (((target - from) % forwardMod) + forwardMod) % forwardMod;
      to = from + d;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Skip the animation (jump straight to the value) when it can't or
    // shouldn't run: reduced-motion, a hidden tab (rAF is paused there, which
    // would otherwise leave the dial stuck at the old orientation), or no move.
    const hidden = typeof document !== "undefined" && document.hidden;
    if (reduce || hidden || Math.abs(to - from) < 1e-6) {
      fromRef.current = to;
      setVal(to);
      return undefined;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * easeInOut(t);
      fromRef.current = v;
      setVal(v);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, forwardMod]);
  return val;
}

export default function DayDial({
  date, // YYYY-MM-DD being viewed
  isToday,
  blocks = [],
  actualSegments = [], // slim tracks for real sleep/activities/workouts
  alarms = [], // [{ id, label, minutes }]
  selectedId = null,
  draftRange = null, // { start, end } being composed in the editor — ghost wedge
  textures = true,
  sleepStart = "23:00",
  sleepEnd = "07:00",
  showSleepBand = true,
  onSelect, // (id) => void
  onCreateRange, // (startMin, endMin) => void
  onMove, // (id, newStart, newEnd) => void — drag an existing block
  onRemove, // (id) => void — the X badge on the selected wedge
  onClearDraft, // () => void — the X badge on the draft range card
  readOnly = false, // mobile: display + tap-to-edit only (no drag create/move)
  compact = false, // phone: crop the label gutters, upscale type, no leaders
  rotateHours = 0, // hours added to the top of the dial (0 = midnight top, 12 = noon top)
  compressSleep = false, // squeeze the sleep window so waking hours get more of the ring
}) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // { from, to }
  const [moving, setMoving] = useState(null); // { id, start, end } live move preview
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // ---- animated angle map (rotation + sleep compression) ----------------
  // Both effects are driven by tweening a scalar that feeds `angleOf`, then
  // re-rendering the whole dial each frame. That keeps the hour numbers and
  // block labels perfectly upright throughout the motion (a CSS transform
  // would flip them) and it's cheap for a static SVG. Everything — wedges,
  // ticks, labels, the now-needle, and the pointer→minute inverse used for
  // dragging — routes through this one map, so they can never disagree.
  const animRot = useTween(rotateHours, { forwardMod: 24 });
  const animWarp = useTween(compressSleep ? 1 : 0);

  const sleepS = hhmmToMinutes(sleepStart) ?? 23 * 60;
  const sleepE = hhmmToMinutes(sleepEnd) ?? 7 * 60;
  const rotFrac = ((((animRot % 24) + 24) % 24)) / 24;
  const bf = (((sleepS % DAY_MIN) + DAY_MIN) % DAY_MIN) / DAY_MIN; // bedtime fraction
  const sd = ((((sleepE - sleepS) % DAY_MIN) + DAY_MIN) % DAY_MIN) / DAY_MIN; // sleep fraction
  const canWarp = sd > 0.03 && sd < 0.97;
  // Compressed sleep fraction — never larger than natural (only ever shrinks).
  const cs = sd + (Math.min(sd, 0.11) - sd) * animWarp;

  const warpFwd = (f) => {
    if (!canWarp || animWarp <= 1e-4) return f;
    const d = (((f - bf) % 1) + 1) % 1; // distance from bedtime, linear
    const off = d <= sd ? (d / sd) * cs : cs + ((d - sd) / (1 - sd)) * (1 - cs);
    return (((bf + off) % 1) + 1) % 1;
  };
  const warpInv = (g) => {
    if (!canWarp || animWarp <= 1e-4) return g;
    const e = (((g - bf) % 1) + 1) % 1; // distance from bedtime, warped
    const d = e <= cs ? (e / cs) * sd : sd + ((e - cs) / (1 - cs)) * (1 - sd);
    return (((bf + d) % 1) + 1) % 1;
  };
  const angleOf = (min) => {
    const f = warpFwd(((((min % DAY_MIN) + DAY_MIN) % DAY_MIN)) / DAY_MIN);
    return ((f + rotFrac) % 1) * Math.PI * 2 - Math.PI / 2;
  };
  // Local geometry bound to the active map — these shadow the module helpers so
  // every call site in the render stays unchanged.
  const pt = (min, r) => ptBase(min, r, angleOf);
  const sectorPath = (a, b, c, d, e) => sectorPathBase(a, b, c, d, e, angleOf);
  const actualArcPath = (a, b, r) => arcLinePathBase(a, b, r, 3, angleOf);
  const layoutLabels = (bl) => layoutLabelsBase(bl, angleOf);
  // A tiny render helper (not a component) so the tooltip follows the active
  // angle map without declaring a component during render.
  const rangeTip = (from, to, onRemove = null, removeLabel) => (
    <RangeTipBase
      from={from}
      to={to}
      angleFn={angleOf}
      onRemove={onRemove}
      removeLabel={removeLabel}
    />
  );

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Pointer → minute: invert the display map (undo rotation, then the sleep
  // warp) so dragging lands on the right time no matter the orientation.
  const minuteFromEvent = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const x = (e.clientX - rect.left) * scale - C;
    const y = (e.clientY - rect.top) * scale - C;
    let ang = Math.atan2(y, x) + Math.PI / 2; // 0 at top
    if (ang < 0) ang += Math.PI * 2;
    const disp = ang / (Math.PI * 2); // fraction from top, display space
    const g = (((disp - rotFrac) % 1) + 1) % 1;
    const f = warpInv(g);
    return Math.round((f * DAY_MIN) / SNAP) * SNAP;
  };

  /* Drag empty ring to carve out time.

     The end point is ACCUMULATED from each small movement rather than read
     straight off the pointer. Taken raw, dragging clockwise from 23:00 past
     midnight gives to=30 with from=1380; the two then get swapped into a
     23-hour block covering almost the whole dial — the selection appearing to
     flip around the ring. Accumulating lets us tell "dragged forwards past
     midnight" from "dragged backwards", so the drag can simply carry on
     through 12am and produce an 11pm–1am block (end 1500, i.e. 1am tomorrow —
     see the note in lib/dayPlanner.js). The travel is capped at a full day in
     each direction so a lap of the ring can't fold back on itself. */
  const onBandDown = (e) => {
    e.preventDefault();
    const from = minuteFromEvent(e);
    let prevMin = from;
    let travelled = 0;
    const endpoint = () => from + Math.max(-DAY_MIN, Math.min(DAY_MIN, travelled));
    setDrag({ from, to: from });

    const move = (ev) => {
      const cur = minuteFromEvent(ev);
      let step = cur - prevMin;
      if (step > DAY_MIN / 2) step -= DAY_MIN;
      if (step < -DAY_MIN / 2) step += DAY_MIN;
      prevMin = cur;
      travelled += step;
      setDrag({ from, to: endpoint() });
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const to = endpoint();
      setDrag(null);
      let [s, en] = from <= to ? [from, to] : [to, from];
      // Dragging anticlockwise from just after midnight puts the start before
      // 00:00. Same block, named from the other day: shift both ends forward so
      // the start is a real time on this day and the end runs past midnight.
      if (s < 0) { s += DAY_MIN; en += DAY_MIN; }
      if (en - s >= SNAP) onCreateRange?.(s, en);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Press a wedge: distinguish a click (select) from a drag (move the block).
  // Duration is preserved; the block slides around the ring, snapping to 15
  // min and clamped inside the day. Shortest-path delta handles the midnight
  // wrap so a small drag near 12am doesn't fling the block across the dial.
  const onBlockDown = (e, b) => {
    e.stopPropagation();
    e.preventDefault();
    const downMin = minuteFromEvent(e);
    const dur = b.end - b.start;
    let didMove = false;
    let finalStart = b.start; // tracked outside React state so `up` stays pure
    // Accumulate the drag from the PREVIOUS pointer position, not from where
    // the press started. Measured against a fixed origin, any drag longer than
    // half the dial looks like a midnight wrap, and the shortest-path
    // correction then flung the block to the opposite side of the ring. Each
    // frame's step is small, so the wrap correction is always the right one.
    let prevMin = downMin;
    let travelled = 0;
    const move = (ev) => {
      const cur = minuteFromEvent(ev);
      let step = cur - prevMin;
      if (step > DAY_MIN / 2) step -= DAY_MIN;
      if (step < -DAY_MIN / 2) step += DAY_MIN;
      prevMin = cur;
      travelled += step;
      if (Math.abs(travelled) >= SNAP) didMove = true;
      // Wrap rather than clamp: the ring is a loop, so a block pushed past
      // midnight should come round to the start of the day (with its end
      // running on past 1440) instead of piling up against an invisible wall
      // at 12am. Only the START is normalised — the duration rides along.
      let ns = Math.round((b.start + travelled) / SNAP) * SNAP;
      ns = ((ns % DAY_MIN) + DAY_MIN) % DAY_MIN;
      finalStart = ns;
      setMoving({ id: b.id, start: ns, end: ns + dur });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMoving(null);
      // Commit AFTER clearing the preview, outside any state updater, so this
      // never calls a parent setState mid-render.
      if (didMove && finalStart !== b.start) onMove?.(b.id, finalStart, finalStart + dur);
      else onSelect?.(b.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Render blocks with the live-moved position substituted for the one being
  // dragged, so the wedge follows the pointer.
  const renderBlocks = blocks.map((b) =>
    moving && moving.id === b.id ? { ...b, start: moving.start, end: moving.end } : b
  );

  // Recomputed each render (cheap) so labels reposition live during the
  // rotate / compress animations instead of snapping at the end.
  const labels = layoutLabels(blocks);
  const totalMin = scheduledMinutes(blocks);

  const dateObj = new Date(date + "T00:00:00");
  const weekday = dateObj.toLocaleDateString(undefined, { weekday: "long" });
  const dateScript = dateObj.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  // Compact mode crops the viewBox to just the ring + hour numbers — the
  // desktop layout reserves ~90px side gutters for leader-line labels, which
  // at phone width turn into unreadable specks and make the whole dial look
  // small and lost. The block list below the dial carries the titles instead.
  const crop = C - (R_NUM + 26);
  const viewBox = compact
    ? `${crop} ${crop} ${SIZE - crop * 2} ${SIZE - crop * 2}`
    : `0 0 ${SIZE} ${SIZE}`;

  return (
    <svg
      ref={svgRef}
      className={"dial" + (readOnly ? " dial--ro" : "") + (compact ? " dial--compact" : "")}
      viewBox={viewBox}
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

      {/* invisible drag-create band (under the wedges). Disabled in read-only
          mode so it never intercepts a scroll on the phone. */}
      {!readOnly && (
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
      )}

      {/* drag preview — filled wedge + crisp outline + floating range tip,
          so the portion being selected is unmistakable while dragging */}
      {drag && drag.from !== drag.to && (
        <g pointerEvents="none">
          <path
            d={sectorPath(Math.min(drag.from, drag.to), Math.max(drag.from, drag.to), R_IN, R_OUT, 0)}
            fill="var(--accent)"
            opacity="0.3"
          />
          <path
            d={sectorPath(Math.min(drag.from, drag.to), Math.max(drag.from, drag.to), R_IN, R_OUT, 0)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
          />
          {rangeTip(drag.from, drag.to)}
        </g>
      )}

      {/* editor draft — the range currently in the From/To fields stays
          visible as a dashed ghost wedge and live-updates as times change */}
      {!drag && draftRange && draftRange.end > draftRange.start && (
        <g pointerEvents="none">
          <path
            d={sectorPath(draftRange.start, draftRange.end, R_IN, R_OUT, 0)}
            fill="var(--accent)"
            opacity="0.22"
          />
          <path
            d={sectorPath(draftRange.start, draftRange.end, R_IN, R_OUT, 0)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeDasharray="7 5"
          />
          {/* Selecting a block opens the editor with that block's times, so the
             draft range and the selected block's own card would be identical
             and stack on top of each other. The block's card wins — it's the
             one carrying the remove X. */}
          {/* The X belongs on the draft card too — arguably more here than on
             a saved block. This card is what's on screen while you're picking
             a range, and until now the only way out of a range you didn't want
             was to find the editor and close it. */}
          {!selectedId &&
            rangeTip(draftRange.start, draftRange.end, onClearDraft || null, "Discard this range")}
        </g>
      )}

      {/* block wedges — drag to move, click to edit */}
      {renderBlocks.map((b) => {
        const cat = categoryById(b.category);
        const selected = b.id === selectedId;
        const isMoving = moving?.id === b.id;
        return (
          <g
            key={b.id}
            onPointerDown={readOnly ? undefined : (e) => onBlockDown(e, b)}
            onClick={readOnly ? () => onSelect?.(b.id) : undefined}
            style={{ cursor: "pointer", touchAction: readOnly ? "auto" : "none" }}
            opacity={b.done ? 0.45 : 1}
          >
            <path d={sectorPath(b.start, b.end)} fill={cat.color} opacity={isMoving ? 1 : 0.9} />
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
            {(selected || isMoving) && (
              <>
                <path
                  d={sectorPath(b.start, b.end, R_IN - 5, R_OUT + 5, 1)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                />
                <path d={sectorPath(b.start, b.end)} fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.6" />
              </>
            )}
            {/* The time card stays up for as long as a block is selected, not
                just while it's being dragged — it names the block you picked,
                and it's what carries the remove X. */}
            {(isMoving || (selected && !drag)) &&
              rangeTip(
                b.start,
                b.end,
                !readOnly && onRemove && !isMoving ? () => onRemove(b.id) : null
              )}
          </g>
        );
      })}

      {/* Remove the selected block, on the ring itself.

         This used to be a trash icon in the floating tool stack at the corner
         of the dial — a third identical grey circle next to two dial
         PREFERENCES, nowhere near the thing it acts on, and reported as simply
         not findable. An X pinned to the wedge you just picked has an obvious
         subject. It rides the inner edge (the outer one is crowded with ticks,
         hour numbers and leader lines) and follows the wedge while it's being
         dragged, so it never points at the wrong block. */}
      {!readOnly && onRemove && (() => {
        const sel = renderBlocks.find((b) => b.id === selectedId);
        if (!sel) return null;
        const [bx, by] = pt((sel.start + sel.end) / 2, R_IN - 24);
        return (
          <g
            className="dial-x"
            style={{ cursor: "pointer" }}
            // Stop the press reaching the wedge underneath, which would start
            // a move and swallow the click that follows it.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(sel.id); }}
          >
            <title>{`Remove "${sel.title}"`}</title>
            <circle cx={bx} cy={by} r="16" className="dial-x-bg" />
            <path
              d={`M ${bx - 5.5} ${by - 5.5} L ${bx + 5.5} ${by + 5.5} M ${bx + 5.5} ${by - 5.5} L ${bx - 5.5} ${by + 5.5}`}
              className="dial-x-mark"
            />
          </g>
        );
      })()}

      {/* Reality tracks. They are deliberately drawn after planned wedges:
          inner = actual sleep, outer = things the user actually did. Keeping
          separate lanes makes overlaps honest (e.g. a late-night activity
          inside the usual sleep window) instead of one hiding the other. */}
      {actualSegments.map((segment) => {
        const inner = segment.kind === "sleep";
        const radius = inner ? R_IN + 8 : R_OUT - 8;
        return (
          <g key={segment.id} pointerEvents="none">
            <path
              d={actualArcPath(segment.start, segment.end, radius)}
              fill="none"
              stroke="var(--panel)"
              strokeWidth={inner ? 10 : 11}
              strokeLinecap="round"
              opacity="0.92"
            />
            <path
              d={actualArcPath(segment.start, segment.end, radius)}
              fill="none"
              stroke={segment.color}
              strokeWidth={inner ? 6 : 7}
              strokeLinecap="round"
              opacity="0.98"
            >
              <title>{`${segment.title} · ${minutesToLabel(segment.start)} – ${minutesToLabel(segment.end)}`}</title>
            </path>
          </g>
        );
      })}

      {/* tick ring */}
      {Array.from({ length: 96 }, (_, i) => {
        const min = i * 15;
        const major = i % 4 === 0;
        const [x1, y1] = pt(min, R_TICK);
        const [x2, y2] = pt(min, R_TICK + (major ? 7 : 4));
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

      {/* labels with dotted leaders (desktop only — compact mode relies on
         the block list below the dial) */}
      {!compact && labels.map(({ b, right, ax, ay, y }) => {
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

      {/* center — compact drops the year and spreads the remaining lines so
         the middle doesn't read as cramped at phone scale */}
      <text x={C} y={C - (compact ? 52 : 42)} textAnchor="middle" className="dial-weekday">{weekday.toUpperCase()}</text>
      <text x={C} y={C + (compact ? 12 : 8)} textAnchor="middle" className="dial-date">{dateScript}</text>
      {!compact && (
        <text x={C} y={C + 34} textAnchor="middle" className="dial-year">{dateObj.getFullYear()}</text>
      )}
      <text x={C} y={C + (compact ? 58 : 64)} textAnchor="middle" className="dial-total">
        {totalMin > 0 ? `${fmtDuration(totalMin)} scheduled` : "nothing scheduled yet"}
      </text>
      {isToday && (
        <text x={C} y={C + (compact ? 92 : 84)} textAnchor="middle" className="dial-now">
          now · {minutesToLabel(nowMin)}
        </text>
      )}
    </svg>
  );
}
