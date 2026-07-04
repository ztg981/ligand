import { useCallback, useEffect, useRef, useState } from "react";

/* useDropdown — one consistent primitive for every dropdown / popover.

   Why this exists: the old dropdowns each dismissed via a full-screen backdrop
   div layered ABOVE their trigger. Tapping an open trigger hit the backdrop
   (pointerdown → close), then the following click fell through to the trigger
   and reopened it — a flash-close-then-reopen on a single tap. Stacking more
   click/pointerdown/touchstart handlers only made it worse.

   The fix is the pattern Radix/Headless-UI use: no dismissal backdrop at all.
   While open, ONE document-level `pointerdown` listener closes the menu only
   when the press lands OUTSIDE both the trigger and the menu (ref checks). So:

   - Tap the trigger while open: the document listener sees the target is inside
     the trigger and ignores it; the trigger's own onClick toggles it closed.
     Exactly one state change — never a close-then-reopen.
   - Tap outside: the document listener closes it. There's no backdrop to fall
     through, so nothing reopens.
   - Tap inside the menu: ignored (ref check); selecting an option calls close()
     explicitly.
   - Opening any dropdown closes all others (a shared module-level registry).
   - Escape closes the active one; listeners are added only while open and
     removed on close/unmount.

   pointerdown fires reliably on iOS Safari at the document level (the "click
   doesn't fire on non-interactive elements" quirk is about `click` on the
   element itself, not document-level pointer events), so this also fixes the
   original iOS tap-outside problem without any Safari-specific hacks. */

// Every currently-open dropdown's stable close fn — so opening one closes the rest.
const openRegistry = new Set();

export function useDropdown({ onClose } = {}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  // Mirror of `open` so event handlers read the live value without a stale
  // closure and without doing side effects inside a state updater.
  const openRef = useRef(false);
  openRef.current = open;

  // Stable close (identity never changes) so the registry add/delete matches.
  const close = useCallback(() => setOpen(false), []);

  const closeOthers = useCallback(() => {
    openRegistry.forEach((fn) => {
      if (fn !== close) fn();
    });
  }, [close]);

  const openMenu = useCallback(() => {
    closeOthers();
    setOpen(true);
  }, [closeOthers]);

  const toggle = useCallback(() => {
    if (openRef.current) {
      setOpen(false);
    } else {
      closeOthers();
      setOpen(true);
    }
  }, [closeOthers]);

  useEffect(() => {
    if (!open) return undefined;
    openRegistry.add(close);

    const onPointerDown = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Capture phase so a child stopPropagation can't hide an outside press.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);

    return () => {
      openRegistry.delete(close);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Fire onClose when the menu transitions to closed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) onClose?.();
    wasOpen.current = open;
  }, [open, onClose]);

  return { open, setOpen, openMenu, close, toggle, triggerRef, menuRef };
}

export default useDropdown;
