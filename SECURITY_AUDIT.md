# Ligand Security Audit

Last updated: 2026-07-06

## Sources Checked

- Supabase Edge Function auth/config docs: https://supabase.com/docs/guides/functions/auth and https://supabase.com/docs/guides/functions/function-configuration
- Supabase JWT docs: https://supabase.com/docs/guides/auth/jwts
- Google Gemini API key migration and limits: https://ai.google.dev/gemini-api/docs/api-key and https://ai.google.dev/gemini-api/docs/rate-limits

## Actual Architecture

Ligand is a React/Vite browser SPA with an Electron desktop wrapper. It is local-first: most app state is stored under `ligand.*` localStorage keys. When signed in, the app syncs one JSON blob to Supabase table `public.user_data`, keyed by `auth.users.id`.

Supabase Auth is used directly from the browser through `@supabase/supabase-js`. The frontend ships only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`/publishable key. No service-role key or Gemini key is used in frontend code.

The repository contains one Supabase Edge Function, `gemini-insights`, for Gemini-backed goal summaries, weekly review, recovery insight, and workout note import. Gemini is server-side only.

There are no repository Vercel Functions, storage buckets, collaboration tables, admin panels, OAuth providers, file upload servers, raw HTML renderers, or GitHub Actions prior to this work.

## Trust Boundaries

- Browser/Electron renderer: untrusted for authorization, stores local user data, calls Supabase Auth/Data/Functions.
- Supabase Postgres/RLS: authoritative tenant boundary for cloud data.
- Supabase Edge Function: authenticated server boundary for expensive Gemini calls.
- Gemini API: untrusted external model output; output must be validated/rendered as text.
- Vercel static hosting: serves the SPA with security headers from `vercel.json`.
- Electron main process: privileged desktop surface for updates and Windows focus-mode hosts-file edits.

## Sensitive Assets And Data

- Journal entries, notes, goals, tasks, habits, recovery data, workouts, alarms, settings, custom wallpapers, notification feed, and AI-generated insights.
- Supabase Auth sessions in the browser's Supabase-managed storage.
- Server-side `GEMINI_API_KEY`.
- Supabase database contents in `public.user_data`.

## Authentication Flow

The browser uses Supabase email/password Auth with persistent sessions and PKCE-capable Supabase defaults. Password reset redirects to `window.location.origin`. Sign-out now clears synced local `ligand.*` data and returns to the auth gate.

Dashboard-only Auth controls still need owner verification: email confirmation, leaked-password protection, rate limits/CAPTCHA, exact Site URL and redirect allowlist, and OAuth provider settings if providers are later enabled.

## Database And RLS Model

Confirmed exposed app table:

| Object | Purpose | Decision |
| --- | --- | --- |
| `public.user_data` | One JSON blob per user | RLS enabled; authenticated users can select/insert/update/delete only `user_id = auth.uid()` |
| `public.ai_rate_limits` | Per-user AI quota counters | RLS enabled; direct client grants revoked; only `consume_ai_rate_limit` can mutate |
| `public.consume_ai_rate_limit` | Atomic quota consume RPC | `SECURITY DEFINER`, fixed empty `search_path`, validates `auth.uid()` and action |
| `public.user_data_touch_updated_at` | Trigger helper | Security invoker trigger function, fixed empty `search_path` |

No views, materialized views, storage policies, Realtime config, or additional RPCs were found in the repo.

## Edge Function Inventory

| Function | Classification | Status |
| --- | --- | --- |
| `gemini-insights` | Authenticated user endpoint | JWT verification explicit in `supabase/config.toml`; handler validates user via `supabase.auth.getUser()`; request schema, size, CORS, and rate limits added |

## AI Data Flow

The client sends only selected context for each action. Existing privacy toggles keep journal text out of AI by default and keep recovery AI off by default. The Edge Function now allowlists fields by action, caps string/array sizes, rejects unknown actions, never accepts client-selected models/system prompts, rate-limits before Gemini spend, validates workout JSON output, bounds text output, and logs only operational categories/request IDs.

Prompt-injection text inside tasks, journals, or workout notes can still influence ordinary generated prose, but it cannot grant tools, reveal server secrets, select models, access other users' data, or perform privileged actions.

## Findings

### High: Gemini Edge Function did not authenticate users in code

- Evidence: `supabase/functions/gemini-insights/index.ts` accepted any request body and read `GEMINI_API_KEY` before any user verification.
- Exploit preconditions: Function deployed with JWT verification disabled, misconfigured, or called from a non-browser client with an available anon/publishable key.
- Impact: Unauthorized Gemini spend and AI endpoint abuse.
- Remediation: Handler now requires `Authorization: Bearer`, verifies it with `supabase.auth.getUser()`, and `supabase/config.toml` explicitly sets `verify_jwt = true`.
- Verification: `test/security-config.test.mjs`, `test/edge-security.test.mjs`, `npm test`, production build.
- Status: Mitigated in repository code; deployment must apply function config.

### High: Gemini operations had no server-side rate limit

- Evidence: Old function retried several Gemini models without per-user quota.
- Exploit preconditions: Any authenticated account or compromised token could repeatedly call the endpoint.
- Impact: Denial-of-wallet and provider quota exhaustion.
- Remediation: Added `public.ai_rate_limits` and `public.consume_ai_rate_limit`; Edge Function consumes quota before calling Gemini.
- Verification: Static config tests and pgTAP RLS/quota test file.
- Status: Mitigated after applying migration `202607060001_security_hardening.sql`.

### High: AI request schemas were client-controlled beyond action name

- Evidence: Old function interpolated `context` fields directly into prompts with only a body-size cap and workout note cap.
- Exploit preconditions: Modified client or direct function call.
- Impact: Oversized prompts, extra private fields, client-supplied system/model-like fields, higher prompt-injection impact.
- Remediation: Added action-specific context allowlists, string/array/number caps, and output validation.
- Verification: `test/edge-security.test.mjs`.
- Status: Mitigated.

### Medium: Backup import wrote arbitrary JSON keys to localStorage

- Evidence: Desktop Settings imported every key from the selected JSON file.
- Exploit preconditions: User imports a malicious or malformed backup file.
- Impact: Browser storage poisoning, possible app instability, accidental syncing of unrelated `ligand.*` keys.
- Remediation: Added `src/lib/backup.js`; imports allow only known Ligand backup keys and cap backup size.
- Verification: `test/backup.test.mjs`.
- Status: Mitigated.

### Medium: Production security headers were absent from repo config

- Evidence: No `vercel.json` existed.
- Exploit preconditions: Browser-based attacks such as clickjacking or script injection via future regressions.
- Impact: Reduced browser hardening.
- Remediation: Added `vercel.json` with CSP, `nosniff`, referrer policy, permissions policy, frame denial, asset cache controls, and SPA rewrite.
- Verification: `scripts/verify-security-headers.mjs`, `test/security-config.test.mjs`, production build.
- Status: Mitigated in repository config; deployment verification required.

### Medium: Electron focus blocker accepted malformed domains

- Evidence: `normalizeDomain` removed whitespace but did not fully validate hostnames.
- Exploit preconditions: User enters malformed custom block domain.
- Impact: Malformed hosts-file entries or confusing blocker behavior.
- Remediation: Added URL hostname parsing and strict domain label validation.
- Verification: `test/app-blocker.test.mjs`.
- Status: Mitigated.

### Low: Lint baseline is currently noisy

- Evidence: `npm run lint` failed before security changes with 74 errors across existing React/Electron files.
- Impact: CI cannot safely gate on lint until those pre-existing issues are cleaned up.
- Remediation: Added CI for tests/build/security scan/audit; documented lint as pre-existing.
- Status: Open.

## Not Applicable Or Not Found

- Supabase Storage buckets and policies: not present.
- Public/collaborative records: not present.
- Raw HTML/Markdown rendering: not found.
- CSV/spreadsheet export: not present; JSON backup only.
- Vercel Functions/server API routes: not present.
- GitHub workflows: none existed before this work.
- Service role in frontend code: not found.

## Residual Risk

- LocalStorage is inherently readable by scripts running on Ligand's origin. The main mitigation is avoiding XSS and clearing synced local data on sign-out.
- RLS/pgTAP tests were added but require Supabase CLI/local database or dashboard execution.
- CORS allowlist requires `LIGAND_ALLOWED_ORIGINS` to be set in Supabase for production/custom domains.
- Gemini key type and billing controls must be verified in Google AI Studio; the repo cannot prove whether the key is already an authorization key.
- Dashboard protections for Supabase, Vercel, GitHub, DNS, billing, backups, and alerts require owner action.
