import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";
import { goalHealth } from "../lib/goalHealth.js";
import { useDropdown } from "../hooks/useDropdown.js";

/* GoalDropdown - the MOBILE-only (<768px) goal selector. The horizontal goal
   pills are far too cramped on a phone, so on mobile they're replaced by a
   single button showing the current goal that opens a clean, full-width list
   to switch goals (plus "+ New goal"). Desktop uses the vertical sidebar and
   hides this via CSS. */
export default function GoalDropdown({
  goals = [],
  tasks = [],
  activeGoalId,
  isGoalTab = false,
  onSelect,
  onAddGoal,
}) {
  const { open, toggle, close, triggerRef, menuRef } = useDropdown();
  // Pixel offset for the full-width sheet, measured from the button so the
  // panel drops just below the (pinned) top bar regardless of bar height.
  const [panelTop, setPanelTop] = useState(0);

  // The button reflects the active goal when we're on a goal screen; otherwise
  // it's a neutral "Goals" prompt so it never implies you're inside a goal.
  const current = goals.find((g) => g.id === activeGoalId);
  const showCurrent = isGoalTab && current;

  // Measure the drop position from the trigger each time the sheet opens.
  useEffect(() => {
    if (open && triggerRef.current) {
      setPanelTop(Math.round(triggerRef.current.getBoundingClientRect().bottom + 8));
    }
  }, [open, triggerRef]);

  const pick = (id) => {
    onSelect?.(id);
    close();
  };

  return (
    <div className="goal-dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="goal-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        title={showCurrent ? current.name : undefined}
      >
        <span className="goal-dd-current">
          {showCurrent ? (
            <>
              {current.type === "recovery" ? (
                <span className="gs-leaf">
                  <Icon.Leaf />
                </span>
              ) : (
                <span className="gs-dot" style={{ background: current.color }} />
              )}
              <span className="goal-dd-name">{current.name}</span>
            </>
          ) : (
            <>
              <Icon.Target />
              <span className="goal-dd-name">Goals</span>
            </>
          )}
        </span>
        <span className={"goal-dd-caret" + (open ? " open" : "")}>
          <Icon.Arrow />
        </span>
      </button>

      {open && (
        <>
          {/* No dimming layer: a fixed full-screen backdrop (even pointer-events:
             none) paints OVER the translucent topbar, so every tap of the trigger
             visibly darkened the whole bar — the "entire nav flashes" bug. The
             sheet's border + shadow carry the elevation on their own. */}
          <div className="goal-dd-panel" role="listbox" ref={menuRef} style={{ top: panelTop }}>
            {goals.length === 0 ? (
              <div className="goal-dd-empty">No goals yet.</div>
            ) : (
              goals.map((g) => {
                const selected = isGoalTab && g.id === activeGoalId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={"goal-dd-item" + (selected ? " selected" : "")}
                    onClick={() => pick(g.id)}
                  >
                    {g.type === "recovery" ? (
                      <span className="gs-leaf">
                        <Icon.Leaf />
                      </span>
                    ) : (
                      <span className="gs-dot" style={{ background: g.color }} />
                    )}
                    <span className="goal-dd-item-name">{g.name}</span>
                    {(() => {
                      const health = goalHealth(g, tasks);
                      return (
                        <span
                          className={"gs-health " + health.level}
                          title={health.label}
                          aria-label={health.label}
                        />
                      );
                    })()}
                    {selected && (
                      <span className="goal-dd-check">
                        <Icon.Check />
                      </span>
                    )}
                  </button>
                );
              })
            )}
            <button
              type="button"
              className="goal-dd-item goal-dd-add"
              onClick={() => {
                onAddGoal?.();
                close();
              }}
            >
              <Icon.Plus />
              <span className="goal-dd-item-name">New goal</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
