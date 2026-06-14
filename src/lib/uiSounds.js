/* ============================================================
   UI Sounds — subtle synthesized feedback for Ligand interactions.
   ------------------------------------------------------------
   All sounds are generated live via Web Audio API (no files, no
   network). They re-use the shared AudioContext from notifications.js
   so audio is never double-initialised.

   The master "UI sounds" toggle is stored in settings.uiSounds.
   Callers should check that before firing; the helpers themselves
   trust the caller to gate on the toggle so they stay pure.

   Three distinct timbres:
     ding()    — soft two-note chime (task/habit/pomodoro completion)
     tick()    — mechanical dial click (slider drag steps)
     pop()     — light toggle pop (switch on/off)
   ============================================================ */

/* Master enable gate — set by App via configure() when the setting changes. */
let _enabled = true;
export function configure({ enabled }) {
  _enabled = Boolean(enabled);
}

let _ctx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!_ctx) _ctx = new Ctor();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

/* --- ding --------------------------------------------------- */
/* Warm, brief chime: two pitched sine tones with fast attack
   and natural ring-down. Inspired by an airplane seatbelt sign. */
export function ding(volume = 0.55) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [[880, 0], [1108, 0.18]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + offset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume * 0.22, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    });
  } catch {/* silently ignore if audio is unavailable */}
}

/* --- tick --------------------------------------------------- */
/* A clean, high mechanical tick: very short noise burst shaped like
   a real dial detent. Fires quickly without accumulating if the
   slider moves fast. Debounced at call-site (see useUiSounds). */
export function tick(volume = 0.35) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // White noise source (buffer of 256 samples at 44.1 kHz ≈ 5.8 ms)
    const buf = ctx.createBuffer(1, 256, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < 256; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // High-pass to make it crisp
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    src.connect(hp).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.04);
  } catch {/* ignore */}
}

/* --- pop ---------------------------------------------------- */
/* Soft toggle pop: a very low, round thump — like a quality
   physical switch. Quieter and lower-pitched than tick(). */
export function pop(volume = 0.28) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Pitch-drop from 220 Hz → 110 Hz over 60 ms for a "thump" feel
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.06);
    gain.gain.setValueAtTime(volume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {/* ignore */}
}
