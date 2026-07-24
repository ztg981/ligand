/* ============================================================
   UI Sounds — a hand-tuned synthesized sound palette for Ligand.
   ============================================================

   DESIGN NOTES (why these sounds sound the way they do)
   ------------------------------------------------------------
   Everything here is generated live with the Web Audio API — no
   files, no network. The whole palette is built around ONE idea
   borrowed from the study-tracker sounds the user already likes:

     A bare sine wave sounds cheap and synthetic. Real bells and
     chimes have an INHARMONIC partial — an overtone that is NOT an
     integer multiple of the fundamental. Adding a quiet partial at
     ~2.76× the fundamental is what turns a flat "beep" into a warm,
     expensive-sounding "chime". This single trick is the difference
     between a $2 toy and an airline cabin chime.

   On top of that, three rules keep the palette premium and calm:

     1. MUSICAL, NOT RANDOM. Every multi-note sound uses real notes
        and pleasant intervals (major thirds, perfect fifths/fourths).
        Rising = positive/progress, descending = completion/rest.
     2. QUIET AND SHORT for frequent actions (click, tick, habit),
        a little fuller and longer for rare rewards (task, pomodoro).
        A completion sound feels rewarding when it RESOLVES (lands on
        a consonant note) — it feels cheap when it's loud or buzzy.
     3. EVERYTHING ROUNDED. A gentle master low-pass shaves the digital
        fizz off the top so nothing is ever harsh, even at full volume.

   All of the above routes through a single master gain node whose
   level is the user's Sound volume, so one setting scales the whole
   palette. The master toggle short-circuits every UI sound. The
   alarm() is the deliberate exception — see its note.
   ============================================================ */

/* Master enable + volume — set by App via configure() when settings change. */
let _enabled = true;
let _volume = 0.75; // 0..1, maps from the Sound volume slider (0–100%)

export function configure({ enabled, volume } = {}) {
  if (enabled !== undefined) _enabled = Boolean(enabled);
  if (volume !== undefined) {
    _volume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (_master) _master.gain.value = _volume;
  }
}

let _ctx = null;
let _master = null; // master volume gain
let _tone = null; // gentle master low-pass to round off harshness
let _limiter = null; // master limiter so stacked sounds never get painfully loud
let _lastClick = 0; // throttle guard for rapid click spam

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!_ctx) {
    _ctx = new Ctor();
    // sound -> _master (volume) -> _tone (round top) -> _limiter -> speakers
    _master = _ctx.createGain();
    _master.gain.value = _volume;
    _tone = _ctx.createBiquadFilter();
    _tone.type = "lowpass";
    _tone.frequency.value = 11000; // keep sparkle, drop only the brittle fizz
    _tone.Q.value = 0.4;
    // A compressor/limiter so rapid overlapping sounds (spamming a button, a
    // fast slider drag) can never sum into a painfully loud peak. It only
    // engages when the combined signal gets hot; single sounds pass through
    // essentially untouched.
    _limiter = _ctx.createDynamicsCompressor();
    _limiter.threshold.value = -18;
    _limiter.knee.value = 12;
    _limiter.ratio.value = 12;
    _limiter.attack.value = 0.003;
    _limiter.release.value = 0.12;
    _master.connect(_tone).connect(_limiter).connect(_ctx.destination);
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

/* The bus every UI sound connects to (respects the volume setting). */
function bus() {
  getCtx();
  return _master;
}

/* ------------------------------------------------------------
   bell() — the core voice.

   A pure sine fundamental plus a quiet inharmonic partial at 2.76×
   (the bell shimmer) and an optional soft sub-partial for body on
   the bigger sounds. Fast linear attack, natural exponential ring-
   down. This one primitive builds almost the entire palette.
   ------------------------------------------------------------ */
function bell(freq, delay, duration, vol, { shimmer = 0.16, body = 0 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  const out = bus();
  const t0 = ctx.currentTime + delay;

  // Fundamental
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);

  // Inharmonic bell partial — the "warm/real" ingredient. Decays faster
  // than the fundamental so it shimmers on the attack then clears.
  if (shimmer > 0) {
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.76;
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.linearRampToValueAtTime(vol * shimmer, t0 + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.55);
    osc2.connect(g2).connect(out);
    osc2.start(t0);
    osc2.stop(t0 + duration * 0.6 + 0.05);
  }

  // Optional sub-octave body — adds warmth/weight to reward sounds.
  if (body > 0) {
    const osc3 = ctx.createOscillator();
    const g3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.value = freq * 0.5;
    g3.gain.setValueAtTime(0.0001, t0);
    g3.gain.linearRampToValueAtTime(vol * body, t0 + 0.01);
    g3.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.9);
    osc3.connect(g3).connect(out);
    osc3.start(t0);
    osc3.stop(t0 + duration + 0.05);
  }
}

