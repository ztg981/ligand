import assert from "node:assert/strict";
import test from "node:test";

import {
  McpAuthenticationError,
  extractBearerToken,
  validateMcpClaims,
} from "../server/ligand-mcp/auth.js";
import {
  McpConfigurationError,
  getMcpConfig,
} from "../server/ligand-mcp/config.js";
import { createProtectedResourceHandler } from "../server/ligand-mcp/metadata.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ENV = Object.freeze({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  LIGAND_MCP_RESOURCE_URL: "https://ligand.example/mcp",
  LIGAND_MCP_OAUTH_CLIENT_ID: "chatgpt-client",
  LIGAND_MCP_ALLOWED_USER_ID: USER_ID,
});

function validClaims(overrides = {}) {
  return {
    iss: "https://project.supabase.co/auth/v1",
    aud: "https://ligand.example/mcp",
    resource: "https://ligand.example/mcp",
    exp: 2_000_000_000,
    nbf: 1_900_000_000,
    client_id: "chatgpt-client",
    sub: USER_ID,
    ligand_mcp: true,
    scope: "openid",
    ...overrides,
  };
}

test("MCP configuration is canonical and contains no privileged credential", () => {
  const config = getMcpConfig({
    ...ENV,
    LIGAND_MCP_RESOURCE_URL: "https://ligand.example/mcp/?ignored=true#ignored",
  });

  assert.equal(config.resourceUrl, "https://ligand.example/mcp");
  assert.equal(
    config.resourceMetadataUrl,
    "https://ligand.example/.well-known/oauth-protected-resource"
  );
  assert.equal(config.issuer, "https://project.supabase.co/auth/v1");
  assert.deepEqual(config.oauthScopes, ["openid"]);
  assert.equal(config.taskWritesEnabled, false);
  assert.equal("serviceRoleKey" in config, false);
});

test("task writes require an exact, explicit deployment flag", () => {
  assert.equal(
    getMcpConfig({ ...ENV, LIGAND_MCP_ENABLE_TASK_WRITES: "true" }).taskWritesEnabled,
    true
  );
  assert.equal(
    getMcpConfig({ ...ENV, LIGAND_MCP_ENABLE_TASK_WRITES: "false" }).taskWritesEnabled,
    false
  );
  assert.throws(
    () => getMcpConfig({ ...ENV, LIGAND_MCP_ENABLE_TASK_WRITES: "TRUE" }),
    McpConfigurationError
  );
});

test("MCP configuration fails closed when identity binding is missing", () => {
  assert.throws(
    () => getMcpConfig({ ...ENV, LIGAND_MCP_ALLOWED_USER_ID: "" }),
    McpConfigurationError
  );
  assert.throws(
    () => getMcpConfig({ ...ENV, LIGAND_MCP_ALLOWED_USER_ID: "not-a-uuid" }),
    McpConfigurationError
  );
  assert.throws(
    () => getMcpConfig({ ...ENV, LIGAND_MCP_RESOURCE_URL: "http://public.example/mcp" }),
    McpConfigurationError
  );
});

test("bearer parsing accepts one token and rejects malformed authorization", () => {
  const valid = new Request("https://ligand.example/mcp", {
    headers: { Authorization: "Bearer token-value" },
  });
  const missing = new Request("https://ligand.example/mcp");
  const malformed = new Request("https://ligand.example/mcp", {
    headers: { Authorization: "Basic token-value" },
  });

  assert.equal(extractBearerToken(valid), "token-value");
  assert.equal(extractBearerToken(missing), null);
  assert.throws(() => extractBearerToken(malformed), McpAuthenticationError);
});

test("claim validation binds issuer, resource, client, user, marker, scope, and lifetime", () => {
  const config = getMcpConfig(ENV);
  assert.deepEqual(validateMcpClaims(validClaims(), config, 1_950_000_000), {
    userId: USER_ID,
    clientId: "chatgpt-client",
  });

  const invalidCases = [
    { iss: "https://attacker.example" },
    { aud: "https://other.example/mcp", resource: "https://other.example/mcp" },
    { exp: 1_949_999_999 },
    { nbf: 1_950_000_006 },
    { client_id: "other-client" },
    { sub: "00000000-0000-4000-8000-000000000002" },
    { ligand_mcp: false },
    { scope: "profile" },
  ];

  for (const patch of invalidCases) {
    assert.throws(
      () => validateMcpClaims(validClaims(patch), config, 1_950_000_000),
      McpAuthenticationError
    );
  }
});

test("protected-resource metadata points ChatGPT at Supabase OAuth", async () => {
  const response = await createProtectedResourceHandler({ env: ENV })();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.resource, "https://ligand.example/mcp");
  assert.deepEqual(body.authorization_servers, ["https://project.supabase.co/auth/v1"]);
  assert.deepEqual(body.scopes_supported, ["openid"]);
  assert.match(response.headers.get("content-type"), /^application\/json/);
});
