import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/202607060001_security_hardening.sql", "utf8");
const assistantMigration = fs.readFileSync(
  "supabase/migrations/202607140001_chatgpt_read_only_foundation.sql",
  "utf8"
);
const taskRecordsMigration = fs.readFileSync(
  "supabase/migrations/202607140002_task_records_foundation.sql",
  "utf8"
);
const taskWritesMigration = fs.readFileSync(
  "supabase/migrations/202607140003_assistant_task_writes.sql",
  "utf8"
);
const confirmationActionsMigration = fs.readFileSync(
  "supabase/migrations/202607140005_confirmation_first_assistant_actions.sql",
  "utf8"
);
const plusApprovalMigration = fs.readFileSync(
  "supabase/migrations/202607150001_plus_approval_links.sql",
  "utf8"
);
const assistantExperienceMigration = fs.readFileSync(
  "supabase/migrations/202607160001_assistant_experience.sql",
  "utf8"
);
const mcpServer = fs.readFileSync("server/ligand-mcp/server.js", "utf8");
const schema = fs.readFileSync("supabase/schema.sql", "utf8");
const functionConfig = fs.readFileSync("supabase/config.toml", "utf8");
const viteConfig = fs.readFileSync("vite.config.js", "utf8");
const packageConfig = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("Supabase user_data policies are explicit owner-only authenticated policies", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /alter table public\.user_data enable row level security/i);
    assert.match(sql, /grant select, insert, update, delete on table public\.user_data to authenticated/i);
    assert.match(sql, /for select\s+to authenticated[\s\S]*?auth\.uid\(\)[\s\S]*?user_id/i);
    assert.match(sql, /for insert\s+to authenticated[\s\S]*?auth\.uid\(\)[\s\S]*?user_id/i);
    assert.match(sql, /for update\s+to authenticated[\s\S]*?auth\.uid\(\)[\s\S]*?user_id/i);
    assert.match(sql, /for delete\s+to authenticated[\s\S]*?auth\.uid\(\)[\s\S]*?user_id/i);
  }
});

test("current user_data policies block OAuth clients from the raw document", () => {
  const assistantUserDataPolicies = assistantMigration.split("-- Global allowlist")[0];
  for (const sql of [assistantUserDataPolicies, schema]) {
    const clientChecks = sql.match(/auth\.jwt\(\)\s*->>\s*'client_id'\)\s+is null/gi) || [];
    assert.equal(clientChecks.length, 5);
  }
});

