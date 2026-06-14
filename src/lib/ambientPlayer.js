/* ============================================================
   Ambient Player — real looping audio per Pomodoro scene.
   ------------------------------------------------------------
   Replaces the synthesized hum with real CC0 audio files served
   from /sounds/. One HTMLAudioElement lives for the lifetime of
   the module; switching scenes cross-fades cleanly.

   File mapping (all CC0/public-domain):
     airplane  → ambient-wind.ogg   (constant cabin-like wind)
     cafe      → ambient-cafe.ogg   (coffee shop chatter, cups)
     library   → ambient-rain.ogg   (gentle, quiet)
     subway    → ambient-thunder.ogg (deep mechanical rumble)
     airport   → ambient-wind.ogg   (terminal wind/bustle)
     forest    → ambient-forest.ogg  (forest-rain ambience)
     fireplace → ambient-fireplace.ogg (crackling fire)
     void      → ambient-rain.ogg   (meditative dark rain)
     — extra options —
     rain      → ambient-rain.ogg
     stream    → ambient-stream.ogg  (flowing water / hot tub)

   Sources:
   · fireplace, forest-rain, rain, stream, wind:
       github.com/Muges/ambientsounds (CC0)
   · cafe:
       archive.org/details/CoffeeShopVRec060 (CC0)
   ============================================================ */

const SCENE_SOUND = {
  airplane:  "/sounds/ambient-wind.ogg",
  cafe:      "/sounds/ambient-cafe.ogg",
  library:   "/sounds/ambient-rain.ogg",
  subway:    "/sounds/ambient-thunder.ogg",
  airport:   "/sounds/ambient-wind.ogg",
  forest:    "/sounds/ambient-forest.ogg",
  fireplace: "/sounds/ambient-fireplace.ogg",
  void:      "/sounds/ambient-rain.ogg",
  // standalone extra options (not scene-id based)
  rain:      "/sounds/ambient-rain.ogg",
  stream:    "/sounds/ambient-stream.ogg",
  wind:      "/sounds/ambient-wind.ogg",
};

const FADE_MS = 800; // cross-fade duration

let _el = null;          // current HTMLAudioElement
let _fadeTimer = null;   // tracks the rAF/setTimeout fade loop
let _currentSrc = null;  // src string of what's playing
let _targetVol = 0.35;   // 0–1

function _clearFade() {
  if (_fadeTimer !== null) {
    clearTimeout(_fadeTimer);
    _fadeTimer = null;
  }
}

function _fade(el, from, to, durationMs, onDone) {
  _clearFade();
  const steps = 20;
  const stepMs = durationMs / steps;
  const delta = (to - from) / steps;
  let step = 0;
  el.volume = Math.max(0, Math.min(1, from));
  function tick() {
    step++;
    el.volume = Math.max(0, Math.min(1, from + delta * step));
    if (step < steps) {
      _fadeTimer = setTimeout(tick, stepMs);
    } else {
      _fadeTimer = null;
      onDone?.();
    }
  }
  _fadeTimer = setTimeout(tick, stepMs);
}

/** Sound file URL for a given scene/sound id, or null if unmapped. */
export function soundForScene(id) {
  return SCENE_SOUND[id] || null;
}

/**
 * Start playing the ambient sound for a scene (or explicit sound id).
 * If the same source is already playing, just adjusts volume.
 * @param {string} sceneOrSoundId   — scene id (e.g. "cafe") or sound id
 * @param {number} volume           — 0–1
 */
export function playAmbient(sceneOrSoundId, volume = 0.35) {
  _targetVol = volume;
  const src = soundForScene(sceneOrSoundId);
  if (!src) {
    stopAmbient();
    return;
  }

  // Same source already playing — just adjust volume
  if (_el && _currentSrc === src && !_el.paused) {
    _fade(_el, _el.volume, _targetVol, FADE_MS);
    return;
  }

  // Fade out old element, then start new one
  const startNew = () => {
    if (_el) {
      _el.pause();
      _el.src = "";
    }
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0;
    _el = audio;
    _currentSrc = src;
    // Resume on user-gesture already happened (caller is inside a start/click handler)
    audio.play().catch(() => {
      // Autoplay blocked — will retry on next user gesture
    });
    _fade(audio, 0, _targetVol, FADE_MS);
  };

  if (_el && !_el.paused) {
    _fade(_el, _el.volume, 0, FADE_MS / 2, startNew);
  } else {
    startNew();
  }
}

/** Smoothly fade out and stop the current ambient audio. */
export function stopAmbient() {
  if (!_el || _el.paused) {
    _clearFade();
    return;
  }
  const el = _el;
  _currentSrc = null;
  _fade(el, el.volume, 0, FADE_MS, () => {
    el.pause();
    el.src = "";
    if (_el === el) _el = null;
  });
}

/** Update volume without changing the source. */
export function setAmbientVolume(volume) {
  _targetVol = volume;
  if (_el && !_el.paused) {
    _clearFade();
    _el.volume = Math.max(0, Math.min(1, volume));
  }
}

/** True if a sound is currently playing (or fading in). */
export function isAmbientPlaying() {
  return !!_el && !_el.paused;
}

export { SCENE_SOUND };
