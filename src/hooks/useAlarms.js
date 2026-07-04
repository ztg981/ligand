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

export function useAlarms(alarms = [], updateAlarm) {
  const [firingId, setFiringId] = useState(null);

  useEffect(() => {
    const check = () => {
      if (firingId) return; // one alarm at a time
      const now = new Date();
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const weekday = (now.getDay() + 6) % 7; // Mon=0..Sun=6
      const today = todayKey(now);
      const due = alarms.find(
        (a) =>
          a.enabled &&
          a.time === hhmm &&
          (!a.days?.length || a.days.includes(weekday)) &&
          a.lastFired !== today
      );
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
