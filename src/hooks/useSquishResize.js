import { useCallback, useEffect, useRef, useState } from "react";

/* useSquishResize — drag either edge of a panel outward to give it more room.

   The panel sits centred with empty space either side. Each edge moves on its
   own: pulling the right one right extends the panel rightward, pulling the
   left one left extends it leftward, and doing one never undoes the other. Two
   independent numbers, not one number with a side attached — that earlier
   model is exactly why stretching left collapsed the right.

   Nothing is SCALED. The panel gets wider; the timer and ring inside it stay
   the size they were. Squashing the box with a transform distorted everything
   in it, which read as the whole scene wobbling rather than a box being
   resized.

   ── geometry ─────────────────────────────────────────────────────────────
   `left` and `right` are each 0…1 of the slack on that side, not pixel widths,
   so the layout re-solves itself on a window resize instead of freezing at
   whatever the page was when you let go. The CSS reads

     max-width: calc(NARROW + var(--pomo-grow) * max(0px, (100% - NARROW) / 2))

   with --pomo-grow = left + right (so 2 means both sides fully out, i.e. the
   whole column). The panel is then shifted to put its edges where they belong:
   a centred box of width W has to move by half the DIFFERENCE between the two
   growths, which in terms of its own width is `(50% - NARROW/2) * K` with
   K = (right - left) / (right + left). That form is used precisely because a
   percentage inside translate() resolves against the element's own box, so the
   browser recomputes it on resize for free. */

/** Movement (px) before a press counts as a drag rather than a click. */
export const DRAG_SLOP = 2;

/* Above this speed (px/ms) a release is a FLICK, not a placement.

   Set well clear of an ordinary drag on purpose. Someone dragging an edge to a
   chosen width moves at roughly 0.2–0.8 px/ms, and a threshold down in that
   range would fling the panel to an end almost every time — which reads as the
   control refusing to be placed. A genuine throw clears 1.5 easily. */
export const FLICK_SPEED = 0.95;

/* How close to a stop counts as landing on it.

   With stops every 0.25 this pulls over most of the range but deliberately not
   all of it: a magnet wider than half the gap would leave no free space at all
   and the panel could only ever rest on a quarter, which is a different
   control — a stepper, not a drag. */
export const MAGNET = 0.1;

/* The widths worth landing exactly on. Quarters as well as halves, so there's
   almost always a stop within reach — with only three, most of the range fell
   between them and the panel came to rest on arbitrary numbers. */
export const NOTCHES = [0, 0.25, 0.5, 0.75, 1];

/** How far past a limit you must push for a full-strength squash. */
export const SQUISH_SCALE = 160;

/* Pointer speed from the last couple of move samples, in px/ms.

   Two samples, not the whole gesture: what matters is how fast the edge was
   moving when you LET GO, and averaging that with the slow start of a long
   drag would read every throw as a gentle placement. */
export function velocityFrom(samples = []) {
  if (samples.length < 2) return 0;
  const a = samples[samples.length - 2];
  const b = samples[samples.length - 1];
  const dt = b.t - a.t;
  if (!(dt > 0)) return 0;
  return (b.x - a.x) / dt;
}

/* Where a released edge settles.

   Two behaviours, and which one applies is decided by speed. Thrown hard, the
   edge commits to whichever end it was thrown toward — that's the "flick it
   open" gesture, and stopping halfway because your finger left the screen
   early would feel like the throw was ignored. Placed slowly, the value is
   kept as-is except for a little magnetism onto the obvious stops, so landing
   on "all the way out" doesn't require pixel accuracy.

   `velocity` is in pointer space, so a leftward throw on the LEFT edge is
   growth and has to change sign before it can be read as a direction. */
export function settleGrow(grow, velocity = 0, side = "right") {
  const g = clampGrow(grow);
  const v = side === "left" ? -velocity : velocity;
  if (Math.abs(v) >= FLICK_SPEED) return v > 0 ? 1 : 0;
  // Nearest stop within reach, not merely the first one that qualifies — with
  // the magnet this wide the ranges overlap, and taking the first would pull
  // a value toward a stop further away than one it had already passed.
  let best = null;
  for (const notch of NOTCHES) {
    const d = Math.abs(g - notch);
    if (d <= MAGNET && (best === null || d < Math.abs(g - best))) best = notch;
  }
  return best === null ? g : best;
}

