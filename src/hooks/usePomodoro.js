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

/* Live-countdown persistence — and, since it carries an ABSOLUTE end time
   rather than a ticking counter, cross-device state as well.

   This used to be deliberately machine-local, on the reasoning that a timer
   running on your laptop shouldn't turn up on your phone. In practice that's
   backwards: starting a block at the desk, pausing, and picking it up on the
   iPad is exactly what a focus timer is for, and the absolute `endTime` makes
   it correct for free — both devices count down to the same instant, so
   there's nothing to reconcile while it runs.

   `savedAt` is what makes a conflict resolvable. Two devices can both write,
   so a session is only adopted if it was saved AFTER the one this device last
   wrote: whoever pressed the button most recently wins, which is the same
   last-write-wins rule the rest of the sync uses. */
export const SESSION_KEY = "ligand.pomodoro.session";
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

const validPhase = (p) => p === PHASES.WORK || p === PHASES.SHORT || p === PHASES.LONG;

/* Turn a saved session into the state to show, given how much time has passed.

   Three cases, and the middle one is the reason this is worth having as its
   own function:
     • running, end time still ahead → resume live, with the time that passed
       while the page (or the other device) was closed honestly subtracted;
     • running, but the block already elapsed while away → land on the NEXT
       phase, freshly reset and stopped, as if you'd been there at the ding
       minus the chime you didn't hear;
     • paused/idle → come back frozen at the saved remaining.

   `endTime` in the result is non-null only in the resume-live case; the caller
   seeds its ref from it. Pure, so `now` is injectable and it can be tested. */
