import { useDropdown } from "../hooks/useDropdown.js";
import { Icon } from "./Icons.jsx";

/* FocusPicker — "what am I focusing on?", as a designed control.

   Replaces the native <select> (whose OS dropdown ignored the app's look
   entirely). A pill button opens a styled panel: nothing / your own words /
   your goals / your open tasks, with section headers and a check on the
   current choice. Same value contract as before: "" | "custom" |
   "goal:<id>" | task id. */

export default function FocusPicker({
  value = "",
  customText = "",
  onChange,
  onCustomText,
  tasks = [],
  goals = [],
}) {
  const { open, toggle, close, triggerRef, menuRef } = useDropdown();
  const openTasks = tasks.filter((t) => !t.done);

  const currentLabel = (() => {
    if (!value) return "Nothing in particular";
    if (value === "custom") return customText.trim() || "Something else…";
    if (value.startsWith("goal:")) {
      return goals.find((g) => g.id === value.slice(5))?.name || "A goal";
    }
    const t = tasks.find((x) => x.id === value);
    return t ? t.text : "Nothing in particular";
  })();

  const pick = (v) => {
    onChange(v);
    if (v !== "custom") close();
  };

  // Plain render helper (not a nested component - those remount every render).
  const renderItem = (v, label, icon = null) => (
    <button
      key={"opt-" + v}
      type="button"
      role="menuitemradio"
      aria-checked={value === v}
      className={"focuspick-item" + (value === v ? " on" : "")}
      onClick={() => pick(v)}
    >
      <span className="focuspick-item-main">
        {icon}
        <span className="focuspick-item-text">{label}</span>
      </span>
      {value === v && <Icon.Check width={13} height={13} />}
    </button>
  );

  return (
    <div className="focuspick">
      <button
        ref={triggerRef}
        type="button"
        className="focuspick-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="focuspick-btn-label">{currentLabel}</span>
        <Icon.Arrow width={12} height={12} style={{ transform: "rotate(90deg)" }} />
      </button>

      {open && (
        <div className="focuspick-pop" ref={menuRef} role="menu">
          {renderItem("", "Nothing in particular")}
          {renderItem("custom", "Something else…", <Icon.Pencil width={12} height={12} />)}
          {value === "custom" && (
            <input
              className="input focuspick-custom"
              autoFocus
              placeholder="What are you working on?"
              value={customText}
              maxLength={60}
              onChange={(e) => onCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") close();
              }}
            />
          )}
          {goals.length > 0 && (
            <>
              <div className="focuspick-sec">Your goals</div>
              {goals.map((g) =>
                renderItem("goal:" + g.id, g.name, <Icon.Target width={12} height={12} />)
              )}
            </>
          )}
          {openTasks.length > 0 && (
            <>
              <div className="focuspick-sec">Your tasks</div>
              {openTasks.slice(0, 12).map((t) => {
                const g = t.goalId ? goals.find((x) => x.id === t.goalId) : null;
                return renderItem(
                  t.id,
                  <>
                    {t.text}
                    {g && <span className="focuspick-goalhint"> · {g.name}</span>}
                  </>,
                  <Icon.Check width={12} height={12} />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
