# Private staged setup runbook

Status: ready for a test account; not applied to production.

Use `docs/chatgpt-integration/THREAT_MODEL.md` as the security sign-off checklist for each stage.

This runbook connects one ChatGPT developer-mode app to one Ligand account. It exposes only the `get_tasks` read tool and only for the goals selected on Ligand's consent page. Do not enable it against the production account until the SQL tests have run against a disposable Supabase branch or project.

## 1. Establish the Supabase foundation

1. Use a test Supabase project or database branch with a test Ligand user.
2. Migrate JWT signing to an asymmetric key (RS256 or ES256).
3. Apply these migrations in order:
   - `supabase/migrations/202607140001_chatgpt_read_only_foundation.sql`
   - `supabase/migrations/202607140002_task_records_foundation.sql`
   - `supabase/migrations/202607140003_assistant_task_writes.sql`
4. Run both database test files:
   - `supabase/tests/rls_user_data.test.sql`
   - `supabase/tests/assistant_access.test.sql`
5. In Authentication > OAuth Server:
   - enable the OAuth 2.1 server;
   - set the authorization path to `/oauth/consent`;
   - keep the Site URL on the exact Ligand HTTPS origin;
   - begin with only the minimal OIDC scope needed by the integration.
6. In Authentication > Hooks, enable `public.ligand_custom_access_token_hook` as the Custom Access Token hook.

The migration is deny-by-default. Applying it does not share data: `assistant_access.enabled` defaults to false, no OAuth client is trusted, and OAuth tokens lose raw `user_data` access.

## 2. Deploy the bootstrap endpoint

Configure these Vercel environment variables. Use a deliberately invalid placeholder such as `bootstrap-not-authorized` for both client-ID variables during the first deployment if ChatGPT has not registered its client yet.

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
LIGAND_MCP_RESOURCE_URL=https://<ligand-origin>/mcp
LIGAND_MCP_OAUTH_CLIENT_ID=bootstrap-not-authorized
LIGAND_MCP_ALLOWED_USER_ID=<test-user-uuid>
LIGAND_MCP_DOCUMENTATION_URL=https://<ligand-origin>/
VITE_LIGAND_MCP_OAUTH_CLIENT_ID=bootstrap-not-authorized
LIGAND_MCP_ENABLE_TASK_WRITES=false
VITE_LIGAND_MCP_ENABLE_TASK_WRITES=false
```

The Supabase key must be a publishable/anon key. Never give this gateway a service-role, secret, database password, or OpenAI API key.

Deploy a preview and verify:

- `GET https://<ligand-origin>/.well-known/oauth-protected-resource` returns the canonical `/mcp` resource and the Supabase authorization server.
- An MCP `initialize` and `tools/list` call succeeds without authentication and lists only `get_tasks`.
- A `tools/call` without authentication returns an MCP `mcp/www_authenticate` challenge and no Ligand content.

## 3. Pin the ChatGPT OAuth client

ChatGPT supports CIMD, dynamic registration, and predefined clients, but Supabase currently documents dynamic or manually registered clients. The practical developer-mode bootstrap is:

1. Temporarily enable Dynamic Client Registration in Supabase OAuth Server settings.
2. In ChatGPT web, enable Developer mode under Settings > Security and login.
3. Create a developer-mode app under Settings > Plugins with the preview `https://<ligand-origin>/mcp` URL.
4. Invoke `get_tasks` once to begin authorization. The placeholder client ID makes the consent page fail closed; it grants nothing.
5. In Supabase Authentication > OAuth Apps, find the client ChatGPT just registered. Confirm its redirect URI is the exact `https://chatgpt.com/connector/oauth/<callback_id>` shown by ChatGPT.
6. Copy that public client ID into both Vercel variables:
   - `LIGAND_MCP_OAUTH_CLIENT_ID`
   - `VITE_LIGAND_MCP_OAUTH_CLIENT_ID`
7. Add the same client/user/resource tuple to the private database allowlist:

```sql
insert into public.assistant_oauth_clients (
  client_id,
  resource_url,
  allowed_user_id,
  enabled
)
values (
  '<exact-chatgpt-client-id>',
  'https://<ligand-origin>/mcp',
  '<test-user-uuid>',
  true
)
on conflict (client_id) do update
set resource_url = excluded.resource_url,
    allowed_user_id = excluded.allowed_user_id,
    enabled = excluded.enabled,
    updated_at = now();
```

