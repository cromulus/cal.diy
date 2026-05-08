import { WEBAPP_URL } from "./constants";

const FALLBACK_CALENDAR_EVENT_UID_DOMAIN = "localhost";

export const getCalendarEventUidDomain = (webappUrl: string = WEBAPP_URL): string => {
  try {
    const hostname = new URL(webappUrl).hostname;
    if (hostname) return hostname.toLowerCase();
  } catch {
    return FALLBACK_CALENDAR_EVENT_UID_DOMAIN;
  }

  return FALLBACK_CALENDAR_EVENT_UID_DOMAIN;
};

export const getCalendarEventUidSuffix = (webappUrl: string = WEBAPP_URL): string =>
  `@${getCalendarEventUidDomain(webappUrl)}`;

export const isCalendarEventUidForInstance = (
  iCalUID: string | null | undefined,
  webappUrl: string = WEBAPP_URL
): boolean => {
  const normalizedICalUID = iCalUID?.toLowerCase();
  if (!normalizedICalUID) return false;

  return normalizedICalUID.endsWith(getCalendarEventUidSuffix(webappUrl));
};
