import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage.js";

/* ============================================================
   usePomodoro — the focus timer engine.

   Settings (durations + theme + sessions-before-long-break) persist
   via the shared localStorage hook. The live countdown ALSO persists
   (ligand.pomodoro.session) so a page refresh doesn't throw away a
   block you're in the middle of — a running timer keeps counting from
   its absolute end time, a paused one restores frozen where you left it.

   Gentle by design: when a phase finishes we advance to the next
   phase but DON'T auto-start it — you choose when the break or the
   next focus block begins. Nothing is forced.
   ============================================================ */

export const PHASES = { WORK: "work", SHORT: "short", LONG: "long" };

// Live-countdown persistence. Device-local and ephemeral, so it is NOT wired
// into cloud sync (no ligand:localwrite dispatch) — a timer running on your
// laptop shouldn't teleport onto your phone.
const SESSION_KEY = "ligand.pomodoro.session";
function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

export const POMO_DEFAULTS = {
  work: 25, // minutes
  shortBreak: 5,
  longBreak: 15,
  longEvery: 4, // a long break after this many focus blocks
  theme: "airplane",
  ambientSound: true, // soft hum while the timer runs (the mute toggle flips this)
  ambientVolume: 35, // 0–100
};

const clampMin = (m) => Math.max(1, Math.round(m * 60)); // minutes -> seconds, >=1s

