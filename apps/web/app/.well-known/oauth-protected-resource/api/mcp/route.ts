import process from "node:process";
import { MCP_SCOPE, mcpResource } from "@lib/mcp/oidc";

export async function GET(): Promise<Response> {
  const issuer = process.env.OIDC_ISSUER?.trim().replace(/\/$/, "");
  if (process.env.MCP_ENABLED !== "true" || process.env.OIDC_LOGIN_ENABLED !== "true" || !issuer) {
    return new Response(null, { status: 404 });
  }
  return Response.json(
    {
      resource: mcpResource(),
      authorization_servers: [issuer],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Cal.diy scheduling",
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }
  );
}
