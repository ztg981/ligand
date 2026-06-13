import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage.js";

/* ============================================================
   usePomodoro — the focus timer engine.

   Settings (durations + theme + sessions-before-long-break) persist
   via the shared localStorage hook. The live countdown is runtime
   state (resets on reload, which is fine for a timer).

   Gentle by design: when a phase finishes we advance to the next
   phase but DON'T auto-start it — you choose when the break or the
   next focus block begins. Nothing is forced.
   ============================================================ */

export const PHASES = { WORK: "work", SHORT: "short", LONG: "long" };

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

  const [phase, setPhase] = useState(PHASES.WORK);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(() => clampMin(POMO_DEFAULTS.work));
  const [completed, setCompleted] = useState(0); // focus blocks done this cycle
  const intervalRef = useRef(null);

  // When the phase changes, the new phase always starts full.
  useEffect(() => {
    setRemaining(phaseSeconds(phase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // While idle, reflect slider changes in the displayed time immediately.
  useEffect(() => {
    if (!running) setRemaining(phaseSeconds(phase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.work, settings.shortBreak, settings.longBreak]);

  // The 1-second tick.
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // Phase completion: when the clock hits zero while running.
  useEffect(() => {
    if (!running || remaining > 0) return;
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
    setRemaining((r) => (r <= 0 ? phaseSeconds(phase) : r));
    setRunning(true);
  }, [phase, phaseSeconds]);

  const pause = useCallback(() => setRunning(false), []);

  const reset = useCallback(() => {
    setRunning(false);
    setRemaining(phaseSeconds(phase));
  }, [phase, phaseSeconds]);

  // Manually jump to a phase (also used by the segmented control).
  const goToPhase = useCallback((p) => {
    setRunning(false);
    setPhase(p);
  }, []);

  // Skip the current phase. Skipping a focus block advances the cycle the
  // same way finishing it would, so a Long break still lands on every
  // `longEvery`-th block instead of always dropping to a Short break.
  const skip = useCallback(() => {
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
