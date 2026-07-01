import { useEffect, useRef, useState } from "react";

/* ConfirmButton - a light, two-step delete affordance.
   First click "arms" the button: it morphs in place into a small "Sure?"
   pill. A second click confirms; moving away or waiting ~3s quietly
   cancels. No modal, nothing scary - just a beat to prevent slips. */
export default function ConfirmButton({
  onConfirm,
  icon,
  title,
  requireConfirmation = true,
  confirmLabel = "Sure?",
  className = "iconbtn",
  style,
  armedStyle,
  timeout = 3000,
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const disarm = () => {
    clearTimeout(timer.current);
    setArmed(false);
  };
  const arm = (e) => {
    e.stopPropagation();
    if (!requireConfirmation) {
      onConfirm();
      return;
    }
    setArmed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), timeout);
  };
  const confirm = (e) => {
    e.stopPropagation();
    disarm();
    onConfirm();
  };

  if (armed) {
    return (
      <button
        type="button"
        className="confirm-armed"
        title="Click again to confirm"
        onClick={confirm}
        onMouseLeave={disarm}
        style={armedStyle}
      >
        {confirmLabel}
      </button>
    );
  }

  return (
    <button type="button" className={className} title={title} onClick={arm} style={style}>
      {icon}
    </button>
  );
}
