import { Segmented, Slider } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { ACCENTS } from "../theme/useTweaks.js";
import { accentFor, ambientFor } from "../theme/palettes.js";

/* Floating Tweaks panel - theme / accent / ambient glow / corner radius /
   density. Every control is wired to the live tweaks state, so the whole app
   re-themes instantly. Accent + ambient are saved PER preset, so this quick
   panel edits whichever mode is currently showing (activeMode). */
export default function TweaksPanel({
  tweaks,
  set,
  onClose,
  wallpaperActive = false,
  activeMode = "light",
}) {
  const accentKey = activeMode === "dark" ? "darkAccent" : "lightAccent";
  const ambientKey = activeMode === "dark" ? "darkAmbient" : "lightAmbient";
  const accent = accentFor(activeMode, tweaks);
  const ambient = ambientFor(activeMode, tweaks);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 280,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        boxShadow: "var(--shadow-pop), 0 30px 60px -20px rgba(40,30,16,0.3)",
        padding: 14,
        zIndex: 80,
      }}
    >
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="brand-dot" style={{ width: 14, height: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Theme</span>
        </div>
        <button className="iconbtn" style={{ width: 24, height: 24 }} onClick={onClose}>
          <Icon.Close />
        </button>
      </div>

      <div
        className="setting-row"
        style={{ padding: "6px 0", borderBottom: wallpaperActive ? "none" : undefined }}
      >
        <div className="name">Theme</div>
        <div
          style={{
            opacity: wallpaperActive ? 0.45 : 1,
            pointerEvents: wallpaperActive ? "none" : "auto",
          }}
          title={wallpaperActive ? "Wallpaper controls the theme while active" : undefined}
        >
          <Segmented
            value={tweaks.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "auto", label: "Auto" },
            ]}
          />
        </div>
      </div>
      {wallpaperActive && (
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            margin: "-2px 0 6px",
            lineHeight: 1.4,
          }}
        >
          Wallpaper controls the theme while active.
        </div>
      )}

      <div className="setting-row" style={{ padding: "6px 0" }}>
        <div className="name">Accent</div>
        <div className="row" style={{ gap: 4 }}>
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className={"swatch-pick " + (accent === a.id ? "active" : "")}
              style={{ background: a.color, width: 20, height: 20 }}
              onClick={() => set({ [accentKey]: a.id })}
              title={`Hue ${a.id}`}
            />
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 0" }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <span className="name">Ambient glow</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {ambient}%
          </span>
        </div>
        <Slider
          value={ambient}
          min={0}
          max={100}
          step={5}
          onChange={(v) => set({ [ambientKey]: v })}
          format={(v) => v + "%"}
        />
      </div>

      <div style={{ padding: "8px 0" }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <span className="name">Corner radius</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {tweaks.radius}px
          </span>
        </div>
        <Slider
          value={tweaks.radius}
          min={4}
          max={20}
          step={2}
          onChange={(v) => set({ radius: v })}
          format={(v) => v + "px"}
        />
      </div>

      <div className="setting-row" style={{ padding: "6px 0", borderBottom: "none" }}>
        <div className="name">Density</div>
        <Segmented
          value={tweaks.density}
          onChange={(v) => set({ density: v })}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfy", label: "Comfy" },
          ]}
        />
      </div>
    </div>
  );
}
