/* Reusable tactile controls — ported from the Claude Design bundle (controls.jsx).
   These are the physical-feeling switches/sliders/segments the design calls for. */
import { tick, pop } from "../lib/uiSounds.js";

export function Switch({ checked, onChange }) {
  return (
    <button
      className="tswitch"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        pop();
        onChange && onChange(!checked);
      }}
    />
  );
}

export function Segmented({ options, value, onChange, icons }) {
  return (
    <div className="seg">
      {options.map((o, i) => {
        const v = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <button
            key={v}
            className={value === v ? "active" : ""}
            onClick={() => onChange && onChange(v)}
          >
            {icons && icons[i]}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
      <input
        type="range"
        className="tslider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--val": pct + "%" }}
        onChange={(e) => {
          tick();
          onChange && onChange(Number(e.target.value));
        }}
      />
      <span
        className="mono"
        style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 36, textAlign: "right" }}
      >
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Button({ variant, size, icon, children, ...rest }) {
  const cls = ["btn", variant, size === "sm" && "sm"].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function Chip({ tone, children, dot }) {
  return (
    <span className={"chip " + (tone || "")}>
      {dot && <i className="swatch" />}
      {children}
    </span>
  );
}

export function Card({ title, icon, actions, glass, hover = true, children, className, style }) {
  return (
    <div
      className={["card", hover && "hover", glass && "glass", className].filter(Boolean).join(" ")}
      style={style}
    >
      {(title || actions) && (
        <div className="card-head">
          <div className="card-title">
            {icon}
            {title}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="drag-handle">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      {children}
    </div>
  );
}

export function Ring({ size = 64, value = 0.5, strokeWidth = 6, label, sub, color }) {
  const r = size / 2 - strokeWidth / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg className="ring" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--panel-3)" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color || "var(--accent)"}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          style={{ transition: "stroke-dashoffset 0.6s var(--ease)" }}
        />
      </svg>
      <div className="gauge-num">
        <div className="v">{label}</div>
        {sub && <div className="l">{sub}</div>}
      </div>
    </div>
  );
}

export function LED({ tone, children }) {
  return <span className={"led " + (tone || "")}>{children}</span>;
}
