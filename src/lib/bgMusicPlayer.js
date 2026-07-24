/* ============================================================
   Background Music Player — app-wide ambient/background loops.
   ------------------------------------------------------------
   Completely separate from the Pomodoro ambient player (different
   HTMLAudioElement, different module). Both can coexist: the
   Pomodoro player is tied to the focus timer; this one plays
   globally across all tabs when the user enables it in Settings.

   Tracks offered (reusing CC0 files already bundled in /sounds/):
     rain   → ambient-rain.ogg    (gentle rain)
     stream → ambient-stream.ogg  (flowing water)
     waves  → ambient-waves.ogg   (ocean waves)

   No new audio files are added — all three are CC0 assets already
   in the repo and attributed in PROGRESS.md.

   Design:
   - One singleton audio element (no overlapping instances).
   - Cross-fade on track change (same pattern as ambientPlayer.js).
   - Volume changes apply immediately without a full stop/start.
   - Play requires a prior user gesture; we don't autoplay.
     The toggle in Settings is the required gesture.
   ============================================================ */

const assetUrl = (file) => `${import.meta.env.BASE_URL || "/"}sounds/${file}`;
export const BG_TRACKS = [
  { id: "rain",   label: "Rain",   src: assetUrl("ambient-rain.ogg") },
  { id: "stream", label: "Stream", src: assetUrl("ambient-stream.ogg") },
  { id: "waves",  label: "Waves",  src: assetUrl("ambient-waves.ogg") },
];

const FADE_MS = 700;

let _el        = null;
let _fadeTimer = null;
let _currentSrc = null;

function _clearFade() {
  if (_fadeTimer !== null) { clearTimeout(_fadeTimer); _fadeTimer = null; }
}

function _fade(el, from, to, durationMs, onDone) {
  _clearFade();
  const steps  = 20;
  const stepMs = durationMs / steps;
  const delta  = (to - from) / steps;
  let   step   = 0;
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

/**
 * Start (or switch to) a background music track.
 * @param {string} trackId  — one of the BG_TRACKS ids
 * @param {number} volume   — 0–1
 */
export function playBgMusic(trackId, volume = 0.30) {
  const track = BG_TRACKS.find((t) => t.id === trackId) || BG_TRACKS[0];
  const src   = track.src;

  // Already playing the same track — just adjust volume.
  if (_el && _currentSrc === src && !_el.paused) {
    _fade(_el, _el.volume, volume, FADE_MS);
    return;
  }

  // Fade out old, start new.
  const startNew = () => {
    if (_el) { _el.pause(); _el.src = ""; }
    const audio   = new Audio(src);
    audio.loop    = true;
    audio.preload = "auto";
    audio.volume  = 0;
    _el           = audio;
    _currentSrc   = src;
    audio.play().catch(() => {
      // Browser blocked autoplay — this should not happen because the
      // play call is triggered by a user gesture (toggling the switch).
      // Swallow silently; the user can toggle again.
    });
    _fade(audio, 0, volume, FADE_MS);
  };

  if (_el && !_el.paused) {
    _fade(_el, _el.volume, 0, FADE_MS / 2, startNew);
  } else {
    startNew();
  }
}

/** Smoothly fade out and stop background music. */
export function stopBgMusic() {
  if (!_el || _el.paused) { _clearFade(); return; }
  const el  = _el;
  _currentSrc = null;
  _fade(el, el.volume, 0, FADE_MS, () => {
    el.pause();
    el.src = "";
    if (_el === el) _el = null;
  });
}

/** Update volume without restarting. */
export function setBgMusicVolume(volume) {
  if (_el && !_el.paused) {
    _clearFade();
    _el.volume = Math.max(0, Math.min(1, volume));
  }
}

/** True if background music is currently playing (or fading in). */
export function isBgMusicPlaying() {
  return !!_el && !_el.paused;
}
