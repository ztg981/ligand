import { useCallback, useMemo, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { uid, todayKey } from "../lib/model.js";
import {
  notify as osNotify,
  requestPermission as osRequestPermission,
  permissionStatus,
} from "../lib/notifications.js";

/* ============================================================
   useNotifications — the app's notification center.

   Two layers:
   1. An in-app FEED (the bell dropdown). Always populated when the
      master toggle is on, so the bell is useful even if the user
      never grants OS permission.
   2. A best-effort OS notification on top, shown only when browser
      permission is "granted".

   Gating + dedup:
   - Every push respects the master `enabled` flag.
   - Triggers that fire on app-load (overdue / urgent / re-entry) pass
     { oncePerDay: true }; we stamp lastFired[type] = today and skip if
     it already fired today. This survives reloads via localStorage.
   - Event triggers (Pomodoro phase end) fire every time.
   ============================================================ */

const STORAGE_KEY = "ligand.notifications";
const MAX_ITEMS = 25;

const EMPTY = { items: [], lastFired: {} };

export function useNotifications({ enabled = false } = {}) {
  const [feed, setFeed] = useLocalStorage(STORAGE_KEY, EMPTY);

  // Refs hold the latest values so `push` can stay referentially stable
  // (no churn in effect deps) while still reading fresh state for dedup.
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Core: add a feed entry (+ optional OS notification), with gating + dedup.
  const push = useCallback(
    (type, title, body = "", { oncePerDay = false } = {}) => {
      if (!enabledRef.current) return false;
      const today = todayKey();
      const current = feedRef.current || EMPTY;
      if (oncePerDay && current.lastFired?.[type] === today) return false;

      const item = {
        id: uid("ntf"),
        type,
        title,
        body,
        ts: Date.now(),
        read: false,
      };

      setFeed((f) => {
        const base = f || EMPTY;
        return {
          ...base,
          items: [item, ...(base.items || [])].slice(0, MAX_ITEMS),
          lastFired: oncePerDay
            ? { ...(base.lastFired || {}), [type]: today }
            : base.lastFired || {},
        };
      });

      // OS layer — silently no-ops unless permission is granted.
      osNotify(title, body);
      return true;
    },
    [setFeed]
  );

  const markAllRead = useCallback(
    () =>
      setFeed((f) => ({
        ...(f || EMPTY),
        items: (f?.items || []).map((i) => (i.read ? i : { ...i, read: true })),
      })),
    [setFeed]
  );

  const clearAll = useCallback(
    () => setFeed((f) => ({ ...(f || EMPTY), items: [] })),
    [setFeed]
  );

  const requestPermission = useCallback(() => osRequestPermission(), []);

  const items = feed?.items || [];
  const unreadCount = useMemo(() => items.filter((i) => !i.read).length, [items]);

  return {
    items,
    unreadCount,
    push,
    markAllRead,
    clearAll,
    requestPermission,
    permission: permissionStatus(),
  };
}

export default useNotifications;
