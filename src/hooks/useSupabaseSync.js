import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import {
  collectLocalBlob,
  applyBlobToLocal,
  clearLocalBlob,
  fetchUserData,
  pushUserData,
} from "../lib/syncManager.js";
import {
  prepareTaskRecordSyncForUser,
  reconcileTaskRecords,
  resetTaskRecordSyncState,
} from "../lib/taskRecordSync.js";

/* ============================================================
   useSupabaseSync — keeps localStorage and the cloud in step.

   Lifecycle (only when a session exists):
     1. On login, fetch the user's row.
        - Row found  → cloud is source of truth: hydrate localStorage,
                       then react state, from it.
        - No row yet → first login: flag `needsMigration` and wait for
                       the app to call runMigration(importExisting).
        - Fetch fails (table missing / offline) → status "offline",
                       keep using localStorage. No data loss.
     2. After hydration, watch `ligand:localwrite` events and push the
        full blob to the cloud, debounced ~1.5s after the last change.
        A push is skipped when the blob is byte-identical to the last
        one sent, which also prevents an echo right after hydration.

   In guest mode (no session) this hook is dormant: status "idle",
   no fetch, no push — the app behaves exactly as before.

   `status`:  idle | loading | syncing | synced | offline
   `hydrating`: true only during the initial on-login fetch, so the
                app can show a brief loading veil.
   ============================================================ */

const DEBOUNCE_MS = 1500;

