import { useCallback, useEffect, useRef, useState } from "react";

/* useSquishResize — drag a panel's edge outward to give it more room.

   The panel sits centred in a column with empty space either side. Pulling its
   RIGHT edge to the right grows it rightward; pulling its LEFT edge to the left
   grows it leftward. Each edge moves on its own, so the panel can lean into
   whichever side of the page you actually want to fill — which is the point,
   and is why this isn't a button.

   It is deliberately undiscoverable-ish: no label, no chrome. The only tell is
   the resize cursor when you happen to be over an edge.

   Feel:
     • press and hold  → the panel jiggles, the way a home-screen widget does
                         when it becomes draggable;
     • drag            → that edge tracks your pointer 1:1;
     • push past full  → it can't grow, so it SQUASHES — stretching along the
                         drag and thinning across it — then springs back.

   The squash is the honest part: rather than the drag going dead at the limit,
   the resistance is visible, which is what tells you you've reached the edge
   without a message saying so.

   ── geometry ─────────────────────────────────────────────────────────────
   `grow` is a 0…1 fraction of the available slack, not a pixel width, so the
   layout stays responsive: the CSS reads

     max-width: calc(NARROW + var(--pomo-grow) * max(0px, 100% - NARROW))

   and the panel is re-centred by translating it half the growth toward the
   side being pulled, which is what keeps the OPPOSITE edge pinned. Doing it
   in percentages of the panel's own width means the browser recomputes it on
   every resize for free. */

/** How far past the limit you must push for a full-strength squash. */
export const SQUISH_SCALE = 150;

/** Grab strip along each edge, in px. Wide enough to hit without aiming. */
export const GRIP_PX = 56;

/* Overshoot in px → a signed squash in −1…1.

   tanh, so the deformation eases toward a limit instead of growing without
   bound: shoving the pointer to the far edge of the screen shouldn't turn the
   panel into a pancake. */
export function squishFrom(overshootPx, scale = SQUISH_SCALE) {
  return Math.tanh((Number(overshootPx) || 0) / scale);
}

/* Pointer travel → how much of the available slack is taken up.

   `side` is which edge is being dragged. Pulling the right edge right (dx > 0)
   grows the panel; pulling the LEFT edge left (dx < 0) grows it by the same
   amount, hence the sign flip. Returns the raw fraction, which may fall
   outside 0…1 — the overshoot is what feeds the squash. */
export function growFrom(baseGrow, dx, slackPx, side) {
  if (!(slackPx > 0)) return baseGrow;
  const travel = side === "left" ? -dx : dx;
  return baseGrow + travel / slackPx;
}

/* The transform that positions and deforms the panel.

   Two jobs in one property. The translate keeps the edge you are NOT dragging
   exactly where it was: growth is shared equally either side of a centred box,
   so shifting by half the growth toward the dragged side pins the other one.
   `50%` is half the panel's own width, so `50% - half of NARROW` is precisely
   half the growth, whatever the viewport is doing.

   The scale is the squash, and only ever appears when the drag is pushing
   past a limit. */
export function panelTransform({ grow = 0, side = "right", squish = 0, narrowPx = 620 } = {}) {
  const parts = [];
  const half = narrowPx / 2;
  if (grow > 0.0001) {
    parts.push(
      side === "left"
        ? `translateX(calc(${half}px - 50%))`
        : `translateX(calc(50% - ${half}px))`
    );
  }
  const mag = Math.abs(squish);
  if (mag > 0.0001) {
    parts.push(`scaleX(${(1 + mag * 0.05).toFixed(4)})`);
    parts.push(`scaleY(${(1 - mag * 0.04).toFixed(4)})`);
  }
  return parts.length ? parts.join(" ") : "none";
}

/** Clamp a dragged fraction back into the range the panel can actually take. */
export function clampGrow(grow) {
  return Math.max(0, Math.min(1, Number(grow) || 0));
}

/**
 * @param {object}   opts
 * @param {number}   opts.grow      persisted 0…1 fraction of the slack in use
 * @param {string}   opts.side      "left" | "right" — which way it grew
 * @param {Function} opts.onChange  ({ grow, side }) => void, called on release
 * @param {number}   opts.narrowPx  the panel's natural (un-grown) width
 * @param {boolean}  opts.enabled   off where there's no room to grow into
 */
