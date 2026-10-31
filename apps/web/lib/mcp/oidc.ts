import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksIssuer: string | undefined;

export const MCP_SCOPE = "cal:mcp";
export const mcpResource = () => new URL("/api/mcp", process.env.NEXT_PUBLIC_WEBAPP_URL).href;
export const mcpMetadataUrl = () =>
  new URL("/.well-known/oauth-protected-resource/api/mcp", mcpResource()).href;

export async function authenticateOidc(token: string) {
  const issuer = process.env.OIDC_ISSUER?.trim().replace(/\/$/, "");
  if (process.env.OIDC_LOGIN_ENABLED !== "true" || !issuer || !token.includes(".")) return null;
  if (!jwks || jwksIssuer !== issuer) {
    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    const config: unknown = await response.json();
    if (
      !response.ok ||
      !config ||
      typeof config !== "object" ||
      !("issuer" in config) ||
      config.issuer !== issuer ||
      !("jwks_uri" in config) ||
      typeof config.jwks_uri !== "string" ||
      new URL(config.jwks_uri).protocol !== "https:"
    ) {
      throw new ErrorWithCode(ErrorCode.InternalServerError, "Invalid OIDC discovery response");
    }
    jwks = createRemoteJWKSet(new URL(config.jwks_uri));
    jwksIssuer = issuer;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: mcpResource(),
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["iss", "aud", "exp", "sub"],
    });
    if (!payload.sub || typeof payload.scope !== "string" || !payload.scope.split(" ").includes(MCP_SCOPE))
      return null;
    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: "oidc", providerAccountId: payload.sub } },
      select: { user: { select: { id: true, uuid: true, email: true, locked: true } } },
    });
    if (!account?.user || account.user.locked) return null;
    return account.user;
  } catch (error) {
    if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) return null;
    throw error;
  }
}
