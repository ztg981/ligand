import { useEffect, useRef, useState } from "react";
import { usePomodoro, PHASES } from "../hooks/usePomodoro.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { Ring, Slider, Segmented, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import PomodoroPresets from "../components/PomodoroPresets.jsx";
import { pomodoroComplete, phaseChange, startAlarm } from "../lib/uiSounds.js";
import {
  playAmbient,
  stopAmbient,
  setAmbientVolume,
} from "../lib/ambientPlayer.js";

/* ============================================================
   Pomodoro tab - immersive focus timer with CSS scene themes.
   Each theme is a pure-CSS + React-elements scene that fills
   the porthole window. Café / Library / Airport switch between
   day (6 am–8 pm) and night variants automatically. Subway is
   always underground - no day/night.
   ============================================================ */

/* Real background photos (CC0/Pexels - bundled in /public/images/).
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
  // Pure-CSS ambient scenes (no photo needed) added Phase 22.
  { id: "sunset",   name: "Sunset",     ready: true,  swatch: "linear-gradient(180deg,#7a3f8f,#ff5e7e 60%,#ff9a5a)" },
  { id: "cosmos",   name: "Cosmos",     ready: true,  swatch: "linear-gradient(180deg,#0b1026,#2a1b4d)" },
  { id: "ocean",    name: "Ocean",      ready: true,  swatch: "linear-gradient(180deg,#7ad7e0,#088395,#0a4d68)" },
  { id: "rain",     name: "Rain",       ready: true,  swatch: "linear-gradient(180deg,#2a3340,#4a5a6a)" },
  { id: "zen",      name: "Zen",        ready: true,  swatch: "linear-gradient(180deg,#efe6d6,#d9bd97)" },
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

// Airplane - drifting clouds
const CLOUDS = [
  { w: 120, h: 34, top: "22%", dur: 34, delay:  0   },
  { w:  80, h: 24, top: "44%", dur: 26, delay: -8   },
  { w: 150, h: 40, top: "63%", dur: 42, delay: -18  },
  { w:  70, h: 20, top: "33%", dur: 30, delay: -24  },
];

// Café - coffee steam wisps (left positions relative to scene width)
const STEAM = [
  { left: "43%", dur: 3.1, delay:  0   },
  { left: "51%", dur: 2.7, delay: -1.1 },
  { left: "47%", dur: 3.5, delay: -2.0 },
];

// Café night - rain drops (positions within window element)
const RAIN = Array.from({ length: 20 }, (_, i) => ({
  left:   `${(i * 5.1) % 96}%`,
  height: 8 + (i % 5) * 3,
  dur:    0.55 + (i % 4) * 0.12,
  delay:  -(i * 0.14),
}));

// Library day - floating dust motes
const DUST = Array.from({ length: 12 }, (_, i) => ({
  left:  `${16 + (i * 5.9) % 62}%`,
  top:   `${30 + (i * 6.4) % 52}%`,
  dur:   10 + (i % 5) * 3.5,
  delay: -(i * 2.3),
  size:  1.5 + (i % 3) * 0.5,
}));

// Subway - horizontal light streaks sweeping right-to-left
const STREAKS = [
  { top: "17%", w:  72, dur: 1.55, delay:  0,    opacity: 0.85 },
  { top: "31%", w:  46, dur: 1.95, delay: -0.52, opacity: 0.60 },
  { top: "49%", w:  92, dur: 1.30, delay: -1.00, opacity: 0.78 },
  { top: "64%", w:  56, dur: 1.70, delay: -0.30, opacity: 0.55 },
  { top: "79%", w:  36, dur: 2.20, delay: -1.50, opacity: 0.65 },
  { top:  "9%", w:  62, dur: 1.85, delay: -0.80, opacity: 0.45 },
];

// Airport night - runway lights
const RUNWAY = Array.from({ length: 8 }, (_, i) => ({
  left:  `${7 + i * 12}%`,
  delay: -(i * 0.19),
}));

// Forest - drifting leaves
const LEAVES = Array.from({ length: 6 }, (_, i) => ({
  left: `${10 + ((i * 15) % 80)}%`,
  dur:  7 + (i % 4) * 2.5,
  delay: -(i * 1.8),
  size: 6 + (i % 3) * 2,
}));

// Forest day - birds drifting across
const BIRDS = [
  { top: "18%", dur: 15, delay: 0 },
  { top: "27%", dur: 19, delay: -8 },
];

// Forest night - fireflies
const FIREFLIES = Array.from({ length: 9 }, (_, i) => ({
  left: `${8 + ((i * 11) % 84)}%`,
  top:  `${32 + ((i * 7) % 52)}%`,
  dur:  3 + (i % 4),
  delay: -(i * 0.9),
}));

// Fireplace - flame tongues (clustered centre)
const FLAMES = [
  { left: "33%", w: 26, h: 52, dur: 0.95, delay: 0 },
  { left: "42%", w: 34, h: 76, dur: 1.15, delay: -0.3 },
  { left: "50%", w: 30, h: 64, dur: 0.8,  delay: -0.6 },
  { left: "58%", w: 24, h: 50, dur: 1.05, delay: -0.15 },
];

// Fireplace - rising embers
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
      {/* Window - bright day or rainy night */}
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
      {/* Bookshelf row lines - always visible */}
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

