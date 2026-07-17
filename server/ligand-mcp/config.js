const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class McpConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "McpConfigurationError";
  }
}

function required(env, primary, fallback) {
  const value = env[primary] || (fallback ? env[fallback] : null);
  if (!value) {
    throw new McpConfigurationError(`Missing required environment variable: ${primary}`);
  }
  return value;
}

function parseHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new McpConfigurationError(`${label} must be a valid URL.`);
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new McpConfigurationError(`${label} must use HTTPS outside local development.`);
  }
  url.hash = "";
  url.search = "";
  return url;
}

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function optionalBoolean(env, name) {
  const value = env[name];
  if (value == null || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new McpConfigurationError(`${name} must be exactly true or false.`);
}

export function getMcpConfig(env = globalThis.process?.env || {}) {
  const supabaseUrl = parseHttpsUrl(
    required(env, "SUPABASE_URL", "VITE_SUPABASE_URL"),
    "SUPABASE_URL"
  );
  const resourceUrl = parseHttpsUrl(
    required(env, "LIGAND_MCP_RESOURCE_URL"),
    "LIGAND_MCP_RESOURCE_URL"
  );
  const oauthClientId = required(env, "LIGAND_MCP_OAUTH_CLIENT_ID");
  const allowedUserId = required(env, "LIGAND_MCP_ALLOWED_USER_ID");
  const supabasePublishableKey = required(
    env,
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY"
  );

  if (!UUID_PATTERN.test(allowedUserId)) {
    throw new McpConfigurationError("LIGAND_MCP_ALLOWED_USER_ID must be a UUID.");
  }
  if (oauthClientId.length > 500) {
    throw new McpConfigurationError("LIGAND_MCP_OAUTH_CLIENT_ID is unexpectedly long.");
  }

  const resource = withoutTrailingSlash(resourceUrl.toString());
  const supabaseBase = withoutTrailingSlash(supabaseUrl.toString());

  return Object.freeze({
    supabaseUrl: supabaseBase,
    supabasePublishableKey,
    issuer: `${supabaseBase}/auth/v1`,
    resourceUrl: resource,
    resourceMetadataUrl: `${resourceUrl.origin}/.well-known/oauth-protected-resource`,
    resourceDocumentationUrl:
      env.LIGAND_MCP_DOCUMENTATION_URL || `${resourceUrl.origin}/`,
    oauthClientId,
    allowedUserId,
    taskWritesEnabled: optionalBoolean(env, "LIGAND_MCP_ENABLE_TASK_WRITES"),
    oauthScopes: Object.freeze(["openid"]),
  });
}
