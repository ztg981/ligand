import { useCallback, useEffect, useRef, useState } from "react";

/* useSquishResize — grab a panel and drag it wider or narrower.

   Replaces a corner "expand" button, which is a poor fit for a thing whose
   whole point is "how much room do I want this to take". A button only ever
   offers a jump between two states; here you push the edge and the panel
   follows your finger, so the size is something you feel out rather than
   toggle.

   Three pieces of feedback make it read as a physical object:

     • press and hold        → it jiggles, the way a home-screen widget does
                               when it becomes draggable;
     • drag                  → the width tracks the pointer 1:1, live;
     • push past either end  → it can't grow, so it SQUASHES instead —
                               stretching along the drag and thinning across
                               it, then springing back on release.

   The squash is the honest part: rather than the drag going dead at the
   limit, the resistance is visible, which is what tells you you've reached
   the edge without a message saying so.

   Widths snap to narrow-or-wide on release (this is a two-state panel, and a
   panel left at 71% reads as a mistake), but the snap is a spring, not a cut. */

/** How far past an edge you must push for a full-strength squash. */
export const SQUISH_SCALE = 150;

/** Movement (px) before a press counts as a drag rather than a click. */
export const DRAG_SLOP = 6;

/* Overshoot in px → a signed squash in −1…1.

   tanh, so the deformation eases toward a limit instead of growing without
   bound: shoving the pointer to the far edge of the screen shouldn't turn the
   panel into a pancake. */
export function squishFrom(overshootPx, scale = SQUISH_SCALE) {
  return Math.tanh((Number(overshootPx) || 0) / scale);
}

/* The transform for a given squash. Positive = pushed right.

   Stretch along the drag axis and thin across it (volume roughly preserved,
   which is what makes it read as squashy rather than merely scaled), plus a
   small lean in the drag direction so the panel looks pulled, not inflated. */
export function squishTransform(s) {
  const mag = Math.abs(s);
  if (mag < 1e-4) return "none";
  return (
    `translateX(${(s * 14).toFixed(2)}px) ` +
    `scaleX(${(1 + mag * 0.05).toFixed(4)}) ` +
    `scaleY(${(1 - mag * 0.04).toFixed(4)})`
  );
}

/** Which end of the range a released drag should settle to. */
export function snapTarget(widthPx, minPx, maxPx) {
  if (maxPx <= minPx) return false;
  return widthPx > (minPx + maxPx) / 2;
}

/**
 * @param {object}   opts
 * @param {boolean}  opts.wide      current state
 * @param {Function} opts.setWide   (nextBoolean) => void
 * @param {number}   opts.minWidth  the narrow width, in px
 * @param {boolean}  opts.enabled   off when there's no room to grow into
 */
export default function useSquishResize({ wide, setWide, minWidth = 620, enabled = true }) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  // liveWidth is px while dragging, null the rest of the time — so the panel
  // goes back to being laid out by CSS the instant the gesture ends and the
  // spring transition has something to animate toward.
  const [liveWidth, setLiveWidth] = useState(null);
  const [squish, setSquish] = useState(0);
  const [held, setHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The pointerup listener closes over state; a ref keeps it reading the width
  // from the last move rather than the value at the time it was attached.
  const liveWidthRef = useRef(null);
  liveWidthRef.current = liveWidth;

  const reset = useCallback(() => {
    dragRef.current = null;
    setLiveWidth(null);
    setSquish(0);
    setHeld(false);
    setDragging(false);
  }, []);

  // A disabled gesture must not leave the panel frozen at a dragged width.
  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled || !ref.current) return;
      // Never swallow a press meant for a control sitting on the panel.
      if (e.target?.closest?.("button, a, input, select, textarea, [role='button']")) return;
      if (e.button != null && e.button !== 0) return;

      const el = ref.current;
      const parent = el.parentElement;
      const maxWidth = parent ? parent.clientWidth : el.offsetWidth;
      if (maxWidth <= minWidth + 8) return; // nowhere to grow — leave it alone

      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        base: el.offsetWidth,
        maxWidth,
        moved: false,
      };
      setHeld(true);
    },
    [enabled, minWidth]
  );

  useEffect(() => {
    if (!held) return undefined;

    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;

      if (!d.moved) {
        // Let a vertical swipe scroll the page. Only claim the gesture once
        // it's clearly sideways, so the panel isn't a dead zone on a phone.
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DRAG_SLOP) {
          reset();
          return;
        }
        if (Math.abs(dx) < DRAG_SLOP) return;
        d.moved = true;
        setDragging(true);
      }

      // Sideways drag is ours now; stop the page scrolling underneath it.
      if (ev.cancelable) ev.preventDefault();

      const raw = d.base + dx;
      const clamped = Math.max(minWidth, Math.min(d.maxWidth, raw));
      setLiveWidth(clamped);
      setSquish(squishFrom(raw - clamped));
    };

    const up = () => {
      const d = dragRef.current;
      if (d?.moved) {
        const settled = liveWidthRef.current ?? d.base;
        setWide(snapTarget(settled, minWidth, d.maxWidth));
      }
      reset();
    };

    // passive:false so preventDefault above can actually hold off the scroll.
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [held, minWidth, setWide, reset]);

  // Arrow keys do the same job for anyone not using a pointer.
  const onKeyDown = useCallback(
    (e) => {
      if (!enabled) return;
      if (e.key === "ArrowRight") { setWide(true); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { setWide(false); e.preventDefault(); }
    },
    [enabled, setWide]
  );

  return {
    ref,
    dragging,
    held,
    squish,
    handlers: enabled
      ? { onPointerDown, onKeyDown, tabIndex: 0 }
      : {},
    style: {
      ...(liveWidth != null ? { maxWidth: `${liveWidth}px` } : null),
      transform: squishTransform(squish),
    },
    className:
      (wide ? " wide" : "") + (held ? " grabbed" : "") + (dragging ? " dragging" : ""),
  };
}
