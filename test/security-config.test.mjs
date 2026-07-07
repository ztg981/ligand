import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/202607060001_security_hardening.sql", "utf8");
const schema = fs.readFileSync("supabase/schema.sql", "utf8");
const functionConfig = fs.readFileSync("supabase/config.toml", "utf8");

test("Supabase user_data policies are explicit owner-only authenticated policies", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /alter table public\.user_data enable row level security/i);
    assert.match(sql, /grant select, insert, update, delete on table public\.user_data to authenticated/i);
    assert.match(sql, /for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /for insert\s+to authenticated\s+with check \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /for update\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)\s+with check \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /for delete\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
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
  assert.deepEqual(vercel.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
});