/* ============================================================
   THE PALETTE
   ============================================================ */

/* --- click (button press) ----------------------------------
   Crisp, light, TACTILE — not harsh. A whisper of high-passed
   noise gives the "snap" of a real key; a short low sine body
   gives it weight so it reads as a rounded "tock", not a tick.
   Kept very short (~45ms) and quiet — it fires on every button
   in the app, so it must never call attention to itself. */
export function click() {
  if (!_enabled) return;
  // Throttle rapid repeats (double-taps, held keys) so clicks can't machine-gun.
  const now = Date.now();
  if (now - _lastClick < 40) return;
  _lastClick = now;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const out = bus();
    const now = ctx.currentTime;

    // Snap — a ~3ms high-passed noise burst.
    const buf = ctx.createBuffer(1, 128, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < 128; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(0.07, now);
    nG.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
    src.connect(hp).connect(nG).connect(out);
    src.start(now);
    src.stop(now + 0.03);

    // Body — a soft, quickly-decaying sine with a small downward glide.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.035);
    const oG = ctx.createGain();
    oG.gain.setValueAtTime(0.0001, now);
    oG.gain.exponentialRampToValueAtTime(0.12, now + 0.004);
    oG.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(oG).connect(out);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch {/* ignore */}
}

/* --- tick (dial / slider detent) ---------------------------
   The feel of a premium volume knob (AirPods Max), not a hard
   mechanical click: a triangle tone through a resonant band-pass
   with a soft attack. Pitch tracks the slider value so turning a
   dial up literally sounds like it's going up; a hair of random
   detune stops a fast drag from turning into a robotic buzz. */
export function tick(value = 0.5, volume = 1) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const out = bus();
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    const jitter = 1 + (Math.random() - 0.5) * 0.03; // ±1.5% — organic, not robotic
    const base = (360 + v * 260) * jitter; // 360–620 Hz, climbs with the value

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(base * 1.05, now);
    osc.frequency.exponentialRampToValueAtTime(base, now + 0.05); // soft settle

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = base;
    bp.Q.value = 4.5;

    const g = ctx.createGain();
    const peak = 0.13 * volume;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(bp).connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {/* ignore */}
}

/* --- pop (toggle switch) -----------------------------------
   A soft, round, low thump — the feel of a good physical switch.
   Lower and quieter than a click so on/off toggles feel weighty
   and deliberate rather than clicky. */
export function pop(volume = 1) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const out = bus();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.07);
    g.gain.setValueAtTime(0.22 * volume, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {/* ignore */}
}

/* --- habitDone (habit check-in) ----------------------------
   Habits get checked many times a day, so this is the LIGHTEST
   completion: a quick, bright, rising major third (A5 -> C#6).
   Encouraging and over in a blink — a little "yes" rather than a
   fanfare, so it never wears out its welcome. */
export function habitDone() {
  if (!_enabled) return;
  try {
    bell(880.0, 0, 0.14, 0.11);      // A5
    bell(1108.73, 0.07, 0.34, 0.12); // C#6 — resolves up a major third
  } catch {/* ignore */}
}

/* --- taskDone (task completion) ----------------------------
   A touch fuller and more "accomplished" than a habit: a rising
   perfect fifth into the octave (E5 -> B5) with a little sub-body
   for weight. Reads as a small, satisfying win. */
export function taskDone() {
  if (!_enabled) return;
  try {
    bell(659.25, 0, 0.16, 0.12);                 // E5
    bell(987.77, 0.11, 0.5, 0.13, { body: 0.2 }); // B5 — lands with warmth
  } catch {/* ignore */}
}

/* --- ding (general positive chime) -------------------------
   The all-purpose "nice" — badge unlocks, a logged set, a recovery
   check-in. Warm rising pair with real ring-down; the volume arg
   lets softer contexts (recovery) dial it back. */