/* Overshoot in px → a signed squash in −1…1. tanh, so pushing the pointer to
   the far edge of the screen shows resistance rather than turning the panel
   into a pancake. */
export function squishFrom(overshootPx) {
  return Math.tanh((Number(overshootPx) || 0) / SQUISH_SCALE);
}

/** Clamp one side's growth into the range it can actually take. */
export function clampGrow(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

/** Normalise whatever was persisted (including the older single-side shape). */
export function normalizeGrow(value) {
  if (!value || typeof value !== "object") return { left: 0, right: 0 };
  // Older builds stored { grow, side }. Read it rather than resetting someone's
  // panel to narrow on upgrade.
  if (value.grow != null && value.left == null && value.right == null) {
    const g = clampGrow(value.grow);
    return value.side === "left" ? { left: g, right: 0 } : { left: 0, right: g };
  }
  return { left: clampGrow(value.left), right: clampGrow(value.right) };
}

/* Pointer travel on one edge → that edge's new growth.

   Rightward travel on the right edge grows the panel; LEFTWARD travel on the
   left edge grows it by the same amount, hence the sign flip. Only the edge
   being dragged is returned — the other is the caller's to leave alone. */
export function growFrom(base, dx, slackPx, side) {
  if (!(slackPx > 0)) return clampGrow(base);
  const travel = side === "left" ? -dx : dx;
  return clampGrow(base + travel / slackPx);
}

/* The transform that puts a grown panel's edges in the right places.

   Shift by half the difference in growth: grow only rightward and the left
   edge must stay put, grow only leftward and the right edge must, grow both
   equally and it stays centred. Expressed against the panel's own width so it
   survives a resize without being recomputed. */
export function panelShift({ left = 0, right = 0 } = {}) {
  const sum = left + right;
  if (sum < 0.0001) return 0;
  return (right - left) / sum;
}

/* How far the panel deforms when pushed past a limit. Stretch along the drag,
   thin across it — volume roughly held, which is what makes it read as squashy
   rather than merely bigger. The content cancels this exactly (see
   .pomo-center), so the frame gives way while the clock does not. */
export function squishScale(squish = 0) {
  const mag = Math.min(1, Math.abs(Number(squish) || 0));
  return { sx: 1 + mag * 0.05, sy: 1 - mag * 0.04 };
}

export function panelTransform({ left = 0, right = 0, squish = 0, narrowPx = 620 } = {}) {
  const k = panelShift({ left, right });
  const { sx, sy } = squishScale(squish);
  const parts = [];
  if (Math.abs(k) >= 0.0001) {
    parts.push(`translateX(calc((50% - ${narrowPx / 2}px) * ${k.toFixed(4)}))`);
  }
  if (Math.abs(sx - 1) >= 0.0001 || Math.abs(sy - 1) >= 0.0001) {
    parts.push(`scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`);
  }
  return parts.length ? parts.join(" ") : "none";
}

/**
 * @param {object}   opts
 * @param {object}   opts.value     { left, right }, each 0…1 of that side's slack
 * @param {Function} opts.onChange  ({ left, right }) => void
 * @param {number}   opts.narrowPx  the panel's natural (un-grown) width
 * @param {boolean}  opts.enabled   off where there's no room to grow into
 */
export default function useSquishResize({
  value,
  onChange,
  narrowPx = 620,
  enabled = true,
}) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const [live, setLive] = useState(null); // { left, right, squish } while dragging
  const [held, setHeld] = useState(false); // pointer down: the pick-up wiggle
  const saved = normalizeGrow(value);

  const reset = useCallback(() => {
    dragRef.current = null;
    setLive(null);
    setHeld(false);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  /** Room available on ONE side: the panel is centred, so half the slack. */
  const sideSlack = useCallback(() => {
    const el = ref.current;
    if (!el) return 0;
    const parent = el.parentElement;
    return ((parent ? parent.clientWidth : el.offsetWidth) - narrowPx) / 2;
  }, [narrowPx]);

  /* Pointer CAPTURE rather than window listeners: the grip owns the pointer
     from the moment it goes down, so nothing can steal it, the drag survives
     the pointer leaving the panel, and there's no race with a re-render in
     between. */
  const startDrag = useCallback(
    (side) => (e) => {
      if (!enabled || !ref.current) return;
      if (e.button != null && e.button !== 0) return;
      const slack = sideSlack();
      if (slack <= 8) return; // nowhere to grow — leave it alone

      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      const from = normalizeGrow(value);
      dragRef.current = {
        x: e.clientX,
        pointerId: e.pointerId,
        target: e.currentTarget,
        side,
        base: from,
        slack,
        moved: false,
        // The last couple of positions, for reading how fast the edge was
        // moving at the moment of release.
        samples: [{ x: e.clientX, t: e.timeStamp || performance.now() }],
      };
      setLive({ ...from, squish: 0 });
      setHeld(true);
    },
    [enabled, value, sideSlack]
  );

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_SLOP) return;
    d.moved = true;
    d.samples.push({ x: e.clientX, t: e.timeStamp || performance.now() });
    if (d.samples.length > 4) d.samples.shift();

    // Only the dragged edge changes. The other keeps whatever it had, which is
    // what makes the two sides genuinely independent.
    const raw = d.base[d.side] + (d.side === "left" ? -dx : dx) / (d.slack || 1);
    const next = clampGrow(raw);
    // Whatever the drag asked for beyond the limit has nowhere to go, so it
    // becomes deformation instead of the drag simply going dead.
    setLive({
      ...d.base,
      [d.side]: next,
      squish: squishFrom((raw - next) * d.slack * (d.side === "left" ? -1 : 1)),
    });
  }, []);

  const endDrag = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || (e && e.pointerId !== d.pointerId)) return;
      try {
        d.target?.releasePointerCapture?.(d.pointerId);
      } catch {
        /* already released */
      }
      if (d.moved) {
        const dx = (e?.clientX ?? d.x) - d.x;
        const landed = growFrom(d.base[d.side], dx, d.slack, d.side);
        // Throw it and it commits to that end; place it and it just tidies up
        // onto the nearest obvious stop.
        onChange?.({
          ...d.base,
          [d.side]: settleGrow(landed, velocityFrom(d.samples), d.side),
        });
      }
      reset();
    },
    [onChange, reset]
  );

  /* Double-click an edge to throw it all the way out — and again to bring it
     back. The drag is for choosing a width; this is for the two you actually
     want most of the time. */
  const onDoubleClick = useCallback(
    (side) => (e) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (sideSlack() <= 8) return;
      const from = normalizeGrow(value);
      onChange?.({ ...from, [side]: from[side] >= 0.999 ? 0 : 1 });
      reset();
    },
    [enabled, value, onChange, sideSlack, reset]
  );

  const gripProps = (side) => ({
    className: "pomo-grip " + side,
    onPointerDown: startDrag(side),
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: onDoubleClick(side),
    title: "Drag to resize · double-click for the full width",
  });

  // Arrow keys do the same job for anyone not using a pointer.
  const onKeyDown = useCallback(
    (e) => {
      if (!enabled) return;
      const from = normalizeGrow(value);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onChange?.({ ...from, right: clampGrow(from.right + 0.25) });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onChange?.({ ...from, left: clampGrow(from.left + 0.25) });
      } else if (e.key === "Escape") {
        e.preventDefault();
        onChange?.({ left: 0, right: 0 });
      }
    },
    [enabled, value, onChange]
  );

  const shown = live || saved;
  const { sx, sy } = squishScale(shown.squish || 0);

  return {
    ref,
    gripProps,
    dragging: Boolean(live && dragRef.current?.moved),
    keyHandlers: enabled ? { onKeyDown, tabIndex: 0 } : {},
    style: {
      "--pomo-grow": shown.left + shown.right,
      /* The inverse of the panel's own shift and squash, for the content to
         cancel them with. Growing one way slides the box sideways and pushing
         past a limit deforms it; either would carry the timer along, and the
         box should open up AROUND the clock rather than dragging it. */
      "--pomo-anchor": -panelShift(shown),
      "--pomo-sx": 1 / sx,
      "--pomo-sy": 1 / sy,
      transform: panelTransform({ ...shown, narrowPx }),
    },
    className:
      (shown.left + shown.right > 0.0001 ? " grown" : "") +
      (held ? " held" : "") +
      (live && dragRef.current?.moved ? " dragging" : ""),
  };
}
