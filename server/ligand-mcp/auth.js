import { createClient } from "@supabase/supabase-js";

export class McpAuthenticationError extends Error {
  constructor(message = "Authentication failed.") {
    super(message);
    this.name = "McpAuthenticationError";
  }
}

export function extractBearerToken(request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new McpAuthenticationError("Malformed authorization header.");
  return match[1];
}

function audienceContains(audience, expected) {
  if (typeof audience === "string") return audience === expected;
  return Array.isArray(audience) && audience.includes(expected);
}

function scopeContains(scope, expected) {
  if (typeof scope !== "string") return false;
  return scope.split(/\s+/).filter(Boolean).includes(expected);
}

export function validateMcpClaims(claims, config, nowSeconds = Date.now() / 1000) {
  if (!claims || typeof claims !== "object") {
    throw new McpAuthenticationError("Token claims are missing.");
  }
  if (claims.iss !== config.issuer) {
    throw new McpAuthenticationError("Token issuer is not allowed.");
  }
  const hasResource =
    audienceContains(claims.aud, config.resourceUrl) || claims.resource === config.resourceUrl;
  if (!hasResource) {
    throw new McpAuthenticationError("Token audience is not this MCP server.");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    throw new McpAuthenticationError("Token has expired.");
  }
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 5) {
    throw new McpAuthenticationError("Token is not active yet.");
  }
  if (claims.client_id !== config.oauthClientId) {
    throw new McpAuthenticationError("OAuth client is not allowed.");
  }
  if (claims.sub !== config.allowedUserId) {
    throw new McpAuthenticationError("Ligand user is not allowed.");
  }
  if (claims.ligand_mcp !== true) {
    throw new McpAuthenticationError("Token is not authorized for Ligand MCP.");
  }
  for (const scope of config.oauthScopes) {
    if (!scopeContains(claims.scope, scope)) {
      throw new McpAuthenticationError("Token is missing a required scope.");
    }
  }

  return Object.freeze({ userId: claims.sub, clientId: claims.client_id });
}

export async function verifyMcpToken(token, config) {
  const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new McpAuthenticationError("Token signature or lifetime is invalid.");
  }
  return validateMcpClaims(data.claims, config);
}

export function authorizationChallenge(config, options = {}) {
  const error = options.error || "invalid_token";
  const description = options.description || "Connect your Ligand account to continue.";
  const escapedDescription = description.replace(/["\\]/g, "");
  return `Bearer resource_metadata="${config.resourceMetadataUrl}", scope="${config.oauthScopes.join(
    " "
  )}", error="${error}", error_description="${escapedDescription}"`;
}

export function unauthorizedResponse(config) {
  return new Response(
    JSON.stringify({
      error: "unauthorized",
      error_description: "A valid Ligand OAuth token is required.",
    }),
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "www-authenticate": authorizationChallenge(config),
      },
    }
  );
}

