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
  const scrimRef = useRef(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the sheet resting above the on-screen keyboard. When a soft keyboard
  // opens, the layout viewport doesn't change but the visual viewport shrinks;
  // we pin the fixed backdrop to the visual viewport so its flex-end sheet sits
  // just above the keyboard (the textarea flex-shrinks to fit — see CSS).
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const scrim = scrimRef.current;
    if (!vv || !scrim) return;
    const apply = () => {
      scrim.style.top = `${vv.offsetTop}px`;
      scrim.style.height = `${vv.height}px`;
      scrim.style.bottom = "auto";
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const close = () => {
    setOpen(false);
    setSaved(false);
    setText("");
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
          <div
            className="sheet-scrim quick-note-scrim"
            role="presentation"
            ref={scrimRef}
            // onPointerDown (guarded to the scrim itself) so tap-outside
            // dismiss fires on iOS Safari, which drops click on non-interactive
            // elements. The target guard keeps taps inside the sheet from
            // closing it.
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            onClick={close}
          >
            <div
              className="bottom-sheet quick-note-sheet"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle is a visual affordance only — dismissal is intentionally
                  limited to the X button and a backdrop tap so an accidental
                  swipe while typing can't close the sheet and lose the note. */}
              <div className="sheet-drag-area">
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
