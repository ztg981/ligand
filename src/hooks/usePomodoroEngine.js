import { useEffect, useRef, useState } from "react";
import { usePomodoro, PHASES } from "./usePomodoro.js";
import { useLocalStorage } from "./useLocalStorage.js";
import { startPomodoroChime, phaseChange, startAlarm } from "../lib/uiSounds.js";

/* usePomodoroEngine — the timer and everything that happens when a block ends,
   owned by the APP rather than by the Pomodoro tab.

   Why it lives here: the Pomodoro tab is lazily mounted and unmounts the
   moment you switch to Journal (or anywhere else). While the engine lived
   inside it, leaving the tab tore down the interval AND the phase-end effect,
   so a focus block that finished while you were elsewhere never chimed and —
   worse — was never written to the focus log. The time was silently lost, and
   the saved session was left stuck in a stale "running" state.

   Hoisting it here means the clock, the chime and the logging survive tab
   changes, which is the only behaviour that makes a background timer honest.
   The tab is now a pure view over this engine.

   Returns everything the tab needs to render and drive the timer. */

/** Below this an "end session" reads as a mis-tap rather than real focus. */
export const MIN_LOGGED_SEC = 5;

export function usePomodoroEngine({
  chimeEnabled = true,
  alarmOnComplete = false,
  tasks = [],
  logFocusSession,
  onPhaseComplete,
} = {}) {
  // What the user is focusing on. Persisted so it survives reloads. Value is
  // "" (nothing), a task id, "goal:<goalId>", or "custom" (free text in
  // ligand.focusCustom). Owned here so the phase-end callback can attribute
  // logged time even when the Pomodoro tab isn't mounted.
  const [focusTaskId, setFocusTaskId] = useLocalStorage("ligand.focusTaskId", "");
  const [focusCustom, setFocusCustom] = useLocalStorage("ligand.focusCustom", "");

  // Latest values for the phase-end callback, without stale closures.
  const focusEndRef = useRef(null);

  // "Ring until dismissed" alarm (opt-in) and its stop handle.
  const alarmStopRef = useRef(null);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const stopAlarm = () => {
    if (alarmStopRef.current) {
      alarmStopRef.current();
      alarmStopRef.current = null;
    }
    setAlarmRinging(false);
  };

  // The repeating completion chime (the gentler default).
  const chimeStopRef = useRef(null);
  const stopChime = () => {
    if (chimeStopRef.current) {
      chimeStopRef.current();
      chimeStopRef.current = null;
    }
  };

  // Read the newest prefs inside the callback without re-subscribing it.
  const alarmPrefRef = useRef(alarmOnComplete);
  alarmPrefRef.current = alarmOnComplete;
  const chimePrefRef = useRef(chimeEnabled);
  chimePrefRef.current = chimeEnabled;
  const logRef = useRef(logFocusSession);
  logRef.current = logFocusSession;
  const completeRef = useRef(onPhaseComplete);
  completeRef.current = onPhaseComplete;

  const pomo = usePomodoro({
    onPhaseEnd: ({ endedPhase }) => {
      // A finished WORK block is a reward (descending bing-bong); a finished
      // break is "back to focus" (rising lift). Both follow the Pomodoro chime
      // setting, not the UI-sounds toggle.
      if (chimePrefRef.current) {
        if (endedPhase === PHASES.WORK) {
          if (alarmPrefRef.current) {
            stopAlarm();
            alarmStopRef.current = startAlarm();
            setAlarmRinging(true);
          } else {
            // Repeat so the finish isn't missed: three rings if you're looking
            // at the app, or until you come back if you aren't (capped).
            stopChime();
            chimeStopRef.current = startPomodoroChime({
              maxRings: document.visibilityState === "visible" ? 3 : 20,
              intervalMs: 2600,
            });
          }
        } else {
          phaseChange();
        }
      }
      // EVERY completed focus block is logged — the trends and the day ring
      // must never miss real focus time, including blocks that finished while
      // the user was on another tab. A task attributes it to the task's goal,
      // "goal:<id>" to that goal directly; custom text and "nothing in
      // particular" log with no goal.
      if (endedPhase === PHASES.WORK && focusEndRef.current) {
        const { taskId, work, tasks: ts } = focusEndRef.current;
        if (logRef.current) {
          let goalId = null;
          if (taskId?.startsWith("goal:")) {
            goalId = taskId.slice(5);
          } else if (taskId && taskId !== "custom") {
            goalId = ts.find((t) => t.id === taskId)?.goalId || null;
          }
          logRef.current({ minutes: work, goalId });
        }
      }
      completeRef.current?.({ endedPhase });
    },
  });

  focusEndRef.current = { taskId: focusTaskId, work: pomo.settings.work, tasks };

  /* Which goal the current focus selection credits (same rules the phase-end
     logging uses): a task credits its goal, "goal:<id>" credits it directly,
     and free text or "nothing in particular" credit none. */
  const currentGoalId = () => {
    const taskId = focusTaskId;
    if (taskId?.startsWith("goal:")) return taskId.slice(5);
    if (taskId && taskId !== "custom") {
      return tasks.find((t) => t.id === taskId)?.goalId || null;
    }
    return null;
  };

  /* End the session early and KEEP the focus time already spent.

     Stopping mid-block is a normal way to finish a day, and the minutes you
     actually sat there are real. Reset discards them; this banks them, so the
     focus stats stay honest either way.

     The floor is deliberately low (5s): only an accidental start-then-stop is
     worth discarding, and anything above that is time the user genuinely spent
     and expects to see counted. */
  const endSession = () => {
    stopChime();
    stopAlarm();
    const result = pomo.endSession();
    if (result?.wasFocus && result.elapsedSec >= MIN_LOGGED_SEC) {
      logRef.current?.({ minutes: result.elapsedMin, goalId: currentGoalId() });
    }
    return result;
  };

  // Coming back to the app — or any interaction — acknowledges the chime.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") stopChime();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pointerdown", stopChime);
    window.addEventListener("keydown", stopChime);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pointerdown", stopChime);
      window.removeEventListener("keydown", stopChime);
    };
  }, []);

  // Starting the next block silences anything still ringing.
  useEffect(() => {
    if (pomo.running) stopChime();
  }, [pomo.running]);

  // Safety: the insistent alarm auto-stops after 90s so it can never ring
  // forever if the user has stepped away.
  useEffect(() => {
    if (!alarmRinging) return undefined;
    const t = setTimeout(() => stopAlarm(), 90000);
    return () => clearTimeout(t);
  }, [alarmRinging]);

  useEffect(
    () => () => {
      stopAlarm();
      stopChime();
    },
    []
  );

  return {
    pomo,
    focusTaskId,
    setFocusTaskId,
    focusCustom,
    setFocusCustom,
    alarmRinging,
    stopAlarm,
    stopChime,
    endSession,
    /** True while a FOCUS block is actively running (drives the site blocker). */
    focusActive: pomo.running && pomo.phase === PHASES.WORK,
  };
}

export default usePomodoroEngine;
