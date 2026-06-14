# Ligand — Supabase Auth & Cloud Sync — Progress

_Session date: 2026-06-14_

This document is the source of truth for what landed, what's verified, what's
**not** verified, and the **two manual Supabase dashboard steps** you must do to
finish the job.

---

## TL;DR

- **Phases 1–4: built and committed.** Auth, schema SQL, the localStorage↔cloud
  sync layer, and the first-login import prompt are all implemented.
- **The app still works exactly as before for guests** — verified in both the
  dev server and the production preview, zero console errors. Cloud features are
  100% dormant unless a user signs in, so nothing that worked before is at risk.
- **Phase 5 security check: PASSED (2026-06-14).** The table was created, email
  confirmation turned off, and the full two-account isolation harness ran with
  the anon key — **all six checks PASS**. Cross-user data isolation is proven
  (see Phase 5 below).
- **Still worth doing:** exercise the real logged-in flow in the UI (sign up →
  migration prompt → add a goal → reload → second browser) to confirm the
  fetch/hydrate/push cycle end-to-end. The data-layer guarantee is proven; this
  just confirms the UI wiring around it.

---

## What you need to do (manual, ~5 min)

These need the dashboard because the app ships only the **publishable/anon key**,
which by design cannot create tables or change auth settings.

1. **Create the table + RLS policies.**
   Dashboard → **SQL Editor** → New query → paste all of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**. Expect "Success."

2. **Allow a sign-in path for testing** (pick one):
   - **Recommended for now:** Dashboard → **Authentication → Sign In / Providers
     → Email** → turn **OFF "Confirm email"** → Save. This lets accounts sign in
     immediately. (Re-enable later if you want email confirmation in production.)
   - Or keep confirmation on and manually confirm two users under
     **Authentication → Users**.

Then run the security check in [`supabase/verify-rls.md`](supabase/verify-rls.md)
(copy-paste console harness). **All six checks must say PASS before you rely on
this in production.**

---

## Status by phase

### Phase 1 — Setup + Auth ✅ built & verified
- Installed `@supabase/supabase-js`.
- `.env.local` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; it is
  **gitignored** (verified not staged) so the key is never committed.
- `src/lib/supabaseClient.js` — shared client, `isSupabaseConfigured` guard so a
  clone without env vars silently runs local-only instead of crashing.
- `src/hooks/useAuth.jsx` — `AuthProvider` context: session/user/loading,
  `signUp` / `signInWithPassword` / `signOut`, `onAuthStateChange` listener.
- `src/components/AuthScreen.jsx` — email + password, Sign in / Create account
  toggle, **prominent "Continue without an account"**, inline error + email-
  confirmation notice.
- `App.jsx` gates: loading veil while session resolves → auth screen when no
  session and not a guest → app. `ligand.guestMode` flag remembers the guest
  choice across reloads.
- Avatar menu shows account email + **Sign out** when logged in, or **"Sign in
  or create account"** (re-opens the auth screen) when a guest.

**Verified (browser):** auth screen gates the app; signup round-trips to
Supabase and **creates a user** (confirmed a real `user_id` came back);
"Continue without an account" enters the app and **persists across reload**;
avatar menu shows the correct guest state and re-opens auth.

### Phase 2 — DB schema + RLS ✅ written, ⚠️ must be run manually
- [`supabase/schema.sql`](supabase/schema.sql): `public.user_data` (`user_id`
  uuid PK → `auth.users`, `data` jsonb, `updated_at`), **RLS enabled**, and four
  policies (SELECT/INSERT/UPDATE/DELETE) all gated on `auth.uid() = user_id`,
  plus an `updated_at` trigger. Idempotent (safe to re-run).
- **Not executed** — the anon key can't run DDL. Confirmed via the client the
  table does not exist yet (`PGRST205`). **This is manual step #1 above.**

### Phase 3 — Data sync layer ✅ built, ⚠️ logged-in path unverified
- `src/lib/syncManager.js` — pure helpers: `collectLocalBlob`,
  `applyBlobToLocal`, `clearLocalBlob`, `hasMeaningfulLocalData`,
  `fetchUserData`, `pushUserData`. The device-local `ligand.guestMode` flag is
  excluded from sync.
- `src/hooks/useSupabaseSync.js` — orchestration:
  - On login: fetch the user's row. **Cloud is source of truth** → hydrate
    localStorage and React state (via a `ligand:hydrate` event).
  - On local writes: **debounced ~1.5s** push of the whole blob. No-op pushes
    are skipped (byte-identical guard), which also prevents an echo right after
    hydration.
  - Fetch failure (table missing / network down) → status **"offline"**, keeps
    using localStorage. No data loss, no crash.
  - Exposes `needsMigration` + `runMigration` (the Phase 4 seam).
- `src/hooks/useLocalStorage.js` — now dispatches `ligand:localwrite` after each
  write and re-reads on `ligand:hydrate`. **Both are inert in guest mode** (no
  listeners / never fired), so local-only behavior is byte-for-byte unchanged.
