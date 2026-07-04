import { useState } from "react";
import { Icon } from "./Icons.jsx";

/* ============================================================
   MigrationModal - first-login data import prompt.

   Shown once, right after a brand-new account's first sign-in,
   when the device already has meaningful local (guest) data.
   The user chooses to bring that data into their new account or
   start clean. Not dismissible by clicking away - it's a clear,
   required one-time decision.
   ============================================================ */
export default function MigrationModal({ onImport, onFresh }) {
  const [busy, setBusy] = useState(false);

  const choose = async (importExisting) => {
    if (busy) return;
    setBusy(true);
    try {
      if (importExisting) await onImport?.();
      else await onFresh?.();
    } finally {
      // The modal unmounts when needsMigration clears; no need to reset busy.
    }
  };

  return (
    <div className="scrim" role="presentation">
      <div
        className="modal migrate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="migrate-title"
      >
        <div className="migrate-body">
          <div className="migrate-icon">
            <Icon.Cloud />
          </div>
          <h2 id="migrate-title" className="migrate-title">
            Bring your data along?
          </h2>
          <p className="migrate-text">
            You already have goals, tasks or journal entries saved on this
            device. Would you like to import them into your new account so they
            sync everywhere, or start with a clean slate?
          </p>

          <div className="migrate-actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => choose(true)}
            >
              {busy ? "Working…" : "Import my data"}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => choose(false)}
            >
              Start fresh
            </button>
          </div>

          <p className="migrate-note">
            “Start fresh” clears this device’s local data and begins a new,
            empty account. This can’t be undone.
          </p>
        </div>
      </div>
    </div>
  );
}
