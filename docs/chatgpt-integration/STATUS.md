# Ligand + ChatGPT integration status

Last updated: 2026-07-14

## Current milestone

Deploy and validate the private read-only proof against a disposable Supabase project/branch and a Vercel preview. Production data remains untouched.

## Completed

- Mapped Ligand's current Supabase/auth/sync/task architecture.
- Verified current OpenAI Apps SDK, Developer Mode, OAuth, tool-annotation, and connection requirements.
- Verified Supabase can reuse the existing user base as an OAuth 2.1 provider for MCP clients.
- Chosen the least-privilege gateway/RPC architecture.
- Documented the staged tool, data-access, migration, safety, test, and deployment plan.
- Implemented a Vercel-hosted Streamable HTTP MCP endpoint and protected-resource metadata.
- Implemented strict Supabase token verification for issuer, audience/resource, expiry, not-before, client, user, marker, and scope.
- Implemented the read-only `get_tasks` tool with MCP OAuth challenges and accurate read-only annotations.
- Added deny-by-default assistant settings, raw-document OAuth blocking, a field-projection RPC, content-free audit records, and per-client/tool rate limits.
- Added a dedicated `/oauth/consent` route that permits only the pinned ChatGPT client, official callback, current Ligand user, and `openid`-only scope.
- Added explicit per-goal sharing; recovery goals and other sensitive categories are excluded.
- Added gateway, consent-boundary, configuration, database policy, and executable PostgreSQL migration tests.
- Executed the full migration in an embedded PostgreSQL engine and verified the token hook, direct/OAuth policy split, filtered RPC, wrong-resource denial, and content-free audit output.
- Added authoritative `task_records`, one-time task import, scheduled dates, versions, timestamps, and soft deletion.
- Added upgraded-client reconciliation that writes only explicitly queued mutations; stale blob omissions and stale edits are repaired from authoritative records.
- Added conflict-safe app writes using expected versions and account/device-local mutation control state.
- Implemented gated `add_task`, `complete_task`, and `reschedule_task` tools with no delete tool.
- Added independent server deployment, browser consent, and per-user database write gates.
- Added content-free idempotency records, per-tool write rate limits, exact-version conflicts, and replay-safe behavior.
- Verified all 156 repository tests, both read-only and write-enabled production builds, security headers, and the secret scan. The integration database test executes all three migrations in PostgreSQL and covers read/write denial, scope, conflicts, replay, and audit output.

## In progress

- Final static/security checks and documentation for the record/write layer.
- Test-project migration, real OAuth issuance, preview deployment, and ChatGPT connection.

## Not started

- Real preview validation of record reconciliation across two clients.
- Test-only write-flag enablement after a stable read-only trial.
- Phase 2 goal/day-plan reads and any later workflow expansion.

## Coordination note

At the start of this milestone, another coding session had uncommitted changes in Electron, app-shell, settings, AI, notification, home, styling, and new badge/showing-up files. Re-run `git status` before every integration edit. Do not modify or format those paths unless the concurrent work is complete and the diff has been reviewed.

That session is still changing app-shell and UI files. The integration touched only the small entry-point route and the optional guest rendering in `AuthScreen`; all styling for consent lives in its own file.

## Hard blockers for production enablement

- Supabase OAuth 2.1 must be enabled and configured by the project owner.
- JWT signing should be migrated to an asymmetric key.
- The OAuth consent path and exact ChatGPT redirect URI must be configured.
- The database migration must be applied and verified with a test account.
- Vercel environment variables must be configured.
- A human must review and approve the exact goal/task access selection.
- The repository-wide lint baseline currently fails in unrelated active Electron/React files; the integration-specific lint set passes.

Current workspace evidence:

- `.vercel/project.json` is absent and the Vercel CLI has no credentials.
- The in-app browser reached Vercel sign-in but had no authenticated session; the temporary device flow was closed without creating or changing a project.
- Docker and a local Supabase CLI/runtime are unavailable.
- `.env.local` contains only browser-visible Supabase URL/publishable-key variable names. The configured project is intentionally treated as non-disposable and was not mutated.

To resume deployment validation, authenticate Vercel and provide/link a disposable Supabase branch or project with a harmless test user. Keep both write flags false for the first preview.
