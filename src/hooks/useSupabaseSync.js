import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import {
  collectLocalBlob,
  applyBlobToLocal,
  clearLocalBlob,
  fetchUserData,
  pushUserData,
} from "../lib/syncManager.js";

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

  // Push the current local blob (debounced caller). Shared by the writer
  // effect and migration. Returns nothing; updates status.
  const pushNow = useCallback(async () => {
    if (!userId || !supabase || !activeRef.current) return;
    const blob = collectLocalBlob();
    const json = JSON.stringify(blob);
    if (json === lastPushedRef.current) return; // nothing changed
    setStatus("syncing");
    const res = await pushUserData(userId, blob);
    if (res.ok) {
      lastPushedRef.current = json;
      setStatus("synced");
    } else {
      setStatus("offline");
    }
  }, [userId]);

  // --- 1. Initial fetch + hydrate whenever the logged-in user changes ---
  useEffect(() => {
    // Reset transient flags on any auth transition.
    activeRef.current = false;
    setNeedsMigration(false);
    clearTimeout(debounceRef.current);

    if (!userId || !supabase) {
      setStatus("idle");
      setHydrating(false);
      lastPushedRef.current = null;
      return;
    }

    let cancelled = false;
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
        lastPushedRef.current = JSON.stringify(res.row.data);
        activeRef.current = true;
        setHydrating(false);
        setStatus("synced");
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
      debounceRef.current = setTimeout(pushNow, DEBOUNCE_MS);
    };
    window.addEventListener("ligand:localwrite", onWrite);
    return () => {
      window.removeEventListener("ligand:localwrite", onWrite);
      clearTimeout(debounceRef.current);
    };
  }, [userId, pushNow]);

  // --- First-login migration, resolved by the app (Phase 4 UI) ---
  // importExisting === true  → push the current local blob as the first row.
  // importExisting === false → wipe local and start with an empty cloud row.
  const runMigration = useCallback(
    async (importExisting) => {
      if (!userId || !supabase) return { ok: false };
      let blob;
      if (importExisting) {
        blob = collectLocalBlob();
      } else {
        clearLocalBlob(); // reset local to defaults
        blob = {};
      }
      activeRef.current = true;
      setStatus("syncing");
      const res = await pushUserData(userId, blob);
      if (res.ok) {
        lastPushedRef.current = JSON.stringify(blob);
        setStatus("synced");
      } else {
        setStatus("offline");
      }
      setNeedsMigration(false);
      return res;
    },
    [userId]
  );

  return { status, hydrating, needsMigration, runMigration };
}

export default useSupabaseSync;
