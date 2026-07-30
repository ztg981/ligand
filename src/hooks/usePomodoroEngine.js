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

/* Below this an "end session" reads as a mis-tap rather than real focus.

   Deliberately as low as it can go. A minute is not a meaningful threshold for
   "did that count" — half a minute of actually sitting down is still half a
   minute, and a tracker that silently discards it is lying about the day. Only
   a start-and-stop inside the same second is treated as a fumble; everything
   above that is logged as real (fractional) minutes and rendered in seconds
   where that's the honest unit (see fmtMinutes). */
export const MIN_LOGGED_SEC = 1;

/** A pause this long means you left, not that you stepped away. */
export const AUTO_END_PAUSED_MS = 3 * 60 * 60 * 1000; // 3 hours

function readSessionRaw() {
  try {
    const raw = window.localStorage.getItem("ligand.pomodoro.session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readPausedAt() {
  try {
    const raw = window.localStorage.getItem("ligand.pomodoro.pausedAt");
    const v = raw ? JSON.parse(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function usePomodoroEngine({
  chimeEnabled = true,
  alarmOnComplete = false,
  tasks = [],
  // Only so a logged session can record what it was FOR in words. The goal
  // attribution below already needs the ids; this turns them into a label the
  // focus detail view can show without re-resolving anything.
  goals = [],
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
  // Assigned further down, once `labelFor` exists. The phase-end callback is
  // built before it (it's passed into usePomodoro) but only ever RUNS later,
  // so reading it through a ref is what lets the two coexist.
  const labelRef = useRef(null);
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
        const { taskId, work, tasks: ts, goals: gs } = focusEndRef.current;
        if (logRef.current) {
          let goalId = null;
          if (taskId?.startsWith("goal:")) {
            goalId = taskId.slice(5);
          } else if (taskId && taskId !== "custom") {
            goalId = ts.find((t) => t.id === taskId)?.goalId || null;
          }
          // "timer": a block that ran the whole way. The one kind of session
          // worth distinguishing, since finishing is the thing being tracked.
          logRef.current({
            minutes: work,
            goalId,
            source: "timer",
            taskId: taskId || null,
            label: labelRef.current?.(taskId, ts, gs) || null,
          });
        }
      }
      completeRef.current?.({ endedPhase });
    },
  });

  focusEndRef.current = { taskId: focusTaskId, work: pomo.settings.work, tasks, goals };

  /* What the current focus selection is called, for the log. Mirrors the goal
     attribution below: a task credits (and is named after) its own text,
     "goal:<id>" the goal's name, "custom" the free text the user typed, and an
     empty selection is honestly unattributed rather than invented. */
  const labelFor = (taskId, ts = tasks, gs = goals) => {
    if (!taskId) return null;
    if (taskId === "custom") return focusCustom.trim() || null;
    if (taskId.startsWith("goal:")) {
      return gs.find((g) => g.id === taskId.slice(5))?.name || null;
    }
    return ts.find((t) => t.id === taskId)?.text || null;
  };
  labelRef.current = labelFor;

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
      // "partial": real focus time, but a block you stopped rather than
      // finished. Worth separating so the detail view can be honest about how
      // many blocks actually ran to the end.
      logRef.current?.({
        minutes: result.elapsedMin,
        goalId: currentGoalId(),
        source: "partial",
        taskId: focusTaskId || null,
        label: labelFor(focusTaskId),
      });
    }
    return result;
  };

  /* Abandoned sessions end themselves.

     Pausing and walking away used to leave a block "in progress" for days, so
     the next visit resumed a stale timer and the dots implied a cycle that
     never happened. After AUTO_END_PAUSED_MS still paused, the session is
     ended and whatever focus time was already spent is banked — the same
     treatment as pressing End session, since that's what actually happened.

     The window is deliberately long: an hour is a lunch break, not an
     abandonment, and ending a real session early would be worse than leaving
     a stale one. */
  useEffect(() => {
    const check = () => {
      const session = readSessionRaw();
      if (!session || session.running) return;
      const pausedAt = readPausedAt();
      if (!pausedAt) return;
      if (Date.now() - pausedAt < AUTO_END_PAUSED_MS) return;
      endSession();
      try {
        window.localStorage.removeItem("ligand.pomodoro.pausedAt");
      } catch {
        /* ignore */
      }
    };
    check();
    const id = window.setInterval(check, 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
