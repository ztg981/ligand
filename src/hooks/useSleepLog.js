import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { makeSleepEntry } from "../lib/sleep.js";

/* useSleepLog — the sleep diary's own little store.

   Deliberately SEPARATE from ligand.data: one entry per wake-date under
   ligand.sleep, upserted by date (logging twice just corrects the entry).
   Keeping it self-contained means the diary can't tangle with goal/task
   sync, and clearing it never touches anything else. */

const STORAGE_KEY = "ligand.sleep";
const PENDING_KEY = "ligand.sleepPending";

export function useSleepLog() {
  const [log, setLog] = useLocalStorage(STORAGE_KEY, []);
  const [pendingSleep, setPendingSleep] = useLocalStorage(PENDING_KEY, null);

  // Upsert by wake-date. Returns the clean entry, or null if the draft
  // didn't validate (caller keeps its form open in that case).
  const logSleep = useCallback(
    (draft) => {
      const entry = makeSleepEntry(draft);
      if (!entry) return null;
      setLog((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const rest = arr.filter((e) => e.date !== entry.date);
        // Keep a year of nights; the widgets only read the recent window.
        return [...rest, entry].slice(-366);
      });
      setPendingSleep(null);
      return entry;
    },
    [setLog, setPendingSleep]
  );

  const removeSleep = useCallback(
    (date) => setLog((prev) => (prev || []).filter((e) => e.date !== date)),
    [setLog]
  );

  const entryFor = useCallback(
    (date) => (log || []).find((e) => e.date === date) || null,
    [log]
  );

  const startSleepNow = useCallback(() => {
    const now = new Date();
    const pending = {
      startedAt: now.toISOString(),
      startedOn: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      bedTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    };
    setPendingSleep(pending);
    return pending;
  }, [setPendingSleep]);

  const cancelPendingSleep = useCallback(() => setPendingSleep(null), [setPendingSleep]);

  return {
    sleepLog: log || [],
    logSleep,
    removeSleep,
    entryFor,
    pendingSleep,
    startSleepNow,
    cancelPendingSleep,
  };
}

export default useSleepLog;