export function usePomodoro({ onPhaseEnd } = {}) {
  const [stored, setSettings] = useLocalStorage("ligand.pomodoro", POMO_DEFAULTS);
  const settings = { ...POMO_DEFAULTS, ...stored };

  // Keep the latest callback in a ref so the completion effect always calls
  // the current one without needing it in its dependency list.
  const onPhaseEndRef = useRef(onPhaseEnd);
  onPhaseEndRef.current = onPhaseEnd;

  const phaseSeconds = useCallback(
    (phase) => {
      const m =
        phase === PHASES.WORK
          ? settings.work
          : phase === PHASES.SHORT
          ? settings.shortBreak
          : settings.longBreak;
      return clampMin(m);
    },
    [settings.work, settings.shortBreak, settings.longBreak]
  );

  const intervalRef = useRef(null);
  // Wall-clock target time (ms) the current run should reach 0. Storing an
  // absolute timestamp — instead of decrementing a counter — keeps the timer
  // accurate across backgrounded tabs and device sleep, where setInterval is
  // throttled or frozen. Null whenever the timer isn't running.
  const endTimeRef = useRef(null);
  const secsLeft = () =>
    Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));

  // Restore any in-flight block once, at mount, so a refresh doesn't reset the
  // timer. Three cases:
  //   • running, end time still ahead → resume live (time that passed while the
  //     page was closed is honestly subtracted from the absolute end time).
  //   • running, but the block already elapsed while away → land on the NEXT
  //     phase, freshly reset and stopped (as if you'd been here at the ding,
  //     minus the chime you didn't hear).
  //   • paused/idle → come back frozen at the saved remaining.
  // endTimeRef is seeded here (before first paint) for the live-resume case.
  const restored = useRef(readSession()).current;
  const init = (() => {
    const s = { ...POMO_DEFAULTS, ...stored };
    const phaseFull = (p) =>
      clampMin(p === PHASES.WORK ? s.work : p === PHASES.SHORT ? s.shortBreak : s.longBreak);
    const validPhase = (p) => p === PHASES.WORK || p === PHASES.SHORT || p === PHASES.LONG;
    const base = { phase: PHASES.WORK, completed: 0, running: false, remaining: phaseFull(PHASES.WORK) };
    if (!restored || !validPhase(restored.phase)) return base;
    const savedPhase = restored.phase;
    const savedCompleted = Number.isFinite(restored.completed) ? restored.completed : 0;

    if (restored.running && Number.isFinite(restored.endTime)) {
      const secs = Math.max(0, Math.round((restored.endTime - Date.now()) / 1000));
      if (secs > 0) {
        endTimeRef.current = restored.endTime;
        return { phase: savedPhase, completed: savedCompleted, running: true, remaining: secs };
      }
      // Elapsed while away → advance the cycle exactly as a natural finish would.
      if (savedPhase === PHASES.WORK) {
        const done = savedCompleted + 1;
        const next = done % s.longEvery === 0 ? PHASES.LONG : PHASES.SHORT;
        return { phase: next, completed: done, running: false, remaining: phaseFull(next) };
      }
      return { phase: PHASES.WORK, completed: savedCompleted, running: false, remaining: phaseFull(PHASES.WORK) };
    }
    // Paused or idle: keep the frozen remaining.
    const rem = Number.isFinite(restored.remaining) ? restored.remaining : phaseFull(savedPhase);
    return { phase: savedPhase, completed: savedCompleted, running: false, remaining: rem };
  })();

  const [phase, setPhase] = useState(init.phase);
  const [completed, setCompleted] = useState(init.completed); // focus blocks done this cycle
  const [running, setRunning] = useState(init.running);
  const [remaining, setRemaining] = useState(init.remaining);

  // These two effects reset the display to a full phase on a real change. They
  // must NOT fire on mount, or they'd wipe the countdown we just restored from
  // a saved session. We guard by comparing against the LAST value we acted on
  // (seeded from the restored init), not a one-shot flag — a flag gets consumed
  // and then defeated by React StrictMode's double-invoked effects in dev.

  // When the phase actually changes, the new phase starts full.
  const lastPhaseRef = useRef(init.phase);
  useEffect(() => {
    if (phase === lastPhaseRef.current) return; // mount / unchanged
    lastPhaseRef.current = phase;
    setRemaining(phaseSeconds(phase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // While idle, reflect slider changes in the displayed time immediately.
  const lastLenRef = useRef(`${settings.work}|${settings.shortBreak}|${settings.longBreak}`);
  useEffect(() => {
    const sig = `${settings.work}|${settings.shortBreak}|${settings.longBreak}`;
    if (sig === lastLenRef.current) return; // mount / unchanged
    lastLenRef.current = sig;
    if (!running) setRemaining(phaseSeconds(phase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.work, settings.shortBreak, settings.longBreak]);

  // The tick — recomputes remaining from the absolute end time rather than
  // decrementing, so a throttled/slept interval self-corrects on the next run.
  // Runs at 250ms for snappy display; setRemaining bails out when unchanged.
  useEffect(() => {
    if (!running) return;
    if (endTimeRef.current == null) {
      endTimeRef.current = Date.now() + remaining * 1000;
    }
    const tick = () => {
      const secs = secsLeft();
      setRemaining((prev) => (prev === secs ? prev : secs));
    };
    tick(); // correct immediately on (re)start
    intervalRef.current = setInterval(tick, 250);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Recompute the moment the tab becomes visible again (covers backgrounding
  // and wake-from-sleep, where the interval may have been paused entirely).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && running && endTimeRef.current != null) {
        const secs = secsLeft();
        setRemaining((prev) => (prev === secs ? prev : secs));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [running]);

  // Persist the live session so a refresh doesn't lose the block. Runs on phase
  // / running / completed / remaining changes, but a dedup guard means a
  // RUNNING timer (whose serialized form is a constant end time, not the
  // ticking `remaining`) writes just once per start — the 250ms ticks don't
  // hammer localStorage. Paused/idle states write their frozen `remaining`.
  const lastSavedRef = useRef("");
  useEffect(() => {
    const session = running
      ? { phase, completed, running: true, endTime: endTimeRef.current, remaining: null }
      : { phase, completed, running: false, endTime: null, remaining };
    const str = JSON.stringify(session);
    if (str === lastSavedRef.current) return;
    lastSavedRef.current = str;
    try {
      window.localStorage.setItem(SESSION_KEY, str);
    } catch {
      /* storage full / unavailable — the timer still works, just won't survive a reload */
    }
  }, [phase, running, completed, remaining]);

  // Phase completion: when the clock hits zero while running.
  useEffect(() => {
    if (!running || remaining > 0) return;
    endTimeRef.current = null;
    setRunning(false);
    if (phase === PHASES.WORK) {
      const done = completed + 1;
      setCompleted(done);
      setPhase(done % settings.longEvery === 0 ? PHASES.LONG : PHASES.SHORT);
    } else {
      setPhase(PHASES.WORK);
    }
    // Let the caller react to a natural phase end (e.g. play a chime).
    onPhaseEndRef.current?.({ endedPhase: phase });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remaining]);

  // -- controls --------------------------------------------------
  const start = useCallback(() => {
    const base = remaining <= 0 ? phaseSeconds(phase) : remaining;
    endTimeRef.current = Date.now() + base * 1000;
    setRemaining(base);
    setRunning(true);
  }, [remaining, phase, phaseSeconds]);

  const pause = useCallback(() => {
    // Freeze at the accurate current value before dropping the end time.
    if (endTimeRef.current != null) setRemaining(secsLeft());
    endTimeRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    endTimeRef.current = null;
    setRunning(false);
    setRemaining(phaseSeconds(phase));
  }, [phase, phaseSeconds]);

  // Manually jump to a phase (also used by the segmented control).
  const goToPhase = useCallback((p) => {
    endTimeRef.current = null;
    setRunning(false);
    setPhase(p);
  }, []);

  // Skip the current phase. Skipping a focus block advances the cycle the
  // same way finishing it would, so a Long break still lands on every
  // `longEvery`-th block instead of always dropping to a Short break.
  const skip = useCallback(() => {
    endTimeRef.current = null;
    setRunning(false);
    if (phase === PHASES.WORK) {
      const done = completed + 1;
      setCompleted(done);
      setPhase(done % settings.longEvery === 0 ? PHASES.LONG : PHASES.SHORT);
    } else {
      setPhase(PHASES.WORK);
    }
  }, [phase, completed, settings.longEvery]);

  const total = phaseSeconds(phase);
  const progress = total > 0 ? 1 - remaining / total : 0;

  return {
    settings,
    setSettings: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
    phase,
    running,
    remaining,
    total,
    progress,
    completed,
    longEvery: settings.longEvery,
    start,
    pause,
    reset,
    skip,
    goToPhase,
  };
}

export default usePomodoro;