test("AI rate limit state is private and only consumable through a narrow RPC", () => {
  assert.match(migration, /alter table public\.ai_rate_limits enable row level security/i);
  assert.match(migration, /revoke all on table public\.ai_rate_limits from authenticated/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.consume_ai_rate_limit\(text, integer, integer\) to authenticated/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
});

test("assistant rate limits are private and consumed only after OAuth binding", () => {
  assert.match(assistantMigration, /alter table public\.assistant_rate_limits enable row level security/i);
  assert.match(assistantMigration, /revoke all on table public\.assistant_rate_limits from authenticated/i);
  assert.match(assistantMigration, /where limits\.request_count < 60/i);
  assert.match(assistantMigration, /oauth client or resource is not allowed[\s\S]*?insert into public\.assistant_rate_limits/i);
});

test("task records use direct-session RLS and optimistic concurrency", () => {
  assert.match(taskRecordsMigration, /alter table public\.task_records enable row level security/i);
  assert.match(taskRecordsMigration, /auth\.jwt\(\)\s*->>\s*'client_id'\)\s+is null/i);
  assert.match(taskRecordsMigration, /v_existing\.version <> p_expected_version/i);
  assert.match(taskRecordsMigration, /p_expected_version is null or p_expected_version < 0/i);
  assert.match(taskRecordsMigration, /grant select on table public\.task_records to authenticated/i);
  assert.doesNotMatch(taskRecordsMigration, /grant select, insert, update, delete on table public\.task_records/i);
  assert.match(taskRecordsMigration, /return jsonb_build_object\(\s*'status', 'conflict'/i);
  assert.match(taskRecordsMigration, /grant execute on function public\.task_record_apply\(jsonb, bigint, boolean\)\s+to authenticated/i);
});

test("assistant task reads project only authoritative allowlisted task records", () => {
  assert.match(taskRecordsMigration, /from public\.task_records as records/i);
  assert.match(taskRecordsMigration, /goal ->> 'id' = any\(v_auth\.allowed_goal_ids\)/i);
  assert.match(taskRecordsMigration, /coalesce\(goal ->> 'type', 'custom'\) <> 'recovery'/i);
  assert.match(taskRecordsMigration, /public\.assistant_authorize\(false\)/i);
});

test("assistant task writes require opt-in, scope checks, versions, and idempotency", () => {
  assert.match(taskWritesMigration, /public\.assistant_authorize\(true\)/i);
  assert.match(taskWritesMigration, /public\.assistant_task_in_scope/i);
  assert.match(taskWritesMigration, /coalesce\(goal ->> 'type', 'custom'\) <> 'recovery'/i);
  assert.match(taskWritesMigration, /v_task\.version <> p_expected_version/i);
  assert.match(taskWritesMigration, /idempotency_key/i);
  assert.match(taskWritesMigration, /request_hash/i);
  assert.doesNotMatch(taskWritesMigration, /request_body|authorization_header|prompt|response_text/i);
});

test("the gateway defaults writes off and exposes no delete tool", () => {
  assert.match(mcpServer, /config\.taskWritesEnabled\s*\?/i);
  assert.doesNotMatch(mcpServer, /name:\s*["']delete_task["']/i);
  assert.doesNotMatch(taskWritesMigration, /create or replace function public\.assistant_delete_task/i);
  assert.doesNotMatch(confirmationActionsMigration, /create or replace function public\.assistant_delete/i);
  assert.match(confirmationActionsMigration, /assistant_change_previews/i);
  assert.match(confirmationActionsMigration, /mark_for_review/i);
  assert.match(confirmationActionsMigration, /status', 'applied'/i);
  assert.doesNotMatch(plusApprovalMigration, /assistant_delete|delete from/i);
});

test("Plus approval links apply only an owned stored preview", () => {
  assert.match(plusApprovalMigration, /previews\.user_id = v_user_id/i);
  assert.match(plusApprovalMigration, /clients\.allowed_user_id = previews\.user_id/i);
  assert.match(plusApprovalMigration, /public\.assistant_apply_changes\(/i);
  assert.match(plusApprovalMigration, /set_config\('request\.jwt\.claims'/i);
  assert.match(plusApprovalMigration, /v_original_claims/i);
  assert.doesNotMatch(plusApprovalMigration, /p_operations|operations jsonb/i);
});

test("assistant experience hides private tasks and safely expires dismissed drafts", () => {
  assert.match(assistantExperienceMigration, /records\.assistant_hidden = false/i);
  assert.match(assistantExperienceMigration, /assistant_list_change_previews/i);
  assert.match(assistantExperienceMigration, /assistant_dismiss_change_preview/i);
  assert.match(assistantExperienceMigration, /expires_at = least/i);
  assert.doesNotMatch(
    assistantExperienceMigration,
    /grant\s+select\s+on\s+table\s+public\.assistant_change_previews/i
  );
});

test("Gemini Edge Function keeps platform JWT verification enabled", () => {
  assert.match(functionConfig, /\[functions\.gemini-insights\]/);
  assert.match(functionConfig, /verify_jwt\s*=\s*true/);
});

test("Vercel config includes an enforced CSP and SPA rewrite", () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const global = vercel.headers.find((entry) => entry.source === "/(.*)");
  const csp = global.headers.find((header) => header.key === "Content-Security-Policy").value;
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("connect-src 'self' https://*.supabase.co wss://*.supabase.co"));
  assert.ok(!/script-src[^;]*'unsafe-eval'/.test(csp));
  assert.deepEqual(vercel.rewrites, [
    { source: "/mcp", destination: "/api/mcp" },
    {
      source: "/.well-known/oauth-protected-resource",
      destination: "/api/oauth-protected-resource",
    },
    {
      source: "/((?!api/|mcp$|\\.well-known/oauth-protected-resource$).*)",
      destination: "/index.html",
    },
  ]);
});

test("nested web routes use root assets while Electron keeps file-relative assets", () => {
  assert.match(viteConfig, /base:\s*mode === 'electron' \? '\.\/' : '\/'/);
  assert.match(
    packageConfig.scripts["electron:build"],
    /vite build --mode electron && electron-builder/
  );
});