// Data for the new pure-CSS scenes (module scope so they're stable).
const STARS = Array.from({ length: 42 }, (_, i) => ({
  left: `${(i * 8.3) % 100}%`,
  top: `${(i * 13.7) % 92}%`,
  size: 1 + (i % 3),
  delay: -(i * 0.3),
}));
const RAINFALL = Array.from({ length: 34 }, (_, i) => ({
  left: `${(i * 7.1) % 100}%`,
  h: 12 + (i % 5) * 6,
  dur: 0.55 + (i % 4) * 0.12,
  delay: -(i * 0.13),
}));

// Sunset — a sinking sun over gradient water.
function SunsetScene() {
  return (
    <div className="scene sunset">
      <div className="sunset-sun" />
      <div className="sunset-water" />
    </div>
  );
}

// Cosmos — deep space, a slow nebula, and a field of twinkling stars.
function CosmosScene() {
  return (
    <div className="scene cosmos">
      <div className="cosmos-nebula" />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="cosmos-star"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

// Ocean — light caustics up top, two slow swaying wave bands.
function OceanScene() {
  return (
    <div className="scene ocean">
      <div className="ocean-caustic" />
      <div className="ocean-wave w1" />
      <div className="ocean-wave w2" />
    </div>
  );
}

// Rain — a calm dark scene with falling streaks.
function RainScene() {
  return (
    <div className="scene rainscene">
      {RAINFALL.map((r, i) => (
        <span
          key={i}
          className="rain-drop"
          style={{ left: r.left, height: r.h, animationDuration: `${r.dur}s`, animationDelay: `${r.delay}s` }}
        />
      ))}
    </div>
  );
}

// Zen — a soft, slow breathing circle to pace your breath while you focus.
function ZenScene() {
  return (
    <div className="scene zen">
      <div className="zen-ring" />
      <div className="zen-breathe" />
    </div>
  );
}

// Hyperfocus - pure dark animated red rings. `dimmed` softens it during breaks.
function HyperfocusScene({ dimmed = false }) {
  return (
    <div className={"scene hyperfocus" + (dimmed ? " dimmed" : "")}>
      <div className="hf-scene-rings">
        <span className="hf-scene-ring" style={{ animationDelay: "0s" }} />
        <span className="hf-scene-ring" style={{ animationDelay: "1.3s" }} />
        <span className="hf-scene-ring" style={{ animationDelay: "2.6s" }} />
      </div>
      <div className="hf-scene-label">HYPERFOCUS</div>
    </div>
  );
}

/** Dispatch the right scene, falling back to a placeholder. */
function SceneContent({ themeId, themeName, dimmed = false }) {
  switch (themeId) {
    case "hyperfocus": return <HyperfocusScene dimmed={dimmed} />;
    case "airplane": return <AirplaneScene />;
    case "cafe":     return <CafeScene />;
    case "library":  return <LibraryScene />;
    case "subway":   return <SubwayScene />;
    case "airport":  return <AirportScene />;
    case "forest":   return <ForestScene />;
    case "fireplace":return <FireplaceScene />;
    case "void":     return <DeepFocusScene />;
    case "sunset":   return <SunsetScene />;
    case "cosmos":   return <CosmosScene />;
    case "ocean":    return <OceanScene />;
    case "rain":     return <RainScene />;
    case "zen":      return <ZenScene />;
    default:
      return (
        <div className="scene placeholder">
          <div className="pomo-soon">"{themeName}" scene is coming soon</div>
        </div>
      );
  }
}

/* ============================================================
   Main component
   ============================================================ */
export default function Pomodoro({
  chimeEnabled = true,
  alarmOnComplete = false,
  onPhaseComplete,
  onFocusStateChange,
  ambientOverride = "none",
  tasks = [],
  goals = [],
  hyperfocus = false,
  logFocusSession,
}) {
  // What the user is focusing on this session (persisted so it survives
  // reloads). Value is "" (nothing), a task id, "goal:<goalId>" (a goal
  // directly), or "custom" (free text held in ligand.focusCustom).
  const [focusTaskId, setFocusTaskId] = useLocalStorage("ligand.focusTaskId", "");
  const [focusCustom, setFocusCustom] = useLocalStorage("ligand.focusCustom", "");
  // Carries the latest values into the phase-end callback without stale closures.
  const focusEndRef = useRef(null);
  // When "ring until dismissed" is on, a finished focus block starts an
  // insistent looping alarm; we hold its stop fn here and surface a Stop button.
  const alarmStopRef = useRef(null);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const stopAlarm = () => {
    if (alarmStopRef.current) {
      alarmStopRef.current();
      alarmStopRef.current = null;
    }
    setAlarmRinging(false);
  };
  // Latest alarm preference without re-subscribing the phase-end callback.
  const alarmPrefRef = useRef(alarmOnComplete);
  alarmPrefRef.current = alarmOnComplete;

  const pomo = usePomodoro({
    onPhaseEnd: ({ endedPhase }) => {
      // A finished WORK block is a reward (descending bing-bong); a finished
      // break is "back to focus" (rising lift). Both follow the Pomodoro chime
      // setting, not the UI-sounds toggle. If the user opted into the insistent
      // "ring until dismissed" alarm, a finished FOCUS block loops that instead
      // of the gentle chime (kitchen-timer style), until they hit Stop.
      if (chimeEnabled) {
        if (endedPhase === PHASES.WORK) {
          if (alarmPrefRef.current) {
            stopAlarm(); // clear any prior ring first
            alarmStopRef.current = startAlarm();
            setAlarmRinging(true);
          } else {
            pomodoroComplete();
          }
        } else {
          phaseChange();
        }
      }
      // Log a completed focus block: a task logs to its goal, "goal:<id>"
      // logs to that goal directly, custom text logs with no goal. Only
      // "nothing in particular" logs nothing at all.
      if (endedPhase === PHASES.WORK && focusEndRef.current) {
        const { taskId, work, tasks: ts } = focusEndRef.current;
        if (taskId && logFocusSession) {
          let goalId = null;
          if (taskId.startsWith("goal:")) {
            goalId = taskId.slice(5);
          } else if (taskId !== "custom") {
            const task = ts.find((t) => t.id === taskId);
            if (!task) goalId = null;
            else goalId = task.goalId || null;
          }
          logFocusSession({ minutes: work, goalId });
        }
      }
      onPhaseComplete?.({ endedPhase });
    },
  });
  const { settings, setSettings } = pomo;
  focusEndRef.current = { taskId: focusTaskId, work: settings.work, tasks };
  const theme = THEMES.find((t) => t.id === settings.theme) || THEMES[0];

  // Report FOCUS-block active state up to App (drives the website-blocker auto
  // mode: block during focus, unblock on break/stop). Reset to false on unmount
  // (leaving the tab stops the timer, so it must lift the block too).
  useEffect(() => {
    onFocusStateChange?.(pomo.running && pomo.phase === PHASES.WORK);
  }, [pomo.running, pomo.phase, onFocusStateChange]);
  useEffect(() => () => onFocusStateChange?.(false), [onFocusStateChange]);

  // Hyperfocus overrides the scene without mutating the saved theme, so the
  // user's previous scene is automatically restored when the mode turns off.
  const effectiveThemeId = hyperfocus ? "hyperfocus" : settings.theme;
  const effectiveThemeName = hyperfocus ? "Hyperfocus" : theme.name;
  const showScenePhoto = !hyperfocus && SCENE_PHOTO[settings.theme];
  const sceneDimmed = hyperfocus && pomo.phase !== PHASES.WORK; // soften on breaks
  const ringColor = hyperfocus ? "#cc1111" : "#fff";

  // Hyperfocus collapses the timer settings to keep the tab distraction-free.
  const [showHfSettings, setShowHfSettings] = useState(false);

  // Subtle "Start a focus session?" prompt while hyperfocus is on and idle.
  const [promptDismissed, setPromptDismissed] = useState(false);
  useEffect(() => {
    if (!hyperfocus) setPromptDismissed(false);
  }, [hyperfocus]);
  const showStartPrompt = hyperfocus && !pomo.running && !promptDismissed;

  // Focus mode: hides all surrounding UI, leaving only the scene + timer.
  // Only toggleable from within; exits cleanly on either the button or when
  // the timer is paused/stopped.
  const [focusMode, setFocusMode] = useState(false);

  // Pause stopwatch: pausing mid-block starts a count-UP of how long you've
  // been stopped, next to a slider for how long you MEANT to stop. Interrupts
  // stop being open-ended ("I'll just check my phone") and become a measured
  // break with a visible edge. Never shaming: overshooting just says so.
  const [pausedAt, setPausedAt] = useState(null); // epoch ms | null
  const [pauseElapsedSec, setPauseElapsedSec] = useState(0);
  const [pausePlanMin, setPausePlanMin] = useLocalStorage("ligand.pausePlanMin", 5);
  useEffect(() => {
    if (!pausedAt) return undefined;
    const t = setInterval(
      () => setPauseElapsedSec(Math.floor((Date.now() - pausedAt) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [pausedAt]);
  // Resuming (or resetting/skipping into a fresh block) clears the stopwatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clear on resume; guarded so it can't cascade
    if (pomo.running && pausedAt) setPausedAt(null);
  }, [pomo.running, pausedAt]);
  const handlePause = () => {
    pomo.pause();
    setPauseElapsedSec(0);
    setPausedAt(Date.now());
  };
  const handleReset = () => {
    setPausedAt(null);
    pomo.reset();
  };
  const pausePlanSec = pausePlanMin * 60;
  const pauseOver = pausedAt && pauseElapsedSec > pausePlanSec;

  // Auto-exit focus mode if the timer stops.
  useEffect(() => {
    if (!pomo.running && focusMode) setFocusMode(false);
  }, [pomo.running, focusMode]);

  const ambientOn = settings.ambientSound;
  const ambientVolume = settings.ambientVolume ?? 35;
  // If the user has set a global ambient override in Settings > Wallpaper & sound,
  // play that instead of the scene-default sound. "none" falls back to scene default.
  const soundId = (ambientOverride && ambientOverride !== "none")
    ? ambientOverride
    : settings.theme;

  // Start/stop the per-scene ambient audio with the timer and mute toggle.
  // Uses real looping audio files from /public/sounds/ via ambientPlayer.
  useEffect(() => {
    if (pomo.running && ambientOn) {
      playAmbient(soundId, ambientVolume / 100);
    } else {
      stopAmbient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, ambientOn, soundId]);

  // Live-update the volume level while a sound is playing.
  useEffect(() => {
    if (pomo.running && ambientOn) setAmbientVolume(ambientVolume / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientVolume]);

  // Always silence the audio when leaving the Pomodoro tab.
  useEffect(() => () => stopAmbient(), []);

  // Safety: an insistent completion alarm auto-stops after 90s so it can never
  // ring forever if the user has stepped away. Also stop it on unmount.
  useEffect(() => {
    if (!alarmRinging) return;
    const t = setTimeout(() => stopAlarm(), 90000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmRinging]);
  useEffect(() => () => stopAlarm(), []);

  // Escape key exits focus mode - never trap the user.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => { if (e.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  return (
    <>
      {/* ── Focus mode overlay ──────────────────────────────────────────
          Fixed fullscreen layer that hides all surrounding UI.
          Only shown when focusMode is true. Auto-exits when timer stops.
          ──────────────────────────────────────────────────────────────── */}
      {focusMode && (
        <div
          className="pomo-focus-overlay"
          aria-label="Focus mode. Press Escape or click Exit to leave"
        >
          {/* Exit button - always visible, small, top-right */}
          <button
            className="pomo-focus-exit"
            onClick={() => setFocusMode(false)}
            title="Exit focus mode"
            aria-label="Exit focus mode"
          >
            <Icon.Close /> <span>Exit focus</span>
          </button>

          {/* Scene window - expanded */}
          <div
            className={"pomo-focus-window" + (hyperfocus ? " hyperfocus" : "")}
            style={showScenePhoto ? {
              backgroundImage: `url(${SCENE_PHOTO[settings.theme]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            } : undefined}
          >
            <div className="pomo-photo-veil" />
            <SceneContent themeId={effectiveThemeId} themeName={effectiveThemeName} dimmed={sceneDimmed} />

            {/* Timer ring - centred */}
            <div className="pomo-focus-center">
              <Ring
                size={240}
                strokeWidth={8}
                value={pomo.progress}
                color={ringColor}
                label={mmss(pomo.remaining)}
                sub={PHASE_LABEL[pomo.phase]}
              />
              {/* Minimal transport controls */}
              <div className="pomo-focus-controls">
                {pomo.running ? (
                  <button className="btn" onClick={handlePause}>
                    <Icon.Pause /> Pause
                  </button>
                ) : (
                  <button className="btn primary" onClick={pomo.start}>
                    <Icon.Play /> Start
                  </button>
                )}
                <button className="btn ghost" onClick={handleReset} title="Reset">
                  <Icon.Reset />
                </button>
                <button className="btn ghost" onClick={pomo.skip} title="Skip">
                  <Icon.Arrow />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-head">
        <div>
          <div className="eyebrow">Focus</div>
          <h1 className="page-title">Pomodoro</h1>
          <p className="page-sub">
            An immersive focus timer. Adjust your blocks, pick a scene, and take
            it one stretch at a time. Breaks are part of the work.
          </p>
        </div>
        {/* Focus mode toggle - only shown when a session is running */}
        {pomo.running && !focusMode && (
          <button
            className="btn ghost"
            onClick={() => setFocusMode(true)}
            title="Enter focus mode (fullscreen)"
            style={{ alignSelf: "center" }}
          >
            <Icon.Sun /> Focus mode
          </button>
        )}
      </div>

      {/* Subtle auto-start prompt while hyperfocus is on and the timer is idle. */}
      {showStartPrompt && (
        <div className="hf-start-prompt">
          <span>Start a focus session?</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary sm" onClick={() => pomo.start()}>
              <Icon.Play /> Start
            </button>
            <button className="btn ghost sm" onClick={() => setPromptDismissed(true)}>
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="pomo-stage">
        {/* The scene window - real photo + CSS animations layered on top */}
        <div
          className={"pomo-window" + (hyperfocus ? " hyperfocus" : "")}
          style={showScenePhoto ? {
            backgroundImage: `url(${SCENE_PHOTO[settings.theme]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          } : undefined}
        >
          {/* Dark overlay so CSS animations + timer remain legible over photo */}
          <div className="pomo-photo-veil" />
          <SceneContent themeId={effectiveThemeId} themeName={effectiveThemeName} dimmed={sceneDimmed} />
          <div className="pomo-center">
            <Ring
              size={210}
              strokeWidth={8}
              value={pomo.progress}
              color={ringColor}
              label={mmss(pomo.remaining)}
              sub={PHASE_LABEL[pomo.phase]}
            />
          </div>
        </div>

        {/* Insistent completion alarm — a dismiss banner while it rings. */}
        {alarmRinging && (
          <button className="pomo-alarm-stop" onClick={stopAlarm} data-mute-click>
            <Icon.Bell /> Alarm ringing — tap to stop
          </button>
        )}

        {/* Transport controls */}
        <div className="row" style={{ gap: 10 }}>
          {pomo.running ? (
            <button className="btn" onClick={handlePause}>
              <Icon.Pause /> Pause
            </button>
          ) : (
            <button className="btn primary" onClick={pomo.start}>
              <Icon.Play /> {pausedAt ? "Resume" : "Start"}
            </button>
          )}
          <button className="btn ghost" onClick={handleReset} title="Reset this block">
            <Icon.Reset /> Reset
          </button>
          <button className="btn ghost" onClick={pomo.skip} title="Skip to next phase">
            <Icon.Arrow /> Skip
          </button>
        </div>

        {/* The pause stopwatch: how long you've been stopped vs. how long
           you meant to stop. */}
        {pausedAt && (
          <div className={"card pomo-pause" + (pauseOver ? " over" : "")}>
            <div className="pomo-pause-head">
              <span className="pomo-pause-lbl">Stopped for</span>
              <span className="pomo-pause-clock mono">{mmss(pauseElapsedSec)}</span>
              <span className="pomo-pause-plan">of {pausePlanMin}m planned</span>
            </div>
            <div className="pomo-pause-bar" aria-hidden="true">
              <span
                className="pomo-pause-fill"
                style={{ width: `${Math.min(100, (pauseElapsedSec / pausePlanSec) * 100)}%` }}
              />
            </div>
            <div className="pomo-pause-slider">
              <span className="pomo-pause-slider-lbl">I'm stopping for</span>
              <Slider
                value={pausePlanMin}
                min={1}
                max={30}
                step={1}
                onChange={(v) => setPausePlanMin(v)}
                format={(v) => v + "m"}
              />
            </div>
            <p className="pomo-pause-note" role="status">
              {pauseOver
                ? "Past what you planned. No drama, the timer held your place. Resume when ready."
                : "The timer is holding your place. Resume whenever."}
            </p>
          </div>
        )}

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

        {/* Focusing on - a task (logs to its goal), a goal directly, or your
           own words. "Nothing in particular" logs nothing. */}
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Focusing on</span>
          <select
            className="input"
            value={focusTaskId}
            onChange={(e) => setFocusTaskId(e.target.value)}
            style={{ width: "auto", maxWidth: 280, flex: "none" }}
          >
            <option value="">Nothing in particular</option>
            <option value="custom">Something else… (type it)</option>
            {goals.length > 0 && (
              <optgroup label="Your goals">
                {goals.map((g) => (
                  <option key={g.id} value={"goal:" + g.id}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
            {tasks.filter((t) => !t.done).length > 0 && (
              <optgroup label="Your tasks">
                {tasks
                  .filter((t) => !t.done)
                  .map((t) => {
                    const g = t.goalId ? goals.find((x) => x.id === t.goalId) : null;
                    return (
                      <option key={t.id} value={t.id}>
                        {t.text}
                        {g ? ` · ${g.name}` : ""}
                      </option>
                    );
                  })}
              </optgroup>
            )}
          </select>
          {focusTaskId === "custom" && (
            <input
              className="input"
              placeholder="What are you working on?"
              value={focusCustom}
              maxLength={60}
              onChange={(e) => setFocusCustom(e.target.value)}
              style={{ width: 200, flex: "none" }}
            />
          )}
        </div>
      </div>

      {/* Hyperfocus: a minimal, collapsed settings strip - no scene picker (it's
          locked anyway), just the timer lengths tucked behind one quiet toggle. */}
      {hyperfocus && (
        <div className="hf-pomo-settings">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setShowHfSettings((s) => !s)}
          >
            <Icon.Timer width={13} height={13} />
            {showHfSettings ? "Hide timer settings" : "Adjust timer"}
          </button>
          {showHfSettings && (
            <div className="card hf-pomo-settings-card">
              <div className="hf-slider-row">
                <span className="name">Focus</span>
                <Slider value={settings.work} min={5} max={60} step={5}
                  onChange={(v) => setSettings({ work: v })} format={(v) => v + "m"} />
              </div>
              <div className="hf-slider-row">
                <span className="name">Short break</span>
                <Slider value={settings.shortBreak} min={1} max={20} step={1}
                  onChange={(v) => setSettings({ shortBreak: v })} format={(v) => v + "m"} />
              </div>
              <div className="hf-slider-row">
                <span className="name">Long break</span>
                <Slider value={settings.longBreak} min={5} max={45} step={5}
                  onChange={(v) => setSettings({ longBreak: v })} format={(v) => v + "m"} />
              </div>
              <div className="hf-slider-row">
                <span className="name">Long break after</span>
                <Slider value={settings.longEvery} min={2} max={8} step={1}
                  onChange={(v) => setSettings({ longEvery: v })} format={(v) => v + "×"} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings (standard mode only) */}
      {!hyperfocus && (
      <div className="grid grid-12" style={{ marginTop: 20 }}>
        {/* Session lengths */}
        <div className="card col-7" style={{ minWidth: 0 }}>
          <div className="card-head">
            <div className="card-title">
              <Icon.Timer /> Session lengths
            </div>
          </div>
          <PomodoroPresets settings={settings} onApply={(cfg) => setSettings(cfg)} />
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
          {hyperfocus && (
            <p className="muted" style={{ fontSize: 11.5, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon.Bolt width={13} height={13} /> Scene locked during Hyperfocus mode
            </p>
          )}
          <div className={"theme-pick" + (hyperfocus ? " locked" : "")}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={"theme-tile" + (settings.theme === t.id ? " active" : "")}
                disabled={hyperfocus}
                style={SCENE_PHOTO[t.id]
                  ? { backgroundImage: `url(${SCENE_PHOTO[t.id]})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: t.swatch }
                }
                onClick={() => !hyperfocus && setSettings({ theme: t.id })}
                title={hyperfocus ? "Locked during Hyperfocus" : (t.ready ? t.name : `${t.name} (coming soon)`)}
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
            between day and night automatically. Real CC0 audio loops per scene -
            override the sound in Settings → Wallpaper &amp; sound.
          </p>
        </div>
      </div>
      )}
    </>
  );
}
