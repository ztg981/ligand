# Ligand + ChatGPT integration plan

Status: read and conflict-safe task-write layers are implemented locally; production access is not enabled.

Last reviewed: 2026-07-14

Deployment threats and go/no-go gates are tracked in `docs/chatgpt-integration/THREAT_MODEL.md`.

## Outcome

Ligand will expose a private, least-privilege MCP app that can be selected in a ChatGPT conversation. ChatGPT will be able to read and, in later phases, change only the Ligand information the user explicitly enables. The integration will reuse the existing Ligand account and Supabase project. It will not call the OpenAI API, receive a Supabase service-role key, expose a general database tool, or make private Ligand content public.

The first deployed milestone remains deliberately read-only. Conflict-safe, record-level task storage and three narrow write tools are implemented, but the tools are hidden by default and must not be enabled until the real read-only OAuth trial passes.

## Confirmed current state

- The web and Electron apps are React/Vite clients hosted through Vercel.
- Supabase Auth supplies Ligand accounts.
- All synced `ligand.*` keys are mirrored into one `public.user_data.data` JSON document per user.
- `ligand.data` contains tasks, goals, journals, notes, fitness/recovery data, day blocks, and other content together.
- Current RLS limits rows by `auth.uid()`, but it does not distinguish direct Ligand sessions from OAuth clients.
- Tasks now also carry `scheduledFor`, `version`, and `updatedAt` in upgraded clients.
- The complete JSON document remains a compatibility/offline cache. `task_records` is authoritative after the record migration; upgraded clients reconcile explicit local mutations one record at a time using expected versions.
- Another coding session currently has uncommitted UI/settings/desktop work. Integration work must remain in new paths or re-check those files before editing them.

## Recommended architecture

```text
ChatGPT conversation
        |
        | OAuth 2.1 access token + MCP request
        v
Ligand MCP gateway on Vercel
  - verifies signature, issuer, audience, expiry, client and user
  - publishes only narrowly described tools
  - holds no service-role credential
        |
        | caller's Supabase access token
        v
Narrow Supabase RPC functions
  - verify OAuth identity and assistant settings
  - return only allowlisted fields
  - record content-free audit metadata
        |
        +--> assistant_access (per-user category/goal permissions)
        +--> user_data (goal-scope lookup only; raw OAuth access denied)
        +--> task_records (authoritative reads and conflict-safe writes)
```

### Why this shape

OpenAI requires authenticated apps that expose user data or writes to use an OAuth 2.1-compatible MCP authorization flow and requires the MCP server to validate tokens itself. Supabase can now act as an OAuth 2.1 provider for MCP clients while preserving the existing user base and RLS. A Vercel function can host the Streamable HTTP MCP endpoint alongside the existing app.

The gateway will call Supabase with the user's bearer token and the publishable key. It will not have a credential that can bypass RLS. Raw `user_data` policies will reject OAuth sessions; audited security-definer functions will be the only OAuth path to Ligand content.

## Data-access contract

Access is deny-by-default, independently controlled by data category and goal. OAuth consent is necessary but does not replace the in-Ligand access settings.

| Data | Default | Earliest phase | Notes |
| --- | --- | --- | --- |
| Tasks in explicitly selected goals | Deny | 1 read / 3 write | Return only task fields needed for the request. |
| Unassigned tasks | Deny | 1 read / 3 write | Separate toggle. |
| Goal names and deadlines | Deny | 2 read | Only selected non-sensitive goals. |
| Habits and check-ins | Deny | 4 | Separate read and write toggles. |
| Day plan/time blocks | Deny | 4 | Notes excluded unless a later explicit setting permits them. |
| Aggregate progress metrics | Deny | 4 | Prefer counts and dates over source text. |
| Journal and reflections | Hard deny | Not planned | No raw text, prompts, moods, locations, or attachments. |
| Recovery goals/data | Hard deny | Not planned | A selected goal ID cannot override this rule. |
| Notes/scratchpad | Hard deny | Not planned | Avoid accidental disclosure of free-form personal content. |
| Meal, workout, body, and wellness details | Deny | Future opt-in only | Separate review required before any tool exists. |
| Alarms, settings, wallpaper, backups, auth data | Hard deny | Not planned | No assistant use case justifies access. |
| Raw JSON, SQL, arbitrary search/query | Hard deny | Never | Every capability must be a named, schema-limited tool. |

## Tool roadmap

