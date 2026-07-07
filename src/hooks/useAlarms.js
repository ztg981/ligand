import { useEffect, useState } from "react";
import { todayKey } from "../lib/model.js";

/* useAlarms — watches the clock and raises the currently-firing alarm.

   Alarms only fire while Ligand is open (a browser tab can't wake a sleeping
   device — the UI is honest about this). We poll every few seconds and, when an
   enabled alarm's HH:MM matches the current minute on a scheduled weekday and it
   hasn't already fired today, we raise it and stamp lastFired so it rings once
   per day. Dismissal is handled by the overlay (photo scan); this hook just
   owns which alarm, if any, is going off. */

const pad = (n) => String(n).padStart(2, "0");

/**
 * Pure due-check for one alarm at a given Date. Exported for tests.
 * True when: enabled, HH:MM matches the current minute, today's weekday is
 * scheduled (empty days = every day), and it hasn't already fired today
 * (the lastFired stamp is the duplicate-fire guard; it also makes the
 * midnight boundary safe since todayKey changes at 00:00 local).
 */
export function isAlarmDue(alarm, now = new Date()) {
  if (!alarm?.enabled) return false;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (alarm.time !== hhmm) return false;
  const weekday = (now.getDay() + 6) % 7; // Mon=0..Sun=6
  if (alarm.days?.length && !alarm.days.includes(weekday)) return false;
  return alarm.lastFired !== todayKey(now);
}

export function useAlarms(alarms = [], updateAlarm) {
  const [firingId, setFiringId] = useState(null);

  useEffect(() => {
    const check = () => {
      if (firingId) return; // one alarm at a time
      const now = new Date();
      const today = todayKey(now);
      const due = alarms.find((a) => isAlarmDue(a, now));
      if (due) {
        setFiringId(due.id);
        updateAlarm?.(due.id, { lastFired: today });
      }
    };
    check(); // catch an alarm that's due the instant this mounts
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, [alarms, firingId, updateAlarm]);

  const firing = alarms.find((a) => a.id === firingId) || null;
  const dismiss = () => setFiringId(null);

  return { firing, dismiss };
}

export default useAlarms;
