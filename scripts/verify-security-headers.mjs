import assert from "node:assert/strict";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
assert.ok(Array.isArray(config.headers), "vercel.json must define headers");

const globalHeaders = config.headers.find((entry) => entry.source === "/(.*)");
assert.ok(globalHeaders, "global /(.*) headers entry is required");

const byKey = new Map(globalHeaders.headers.map((header) => [header.key.toLowerCase(), header.value]));
const csp = byKey.get("content-security-policy") || "";

for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
]) {
  assert.ok(csp.includes(directive), `CSP must include: ${directive}`);
}

assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), "script-src must not allow unsafe-inline");
assert.ok(!/script-src[^;]*'unsafe-eval'/.test(csp), "script-src must not allow unsafe-eval");
assert.equal(byKey.get("x-content-type-options"), "nosniff");
assert.equal(byKey.get("referrer-policy"), "strict-origin-when-cross-origin");
assert.equal(byKey.get("x-frame-options"), "DENY");
assert.ok((byKey.get("permissions-policy") || "").includes("camera=(self)"));
assert.ok((byKey.get("permissions-policy") || "").includes("geolocation=(self)"));

console.log("Security headers config looks compatible and intentional.");
