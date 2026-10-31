// @vitest-environment node

import type { JWTPayload, KeyLike } from "jose";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/.well-known/oauth-protected-resource/api/mcp/route";
import { authenticateOidc } from "./oidc";

const mocks = vi.hoisted(() => ({ account: vi.fn(), jwks: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { account: { findUnique: mocks.account } } }));
vi.mock("jose", async (original) => ({
  ...(await original<typeof import("jose")>()),
  createRemoteJWKSet: mocks.jwks,
}));

const issuer = "https://id.example.test";
const resource = "https://cal.example.test/api/mcp";
const user = { id: 7, uuid: "user-7", email: "owner@example.test", locked: false };
let key: KeyLike;
let otherKey: KeyLike;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  mocks.jwks.mockReturnValue(createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] }));
});
beforeEach(() => {
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("OIDC_LOGIN_ENABLED", "true");
  vi.stubEnv("OIDC_ISSUER", issuer);
  vi.stubEnv("NEXT_PUBLIC_WEBAPP_URL", "https://cal.example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ issuer, jwks_uri: `${issuer}/jwks` })));
  mocks.account.mockReset().mockResolvedValue({ user });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function token(overrides: JWTPayload = {}, signingKey = key) {
  return new SignJWT({
    iss: issuer,
    aud: resource,
    sub: "pocket-subject",
    exp: Math.floor(Date.now() / 1000) + 60,
    scope: "cal:mcp",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(signingKey);
}

describe("OIDC access tokens", () => {
  it("maps a signed resource token to an existing OIDC account", async () => {
    expect(await authenticateOidc(await token())).toEqual(user);
    expect(mocks.account).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: { provider: "oidc", providerAccountId: "pocket-subject" },
        },
      })
    );
  });
  it.each([
    { iss: "https://attacker.example" },
    { aud: "website-login-client" },
    { exp: 1 },
    { scope: "openid profile" },
    { sub: undefined },
    { exp: undefined },
  ])("rejects wrong issuer/audience, expiration, missing scope or claims: %j", async (claims) => {
    expect(await authenticateOidc(await token(claims))).toBeNull();
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("rejects an invalid signature", async () => {
    expect(await authenticateOidc(await token({}, otherKey))).toBeNull();
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { user: { ...user, locked: true } },
  ])("rejects unlinked and locked accounts", async (account) => {
    mocks.account.mockResolvedValue(account);
    expect(await authenticateOidc(await token())).toBeNull();
  });
  it("rejects OIDC tokens when OIDC login is disabled", async () => {
    vi.stubEnv("OIDC_LOGIN_ENABLED", "false");
    expect(await authenticateOidc(await token())).toBeNull();
  });
  it("publishes the exact resource, issuer, and scope for client discovery", async () => {
    expect(await (await GET()).json()).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ["cal:mcp"],
    });
  });
});
