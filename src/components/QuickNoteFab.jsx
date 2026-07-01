import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";

/* QuickNoteFab - mobile-only replacement for the Hyperfocus FAB (see
   App.jsx, gated on useIsMobile(768)). A single-purpose "capture a thought
   right now" button: tap, type, save, done - no navigation, no tab switch.
   Reuses .hf-fab's fixed bottom-right position/sizing so it slots into the
   exact same spot the Focus button occupies on desktop. */
export default function QuickNoteFab({ addNote }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const close = () => {
    setOpen(false);
    setSaved(false);
    setText("");
    setDragY(0);
    dragStartY.current = null;
  };

  const save = () => {
    const t = text.trim();
    if (!t) {
      close();
      return;
    }
    addNote({ text: t });
    setSaved(true);
    closeTimer.current = setTimeout(close, 1000);
  };

  const onDragStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onDragMove = (e) => {
    if (dragStartY.current == null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const onDragEnd = () => {
    if (dragY > 80) close();
    else setDragY(0);
  };

  return (
    <>
      <button
        type="button"
        className="hf-fab quick-note-fab"
        title="Quick note"
        onClick={() => setOpen(true)}
        data-mute-click
      >
        <Icon.Pencil />
        <span className="hf-fab-label">Note</span>
      </button>

      {open &&
        createPortal(
          <div className="sheet-scrim" role="presentation" onClick={close}>
            <div
              className="bottom-sheet quick-note-sheet"
              role="dialog"
              aria-modal="true"
              style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="sheet-drag-area"
                onTouchStart={onDragStart}
                onTouchMove={onDragMove}
                onTouchEnd={onDragEnd}
              >
                <span className="sheet-handle" />
              </div>
              <div className="sheet-body quick-note-body">
                {saved ? (
                  <div className="quick-note-saved">
                    <Icon.Check width={20} height={20} /> Saved
                  </div>
                ) : (
                  <>
                    <div className="row between" style={{ alignItems: "center" }}>
                      <div className="sheet-title">Quick note</div>
                      <button type="button" className="iconbtn" title="Close" onClick={close}>
                        <Icon.Close />
                      </button>
                    </div>
                    <textarea
                      ref={textareaRef}
                      className="input quick-note-textarea"
                      placeholder="What's on your mind?"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn primary quick-note-save"
                      onClick={save}
                      disabled={!text.trim()}
                      style={{ opacity: text.trim() ? 1 : 0.5 }}
                    >
                      <Icon.Check width={14} height={14} /> Save
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
