import process from "node:process";
import type { User } from "next-auth";
import type { OAuthConfig } from "next-auth/providers";

export const OIDC_PROVIDER_ID = "oidc";

export const OIDC_LOGIN_ENABLED = process.env.OIDC_LOGIN_ENABLED === "true";
export const OIDC_PROVIDER_NAME = process.env.OIDC_PROVIDER_NAME?.trim() || "OIDC";
export const OIDC_ISSUER = process.env.OIDC_ISSUER?.trim().replace(/\/$/, "") || "";
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID?.trim() || "";
export const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET?.trim() || "";
export const OIDC_TRUST_EMAIL = process.env.OIDC_TRUST_EMAIL === "true";

export const IS_OIDC_LOGIN_ENABLED = !!(
  OIDC_LOGIN_ENABLED &&
  OIDC_ISSUER &&
  OIDC_CLIENT_ID &&
  OIDC_CLIENT_SECRET
);

export interface GenericOidcProfile extends Record<string, unknown> {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

type OidcProviderUser = Omit<User, "id"> & { id: string };

const oidcProfile = ((profile: GenericOidcProfile): OidcProviderUser => {
  return {
    id: profile.sub,
    name: profile.name || profile.preferred_username || profile.email || OIDC_PROVIDER_NAME,
    email: profile.email,
    image: profile.picture,
  };
}) as unknown as OAuthConfig<GenericOidcProfile>["profile"];

export const GenericOidcProvider = (): OAuthConfig<GenericOidcProfile> => ({
  id: OIDC_PROVIDER_ID,
  name: OIDC_PROVIDER_NAME,
  type: "oauth",
  wellKnown: `${OIDC_ISSUER}/.well-known/openid-configuration`,
  authorization: { params: { scope: "openid profile email" } },
  checks: ["pkce", "state"],
  idToken: true,
  allowDangerousEmailAccountLinking: true,
  // The provider profile id is the external OIDC subject. Cal's augmented User id is numeric only
  // after the adapter resolves or creates the local user.
  profile: oidcProfile,
  clientId: OIDC_CLIENT_ID,
  clientSecret: OIDC_CLIENT_SECRET,
});