8. Redeploy. If disabling dynamic registration leaves the existing client usable in the test project, disable it; otherwise leave registration available only for the test period. The gateway, token hook, consent page, and RPC still pin the one exact client ID.

Client IDs are public identifiers, not secrets. They are pinned to prevent another registered OAuth app from using an otherwise valid Ligand login.

## 4. Grant selected read access

Retry the ChatGPT connection. Ligand will:

1. require a normal Ligand sign-in;
2. validate the exact client ID, signed-in user, official `chatgpt.com/connector/...` redirect, and `openid`-only scope;
3. show all non-recovery goals as unchecked choices;
4. state the hard exclusions;
5. save a read-only `assistant_access` row only after explicit approval.

Select a single harmless test goal first. Do not select unassigned tasks until the goal filter has been verified.

In ChatGPT, set the app permission to **Always ask** during the trial. Prompts to verify:

- “What Ligand tasks are left today?”
- “Show all open Ligand tasks in the goals I shared.”
- “Show completed Ligand tasks.”
- “Complete this task.” — must explain that this version is read-only and make no change.
- Ask for a known private/recovery/journal item — it must not appear.

## 5. Negative security checks

Before production, verify all of these with real issued tokens:

- another Supabase user is rejected;
- another OAuth client is rejected;
- a token for another resource/audience is rejected;
- an expired token is rejected;
- an OAuth token cannot select, update, insert, or delete `public.user_data`;
- disabling `assistant_access.enabled` immediately blocks tool reads;
- removing a goal ID immediately removes its tasks;
- a recovery goal remains excluded even if its ID is inserted accidentally;
- 61 calls in one minute trigger the database rate limit;
- audit rows contain only IDs, tool/action/outcome, count, request ID, and timestamps—never task or goal text.

## 6. Revoke access

For the fastest kill switch:

```sql
update public.assistant_access
set enabled = false,
    tasks_read = false,
    tasks_write = false,
    allowed_goal_ids = array[]::text[],
    allow_unassigned_tasks = false
where user_id = '<user-uuid>';
```

Then revoke the OAuth grant in Ligand/Supabase and disconnect the app in ChatGPT. For a client-wide shutdown, also set `assistant_oauth_clients.enabled = false` and remove the Vercel client-ID environment value.

## 7. Production gate

Production enablement requires all of the following:

- database tests pass on the deployed schema;
- real OAuth negative tests pass;
- the consent page requests only `openid`;
- the exact production ChatGPT callback is reviewed;
- the selected goal list is reviewed by the user;
- Vercel and Supabase logs are checked for content leakage;
- the read-only trial is stable before any task storage or write tool ships.

Task completion, creation, and rescheduling remain intentionally unavailable during this stage even though their code and schema are installed. Both deployment flags must stay false through the read-only trial.

## 8. Test-only write expansion

Do this only after the production-gate checks above pass in a disposable/test environment:

1. Confirm every active Ligand client contains record-level task reconciliation and has completed at least one successful sync.
2. Set both `LIGAND_MCP_ENABLE_TASK_WRITES=true` and `VITE_LIGAND_MCP_ENABLE_TASK_WRITES=true` in the same preview deployment.
3. Reconnect the ChatGPT app and explicitly select **Allow limited task changes**. OAuth identity scope remains `openid`; this is a separate Ligand data permission.
4. Keep ChatGPT's app permission on **Always ask**.
5. Verify `tools/list` contains only `get_tasks`, `add_task`, `complete_task`, and `reschedule_task`. It must never contain a delete tool.
6. Test one harmless task in one harmless shared goal:
   - add once, then retry with the same idempotency key and confirm only one task exists;
   - complete with the current version;
   - retry a stale version and confirm a `conflict` response with no overwrite;
   - reschedule and confirm the upgraded Ligand client reflects it after foreground sync;
   - attempt a recovery/private goal and confirm denial.
7. Turn both flags back to false immediately if a client shows stale-cache behavior, content appears in logs, or any scope check differs from the selected consent.
