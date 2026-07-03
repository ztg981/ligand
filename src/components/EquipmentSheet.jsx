import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { EQUIPMENT_OPTIONS, EQUIPMENT_PRESETS } from "../lib/exercises.js";

/* EquipmentSheet - "What do you have available today?" A bottom-sheet the
   Workout tab shows at the start of a session (and from the hub quick-selector)
   so equipment can change per workout - hotel gym one day, full gym the next -
   without editing the saved profile default. Additive multi-select; bodyweight
   is always available so an empty selection is still a valid workout. */
export default function EquipmentSheet({ selected = [], onConfirm, onClose }) {
  const [equip, setEquip] = useState(selected);

  const toggle = (id) =>
    setEquip((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const sameSet = (a, b) =>
    a.length === b.length && a.every((x) => b.includes(x));

  return (
    <div className="scrim wk-sheet-scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="wk-sheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="wk-sheet-grip" aria-hidden="true" />
        <div className="wk-sheet-head">
          <div>
            <div className="eyebrow">This session</div>
            <h2 className="wk-sheet-title">What do you have today?</h2>
          </div>
          <button className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>

        <div className="wk-preset-row">
          {EQUIPMENT_PRESETS.map((p) => (
            <button
              key={p.id}
              className={"wk-preset" + (sameSet(equip, p.equipment) ? " on" : "")}
              onClick={() => setEquip(p.equipment)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="wk-equip-grid wk-sheet-grid">
          {EQUIPMENT_OPTIONS.map((opt) => {
            const on = equip.includes(opt.id);
            return (
              <button
                key={opt.id}
                className={"wk-equip-opt" + (on ? " on" : "")}
                onClick={() => toggle(opt.id)}
              >
                <span className="wk-equip-check">{on && <Icon.Check width={12} height={12} />}</span>
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          className="btn primary wk-sheet-confirm"
          onClick={() => onConfirm?.(equip)}
        >
          <Icon.Check /> {equip.length ? `Use ${equip.length} selected` : "Bodyweight only"}
        </button>
      </div>
    </div>
  );
}