Each read and write is a separate tool so ChatGPT's confirmation controls remain meaningful. Every tool returns stable record IDs for safe follow-up calls.

### Phase 1: private read-only proof

`get_tasks`

- Use when the user asks what is left, what is marked Today/Urgent, or what tasks exist in the explicitly shared scope.
- Inputs: focus (`today` or `all`), status (`open`, `completed`, or `all`), limit.
- Output: allowlisted task fields and selected goal name; no surrounding Ligand document.
- Annotation: read-only, non-destructive, closed-world.

Exit criteria:

- OAuth login uses the existing Ligand account.
- A token for another user, client, issuer, or audience is rejected.
- Raw `user_data` cannot be read with the OAuth token.
- Disabled access and unselected/recovery goals return no content.
- Audit rows contain no task or goal text.
- MCP Inspector and ChatGPT can list and call the tool.

### Phase 2: useful read context

- `get_goals`: selected goals and deadlines only.
- `get_day_plan`: selected, non-sensitive blocks only.
- Optional compact task-list component after the JSON-only behavior is stable.

### Phase 3: task writes

- `complete_task`
- `add_task`
- `reschedule_task`
- `update_task` only if real use cases cannot be covered by the narrower tools.

Prerequisites:

- Tasks are authoritative record-level rows with versions/timestamps instead of fields inside a last-write-wins document.
- Ligand web/Electron/mobile paths read and write those rows.
- Tasks gain an explicit `scheduledFor` date; “Today” remains a presentation/priority concept rather than a fake date.
- Writes accept an idempotency key and expected record version.
- Ambiguous names return candidates and make no change.
- No delete tool is exposed.
- ChatGPT permission is initially “Ask before making changes.”

Local implementation status:

- `add_task`, `complete_task`, and `reschedule_task` are implemented; no delete or general update tool exists.
- Every write requires a bounded idempotency key. Completion and rescheduling also require the exact record version returned by `get_tasks`.
- The gateway defaults `LIGAND_MCP_ENABLE_TASK_WRITES` to false, and the browser consent screen independently defaults `VITE_LIGAND_MCP_ENABLE_TASK_WRITES` to false.
- Even when both deployment flags are enabled, the database denies writes until the user separately enables `assistant_access.tasks_write` for the selected goal scope.

### Phase 4: planning workflows

- Create/move a day block.
- Check in an explicitly shared habit.
- Read selected deadlines and non-text progress aggregates.
- Compose a daily or weekly plan from the above tools without adding a separate AI model inside Ligand.

### Phase 5: broader clients and automation

- Connect the same MCP server to Codex, using Codex's separate permission controls.
- Consider narrowly scoped scheduled summaries only after the interactive tools are reliable.
- Evaluate sharing with other users only if Ligand stops being a single-person private app; public plugin submission is not required for the personal version.

## Authentication and authorization design

1. Enable Supabase OAuth 2.1 and use asymmetric JWT signing keys.
2. Build `/oauth/consent` in Ligand so the logged-in user sees the client and requested access before approval.
3. Pin one exact public ChatGPT client with PKCE and an exact `chatgpt.com/connector/...` redirect. For developer mode, bootstrap through Supabase dynamic registration if necessary, then copy the generated client ID into the database and both server/browser deployment variables; disable further registration after the existing client is proven to keep working.
4. Publish MCP protected-resource metadata pointing at the Supabase authorization server.
5. Use a fixed canonical MCP resource URL and customize the OAuth token audience to that URL.
6. On every MCP request, verify signature, issuer, audience/resource, expiration/not-before, the expected OAuth `client_id`, and the allowed Ligand user ID.
7. Pass the same user token to Supabase. Never substitute a service-role token.
8. Enforce category/goal access again inside database functions.
9. Support revocation through Supabase sessions, the OAuth client, the per-user kill switch, and Vercel environment allowlists.

## Database changes

### Read-only foundation

- Add `assistant_access`, keyed by user, with an enabled flag, allowed goal IDs, an unassigned-task flag, timezone, and future per-category toggles.
- Add `assistant_audit_log` containing timestamps, user/client IDs, tool/action class, status, count bucket, and request ID only.
- Add private per-client/tool fixed-window rate counters with no browser or OAuth table access.
- Change `user_data` policies so direct Ligand sessions keep existing access while OAuth sessions cannot select, insert, update, or delete the raw row.
- Add one security-definer read function that projects approved task fields from the current JSON document. Revoke all other execution paths from OAuth sessions.