export default function useSquishResize({
  grow = 0,
  side = "right",
  onChange,
  narrowPx = 620,
  enabled = true,
}) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const [live, setLive] = useState(null); // { grow, side, squish } while dragging
  const [held, setHeld] = useState(false);

  const reset = useCallback(() => {
    dragRef.current = null;
    setLive(null);
    setHeld(false);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  /* One handler for both grips.

     Pointer CAPTURE rather than window listeners, which is what makes a slow,
     deliberate hold-then-drag work: the grip owns the pointer from the moment
     it goes down, so nothing can steal it, the drag survives the pointer
     leaving the panel, and there is no window-listener race with React's
     re-render in between. The previous version also cancelled the whole
     gesture the moment vertical movement exceeded horizontal, which killed it
     on the tiny wobble at the start of any unhurried drag — that check is
     gone, and scrolling is handled by scoping `touch-action: none` to the
     56px grips instead of the whole panel. */
  const startDrag = useCallback(
    (whichSide) => (e) => {
      if (!enabled || !ref.current) return;
      if (e.button != null && e.button !== 0) return;
      const el = ref.current;
      const parent = el.parentElement;
      /* Halved: the panel is centred, so the room it can expand into on ONE
         side is half the total empty space. Taking the whole of it let a full
         drag carry the panel's far edge clean off the side of the page. This
         is also the width the drag maps onto 1:1 — pulling an edge by N px
         widens the panel by N px, which is what makes it feel attached. */
      const slack = ((parent ? parent.clientWidth : el.offsetWidth) - narrowPx) / 2;
      if (slack <= 8) return; // nowhere to grow — leave it alone

      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      dragRef.current = {
        x: e.clientX,
        pointerId: e.pointerId,
        target: e.currentTarget,
        side: whichSide,
        // Dragging the opposite edge starts the growth over from zero: the
        // panel can lean one way at a time, so switching sides is a new gesture
        // rather than a continuation of the old one.
        base: whichSide === side ? clampGrow(grow) : 0,
        slack,
        moved: false,
      };
      setHeld(true);
      setLive({ grow: whichSide === side ? clampGrow(grow) : 0, side: whichSide, squish: 0 });
    },
    [enabled, grow, side, narrowPx]
  );

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 2) return;
    d.moved = true;
    const raw = growFrom(d.base, dx, d.slack, d.side);
    const clamped = clampGrow(raw);
    setLive({
      grow: clamped,
      side: d.side,
      squish: squishFrom((raw - clamped) * d.slack * (d.side === "left" ? -1 : 1)),
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
        onChange?.({ grow: clampGrow(growFrom(d.base, dx, d.slack, d.side)), side: d.side });
      }
      reset();
    },
    [onChange, reset]
  );

  const gripProps = (whichSide) => ({
    className: "pomo-grip " + whichSide,
    onPointerDown: startDrag(whichSide),
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  // Arrow keys do the same job for anyone not using a pointer.
  const onKeyDown = useCallback(
    (e) => {
      if (!enabled) return;
      const step = (dir) => {
        e.preventDefault();
        const cur = live?.grow ?? clampGrow(grow);
        const curSide = live?.side ?? side;
        // Growing the way it already leans widens it; the other way shrinks it
        // back before it can lean the other side.
        const delta = dir === curSide ? 0.25 : -0.25;
        const next = clampGrow(cur + delta);
        onChange?.({ grow: next, side: next === 0 ? dir : curSide });
      };
      if (e.key === "ArrowRight") step("right");
      else if (e.key === "ArrowLeft") step("left");
    },
    [enabled, grow, side, live, onChange]
  );

  const shownGrow = live ? live.grow : clampGrow(grow);
  const shownSide = live ? live.side : side;

  return {
    ref,
    gripProps,
    held,
    dragging: Boolean(live && dragRef.current?.moved),
    keyHandlers: enabled ? { onKeyDown, tabIndex: 0 } : {},
    style: {
      "--pomo-grow": shownGrow,
      transform: panelTransform({
        grow: shownGrow,
        side: shownSide,
        squish: live?.squish ?? 0,
        narrowPx,
      }),
    },
    className:
      (shownGrow > 0.0001 ? " grown" : "") +
      (held ? " grabbed" : "") +
      (live && dragRef.current?.moved ? " dragging" : ""),
  };
}
