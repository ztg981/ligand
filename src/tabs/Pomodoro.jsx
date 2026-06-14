import { useEffect } from "react";
import { usePomodoro, PHASES } from "../hooks/usePomodoro.js";
import { Ring, Slider, Segmented, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { chime } from "../lib/notifications.js";
import {
  playAmbient,
  stopAmbient,
  setAmbientVolume,
} from "../lib/ambientPlayer.js";

/* ============================================================
   Pomodoro tab — immersive focus timer with CSS scene themes.
   Each theme is a pure-CSS + React-elements scene that fills
   the porthole window. Café / Library / Airport switch between
   day (6 am–8 pm) and night variants automatically. Subway is
   always underground — no day/night.
   ============================================================ */

/* Real background photos (CC0/Pexels — bundled in /public/images/).
   Each scene photo is loaded lazily as a CSS background-image so the
   network cost is zero until the user opens the Pomodoro tab. */
const SCENE_PHOTO = {
  airplane:  "/images/scene-airplane.jpg",
  cafe:      "/images/scene-cafe.jpg",
  library:   "/images/scene-library.jpg",
  subway:    "/images/scene-subway.jpg",
  airport:   "/images/scene-airport.jpg",
  forest:    "/images/scene-forest.jpg",
  fireplace: "/images/scene-fireplace.jpg",
  void:      "/images/scene-void.jpg",
};

const THEMES = [
  { id: "airplane", name: "Airplane",   ready: true,  swatch: "linear-gradient(180deg,#3a5bd0,#bfe0ff)" },
  { id: "cafe",     name: "Café",       ready: true,  swatch: "linear-gradient(180deg,#7a4a2b,#d9b08c)" },
  { id: "library",  name: "Library",    ready: true,  swatch: "linear-gradient(180deg,#3d2610,#8b6845)" },
  { id: "subway",   name: "NYC Subway", ready: true,  swatch: "linear-gradient(180deg,#16161e,#3a3a5c)" },
  { id: "airport",  name: "Airport",    ready: true,  swatch: "linear-gradient(180deg,#3a6fd0,#cce4ff)" },
  { id: "forest",   name: "Forest",     ready: true,  swatch: "linear-gradient(180deg,#2f6b43,#9bd0a3)" },
  { id: "fireplace",name: "Fireplace",  ready: true,  swatch: "linear-gradient(180deg,#7a2b2b,#e0a06c)" },
  { id: "void",     name: "Deep focus", ready: true,  swatch: "linear-gradient(180deg,#1b1d2a,#3a3d52)" },
];

const PHASE_LABEL = {
  [PHASES.WORK]:  "Focus",
  [PHASES.SHORT]: "Short break",
  [PHASES.LONG]:  "Long break",
};

function mmss(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Returns true between 06:00 and 19:59 (daytime). */
function isDay() {
  const h = new Date().getHours();
  return h >= 6 && h < 20;
}

/* ============================================================
   Per-scene element data  (defined once at module scope so
   React doesn't re-create them on every render)
   ============================================================ */

// Airplane — drifting clouds
const CLOUDS = [
  { w: 120, h: 34, top: "22%", dur: 34, delay:  0   },
  { w:  80, h: 24, top: "44%", dur: 26, delay: -8   },
  { w: 150, h: 40, top: "63%", dur: 42, delay: -18  },
  { w:  70, h: 20, top: "33%", dur: 30, delay: -24  },
];

// Café — coffee steam wisps (left positions relative to scene width)
const STEAM = [
  { left: "43%", dur: 3.1, delay:  0   },
  { left: "51%", dur: 2.7, delay: -1.1 },
  { left: "47%", dur: 3.5, delay: -2.0 },
];

// Café night — rain drops (positions within window element)
const RAIN = Array.from({ length: 20 }, (_, i) => ({
  left:   `${(i * 5.1) % 96}%`,
  height: 8 + (i % 5) * 3,
  dur:    0.55 + (i % 4) * 0.12,
  delay:  -(i * 0.14),
}));

// Library day — floating dust motes
const DUST = Array.from({ length: 12 }, (_, i) => ({
  left:  `${16 + (i * 5.9) % 62}%`,
  top:   `${30 + (i * 6.4) % 52}%`,
  dur:   10 + (i % 5) * 3.5,
  delay: -(i * 2.3),
  size:  1.5 + (i % 3) * 0.5,
}));

// Subway — horizontal light streaks sweeping right-to-left
const STREAKS = [
  { top: "17%", w:  72, dur: 1.55, delay:  0,    opacity: 0.85 },
  { top: "31%", w:  46, dur: 1.95, delay: -0.52, opacity: 0.60 },
  { top: "49%", w:  92, dur: 1.30, delay: -1.00, opacity: 0.78 },
  { top: "64%", w:  56, dur: 1.70, delay: -0.30, opacity: 0.55 },
  { top: "79%", w:  36, dur: 2.20, delay: -1.50, opacity: 0.65 },
  { top:  "9%", w:  62, dur: 1.85, delay: -0.80, opacity: 0.45 },
];

// Airport night — runway lights
const RUNWAY = Array.from({ length: 8 }, (_, i) => ({
  left:  `${7 + i * 12}%`,
  delay: -(i * 0.19),
}));

// Forest — drifting leaves
const LEAVES = Array.from({ length: 6 }, (_, i) => ({
  left: `${10 + ((i * 15) % 80)}%`,
  dur:  7 + (i % 4) * 2.5,
  delay: -(i * 1.8),
  size: 6 + (i % 3) * 2,
}));

// Forest day — birds drifting across
const BIRDS = [
  { top: "18%", dur: 15, delay: 0 },
  { top: "27%", dur: 19, delay: -8 },
];

// Forest night — fireflies
const FIREFLIES = Array.from({ length: 9 }, (_, i) => ({
  left: `${8 + ((i * 11) % 84)}%`,
  top:  `${32 + ((i * 7) % 52)}%`,
  dur:  3 + (i % 4),
  delay: -(i * 0.9),
}));

// Fireplace — flame tongues (clustered centre)
const FLAMES = [
  { left: "33%", w: 26, h: 52, dur: 0.95, delay: 0 },
  { left: "42%", w: 34, h: 76, dur: 1.15, delay: -0.3 },
  { left: "50%", w: 30, h: 64, dur: 0.8,  delay: -0.6 },
  { left: "58%", w: 24, h: 50, dur: 1.05, delay: -0.15 },
];

// Fireplace — rising embers
const EMBERS = Array.from({ length: 7 }, (_, i) => ({
  left: `${36 + ((i * 6) % 30)}%`,
  dur:  2.4 + (i % 3) * 0.8,
  delay: -(i * 0.7),
}));

/* ============================================================
   Scene components
   ============================================================ */

function AirplaneScene() {
  return (
    <div className="scene airplane">
      <div className="sun" />
      {CLOUDS.map((c, i) => (
        <span key={i} className="cloud" style={{
          width: c.w, height: c.h, top: c.top,
          animationDuration: `${c.dur}s`,
          animationDelay:    `${c.delay}s`,
        }} />
      ))}
    </div>
  );
}

function CafeScene() {
  const day = isDay();
  return (
    <div className={`scene cafe ${day ? "day" : "night"}`}>
      {/* Window — bright day or rainy night */}
      <div className="cafe-window">
        {!day && RAIN.map((r, i) => (
          <span key={i} className="cafe-raindrop" style={{
            left:              r.left,
            height:            r.height,
            animationDuration: `${r.dur}s`,
            animationDelay:    `${r.delay}s`,
          }} />
        ))}
      </div>

      {/* Light shaft from window (day only) */}
      {day && <div className="cafe-shaft" />}

      {/* Table surface, cup, and steam */}
      <div className="cafe-table" />
      <div className="cafe-cup" />
      {STEAM.map((s, i) => (
        <span key={i} className="cafe-wisp" style={{
          left:              s.left,
          animationDuration: `${s.dur}s`,
          animationDelay:    `${s.delay}s`,
        }} />
      ))}

      {/* Candle (night only) */}
      {!day && (
        <>
          <div className="cafe-candle">
            <div className="cafe-flame" />
          </div>
          <div className="cafe-candle-glow" />
        </>
      )}
    </div>
  );
}

function LibraryScene() {
  const day = isDay();
  return (
    <div className={`scene library ${day ? "day" : "night"}`}>
      {/* Bookshelf row lines — always visible */}
      <div className="lib-shelves" />

      {day ? (
        <>
          {/* Tall window column with light shaft and dust motes */}
          <div className="lib-window" />
          <div className="lib-shaft" />
          {DUST.map((d, i) => (
            <span key={i} className="lib-mote" style={{
              left:              d.left,
              top:               d.top,
              width:             d.size,
              height:            d.size,
              animationDuration: `${d.dur}s`,
              animationDelay:    `${d.delay}s`,
            }} />
          ))}
        </>
      ) : (
        <>
          {/* Desk lamp with green cone of light */}
          <div className="lib-lamp" />
          <div className="lib-cone" />
          <div className="lib-desk-glow" />
        </>
      )}
    </div>
  );
}

function SubwayScene() {
  return (
    <div className="scene subway">
      {/* Tunnel structure */}
      <div className="subway-ceiling" />
      <div className="subway-wall-l" />
      <div className="subway-wall-r" />
      <div className="subway-floor" />

      {/* Fluorescent strips overhead */}
      <div className="subway-fl-l" />
      <div className="subway-fl-r" />

      {/* Tunnel light streaks flying past */}
      {STREAKS.map((s, i) => (
        <span key={i} className="subway-streak" style={{
          top:               s.top,
          width:             s.w,
          opacity:           s.opacity,
          animationDuration: `${s.dur}s`,
          animationDelay:    `${s.delay}s`,
        }} />
      ))}
    </div>
  );
}

function AirportScene() {
  const day = isDay();
  return (
    <div className={`scene airport ${day ? "day" : "night"}`}>
      {/* Large window bank at top */}
      <div className="airport-windows">
        {day
          ? <div className="airport-sky" />
          : <div className="airport-night-sky" />
        }
        {/* Runway lights (night only, shown low in the window) */}
        {!day && (
          <div className="airport-runway-row">
            {RUNWAY.map((r, i) => (
              <span key={i} className="airport-rdot" style={{
                left:           r.left,
                animationDelay: `${r.delay}s`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Terminal interior wall */}
      <div className="airport-wall" />

      {/* Polished floor */}
      <div className="airport-floor" />

      {/* Distant plane silhouette (day only) */}
      {day && <div className="airport-plane" />}
    </div>
  );
}

function ForestScene() {
  const day = isDay();
  return (
    <div className={`scene forest ${day ? "day" : "night"}`}>
      <div className="forest-canopy" />
      {day && (
        <>
          <div className="forest-ray r1" />
          <div className="forest-ray r2" />
          <div className="forest-ray r3" />
        </>
      )}
      <div className="forest-trunk t1" />
      <div className="forest-trunk t2" />
      <div className="forest-trunk t3" />
      <div className="forest-floor" />
      {LEAVES.map((l, i) => (
        <span key={i} className="forest-leaf" style={{
          left: l.left, width: l.size, height: l.size,
          animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s`,
        }} />
      ))}
      {day
        ? BIRDS.map((b, i) => (
            <span key={i} className="forest-bird" style={{
              top: b.top, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`,
            }} />
          ))
        : FIREFLIES.map((f, i) => (
            <span key={i} className="forest-firefly" style={{
              left: f.left, top: f.top,
              animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`,
            }} />
          ))}
    </div>
  );
}

function FireplaceScene() {
  return (
    <div className="scene fireplace">
      <div className="fire-glow" />
      <div className="fire-hearth" />
      <div className="fire-cluster">
        {FLAMES.map((f, i) => (
          <span key={i} className="fire-flame" style={{
            left: f.left, width: f.w, height: f.h,
            animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`,
          }} />
        ))}
      </div>
      <div className="fire-logs" />
      {EMBERS.map((e, i) => (
        <span key={i} className="fire-ember" style={{
          left: e.left, animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`,
        }} />
      ))}
    </div>
  );
}

function DeepFocusScene() {
  return (
    <div className="scene void">
      <div className="void-core" />
    </div>
  );
}

/** Dispatch the right scene, falling back to a placeholder. */
function SceneContent({ themeId, themeName }) {
  switch (themeId) {
    case "airplane": return <AirplaneScene />;
    case "cafe":     return <CafeScene />;
    case "library":  return <LibraryScene />;
    case "subway":   return <SubwayScene />;
    case "airport":  return <AirportScene />;
    case "forest":   return <ForestScene />;
    case "fireplace":return <FireplaceScene />;
    case "void":     return <DeepFocusScene />;
    default:
      return (
        <div className="scene placeholder">
          <div className="pomo-soon">"{themeName}" scene — coming soon</div>
        </div>
      );
  }
}

/* ============================================================
   Main component
   ============================================================ */
export default function Pomodoro({ chimeEnabled = true, onPhaseComplete }) {
  const pomo = usePomodoro({
    onPhaseEnd: ({ endedPhase }) => {
      // Sound and system notification fire independently: the chime is gated
      // by its own setting, the notification by the master toggle (handled by
      // the caller). Either, both, or neither may be active.
      if (chimeEnabled) chime();
      onPhaseComplete?.({ endedPhase });
    },
  });
  const { settings, setSettings } = pomo;
  const theme = THEMES.find((t) => t.id === settings.theme) || THEMES[0];

  const ambientOn = settings.ambientSound;
  const ambientVolume = settings.ambientVolume ?? 35;

  // Start/stop the per-scene ambient audio with the timer and mute toggle.
  // Uses real looping audio files from /public/sounds/ via ambientPlayer.
  useEffect(() => {
    if (pomo.running && ambientOn) {
      playAmbient(settings.theme, ambientVolume / 100);
    } else {
      stopAmbient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, ambientOn, settings.theme]);

  // Live-update the volume level while a sound is playing.
  useEffect(() => {
    if (pomo.running && ambientOn) setAmbientVolume(ambientVolume / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientVolume]);

  // Always silence the audio when leaving the Pomodoro tab.
  useEffect(() => () => stopAmbient(), []);

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
        {/* The scene window — real photo + CSS animations layered on top */}
        <div
          className="pomo-window"
          style={SCENE_PHOTO[settings.theme] ? {
            backgroundImage: `url(${SCENE_PHOTO[settings.theme]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          } : undefined}
        >
          {/* Dark overlay so CSS animations + timer remain legible over photo */}
          <div className="pomo-photo-veil" />
          <SceneContent themeId={settings.theme} themeName={theme.name} />
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

        {/* Phase segmented control + session dots */}
        <div className="row" style={{ gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <Segmented
            value={pomo.phase}
            onChange={pomo.goToPhase}
            options={[
              { value: PHASES.WORK,  label: "Focus" },
              { value: PHASES.SHORT, label: "Short" },
              { value: PHASES.LONG,  label: "Long"  },
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
        {/* Session lengths */}
        <div className="card col-7" style={{ minWidth: 0 }}>
          <div className="card-head">
            <div className="card-title">
              <Icon.Timer /> Session lengths
            </div>
          </div>
          <div className="setting-row">
            <div className="name">Focus block</div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider value={settings.work} min={5} max={60} step={5}
                onChange={(v) => setSettings({ work: v })} format={(v) => v + "m"} />
            </div>
          </div>
          <div className="setting-row">
            <div className="name">Short break</div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider value={settings.shortBreak} min={1} max={20} step={1}
                onChange={(v) => setSettings({ shortBreak: v })} format={(v) => v + "m"} />
            </div>
          </div>
          <div className="setting-row">
            <div className="name">Long break</div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider value={settings.longBreak} min={5} max={45} step={5}
                onChange={(v) => setSettings({ longBreak: v })} format={(v) => v + "m"} />
            </div>
          </div>
          <div className="setting-row">
            <div className="name">
              Long break after
              <div className="sub">How many focus blocks before a long break</div>
            </div>
            <div className="ctrl" style={{ minWidth: 180 }}>
              <Slider value={settings.longEvery} min={2} max={8} step={1}
                onChange={(v) => setSettings({ longEvery: v })} format={(v) => v + "×"} />
            </div>
          </div>
        </div>

        {/* Scene picker */}
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
                style={SCENE_PHOTO[t.id]
                  ? { backgroundImage: `url(${SCENE_PHOTO[t.id]})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: t.swatch }
                }
                onClick={() => setSettings({ theme: t.id })}
                title={t.ready ? t.name : `${t.name} (coming soon)`}
              >
                {!t.ready && <span className="soon-tag">soon</span>}
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <div className="divider" style={{ margin: "12px 0" }} />

          {/* Ambient sound */}
          <div className="setting-row" style={{ padding: "2px 0", border: "none" }}>
            <div className="name">
              Ambient hum
              <div className="sub">A soft tone while the timer runs</div>
            </div>
            <Switch
              checked={ambientOn}
              onChange={(v) => setSettings({ ambientSound: v })}
            />
          </div>
          <div className="setting-row" style={{ padding: "2px 0", border: "none" }}>
            <div className="name" style={{ opacity: ambientOn ? 1 : 0.45 }}>Volume</div>
            <div
              className="ctrl"
              style={{ minWidth: 150, opacity: ambientOn ? 1 : 0.45, pointerEvents: ambientOn ? "auto" : "none" }}
            >
              <Slider
                value={ambientVolume}
                min={0}
                max={100}
                step={5}
                onChange={(v) => setSettings({ ambientVolume: v })}
                format={(v) => v + "%"}
              />
            </div>
          </div>

          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            All eight scenes are live. Café, Library, Airport, and Forest shift
            between day and night automatically. The hum is generated live and
            only plays while the timer is running.
          </p>
        </div>
      </div>
    </>
  );
}