export function restoreSession(saved, settings, now = Date.now()) {
  const phaseFull = (p) =>
    clampMin(p === PHASES.WORK ? settings.work : p === PHASES.SHORT ? settings.shortBreak : settings.longBreak);
  const base = {
    phase: PHASES.WORK,
    completed: 0,
    running: false,
    remaining: phaseFull(PHASES.WORK),
    endTime: null,
  };
  if (!saved || !validPhase(saved.phase)) return base;
  const phase = saved.phase;
  const completed = Number.isFinite(saved.completed) ? saved.completed : 0;

  if (saved.running && Number.isFinite(saved.endTime)) {
    const secs = Math.max(0, Math.round((saved.endTime - now) / 1000));
    if (secs > 0) {
      return { phase, completed, running: true, remaining: secs, endTime: saved.endTime };
    }
    if (phase === PHASES.WORK) {
      const done = completed + 1;
      const next = done % settings.longEvery === 0 ? PHASES.LONG : PHASES.SHORT;
      return { phase: next, completed: done, running: false, remaining: phaseFull(next), endTime: null };
    }
    return { phase: PHASES.WORK, completed, running: false, remaining: phaseFull(PHASES.WORK), endTime: null };
  }
  const remaining = Number.isFinite(saved.remaining) ? saved.remaining : phaseFull(phase);
  return { phase, completed, running: false, remaining, endTime: null };
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
  // timer (see restoreSession). endTimeRef is seeded here, before first paint,
  // for the resume-live case.
  const restored = useRef(readSession()).current;
  const init = restoreSession(restored, { ...POMO_DEFAULTS, ...stored });
  if (init.endTime != null) endTimeRef.current = init.endTime;
  // The stamp on the session this device is currently showing. A session
  // arriving from another device is only adopted if it is strictly newer.
  const savedAtRef = useRef(Number(restored?.savedAt) || 0);

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
    // Dedup on the session WITHOUT the timestamp: savedAt changes every time,
    // so including it here would defeat the guard and write on every tick.
    const str = JSON.stringify(session);
    if (str === lastSavedRef.current) return;
    lastSavedRef.current = str;
    const savedAt = Date.now();
    savedAtRef.current = savedAt;
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt }));
      // Tell the sync layer there's something to push. Without this the key
      // would sit in localStorage and never leave the machine, which is what
      // kept a paused timer stranded on the device that paused it.
      window.dispatchEvent(
        new CustomEvent("ligand:localwrite", { detail: { key: SESSION_KEY } })
      );
    } catch {
      /* storage full / unavailable — the timer still works, just won't survive a reload */
    }
  }, [phase, running, completed, remaining]);

  /* Adopt a session that arrived from another device.

     A cloud pull writes the key straight into localStorage and fires
     `ligand:hydrate`; this hook holds the countdown in React state, so without
     listening it would happily keep showing its own stale timer. Only a
     STRICTLY newer session is taken, so a pull carrying this device's own
     recent write — or an older one from a device that has been asleep — can't
     yank the timer out from under whoever is actually using it. */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    const adopt = () => {
      const saved = readSession();
      const stamp = Number(saved?.savedAt) || 0;
      if (!saved || !validPhase(saved.phase) || stamp <= savedAtRef.current) return;
      savedAtRef.current = stamp;
      const next = restoreSession(saved, settingsRef.current);
      endTimeRef.current = next.endTime;
      lastPhaseRef.current = next.phase;
      // Keep the dedup guard in step, or the effect above immediately writes
      // this same state back with a fresh stamp and starts a push/pull loop.
      lastSavedRef.current = JSON.stringify(
        next.running
          ? { phase: next.phase, completed: next.completed, running: true, endTime: next.endTime, remaining: null }
          : { phase: next.phase, completed: next.completed, running: false, endTime: null, remaining: next.remaining }
      );
      setPhase(next.phase);
      setCompleted(next.completed);
      setRemaining(next.remaining);
      setRunning(next.running);
    };
    window.addEventListener("ligand:hydrate", adopt);
    return () => window.removeEventListener("ligand:hydrate", adopt);
  }, []);

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

  /* End the whole session early — "I'm done for the day", mid-block.

     Reset throws the block away; this BANKS it. It reports how much of the
     current phase was actually spent so the caller can log that focus time,
     because time you really sat and worked should count whether or not you
     happened to reach the end of a 25-minute box. Returns
     { wasFocus, elapsedSec, elapsedMin } and leaves the timer on a fresh
     focus block with the cycle cleared. */
  const endSession = useCallback(() => {
    const total = phaseSeconds(phase);
    const left =
      running && endTimeRef.current != null ? secsLeft() : Math.max(0, remaining);
    const elapsedSec = Math.max(0, total - left);
    const wasFocus = phase === PHASES.WORK;
    endTimeRef.current = null;
    setRunning(false);
    setCompleted(0);
    setPhase(PHASES.WORK);
    setRemaining(phaseSeconds(PHASES.WORK));
    return {
      wasFocus,
      elapsedSec,
      elapsedMin: Math.round((elapsedSec / 60) * 10) / 10,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, phaseSeconds, running, remaining]);

  // Manually jump to a phase (also used by the segmented control).
  const goToPhase = useCallback((p) => {
    endTimeRef.current = null;
    setRunning(false);
    setPhase(p);
  }, []);

  // Skip the current phase. Skipping a focus block advances the cycle the
  // same way finishing it would, so a Long break still lands on every
  // `longEvery`-th block instead of always dropping to a Short break.
  /* Take already-spent time off the current block.

     For "I studied 5 minutes before opening the timer": rather than logging
     those minutes and then sitting through a full 50, the block starts at 45.
     The point of a Pomodoro is the total time at the desk, so time you already
     did is time you don't owe.

     Only the CURRENT block shrinks — settings are untouched, so the next one is
     full length again. A running block moves its absolute end time by the same
     amount, which keeps the countdown honest without a special case.

     Never drives the block to zero: landing on 0 would fire the phase-end
     handler and log the whole block as focus, double-counting the very minutes
     being credited. It stops a second short and reports what it could take, so
     the caller can say so. */
  const creditSpent = useCallback(
    (minutes) => {
      const want = Math.max(0, Math.round((Number(minutes) || 0) * 60));
      if (!want) return { applied: 0, appliedMin: 0 };
      const left = running && endTimeRef.current != null ? secsLeft() : Math.max(0, remaining);
      const applied = Math.max(0, Math.min(want, left - 1));
      if (!applied) return { applied: 0, appliedMin: 0 };
      if (running && endTimeRef.current != null) {
        endTimeRef.current -= applied * 1000;
        setRemaining(Math.max(0, left - applied));
      } else {
        setRemaining(Math.max(0, left - applied));
      }
      return { applied, appliedMin: Math.round((applied / 60) * 10) / 10 };
    },
    [running, remaining]
  );

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
    endSession,
    creditSpent,
    goToPhase,
  };
}

export default usePomodoro;