export function useSupabaseSync(session) {
  const userId = session?.user?.id || null;

  const [status, setStatus] = useState("idle");
  const [hydrating, setHydrating] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);

  // Mutable refs that shouldn't trigger re-renders.
  const lastPushedRef = useRef(null); // JSON string last sent to the cloud
  const activeRef = useRef(false); // pushes allowed only after hydrate/migrate
  const debounceRef = useRef(null);
  const taskSyncRef = useRef(Promise.resolve());

  // Serialize record reconciliation so a focus event and a debounced local
  // write cannot apply the same expected version concurrently.
  const reconcileTasksNow = useCallback(() => {
    const run = taskSyncRef.current
      .catch(() => undefined)
      .then(() => reconcileTaskRecords({ client: supabase }));
    taskSyncRef.current = run;
    return run;
  }, []);

  // Push the current local blob (debounced caller). Shared by the writer
  // effect and migration. Returns nothing; updates status.
  const pushNow = useCallback(async () => {
    if (!userId || !supabase || !activeRef.current) return;
    const taskResult = await reconcileTasksNow();
    const blob = collectLocalBlob();
    const json = JSON.stringify(blob);
    if (json === lastPushedRef.current) {
      if (!taskResult.ok) setStatus("offline");
      return; // nothing changed
    }
    setStatus("syncing");
    const res = await pushUserData(userId, blob);
    if (res.ok) {
      lastPushedRef.current = json;
      setStatus(taskResult.ok ? "synced" : "offline");
    } else {
      setStatus("offline");
    }
  }, [userId, reconcileTasksNow]);

  // --- 1. Initial fetch + hydrate whenever the logged-in user changes ---
  useEffect(() => {
    // Reset transient flags on any auth transition.
    activeRef.current = false;
    // This effect is the auth-transition state machine; these resets must land
    // before its asynchronous hydration branch can report a later state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedsMigration(false);
    clearTimeout(debounceRef.current);

    if (!userId || !supabase) {
      setStatus("idle");
      setHydrating(false);
      lastPushedRef.current = null;
      return;
    }

    let cancelled = false;
    prepareTaskRecordSyncForUser(userId);
    setHydrating(true);
    setStatus("loading");

    (async () => {
      const res = await fetchUserData(userId);
      if (cancelled) return;

      if (!res.ok) {
        // Table missing or network down — keep localStorage, show offline.
        setStatus("offline");
        setHydrating(false);
        lastPushedRef.current = null;
        // Allow pushes to retry later (e.g. once the table exists / net back).
        activeRef.current = true;
        return;
      }

      if (res.row && res.row.data && Object.keys(res.row.data).length > 0) {
        // Cloud wins: overwrite local with the fetched blob.
        applyBlobToLocal(res.row.data);
        const taskResult = await reconcileTasksNow();
        if (cancelled) return;
        lastPushedRef.current = JSON.stringify(res.row.data);
        activeRef.current = true;
        setHydrating(false);
        setStatus(taskResult.ok ? "synced" : "offline");
        if (taskResult.changed) void pushNow();
        // If local had extra keys the cloud didn't, the resulting localwrite
        // will differ from lastPushed and get merged up on the next debounce.
      } else {
        // No row yet → first login. Defer the import decision to the app.
        setHydrating(false);
        setNeedsMigration(true);
        setStatus("synced");
        // pushes stay disabled until runMigration sets activeRef.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // --- 2. Debounced push on local writes (once hydrated) ---
  useEffect(() => {
    if (!userId || !supabase) return;
    const onWrite = () => {
      if (!activeRef.current) return;
      clearTimeout(debounceRef.current);
      // Null the ref when the timer fires: pullNow treats a SET ref as
      // "local edits pending" and skips, so a stale id would block pulling
      // forever after the first edit.
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        pushNow();
      }, DEBOUNCE_MS);
    };
    window.addEventListener("ligand:localwrite", onWrite);
    return () => {
      window.removeEventListener("ligand:localwrite", onWrite);
      clearTimeout(debounceRef.current);
    };
  }, [userId, pushNow]);

  // Pull the cloud blob when it differs from the last state we pushed/pulled.
  // This is what makes "plan on the PC, open the phone, it's there" work
  // WITHOUT signing out and back in: previously the cloud was only read at
  // login, so an already-open device never saw another device's edits until
  // its own next push overwrote them. Guards:
  //   - skipped while a local edit is waiting to push (debounce pending) —
  //     local changes win, exactly the documented last-write-wins policy;
  //   - a no-op when the fetched blob matches lastPushedRef (common case).
  const pullNow = useCallback(async () => {
    if (!userId || !supabase || !activeRef.current) return;
    if (debounceRef.current) return; // local edits about to push — don't clobber
    const res = await fetchUserData(userId);
    if (!res.ok || !res.row?.data) return;
    const json = JSON.stringify(res.row.data);
    if (json === lastPushedRef.current) return; // already in step
    applyBlobToLocal(res.row.data);
    const taskResult = await reconcileTasksNow();
    lastPushedRef.current = json;
    setStatus(taskResult.ok ? "synced" : "offline");
    if (taskResult.changed) void pushNow();
  }, [userId, pushNow, reconcileTasksNow]);

  // --- 3. Reconcile when connectivity returns / app is foregrounded ------
  // With no pending local edit, pull first so a confirmed ChatGPT change or a
  // second device update cannot be overwritten by task-record reconciliation.
  // A genuinely pending local edit still pushes first and keeps the existing
  // local-wins behavior.
  useEffect(() => {
    if (!userId || !supabase) return undefined;
    const reconcile = () => {
      if (!activeRef.current) return;
      if (document.visibilityState === "hidden") {
        // Backgrounding: flush local changes up, nothing to pull for a
        // screen nobody is looking at.
        pushNow();
        return;
      }
      if (debounceRef.current) {
        Promise.resolve(pushNow()).then(pullNow);
      } else {
        Promise.resolve(pullNow()).then(pushNow);
      }
    };
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [userId, pushNow, pullNow]);

  // --- First-login migration, resolved by the app (Phase 4 UI) ---
  // importExisting === true  → push the current local blob as the first row.
  // importExisting === false → wipe local and start with an empty cloud row.
  const runMigration = useCallback(
    async (importExisting) => {
      if (!userId || !supabase) return { ok: false };
      let blob;
      if (importExisting) {
        prepareTaskRecordSyncForUser(userId);
      } else {
        clearLocalBlob(); // reset local to defaults
        resetTaskRecordSyncState(undefined, userId);
      }
      activeRef.current = true;
      setStatus("syncing");
      const taskResult = importExisting
        ? await reconcileTasksNow()
        : { ok: true };
      blob = importExisting ? collectLocalBlob() : {};
      const res = await pushUserData(userId, blob);
      if (res.ok) {
        lastPushedRef.current = JSON.stringify(blob);
        setStatus(taskResult.ok ? "synced" : "offline");
      } else {
        setStatus("offline");
      }
      setNeedsMigration(false);
      return res;
    },
    [userId, reconcileTasksNow]
  );

  return { status, hydrating, needsMigration, runMigration };
}

export default useSupabaseSync;
