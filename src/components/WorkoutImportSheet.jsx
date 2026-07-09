import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import WorkoutImport from "./WorkoutImport.jsx";

/* WorkoutImportSheet — the PHONE-shaped door into workout import.

   Same brain, different body: this renders the exact same WorkoutImport
   component (same AI call, same Quick parse fallback, same schema gate,
   same review-before-anything-saves) inside a bottom sheet, so paste-from-
   Notes works one-handed at the gym. Nothing is duplicated, so mobile and
   desktop can never drift apart in behavior. */
export default function WorkoutImportSheet({ open, onClose, onImported }) {
  if (!open) return null;
  return createPortal(
    <div
      className="sheet-scrim quick-note-scrim"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bottom-sheet quick-note-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Import workout from notes"
      >
        <div className="sheet-drag-area">
          <span className="sheet-handle" />
        </div>
        <div className="sheet-body">
          <div className="row between" style={{ alignItems: "center", marginBottom: 4 }}>
            <div className="sheet-title">Import from notes</div>
            <button type="button" className="iconbtn" title="Close" onClick={onClose}>
              <Icon.Close />
            </button>
          </div>
          <WorkoutImport
            bare
            compact
            onImported={(plan, meta) => {
              onImported?.(plan, meta);
              onClose();
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
