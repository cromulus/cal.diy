const DOMAIN_SEPARATOR_REGEX = /[\s,]+/;
const URL_PROTOCOL_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;

const normalizeHost = (value: string) => {
  const trimmedValue = value.trim().toLowerCase();
  if (!trimmedValue) return null;

  const urlString = URL_PROTOCOL_REGEX.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;

  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;

    return url.host.toLowerCase();
  } catch {
    return null;
  }
};

export const normalizeEmbedAllowedDomain = (value: string) => normalizeHost(value);

export const normalizeEmbedAllowedDomains = (values: string[]) => {
  const seenDomains = new Set<string>();

  return values.reduce<string[]>((domains, value) => {
    const domain = normalizeEmbedAllowedDomain(value);
    if (!domain || seenDomains.has(domain)) return domains;

    seenDomains.add(domain);
    domains.push(domain);
    return domains;
  }, []);
};

export const parseEmbedAllowedDomainsInput = (value: string) =>
  normalizeEmbedAllowedDomains(value.split(DOMAIN_SEPARATOR_REGEX));

const getUrlFromReferrer = (referrer: string | undefined) => {
  if (!referrer) return null;

  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
};

const getUrlFromAllowedHost = (allowedHost: string) => {
  try {
    return new URL(`https://${allowedHost}`);
  } catch {
    return null;
  }
};

const isWildcardAllowedDomainMatch = (referrerUrl: URL, allowedDomain: string) => {
  const allowedUrl = getUrlFromAllowedHost(allowedDomain.slice(2));
  if (!allowedUrl) return false;

  if (!referrerUrl.hostname.endsWith(`.${allowedUrl.hostname}`)) return false;
  if (allowedUrl.port && referrerUrl.port !== allowedUrl.port) return false;

  return true;
};

const isExactAllowedDomainMatch = (referrerUrl: URL, allowedDomain: string) => {
  const allowedUrl = getUrlFromAllowedHost(allowedDomain);
  if (!allowedUrl) return false;

  if (allowedUrl.port) return referrerUrl.host === allowedUrl.host;

  return referrerUrl.hostname === allowedUrl.hostname;
};

export const isEmbedReferrerAllowed = ({
  referrer,
  allowedDomains,
}: {
  referrer: string | undefined;
  allowedDomains: string[];
}) => {
  const normalizedAllowedDomains = normalizeEmbedAllowedDomains(allowedDomains);
  if (!normalizedAllowedDomains.length) return true;

  const referrerUrl = getUrlFromReferrer(referrer);
  if (!referrerUrl) return false;

  return normalizedAllowedDomains.some((allowedDomain) =>
    allowedDomain.startsWith("*.")
      ? isWildcardAllowedDomainMatch(referrerUrl, allowedDomain)
      : isExactAllowedDomainMatch(referrerUrl, allowedDomain)
  );
};
