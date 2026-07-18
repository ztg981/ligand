import { useDropdown } from "../hooks/useDropdown.js";
import { Icon } from "./Icons.jsx";

/* Select — a themed dropdown that replaces the native <select>, whose OS menu
   ignores the app's look entirely (the "outdated" dropdowns). A pill button
   opens a styled popover list with a check on the current choice. Same value
   contract as a native select: value + onChange(nextValue).

   options: [{ value, label, sub? }] (or plain strings). */
export default function Select({
  value,
  onChange,
  options = [],
  className = "",
  ariaLabel,
  placeholder = "Select…",
  align = "left", // popover edge alignment
}) {
  const { open, toggle, close, triggerRef, menuRef } = useDropdown();
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  const current = opts.find((o) => String(o.value) === String(value));

  return (
    <div className={"uisel " + className}>
      <button
        ref={triggerRef}
        type="button"
        className="uisel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        <span className="uisel-btn-label">{current ? current.label : placeholder}</span>
        <Icon.Arrow width={12} height={12} style={{ transform: "rotate(90deg)", flex: "none" }} />
      </button>
      {open && (
        <div
          className={"uisel-pop" + (align === "right" ? " right" : "")}
          ref={menuRef}
          role="listbox"
        >
          {opts.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={String(o.value) === String(value)}
              className={"uisel-opt" + (String(o.value) === String(value) ? " on" : "")}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              <span className="uisel-opt-main">
                <span className="uisel-opt-label">{o.label}</span>
                {o.sub && <span className="uisel-opt-sub">{o.sub}</span>}
              </span>
              {String(o.value) === String(value) && <Icon.Check width={13} height={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
