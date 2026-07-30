import { useEffect, useMemo, useRef, useState } from "react";
import { PHASES } from "../hooks/usePomodoro.js";
import { todayKey } from "../lib/model.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import useSquishResize from "../hooks/useSquishResize.js";
import FocusPicker from "../components/FocusPicker.jsx";
import { Ring, Slider, Segmented, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import PomodoroPresets from "../components/PomodoroPresets.jsx";
import { pauseNudge } from "../lib/uiSounds.js";
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

/* The scene's narrow width — the bottom of the drag-to-resize range, and the
   width it sits at by default. Kept in step with `max-width` on .pomo-window
   in index.css; the gesture needs it as a number, CSS needs it as a length. */
const POMO_NARROW_PX = 620;

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
  { id: "highway",  name: "CA Highway", ready: true,  swatch: "linear-gradient(180deg,#2f7fd4,#8fb6d8 52%,#c8a86a)" },
  { id: "nyc",      name: "New York",   ready: true,  swatch: "linear-gradient(180deg,#1b2340,#7a4a6a 62%,#e8a24a)" },
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

/* California highway — the roadside furniture, laid out once at module scope.

   Everything rushes at you from a single vanishing point, so each item only
   needs a lane (how far off-centre it ends up), a start offset, and a cycle
   length. Staggering the NEGATIVE delays is what makes the traffic feel
   continuous instead of arriving in convoys: by the time the scene paints,
   each item is already partway through its run. */
/* `lane` is in PIXELS, deliberately. These are 4px-wide sticks, and a
   percentage inside translate() resolves against the element's own box — so a
   "30%" lane moved a palm about one pixel sideways and the whole roadside sat
   in a heap on the vanishing point. */
const HW_PALMS = Array.from({ length: 10 }, (_, i) => ({
  side: i % 2 ? 1 : -1,
  lane: 150 + ((i * 47) % 160), // px off centre by the time it exits frame
  dur: 7.5 + ((i * 7) % 5) * 0.6,
  delay: -(i * 0.94),
  lean: ((i * 37) % 11) - 5, // a few degrees of trunk lean each
}));
const HW_POLES = Array.from({ length: 6 }, (_, i) => ({
  side: i % 2 ? 1 : -1,
  lane: 260 + ((i * 53) % 120),
  dur: 6.4,
  delay: -(i * 1.07),
}));
// Dashes on the centre line. One element each, so they can accelerate outward
// the way real markings do rather than sliding at a flat speed.
const HW_DASHES = Array.from({ length: 7 }, (_, i) => ({ delay: -(i * 0.34), dur: 2.4 }));
const HW_CARS = [
  { delay: -1.2, dur: 9, lane: -22, tint: "#d8dde4" },
  { delay: -5.6, dur: 11, lane: 26, tint: "#c05a4a" },
];

/* New York — a skyline built from real proportions rather than random bars.

   `w` and `h` are percentages of the scene; `spire` gives a couple of them the
   setback-and-mast silhouette that actually reads as Manhattan. Window grids
   come from the CSS; `lit` seeds how many of them are on. */
/* Widths and heights are deliberately uneven and the tall ones are off-centre.
   An evenly-spread row of similar towers reads as a bar chart, not a city —
   real skylines are mostly low mass with a few things sticking out of it. */
const NYC_BUILDINGS = [
  { w: 9, h: 22, lit: 0.34 },
  { w: 5, h: 41, lit: 0.55 },
  { w: 11, h: 17, lit: 0.24 },
  { w: 4, h: 62, lit: 0.6, spire: true },
  { w: 8, h: 27, lit: 0.4 },
  { w: 6, h: 19, lit: 0.22 },
  { w: 5, h: 78, lit: 0.66, spire: true }, // the tall one, off-centre on purpose
  { w: 7, h: 31, lit: 0.44 },
  { w: 12, h: 15, lit: 0.2 },
  { w: 4, h: 49, lit: 0.5 },
  { w: 9, h: 24, lit: 0.36 },
  { w: 6, h: 36, lit: 0.46 },
  { w: 10, h: 13, lit: 0.18 },
  { w: 5, h: 29, lit: 0.38 },
];
// Windows that flick on and off — a building is never entirely still at dusk.
const NYC_WINDOWS = Array.from({ length: 26 }, (_, i) => ({
  left: 3 + ((i * 17) % 94),
  bottom: 6 + ((i * 23) % 52),
  dur: 4 + ((i * 11) % 9),
  delay: -(i * 1.7),
}));
// Headlights and tail-lights streaking down the avenue.
const NYC_TRAFFIC = Array.from({ length: 9 }, (_, i) => ({
  dir: i % 3 === 0 ? -1 : 1,
  bottom: 1 + ((i * 5) % 10),
  dur: 2.6 + ((i * 7) % 6) * 0.45,
  delay: -(i * 0.83),
  warm: i % 3 !== 0, // oncoming headlights are white, tail-lights red
}));
const NYC_STEAM = Array.from({ length: 4 }, (_, i) => ({
  left: 18 + i * 21,
  dur: 7 + (i % 3) * 1.8,
  delay: -(i * 2.3),
  size: 40 + (i % 3) * 18,
}));

/* California highway — driving into the heat, palms streaming past.

   The road is a CSS trapezoid rather than an image, so the whole thing is one
   vanishing point everything else can be aimed at: markings, palms, poles and
   traffic all run the same outward path from the horizon, which is what sells
   the motion. Layered haze near the horizon does the rest — a hard edge where
   the road meets the hills is the thing that always looks fake. */
function HighwayScene() {
  return (
    <div className="scene highway">
      <div className="hw-sky" />
      <div className="hw-sun" />
      <div className="hw-hills far" />
      <div className="hw-hills near" />
      {/* Dry ground either side of the tarmac. Without it the road's clipped
         trapezoid left the scene's own background showing through as two black
         wedges in the bottom corners. */}
      <div className="hw-ground" />
      <div className="hw-haze" />
      <div className="hw-road">
        <div className="hw-asphalt" />
        {HW_DASHES.map((d, i) => (
          <span
            key={i}
            className="hw-dash"
            style={{ animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
          />
        ))}
        <span className="hw-edge left" />
        <span className="hw-edge right" />
        {/* The mirage: a band of shimmer sitting just above the tarmac. */}
        <div className="hw-shimmer" />
      </div>
      {HW_CARS.map((c, i) => (
        <span
          key={`car${i}`}
          className="hw-car"
          style={{
            "--lane": `${c.lane}px`,
            "--tint": c.tint,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}
      {HW_POLES.map((p, i) => (
        <span
          key={`pole${i}`}
          className="hw-pole"
          style={{
            "--lane": `${p.side * p.lane}px`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      {HW_PALMS.map((p, i) => (
        <span
          key={`palm${i}`}
          className="hw-palm"
          style={{
            "--lane": `${p.side * p.lane}px`,
            "--lean": `${p.lean}deg`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {/* The trunk is its own element because it's tapered with a
             clip-path, and a clip-path on the palm itself would cut the
             fronds off with it — which left every tree a bare brown stick. */}
          <i className="hw-trunk" />
          <i className="hw-frond a" />
          <i className="hw-frond b" />
          <i className="hw-frond c" />
          <i className="hw-frond d" />
          <i className="hw-frond e" />
        </span>
      ))}
      <div className="hw-glare" />
    </div>
  );
}

/* New York at dusk — the skyline, the avenue, and the steam.

   Dusk rather than full night on purpose: the warm band low in the sky is
   what reads as a city (light pollution against a cooling sky), and it gives
   the buildings something to be silhouetted against instead of sitting on
   flat black. */
function NycScene() {
  return (
    <div className="scene nyc">
      <div className="nyc-sky" />
      <div className="nyc-glow" />
      <span className="nyc-plane" />
      <div className="nyc-skyline far">
        {NYC_BUILDINGS.map((b, i) => (
          <span
            key={`f${i}`}
            className="nyc-bldg"
            style={{ "--w": `${b.w * 0.8}%`, "--h": `${b.h * 0.62}%` }}
          />
        ))}
      </div>
      <div className="nyc-skyline near">
        {NYC_BUILDINGS.map((b, i) => (
          <span
            key={i}
            className={"nyc-bldg lit" + (b.spire ? " spire" : "")}
            style={{ "--w": `${b.w}%`, "--h": `${b.h}%`, "--lit": b.lit }}
          />
        ))}
      </div>
      {NYC_WINDOWS.map((w, i) => (
        <span
          key={`w${i}`}
          className="nyc-win"
          style={{
            left: `${w.left}%`,
            bottom: `${w.bottom}%`,
            animationDuration: `${w.dur}s`,
            animationDelay: `${w.delay}s`,
          }}
        />
      ))}
      {NYC_STEAM.map((s, i) => (
        <span
          key={`s${i}`}
          className="nyc-steam"
          style={{
            left: `${s.left}%`,
            "--size": `${s.size}px`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      <div className="nyc-street" />
      {NYC_TRAFFIC.map((t, i) => (
        <span
          key={`t${i}`}
          className={"nyc-car" + (t.warm ? " warm" : " tail")}
          style={{
            "--dir": t.dir,
            bottom: `${t.bottom}%`,
            animationDuration: `${t.dur}s`,
            animationDelay: `${t.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

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
      <span className="cosmos-shoot" />
      <span className="cosmos-shoot two" />
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
    case "highway":  return <HighwayScene />;
    case "nyc":      return <NycScene />;
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
  // The timer engine lives in App (see hooks/usePomodoroEngine.js) so it keeps
  // running, chiming and logging when this lazily-mounted tab unmounts. This
  // component is now purely the view over it.
  engine,
  chimeEnabled = true,
  ambientOverride = "none",
  tasks = [],
  goals = [],
  hyperfocus = false,
  // Used only by "log focus you already did" — the automatic logging of
  // completed blocks happens in the engine, so it survives tab changes.
  logFocusSession,
  logPause,
  pauseLog = [],
}) {
  const {
    pomo,
    focusTaskId,
    setFocusTaskId,
    focusCustom,
    setFocusCustom,
    alarmRinging,
    stopAlarm,
    endSession,
  } = engine;
  // A short receipt after ending early, so banked focus time is visible rather
  // than something you have to trust happened.
  const [endedNote, setEndedNote] = useState("");
  useEffect(() => {
    if (!endedNote) return undefined;
    const t = setTimeout(() => setEndedNote(""), 6000);
    return () => clearTimeout(t);
  }, [endedNote]);
  const { settings, setSettings } = pomo;
  const theme = THEMES.find((t) => t.id === settings.theme) || THEMES[0];

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

  /* How far the scene reaches into the empty space beside it, and which way.

     Stored as a fraction of the available slack rather than a width, so it
     survives a window resize (see useSquishResize). Pull the scene's right
     edge right to lean it right, its left edge left to lean it left. */
  const [sceneSize, setSceneSize] = useLocalStorage("ligand.pomoScene", {
    grow: 0,
    side: "right",
  });
  const squish = useSquishResize({
    grow: sceneSize?.grow ?? 0,
    side: sceneSize?.side === "left" ? "left" : "right",
    onChange: setSceneSize,
    narrowPx: POMO_NARROW_PX,
    // Hyperfocus is a deliberately fixed, undistracting layout — nothing to
    // resize there, and a jiggling panel would undo the point of it.
    enabled: !hyperfocus,
  });

  // Focus mode: hides all surrounding UI, leaving only the scene + timer.
  // Only toggleable from within; exits cleanly on either the button or when
  // the timer is paused/stopped.
  const [focusMode, setFocusMode] = useState(false);

  // "Log past focus": credit real focus time you did BEFORE opening the timer
  // (or forgot to start it). It writes honest minutes to today's focus log,
  // attributed to whatever you're focusing on — never a fake timed block.
  const [showLogPast, setShowLogPast] = useState(false);
  const [pastMin, setPastMin] = useState(25);
  const [justLoggedMin, setJustLoggedMin] = useState(0);
  useEffect(() => {
    if (!justLoggedMin) return undefined;
    const t = setTimeout(() => setJustLoggedMin(0), 5000);
    return () => clearTimeout(t);
  }, [justLoggedMin]);

  // Pause stopwatch: pausing mid-block starts a count-UP of how long you've
  // been stopped, next to a slider for how long you MEANT to stop. Interrupts
  // stop being open-ended ("I'll just check my phone") and become a measured
  // break with a visible edge. Never shaming: overshooting just says so.
  // pausedAt is an absolute epoch, persisted (device-local) so a refresh while
  // stopped restores the "Stopped for X" card still counting from when you
  // actually paused — the timer countdown already survives a reload, and this
  // keeps its companion stopwatch honest instead of resetting to 0.
  const [pausedAt, setPausedAt] = useLocalStorage("ligand.pomodoro.pausedAt", null); // epoch ms | null
  const [pauseElapsedSec, setPauseElapsedSec] = useState(
    pausedAt ? Math.floor((Date.now() - pausedAt) / 1000) : 0
  );
  const [pausePlanMin, setPausePlanMin] = useLocalStorage("ligand.pausePlanMin", 5);
  useEffect(() => {
    if (!pausedAt) return undefined;
    // Correct immediately on (re)mount, then tick every second.
    setPauseElapsedSec(Math.floor((Date.now() - pausedAt) / 1000));
    const t = setInterval(
      () => setPauseElapsedSec(Math.floor((Date.now() - pausedAt) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [pausedAt]);
  // Resuming (or resetting/skipping into a fresh block) clears the stopwatch
  // and records how long the stop lasted — stopped time is data too.
  useEffect(() => {
    if (pomo.running && pausedAt) {
      logPause?.({ seconds: (Date.now() - pausedAt) / 1000 });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clear on resume; guarded so it can't cascade
      setPausedAt(null);
    }
    // setPausedAt is a stable useState setter (via useLocalStorage), not a real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, pausedAt, logPause]);
  const pausedTodayMin = useMemo(() => {
    const today = todayKey();
    return Math.round(
      pauseLog
        .filter((p) => p.date === today)
        .reduce((n, p) => n + (p.seconds || 0), 0) / 60
    );
  }, [pauseLog]);
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

  // A gentle chime the moment a pause runs past the time you planned to stop —
  // an external cue to come back, since "I'll just check my phone" is exactly
  // the interrupt that quietly eats an afternoon. Fires once per pause (the ref
  // resets when a new pause starts), and follows the Pomodoro chime setting.
  const pauseOverFiredRef = useRef(false);
  useEffect(() => {
    pauseOverFiredRef.current = false;
  }, [pausedAt]);
  useEffect(() => {
    if (pausedAt && pauseOver && !pauseOverFiredRef.current) {
      pauseOverFiredRef.current = true;
      if (chimeEnabled) pauseNudge();
    }
  }, [pauseOver, pausedAt, chimeEnabled]);

  // Auto-exit focus mode if the timer stops.
  useEffect(() => {
    if (!pomo.running && focusMode) setFocusMode(false);
  }, [pomo.running, focusMode]);

  // (Chime acknowledgement and the alarm's safety timeout now live in the
  // app-level engine, so they work on every tab rather than only this one.)

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

  // Escape key exits focus mode - never trap the user.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => { if (e.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  // "Log past focus" helpers: a friendly minutes label, the goal the current
  // focus selection maps to (same rules the phase-end auto-log uses), and a
  // human label for what the time will be credited to.
  const fmtMin = (m) =>
    m >= 60
      ? m % 60 === 0
        ? m / 60 + "h"
        : Math.floor(m / 60) + "h " + (m % 60) + "m"
      : m + "m";
  const focusGoalOf = (taskId) => {
    if (taskId?.startsWith("goal:")) return taskId.slice(5);
    if (taskId && taskId !== "custom") return tasks.find((t) => t.id === taskId)?.goalId || null;
    return null;
  };
  const focusLabel = (() => {
    if (!focusTaskId) return "nothing in particular";
    if (focusTaskId === "custom") return focusCustom.trim() || "something else";
    if (focusTaskId.startsWith("goal:"))
      return goals.find((g) => g.id === focusTaskId.slice(5))?.name || "a goal";
    return tasks.find((t) => t.id === focusTaskId)?.text || "nothing in particular";
  })();
  const logPastFocus = () => {
    const m = Math.round(pastMin);
    if (!m || m <= 0) return;
    logFocusSession?.({ minutes: m, goalId: focusGoalOf(focusTaskId) });
    setJustLoggedMin(m);
    setShowLogPast(false);
  };

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
          ref={squish.ref}
          className={"pomo-window" + (hyperfocus ? " hyperfocus" : "") + squish.className}
          role="group"
          aria-label="Focus scene — drag either edge sideways to resize"
          style={{
            ...(showScenePhoto ? {
              backgroundImage: `url(${SCENE_PHOTO[settings.theme]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            } : null),
            ...squish.style,
          }}
          {...squish.keyHandlers}
        >
          {/* Grab strips on the two edges. Each grows the scene toward its own
             side, so the opposite edge stays where it is — unlabelled and
             unadorned, found by the resize cursor rather than announced. */}
          {!hyperfocus && (
            <>
              <div {...squish.gripProps("left")} />
              <div {...squish.gripProps("right")} />
            </>
          )}
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
            <Icon.Bell /> Alarm ringing. Tap to stop
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
          {/* Done for the day, mid-block. Unlike Reset (which throws the block
             away), this BANKS the minutes already spent into your focus log. */}
          <button
            className="btn ghost"
            onClick={() => {
              setPausedAt(null);
              const r = endSession();
              const banked = r?.wasFocus && r.elapsedSec >= 5;
              setEndedNote(
                !banked
                  ? "Session ended."
                  : r.elapsedMin < 1
                    ? "Session ended. Under a minute added to today's focus."
                    : `Session ended. ${fmtMin(Math.round(r.elapsedMin))} added to today's focus.`
              );
            }}
            title="End the session and keep the focus time so far"
          >
            <Icon.Check /> End session
          </button>
        </div>

        {endedNote && (
          <div className="pomo-logpast-done" role="status">
            <span className="pomo-logpast-done-msg">
              <Icon.Check width={14} height={14} /> {endedNote}
            </span>
          </div>
        )}

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
              {pausedTodayMin > 0 ? ` · stopped ${pausedTodayMin}m today` : ""}
            </span>
          </div>
        </div>

        {/* Focusing on - a task (logs to its goal), a goal directly, or your
           own words. "Nothing in particular" still logs the block, just with
           no goal attached. */}
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Focusing on</span>
          <FocusPicker
            value={focusTaskId}
            customText={focusCustom}
            onChange={setFocusTaskId}
            onCustomText={setFocusCustom}
            tasks={tasks}
            goals={goals}
          />
        </div>

        {/* Log focus you already did — for when you got into it before opening
           the timer, or forgot to start it. Adds honest minutes to today's
           log, attributed to whatever you're focusing on above. */}
        <div className="pomo-logpast-wrap">
          {showLogPast ? (
            <div className="card pomo-logpast">
              <div className="pomo-logpast-head">
                <span className="pomo-logpast-title">
                  <Icon.Timer width={14} height={14} /> Already been focusing?
                </span>
                <button
                  className="iconbtn sm"
                  onClick={() => setShowLogPast(false)}
                  title="Close"
                  aria-label="Close"
                >
                  <Icon.Close width={13} height={13} />
                </button>
              </div>
              <p className="pomo-logpast-sub">
                Add time you already put in. It counts toward today just like a
                timed block — no need to run the clock after the fact.
              </p>
              <div className="pomo-logpast-chips" role="group" aria-label="How long did you focus?">
                {[15, 25, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={"chip" + (pastMin === m ? " accent" : "")}
                    onClick={() => setPastMin(m)}
                  >
                    {fmtMin(m)}
                  </button>
                ))}
              </div>
              <div className="pomo-logpast-slider">
                <Slider
                  value={pastMin}
                  min={5}
                  max={180}
                  step={5}
                  onChange={(v) => setPastMin(v)}
                  format={fmtMin}
                />
              </div>
              <div className="pomo-logpast-foot">
                <span className="pomo-logpast-attr">
                  For <strong>{focusLabel}</strong>
                </span>
                <button className="btn primary sm" onClick={logPastFocus}>
                  <Icon.Check width={13} height={13} /> Add {fmtMin(pastMin)}
                </button>
              </div>
            </div>
          ) : justLoggedMin ? (
            <div className="pomo-logpast-done" role="status">
              <span className="pomo-logpast-done-msg">
                <Icon.Check width={14} height={14} /> Added {fmtMin(justLoggedMin)} to today's focus.
              </span>
              <button
                type="button"
                className="pomo-logpast-again"
                onClick={() => setShowLogPast(true)}
              >
                Add more
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn ghost sm pomo-logpast-open"
              onClick={() => setShowLogPast(true)}
            >
              <Icon.Plus width={13} height={13} /> Log focus you already did
            </button>
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
