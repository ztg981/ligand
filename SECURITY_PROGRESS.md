# Security Progress

## Baseline

- Date: 2026-07-06
- Branch: `master`
- Starting commit: `2431adf245bed88145ae11dd2b3d86a8aa7ebe04`
- Starting working tree: dirty before this work, with unrelated workout UI changes in:
  - `src/components/DesktopWorkoutHub.jsx`
  - `src/components/MobileWorkoutHome.jsx`
  - `src/components/WeekSchedule.jsx`
  - `src/components/WorkoutPreview.jsx`
  - `src/index.css`
  - `src/tabs/WorkoutTab.jsx`

## Architecture Discoveries

- React/Vite SPA with Electron wrapper.
- Local-first persistence through `ligand.*` localStorage keys.
- Supabase Auth direct from browser.
- Cloud sync stores one JSON blob per user in `public.user_data`.
- One Supabase Edge Function: `gemini-insights`.
- Gemini key is server-side in Supabase Edge Function environment.
- No Supabase Storage, Vercel Functions, raw HTML rendering, or pre-existing GitHub workflows found.

## Baseline Commands

- `npm run lint`: failed before changes with broad pre-existing React/Electron lint errors.
- `npm run build`: passed before changes.
- `npm audit --audit-level=high`: passed, 0 vulnerabilities.

## Findings

- High: `gemini-insights` did not verify the Supabase user in handler code.
- High: Gemini operations had no server-side per-user rate limit.
- High: AI request context accepted arbitrary client fields beyond action routing.
- Medium: JSON backup import wrote arbitrary keys from selected files into localStorage.
- Medium: no repository Vercel security header config.
- Medium: Electron focus blocker accepted malformed domain strings.
- Low: lint baseline is currently noisy and not usable as a CI gate.

## Changes Made

- Added authenticated, rate-limited, schema-validated Gemini Edge Function flow.
- Added pure Edge security helpers and tests.
- Added Supabase migration and one-shot schema updates for explicit RLS and AI quota RPC.
- Added pgTAP RLS/quota test SQL.
- Added safe backup import/export helper and wired desktop/mobile settings to it.
- Added sign-out cleanup for synced local data.
- Added Vercel CSP/security headers and SPA rewrite.
- Added dependency/security CI and Dependabot config with pinned GitHub-owned actions.
- Added security docs, operations runbook, manual dashboard checklist, and vulnerability policy.

## Final Verification

- `npm test`: passed, 21 tests.
- `npm run security:headers`: passed.
- `npm run build`: passed. Vite reported the existing large chunk warning.
- `npm run security:scan`: passed; no privileged secret patterns found in repo or build output.
- `npm audit --audit-level=high`: passed; 0 vulnerabilities.
- `npm ci`: failed on Windows `EPERM` unlink of a just-used Rolldown native binding.
- `npm install`: completed afterward, repaired dependencies, and found 0 vulnerabilities. It also updated the root package-lock metadata from `1.0.0` to `1.0.1` to match `package.json`.
- Re-ran `npm test`, `npm run build`, `npm run security:headers`, `npm run security:scan`, and `npm audit --audit-level=high` after dependency repair; all passed except the build's existing large chunk warning.
- `git diff --check`: passed; Windows CRLF conversion warnings only.
- `npm run lint`: still failed with the pre-existing broad lint baseline (74 errors, 5 warnings after removing one new blocker-helper lint issue). The remaining failures include Electron CommonJS globals, React compiler/set-state-in-effect rules, unused variables, and existing memoization warnings.
- `supabase --version`: unavailable in this environment, so `supabase/tests/rls_user_data.test.sql` was not executed locally.

## Files Changed By This Security Work

- `supabase/functions/gemini-insights/index.ts`
- `supabase/functions/gemini-insights/security.js`
- `supabase/migrations/202607060001_security_hardening.sql`
- `supabase/schema.sql`
- `supabase/config.toml`
- `supabase/tests/rls_user_data.test.sql`
- `src/lib/backup.js`
- `src/tabs/Settings.jsx`
- `src/tabs/MobileSettings.jsx`
- `src/App.jsx`
- `src/lib/aiApi.js`
- `src/lib/workoutParser.js`
- `electron/appBlocker.js`
- `vercel.json`
- `.env.example`
- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `package.json`
- `scripts/security-scan.mjs`
- `scripts/verify-security-headers.mjs`
- `test/*.mjs`
- `SECURITY*.md`

## Remaining Manual Actions

See `SECURITY_MANUAL_CHECKLIST.md`.
