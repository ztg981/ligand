import { useCallback, useEffect, useRef, useState } from "react";
import {
  readCookieBridge,
  writeCookieBridge,
} from "../lib/cookieBridge.js";
import { COOKIE_HANDOFF_KEYS } from "../lib/preferenceRecords.js";

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
      let raw = window.localStorage.getItem(key);
      if (raw === null && COOKIE_HANDOFF_KEYS.has(key)) {
        raw = readCookieBridge(key);
        if (raw !== null) window.localStorage.setItem(key, raw);
      }
      return raw === null ? resolveInitial() : JSON.parse(raw);
    } catch (err) {
      console.warn(`useLocalStorage: could not read "${key}"`, err);
      return resolveInitial();
    }
  }, [key, resolveInitial]);

  const [value, setValue] = useState(readValue);

  // Persist on every change. The `ligand:localwrite` event lets the optional
  // Supabase sync layer notice changes and debounce a push to the cloud. It is
  // inert in guest mode (nothing listens), so local-only behavior is unchanged.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const serialized = JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
      if (COOKIE_HANDOFF_KEYS.has(key)) {
        writeCookieBridge(key, serialized);
      }
      window.dispatchEvent(
        new CustomEvent("ligand:localwrite", { detail: { key } })
      );
    } catch (err) {
      console.warn(`useLocalStorage: could not write "${key}"`, err);
    }
  }, [key, value]);

  // When the sync layer hydrates localStorage from the cloud, it fires a single
  // `ligand:hydrate` event; every hook re-reads its own key so React state
  // reflects the fetched data without a full page reload. Never fires in guest
  // mode, so this is a no-op there.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHydrate = () => {
      try {
        const raw = window.localStorage.getItem(key);
        setValue((prev) => {
          if (raw === null) return resolveInitial();
          // Avoid a pointless re-render when nothing actually changed.
          try {
            if (JSON.stringify(prev) === raw) return prev;
          } catch {
            /* fall through to update */
          }
          return JSON.parse(raw);
        });
      } catch {
        /* ignore malformed payload */
      }
    };
    window.addEventListener("ligand:hydrate", onHydrate);
    return () => window.removeEventListener("ligand:hydrate", onHydrate);
  }, [key, resolveInitial]);

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
