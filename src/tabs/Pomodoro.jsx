import { usePomodoro, PHASES } from "../hooks/usePomodoro.js";
import { Ring, Slider, Segmented } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { chime } from "../lib/notifications.js";

/* ============================================================
   Pomodoro tab
   A real countdown timer with adjustable work / break durations.
   "Airplane" is the one fully-rendered theme; the others are
   picker-only placeholders for a later step.
   ============================================================ */

const THEMES = [
  { id: "airplane", name: "Airplane", ready: true, swatch: "linear-gradient(180deg,#3a5bd0,#bfe0ff)" },
  { id: "rain", name: "Rainy window", swatch: "linear-gradient(180deg,#4a5568,#9aa6b2)" },
  { id: "forest", name: "Forest", swatch: "linear-gradient(180deg,#2f6b43,#9bd0a3)" },
  { id: "cafe", name: "Café", swatch: "linear-gradient(180deg,#7a4a2b,#d9b08c)" },
  { id: "fireplace", name: "Fireplace", swatch: "linear-gradient(180deg,#7a2b2b,#e0a06c)" },
  { id: "void", name: "Deep focus", swatch: "linear-gradient(180deg,#1b1d2a,#3a3d52)" },
];

const PHASE_LABEL = {
  [PHASES.WORK]: "Focus",
  [PHASES.SHORT]: "Short break",
  [PHASES.LONG]: "Long break",
};

function mmss(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// A few drifting clouds for the airplane scene (varied size/speed/offset).
const CLOUDS = [
  { w: 120, h: 34, top: "22%", dur: 34, delay: 0 },
  { w: 80, h: 24, top: "44%", dur: 26, delay: -8 },
  { w: 150, h: 40, top: "63%", dur: 42, delay: -18 },
  { w: 70, h: 20, top: "33%", dur: 30, delay: -24 },
];

export default function Pomodoro({ chimeEnabled = true }) {
  // Play a soft chime when a focus block or break ends, if the setting is on.
  const pomo = usePomodoro({
    onPhaseEnd: () => {
      if (chimeEnabled) chime();
    },
  });
  const { settings, setSettings } = pomo;
  const theme = THEMES.find((t) => t.id === settings.theme) || THEMES[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Focus</div>
          <h1 className="page-title">Pomodoro</h1>
          <p className="page-sub">
            An immersive focus timer. Adjust your blocks, pick a scene, and take
            it one stretch at a time — breaks are part of the work.
          </p>
        </div>
      </div>

      <div className="pomo-stage">
        {/* The scene + timer */}
        <div className="pomo-window">
          {theme.ready ? (
            <div className="scene airplane">
              <div className="sun" />
              {CLOUDS.map((c, i) => (
                <span
                  key={i}
                  className="cloud"
                  style={{
                    width: c.w,
                    height: c.h,
                    top: c.top,
                    animationDuration: `${c.dur}s`,
                    animationDelay: `${c.delay}s`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="scene placeholder">
              <div className="pomo-soon">“{theme.name}” scene — coming soon</div>
            </div>
          )}

          <div className="pomo-center">
            <Ring
              size={210}
              strokeWidth={8}
              value={pomo.progress}
              color="#fff"
              label={mmss(pomo.remaining)}
              sub={PHASE_LABEL[pomo.phase]}
            />
          </div>
        </div>

        {/* Transport controls */}
        <div className="row" style={{ gap: 10 }}>
          {pomo.running ? (
            <button className="btn" onClick={pomo.pause}>
              <Icon.Pause /> Pause
            </button>
          ) : (
            <button className="btn primary" onClick={pomo.start}>
              <Icon.Play /> Start
            </button>
          )}
          <button className="btn ghost" onClick={pomo.reset} title="Reset this block">
            <Icon.Reset /> Reset
          </button>
          <button className="btn ghost" onClick={pomo.skip} title="Skip to next phase">
            <Icon.Arrow /> Skip
          </button>
        </div>

        {/* Phase switch + session dots */}
        <div className="row" style={{ gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <Segmented
            value={pomo.phase}
            onChange={pomo.goToPhase}
            options={[
              { value: PHASES.WORK, label: "Focus" },
              { value: PHASES.SHORT, label: "Short" },
              { value: PHASES.LONG, label: "Long" },
            ]}
          />
          <div className="row" style={{ gap: 8 }}>
            <span className="pomo-dots">
              {Array.from({ length: pomo.longEvery }).map((_, i) => (
                <i key={i} className={i < pomo.completed % pomo.longEvery ? "on" : ""} />
              ))}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {pomo.completed} done
            </span>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="grid grid-12" style={{ marginTop: 20 }}>
        <div className="card col-7" style={{ minWidth: 0 }}>
          <div className="card-head">
            <div className="card-title">
              <Icon.Timer /> Session lengths
            </div>
          </div>
          <div className="setting-row">
            <div className="name">Focus block</div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider
                value={settings.work}
                min={5}
                max={60}
                step={5}
                onChange={(v) => setSettings({ work: v })}
                format={(v) => v + "m"}
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="name">Short break</div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider
                value={settings.shortBreak}
                min={1}
                max={20}
                step={1}
                onChange={(v) => setSettings({ shortBreak: v })}
                format={(v) => v + "m"}
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="name">Long break</div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider
                value={settings.longBreak}
                min={5}
                max={45}
                step={5}
                onChange={(v) => setSettings({ longBreak: v })}
                format={(v) => v + "m"}
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="name">
              Long break after
              <div className="sub">How many focus blocks before a long break</div>
            </div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider
                value={settings.longEvery}
                min={2}
                max={8}
                step={1}
                onChange={(v) => setSettings({ longEvery: v })}
                format={(v) => v + "×"}
              />
            </div>
          </div>
        </div>

        {/* Theme picker */}
        <div className="card col-5" style={{ minWidth: 0 }}>
          <div className="card-head">
            <div className="card-title">
              <Icon.Wand /> Scene
            </div>
          </div>
          <div className="theme-pick">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={"theme-tile" + (settings.theme === t.id ? " active" : "")}
                style={{ background: t.swatch }}
                onClick={() => setSettings({ theme: t.id })}
                title={t.ready ? t.name : `${t.name} (coming soon)`}
              >
                {!t.ready && <span className="soon-tag">soon</span>}
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            Airplane is ready now. The other scenes (and their ambient sounds)
            arrive in a later step.
          </p>
        </div>
      </div>
    </>
  );
}
