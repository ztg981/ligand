import { getMcpConfig } from "./config.js";

export function createProtectedResourceHandler(options = {}) {
  const env = options.env || globalThis.process?.env || {};
  return async function protectedResourceMetadata() {
    const config = getMcpConfig(env);
    return new Response(
      JSON.stringify({
        resource: config.resourceUrl,
        authorization_servers: [config.issuer],
        scopes_supported: config.oauthScopes,
        resource_documentation: config.resourceDocumentationUrl,
      }),
      {
        status: 200,
        headers: {
          "cache-control": "public, max-age=300",
          "content-type": "application/json; charset=utf-8",
        },
      }
    );
  };
}