export function ding(volume = 1) {
  if (!_enabled) return;
  try {
    bell(783.99, 0, 0.16, 0.12 * volume);                 // G5
    bell(1046.5, 0.12, 0.6, 0.13 * volume, { body: 0.18 }); // C6 — resolves up a fourth
  } catch {/* ignore */}
}

/* --- pomodoroComplete (a focus block finished) -------------
   The reward for finishing a work block. The classic cabin
   "bing-bong": a descending perfect fourth (B5 -> F#5) with a soft
   low root under the second note for warmth. Descending = "you're
   done, rest now." Satisfying but calm — you'll hear it every ~25
   minutes, so it's a reward, never an alarm. Follows the Pomodoro
   chime setting (via the caller), not the UI-sounds toggle. */
export function pomodoroComplete() {
  try {
    bell(987.77, 0, 0.45, 0.16);                  // B5
    bell(739.99, 0.34, 0.95, 0.17, { body: 0.25 }); // F#5 — settles down a fourth
  } catch {/* ignore */}
}

/* --- phaseChange (break over, back to focus) ---------------
   The gentle counterpart to pomodoroComplete: a rising major second
   (B4 -> D5, the "seatbelt-on" chime) that says "let's go again"
   without the finality of a completion. Softer than the reward. */
export function phaseChange() {
  try {
    bell(493.88, 0, 0.42, 0.14);   // B4
    bell(587.33, 0.3, 0.7, 0.15);  // D5 — lifts up
  } catch {/* ignore */}
}

/* --- error (something didn't work) -------------------------
   NOT a harsh buzzer — a punishing error sound makes an app feel
   hostile. A soft, low, descending pair (E4 -> B3) with no bell
   shimmer (shimmer reads as "positive"; we want a neutral "nope").
   Quiet and quick: it registers "that didn't work" and gets out. */
export function error() {
  if (!_enabled) return;
  try {
    bell(329.63, 0, 0.14, 0.13, { shimmer: 0 }); // E4
    bell(246.94, 0.1, 0.28, 0.13, { shimmer: 0 }); // B3 — falls a fourth
  } catch {/* ignore */}
}

/* --- alarm (deliberate wake/timer alarm) -------------------
   The exception to every rule above. This is a real alarm the user
   set on purpose (see the Alarm feature), so it must be INSISTENT
   and it deliberately IGNORES the UI-sounds master toggle — turning
   off click sounds should never silence an alarm you set to wake up.
   It routes straight to the destination at a high floor so it's
   always audible.

   startAlarm() loops an urgent-but-musical rising triad until you
   call the returned stop function. */
export function startAlarm() {
  const ctx = getCtx();
  if (!ctx) return () => {};
  let stopped = false;
  let timer = null;

  // A brighter, louder bell straight to the speakers (bypasses _master).
  const strike = (freq, delay, duration, vol) => {
    if (stopped) return;
    const t0 = ctx.currentTime + delay;
    [[freq, 1, duration], [freq * 2.76, 0.22, duration * 0.5]].forEach(
      ([f, mul, dur]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol * mul, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      }
    );
  };

  // One "bar": a rising triad, then a beat of silence, ~1.6s total.
  const bar = () => {
    if (stopped) return;
    strike(880.0, 0, 0.22, 0.5);     // A5
    strike(1108.73, 0.22, 0.22, 0.5); // C#6
    strike(1318.51, 0.44, 0.5, 0.55); // E6 — top of the triad, rings out
    timer = setTimeout(bar, 1600);
  };
  bar();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/* ============================================================
   Global wiring (runs once on import, browser only)
   ============================================================ */
if (typeof window !== "undefined" && !window.__ligandUiSoundsInit) {
  window.__ligandUiSoundsInit = true;

  // Unlock/resume the AudioContext on the first user gesture so the very
  // first sound isn't dropped while the context is still suspended.
  const unlock = () => {
    if (!_enabled) return;
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });

  // One delegated listener gives every button in the app a click sound.
  // Controls that own a distinct sound are excluded so nothing doubles:
  //   .tswitch    → pop()  (handled in the Switch component)
  //   .checkbox   → taskDone() (task completion)
  //   .habit-cell → habitDone() (habit check-in)
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
