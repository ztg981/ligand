import { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================
   Goal-dashboard widget compaction
   ------------------------------------------------------------
   The dashboard is a 6-column CSS grid. Left to itself, grid puts every
   widget on its own implicit row and sizes that row to its TALLEST member,
   so a compact 156px card sitting beside a 430px tall one leaves ~270px of
   dead space underneath it, and the leftover column at the end of a row is
   never backfilled.

   The fix is the standard CSS-grid masonry trick, which needs no library:
   make the rows very short (WIDGET_ROW_PX) and have each widget span as
   many of them as its own content actually needs. Combined with
   `grid-auto-flow: dense`, a short widget then packs up into the gap a tall
   neighbour left behind instead of pushing a new full-width row.

   The span has to be measured, because widget height depends on content
   (how many tasks, whether a chart rendered) and not just on its size class.
   The measurement is taken from an INNER wrapper whose height is natural —
   measuring the shell itself would feed the span we just set back into the
   next measurement and oscillate.
   ============================================================ */

/* Must stay in step with index.css.

   The rows are 1px and carry NO row gap; the 12px vertical rhythm comes from
   a margin under each widget instead. That combination is what makes a span
   exact — with taller rows, every widget rounds up to the next row boundary,
   and eight widgets each donating a few stray pixels cost more than the dead
   space the compaction set out to reclaim. Here the error is under 1px. */
export const WIDGET_ROW_PX = 1;
export const WIDGET_GAP_PX = 12;

/**
 * How many grid rows a widget of this pixel height occupies.
 *
 * The widget has to cover its own height plus the gap beneath it. With no row
 * gap to account for, that is simply (height + gap) rows of ROW pixels.
 */
export function widgetRowSpan(height, row = WIDGET_ROW_PX, gap = WIDGET_GAP_PX) {
  if (!Number.isFinite(height) || height <= 0) return null;
  return Math.max(1, Math.ceil((height + gap) / row));
}

/**
 * Measure a widget's natural height and report its row span.
 *
 * Returns [ref, span]. Attach the ref to the natural-height wrapper. `span`
 * is null until the first measurement lands (and whenever compaction is off),
 * so callers can fall back to a per-size guess and avoid a first-paint jump.
 *
 * Disabled on single-column layouts: there is nothing to pack against on a
 * phone, and rounding each card up to a row boundary would only add slack.
 */
export function useWidgetRowSpan(enabled = true) {
  const [span, setSpan] = useState(null);
  const nodeRef = useRef(null);
  const observerRef = useRef(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    setSpan(widgetRowSpan(node.getBoundingClientRect().height));
  }, []);

  // A callback ref rather than useEffect on a plain ref: the wrapper mounts
  // and unmounts as widgets are added, hidden and reordered, and this way the
  // observer follows the node it is actually attached to.
  const ref = useCallback(
    (node) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      nodeRef.current = node;

      if (!node || !enabled || typeof ResizeObserver === "undefined") {
        setSpan(null);
        return;
      }
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      observerRef.current = observer;
    },
    [enabled, measure]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, enabled ? span : null];
}

export default useWidgetRowSpan;
