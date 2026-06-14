/* ============================================================
   UI Sounds — subtle synthesized feedback for Ligand interactions.
   ------------------------------------------------------------
   All sounds are generated live via the Web Audio API (no files, no
   network). A single AudioContext is created lazily and unlocked on
   the first user gesture (Chrome's autoplay policy suspends contexts
   created outside a gesture, which is why early sounds were silent).

   The master "UI sounds" toggle is stored in settings.uiSounds and
   pushed here via configure(). Every helper short-circuits when the
   toggle is off, and a single delegated click listener gives every
   button in the app a sound without per-component wiring.

   Timbres:
     ding()    — warm two-note chime (task / habit completion)
     click()   — crisp, light button press (any button, app-wide)
     tick(v)   — soft resonant dial detent (slider drag; pitch tracks v)
     pop()     — round toggle pop (switch on/off)
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
  // Resume eagerly; harmless if already running. resume() is async but the
  // global unlock below means the context is usually running before any call.
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

/* --- ding --------------------------------------------------- */
/* Warm, brief chime: two pitched sine tones with fast attack and a
   natural ring-down. Used for task and habit completion. */
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
      gain.gain.exponentialRampToValueAtTime(volume * 0.26, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    });
  } catch {/* silently ignore if audio is unavailable */}
}

/* --- click -------------------------------------------------- */
/* Crisp, light button press: a tiny high-passed noise transient for
   "snap", layered with a soft, quickly-decaying sine body so it reads
   as modern and rounded rather than harsh. */
export function click(volume = 0.4) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // High transient — a 128-sample (~3 ms) noise burst through a highpass.
    const buf = ctx.createBuffer(1, 128, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < 128; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * 0.10, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
    src.connect(hp).connect(nGain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.03);

    // Rounded body — short sine with a small downward glide.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.03);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.0001, now);
    oGain.gain.exponentialRampToValueAtTime(volume * 0.14, now + 0.003);
    oGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(oGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch {/* ignore */}
}

/* --- tick (dial detent) ------------------------------------- */
/* Soft, premium dial tick — the feel of an AirPods Max volume knob
   rather than a hard mechanical click. A triangle tone through a
   resonant bandpass, with a gentle attack/decay and a pitch that
   rises slightly as the slider value increases.
   @param value  normalized slider position 0–1 (drives pitch)
   @param volume 0–1 overall level */
export function tick(value = 0.5, volume = 0.5) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    const base = 360 + v * 240; // 360–600 Hz, climbs as you turn it up

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    // Tiny downward settle gives the detent a soft, organic resonance.
    osc.frequency.setValueAtTime(base * 1.05, now);
    osc.frequency.exponentialRampToValueAtTime(base, now + 0.05);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = base;
    bp.Q.value = 4.5; // gentle ring, not a sharp click

    const gain = ctx.createGain();
    const peak = volume * 0.14; // quieter than the old tick
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.004); // soft attack
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06); // smooth decay

    osc.connect(bp).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {/* ignore */}
}

/* --- pop ---------------------------------------------------- */
/* Soft toggle pop: a very low, round thump — like a quality physical
   switch. Quieter and lower-pitched than a click. */
export function pop(volume = 0.28) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
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

/* ============================================================
   Global wiring (runs once on import, browser only)
   ============================================================ */
if (typeof window !== "undefined" && !window.__ligandUiSoundsInit) {
  window.__ligandUiSoundsInit = true;

  // Unlock/resume the AudioContext on the first user gesture so the very
  // first sound isn't dropped while the context is still suspended.
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });

  // One delegated listener gives every button in the app a click sound.
  // Controls that own a distinct sound are excluded so nothing doubles:
  //   .tswitch    → pop()  (handled in the Switch component)
  //   .checkbox   → ding() (task completion)
  //   .habit-cell → ding() (habit check-in)
  //   [data-mute-click] → opt-out for any other element
  window.addEventListener(
    "click",
    (e) => {
      if (!_enabled) return;
      const target = e.target;
      if (!target || typeof target.closest !== "function") return;
      const btn = target.closest('button, [role="button"]');
      if (!btn) return;
      if (
        btn.classList.contains("tswitch") ||
        btn.classList.contains("checkbox") ||
        btn.classList.contains("habit-cell") ||
        btn.hasAttribute("data-mute-click")
      ) {
        return;
      }
      click();
    },
    true // capture phase — still fires if a handler stops propagation
  );
}
