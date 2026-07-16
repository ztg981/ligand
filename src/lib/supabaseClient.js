/* ============================================================
   Supabase client — single shared instance for auth + data sync.
   ------------------------------------------------------------
   Reads the project URL and publishable/anon key from Vite env
   vars (see .env.local, which is gitignored). The anon key is
   safe to ship in the client: all data access is gated by
   Row Level Security policies on the `user_data` table, so a
   user can only ever read/write their own row.

   If the env vars are missing (e.g. a fresh clone with no
   .env.local), `supabase` is null and the app silently runs in
   guest / localStorage-only mode — no crashes.
   ============================================================ */
import { createClient } from "@supabase/supabase-js";
import { createCookieHandoffStorage } from "./cookieBridge.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when Supabase is configured. When false, the app runs guest-only. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Not an error — just means cloud sync is unavailable this build.
  console.info(
    "[ligand] Supabase env vars missing. Running in local-only mode."
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Safari copies first-party cookies, but not localStorage, into a newly
        // installed Home Screen web app. Mirror Supabase's normal localStorage
        // session through a cookie so future installs inherit the login once.
        storage: createCookieHandoffStorage(),
      },
    })
  : null;

export default supabase;
