import { WEBAPP_URL } from "./constants";

const DOMAIN_SEPARATOR_REGEX = /[\s,]+/;
const URL_PROTOCOL_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;

const normalizeHost = (value: string): string | null => {
  const trimmedValue = value.trim().toLowerCase();
  if (!trimmedValue) return null;

  let urlString = trimmedValue;
  if (!URL_PROTOCOL_REGEX.test(trimmedValue)) {
    urlString = `https://${trimmedValue}`;
  }

  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;

    return url.host.toLowerCase();
  } catch {
    return null;
  }
};

const APP_HOST: string | null = normalizeHost(WEBAPP_URL);

const normalizeEmbedAllowedDomain = (value: string): string | null => normalizeHost(value);

const normalizeEmbedAllowedDomains = (values: string[]): string[] => {
  const seenDomains = new Set<string>();

  return values.reduce<string[]>((domains, value) => {
    const domain = normalizeEmbedAllowedDomain(value);
    if (!domain || seenDomains.has(domain)) return domains;

    seenDomains.add(domain);
    domains.push(domain);
    return domains;
  }, []);
};

const parseEmbedAllowedDomainsInput = (value: string): string[] =>
  normalizeEmbedAllowedDomains(value.split(DOMAIN_SEPARATOR_REGEX));

const getUrlFromReferrer = (referrer: string | undefined): URL | null => {
  if (!referrer) return null;

  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
};

const getUrlFromAllowedHost = (allowedHost: string): URL | null => {
  try {
    return new URL(`https://${allowedHost}`);
  } catch {
    return null;
  }
};

const isWildcardAllowedDomainMatch = (referrerUrl: URL, allowedDomain: string): boolean => {
  const allowedUrl = getUrlFromAllowedHost(allowedDomain.slice(2));
  if (!allowedUrl) return false;

  if (!referrerUrl.hostname.endsWith(`.${allowedUrl.hostname}`)) return false;
  if (allowedUrl.port && referrerUrl.port !== allowedUrl.port) return false;

  return true;
};

const isExactAllowedDomainMatch = (referrerUrl: URL, allowedDomain: string): boolean => {
  const allowedUrl = getUrlFromAllowedHost(allowedDomain);
  if (!allowedUrl) return false;

  if (allowedUrl.port) return referrerUrl.host === allowedUrl.host;

  return referrerUrl.hostname === allowedUrl.hostname;
};

const isAllowedDomainMatch = (referrerUrl: URL, allowedDomain: string): boolean => {
  if (allowedDomain.startsWith("*.")) {
    return isWildcardAllowedDomainMatch(referrerUrl, allowedDomain);
  }

  return isExactAllowedDomainMatch(referrerUrl, allowedDomain);
};

const isEmbedReferrerAllowed = ({
  referrer,
  allowedDomains,
}: {
  referrer: string | undefined;
  allowedDomains: string[];
}): boolean => {
  const normalizedAllowedDomains = normalizeEmbedAllowedDomains(allowedDomains);
  if (!normalizedAllowedDomains.length) return true;

  const referrerUrl = getUrlFromReferrer(referrer);
  if (!referrerUrl) return false;
  if (APP_HOST && referrerUrl.host === APP_HOST) return true;

  return normalizedAllowedDomains.some((allowedDomain) => isAllowedDomainMatch(referrerUrl, allowedDomain));
};

export {
  isEmbedReferrerAllowed,
  normalizeEmbedAllowedDomain,
  normalizeEmbedAllowedDomains,
  parseEmbedAllowedDomainsInput,
};