### Write-safe task model (implemented locally)

- Add a relational task table with user ownership, stable text ID, goal relation, label/term/repeat, `scheduled_for`, completion fields, `version`, `updated_at`, and soft-deletion metadata if needed.
- Migrate one user's existing tasks and verify counts/content hashes before switching reads.
- Update the app sync path to use record-level updates and optimistic concurrency.
- Keep the JSON task array as a repairable compatibility/offline cache; assistant reads and writes never use it as their authoritative source.
- Track explicit app mutations in device-local control state so a stale blob hydration is never mistaken for an edit or deletion.

## Safety behavior

- Tool descriptions begin with “Use this when…” and state exclusions and ambiguity rules.
- Read tools carry `readOnlyHint: true`; write tools carry accurate destructive/open-world annotations.
- The server's first instructions say never to infer a target when multiple records match.
- Every write is idempotent and returns the changed record and its new version.
- No tool logs authorization headers, tokens, full request bodies, task/goal text, prompts, or responses.
- Rate limits apply per user and per tool. Repeated failures trigger a temporary cooldown.
- Returned MCP content is user-visible and never contains credentials or hidden internal metadata.

## Verification

Automated checks:

- Unit tests for projection/field allowlists and tool input validation.
- SQL tests proving direct users retain access, OAuth users cannot access `user_data`, allowed OAuth reads are filtered, and cross-user access fails.
- Token tests for bad signature, issuer, audience, expiry, client, and user.
- MCP protocol tests for initialization, tool listing, structured output, OAuth challenges, and error shapes.
- Regression tests for sync/migration and concurrent task updates before writes ship.

Manual checks:

- Use only a test Ligand account until all security tests pass.
- Inspect OAuth consent and revoke/relink behavior.
- Test ChatGPT permission levels, beginning with “Always ask” or “Ask before making changes.”
- Confirm mobile availability after linking on the web.
- Verify Vercel/Supabase logs contain operational metadata but no personal content.

## Deployment sequence

1. Land documentation and local tests.
2. Implement the deny-by-default access tables and read-only RPC in a new migration.
3. Implement the MCP endpoint and protected-resource metadata locally.
4. Add the Ligand consent/access UI after the concurrent settings work is settled.
5. Apply the migration to a non-production/test account.
6. Configure Supabase OAuth and Vercel environment variables.
7. Deploy a preview, run MCP Inspector, and test negative auth cases.
8. Connect a ChatGPT developer-mode app and use read-only access for a trial period.
9. Promote the read-only app to the production Ligand account.
10. Apply and verify the record-level task migrations while write flags remain false.
11. Exercise app/assistant conflict, replay, offline, and stale-device cases in the preview.
12. Only after the read-only trial is stable, enable both write deployment flags in a test environment and explicitly opt in on consent.

## Required environment variables

Names only; values must never be committed:

- `SUPABASE_URL` (server-side alias; may match the existing public URL)
- `SUPABASE_PUBLISHABLE_KEY`
- `LIGAND_MCP_RESOURCE_URL`
- `LIGAND_MCP_OAUTH_CLIENT_ID`
- `LIGAND_MCP_ALLOWED_USER_ID`
- `LIGAND_MCP_ENABLE_TASK_WRITES` (defaults/starts as `false`)
- `VITE_LIGAND_MCP_OAUTH_CLIENT_ID`
- `VITE_LIGAND_MCP_ENABLE_TASK_WRITES` (defaults/starts as `false`)

No OpenAI API key and no Supabase service-role/secret key are required.

## Current official-source basis

- OpenAI Apps SDK authentication: https://developers.openai.com/apps-sdk/build/auth
- OpenAI ChatGPT connection flow: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
- OpenAI tool design: https://developers.openai.com/apps-sdk/plan/tools
- OpenAI developer mode: https://developers.openai.com/api/docs/guides/developer-mode
- Supabase OAuth 2.1 server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase MCP authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase token security and RLS: https://supabase.com/docs/guides/auth/oauth-server/token-security
- Vercel MCP deployment: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel

## Decisions intentionally deferred

- Exact goal IDs/categories to share: the access UI must make this a user choice.
- Whether task/goal names should be retained in ChatGPT memory: connector data access and ChatGPT memory are separate controls and require a user-facing explanation.
- Any access to wellness, fitness, meals, or location-related data: separate threat review first.
- Public plugin submission: unnecessary for the private version.