- `App.jsx` — calls the sync hook, extends the loading veil to cover the initial
  cloud fetch, shows a small **Sync/Offline pill** in the top bar (nothing in
  guest mode or when synced).

**Verified:** guest mode unaffected (dev + prod, all tabs, localStorage
persists, zero console errors). **Not verified:** the fetch/hydrate/push cycle
with a real session (blocked — see below).

### Phase 4 — First-login migration ✅ built, ⚠️ flow unverified
- `src/components/MigrationModal.jsx` — on a brand-new account's first sign-in
  **with meaningful local data**, asks "Bring your data along?" → **Import my
  data** (push current local blob as the first row) or **Start fresh** (wipe
  local + empty row). If there's nothing meaningful, it silently creates an
  empty row (no prompt).
- `hasMeaningfulLocalData()` only counts real content (tasks/journal/count-ups
  or non-seed goals/habits/reflections), so the fresh seed alone doesn't trigger
  the prompt.

**Verified:** the modal renders correctly (title, both actions, icon, note) when
forced; guest mode never shows it. **Not verified:** the actual import vs
start-fresh outcome against a live row (blocked).

### Phase 5 — Security verification ✅ PASSED (2026-06-14)
**The full isolation harness was run against the real table and all six checks
PASSED.** The two earlier blockers were cleared: the `user_data` table was
created via `schema.sql`, and email confirmation was turned OFF so real sessions
could be obtained.

Run with the **publishable/anon key** (the exact key the shipped app uses, so
this reflects real production enforcement — not a privileged bypass):

```
✅ A can read its own row
✅ B can read its own row
✅ B CANNOT read A's row (RLS isolation)      — rows returned: 0
✅ B CANNOT overwrite A's row                 — rows updated: 0
✅ A's data still intact after B's attempts   — still ACCOUNT_A, not HIJACKED
✅ Anonymous (signed-out) read returns nothing — rows: 0
```

Cross-user isolation is **proven**: SELECT and UPDATE are both locked to
`auth.uid()`, A's data survived B's tamper attempts unchanged, and the anon key
alone exposes no data. The reusable harness lives in
[`supabase/verify-rls.md`](supabase/verify-rls.md) if you want to re-run it.

---

## How the sync works (architecture)

```
guest (no session):   useLocalStorage  ⇄  localStorage      (cloud code dormant)

logged in:            useLocalStorage  ⇄  localStorage
                              │  ligand:localwrite (debounced 1.5s)
                              ▼
                       useSupabaseSync  ──upsert──▶  user_data.data (jsonb)
                              ▲
                              │  on login: fetch → applyBlobToLocal → ligand:hydrate
```

The entire `ligand.*` keyspace is stored as one JSON blob per user, mirroring
the existing local model. Cloud wins on login; local writes flow up debounced.

---

## Notes / housekeeping

- **Test users created during Phase 1 probing** (unconfirmed, harmless — delete
  from Authentication → Users if you like):
  `ligand.qa.alpha@gmail.com`, and a couple `ligand.qa.<timestamp>@gmail.com`.
  `test1@example.com` was **rejected** by Supabase (it blocks `example.com`) —
  use real-domain emails (e.g. gmail) for test accounts.
- **Bundle size:** adding supabase-js pushed the JS bundle to ~590 KB (gzip
  ~168 KB) and Vite prints a >500 KB warning. It's only a warning. If you want
  it gone later, code-split the Supabase client behind a dynamic import — not
  done now to avoid churn.
- **Minor:** there's a very brief "Loading…" veil on every startup while the
  initial session check resolves (it reads localStorage, no network). Negligible
  for guests; left as-is.
- **Sign-out behavior:** signing out returns you to the auth screen unless you'd
  previously chosen guest mode on this device.

---

## Files added / changed

**Added**
- `src/lib/supabaseClient.js`
- `src/hooks/useAuth.jsx`
- `src/hooks/useSupabaseSync.js`
- `src/lib/syncManager.js`
- `src/components/AuthScreen.jsx`
- `src/components/MigrationModal.jsx`
- `supabase/schema.sql`  ← run this in the dashboard
- `supabase/verify-rls.md`  ← run this after the table exists
- `.env.local` (gitignored, not committed)

**Changed**
- `src/main.jsx` (wrap in `AuthProvider`)
- `src/App.jsx` (auth gate, sync hook, migration modal, sync status)
- `src/layout/TopNav.jsx` (avatar account state, sync pill)
- `src/hooks/useLocalStorage.js` (localwrite/hydrate events — inert for guests)
- `.gitignore` (explicit `.env*` entries)
- `package.json` / `package-lock.json` (`@supabase/supabase-js`)

---

## Recommended next session

1. Do the two manual dashboard steps above.
2. Run `supabase/verify-rls.md` — confirm all six checks PASS (the critical
   security gate).
3. Exercise the real logged-in flow in the UI: sign up → migration prompt →
   add a goal → reload (persists from cloud) → sign out/in on a second "device"
   (different browser) → confirm data follows the account and never leaks across
   accounts.
4. Optional polish: code-split supabase-js to clear the bundle-size warning;
   consider a "last synced" timestamp in the UI.
