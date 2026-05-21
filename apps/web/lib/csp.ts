import process from "node:process";
import { IS_PRODUCTION, WEBAPP_URL } from "@calcom/lib/constants";
import { buildNonce } from "./buildNonce";

type CspHeader = {
  name: "Content-Security-Policy";
  value: string;
};

function getCspPolicy(nonce: string): string {
  //TODO: Do we need to explicitly define it in turbo.json
  const CSP_POLICY = process.env.CSP_POLICY;

  // Note: "non-strict" policy only allows inline styles otherwise it's the same as "strict"
  // We can remove 'unsafe-inline' from style-src when we add nonces to all style tags
  // Maybe see how @next-safe/middleware does it if it's supported.
  const useNonStrictPolicy = CSP_POLICY === "non-strict";
  let defaultSrc = "data:";
  let scriptSrc =
    // Note: We could use 'strict-dynamic' with 'nonce-..' instead of unsafe-inline but there are some streaming related scripts that get blocked(because they don't have nonce on them). It causes a really frustrating full page error model by Next.js to show up sometimes
    "'unsafe-inline' 'unsafe-eval' https: http:";
  let styleSrc = "'unsafe-inline'";
  if (IS_PRODUCTION) {
    defaultSrc = "";
    // 'self' 'unsafe-inline' https: added for Browsers not supporting strict-dynamic
    scriptSrc = `'nonce-${nonce}' 'strict-dynamic' 'self' 'unsafe-inline' https:`;
    styleSrc = "";
    if (useNonStrictPolicy) {
      styleSrc = "'unsafe-inline'";
    }
  }

  // We add WEBAPP_URL to img-src because of booking pages, which end up loading images from app.cal.com on cal.com
  // FIXME: Write a layer to extract out EventType Analytics tracking endpoints and add them to img-src or connect-src as needed. e.g. fathom, Google Analytics and others
  return `
	  default-src 'self' ${defaultSrc};
	  script-src ${scriptSrc};
    object-src 'none';
    base-uri 'none';
	  child-src app.cal.com;
	  style-src 'self' ${styleSrc} app.cal.com;
	  font-src 'self';
	  img-src 'self' ${WEBAPP_URL} https://img.youtube.com https://eu.ui-avatars.com/api/ data:;
    connect-src 'self' ${WEBAPP_URL}
	`;
}

export function getCspNonce(): string {
  const nonce = buildNonce(crypto.getRandomValues(new Uint8Array(22)));

  return nonce;
}

export function getCspHeader({
  shouldEnforceCsp,
  nonce,
}: {
  shouldEnforceCsp: boolean;
  nonce: string;
}): CspHeader | null {
  if (!shouldEnforceCsp) {
    return null;
  }

  const cspHeaderValue = getCspPolicy(nonce)
    .replace(/\s{2,}/g, " ")
    .trim();

  return { name: "Content-Security-Policy", value: cspHeaderValue };
}
