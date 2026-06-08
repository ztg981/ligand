import { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================
   useLocalStorage — the ONE hook all persisted state flows through.

   Works just like useState, but the value is mirrored to
   localStorage as JSON so it survives reloads. No backend.

   - initialValue may be a value OR a function (lazy init), like useState.
   - Reads once on first render; falls back to initialValue if nothing
     is stored or the stored JSON is corrupt.
   - Writes back automatically whenever the value changes.
   - Keeps multiple open tabs in sync via the window "storage" event.
   ============================================================ */
export function useLocalStorage(key, initialValue) {
  // Keep the latest initialValue without making it a hook dependency
  // (so passing an object/function literal doesn't cause re-reads).
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  const resolveInitial = useCallback(() => {
    const v = initialRef.current;
    return typeof v === "function" ? v() : v;
  }, []);

  const readValue = useCallback(() => {
    if (typeof window === "undefined") return resolveInitial();
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? resolveInitial() : JSON.parse(raw);
    } catch (err) {
      console.warn(`useLocalStorage: could not read "${key}"`, err);
      return resolveInitial();
    }
  }, [key, resolveInitial]);

  const [value, setValue] = useState(readValue);

  // Persist on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`useLocalStorage: could not write "${key}"`, err);
    }
  }, [key, value]);

  // Reflect changes made in other tabs/windows.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setValue(JSON.parse(e.newValue));
        } catch {
          /* ignore malformed cross-tab payload */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [value, setValue];
}

export default useLocalStorage;
