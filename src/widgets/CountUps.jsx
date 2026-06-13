import { useState } from "react";
import { daysSince, todayKey } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

/* CountUps — manage "what I'm proud of" day counters.
   Each one counts UP from a start date (forgiving: nothing resets it on
   its own). Users can add their own (e.g. "No gaming"), rename, set or
   reset the start date, and delete ones they don't want. */
export default function CountUps({
  countUps = [],
  addCountUp,
  updateCountUp,
  removeCountUp,
  confirmBeforeDelete = true,
}) {
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draftLabel, setDraftLabel] = useState("");

  const add = () => {
    const l = label.trim();
    if (!l) return;
    addCountUp({ label: l, startDate: todayKey() });
    setLabel("");
  };

  const startEdit = (cu) => {
    setEditingId(cu.id);
    setDraftLabel(cu.label);
  };
  const saveEdit = () => {
    if (editingId) {
      const l = draftLabel.trim();
      if (l) updateCountUp(editingId, { label: l });
    }
    setEditingId(null);
    setDraftLabel("");
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Flame /> What I'm proud of
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {countUps.length || ""}
        </span>
      </div>

      {countUps.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No count-ups yet. Start one below — it counts up gently and never
          resets on its own.
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {countUps.map((cu) => {
            const days = daysSince(cu.startDate);
            return (
              <div
                key={cu.id}
                id={"countup-" + cu.id}
                style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
              >
                <div className="row between" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 6, alignItems: "baseline", minWidth: 0 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}
                    >
                      {days}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {days === 1 ? "day" : "days"}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 4, flex: "none" }}>
                    <button
                      type="button"
                      className="iconbtn sm"
                      title="Rename"
                      onClick={() => startEdit(cu)}
                      style={{ width: 24, height: 24, color: "var(--ink-4)" }}
                    >
                      <Icon.Edit width={12} height={12} />
                    </button>
                    <ConfirmButton
                      className="iconbtn sm"
                      title="Delete count-up"
                      confirmLabel="Delete?"
                      requireConfirmation={confirmBeforeDelete}
                      onConfirm={() => removeCountUp(cu.id)}
                      style={{ width: 24, height: 24, color: "var(--ink-4)" }}
                      icon={<Icon.Trash width={12} height={12} />}
                    />
                  </div>
                </div>

                {editingId === cu.id ? (
                  <input
                    className="input"
                    autoFocus
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setDraftLabel("");
                      }
                    }}
                    onBlur={saveEdit}
                    style={{ marginTop: 4, maxWidth: 220 }}
                  />
                ) : (
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {cu.label}
                  </div>
                )}

                <div
                  className="row"
                  style={{ gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}
                >
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Since</span>
                  <input
                    type="date"
                    className="input"
                    value={cu.startDate}
                    max={todayKey()}
                    onChange={(e) => e.target.value && updateCountUp(cu.id, { startDate: e.target.value })}
                    style={{ width: 150, flex: "none" }}
                  />
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => updateCountUp(cu.id, { startDate: todayKey() })}
                    title="Reset the start date to today"
                  >
                    <Icon.Reset width={12} height={12} /> Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input
          className="input"
          placeholder="New count-up (e.g. No gaming)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn primary" onClick={add} style={{ flex: "none" }}>
          <Icon.Plus /> Add
        </button>
      </div>
    </div>
  );
}
