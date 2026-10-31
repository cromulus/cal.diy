import process from "node:process";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { authenticateMcp } from "@lib/mcp/auth";
import { createMcpServer } from "@lib/mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (process.env.MCP_ENABLED !== "true") return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(process.env.NEXT_PUBLIC_WEBAPP_URL || request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const user = await authenticateMcp(request);
  if (!user) return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  try {
    await checkRateLimitAndThrowError({ identifier: `mcp:${user.id}`, rateLimitingType: "core" });
  } catch {
    return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  }
  const server = createMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export const DELETE = GET;
