import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/* PopoverPortal — hoists a topbar popover out of the topbar's DOM.

   Why this must exist: the topbar is a frosted-glass surface
   (backdrop-filter + translateZ). Per the filter-effects spec, that makes it
   a "backdrop root": any backdrop-filter on a DESCENDANT can only sample
   what's painted inside the topbar — for a menu hanging below it, that's
   nothing. So the menus rendered inside it got translucency with no frost,
   and page text showed through crisp (the liquid-glass "text mash").
   Rendering the menu on document.body gives its blur the real page to
   sample, which is what makes glass readable.

   Positioning: fixed, right-aligned to the trigger (every topbar menu opens
   from the bar's right cluster). Recomputed on resize; the topbar itself is
   fixed/sticky, so the anchor never scrolls away while open. */
export default function PopoverPortal({ anchorRef, gap = 8, children }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        top: Math.round(r.bottom + gap),
        right: Math.max(8, Math.round(window.innerWidth - r.right)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorRef, gap]);

  if (!pos) return null;
  return createPortal(
    <div
      className="pop-layer"
      style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 120 }}
    >
      {children}
    </div>,
    document.body
  );
}
