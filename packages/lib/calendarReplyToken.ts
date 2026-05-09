import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";

const CALENDAR_REPLY_LOCAL_PART_PREFIX = "booking+";
const CALENDAR_REPLY_TOKEN_LENGTH = 22;

const normalizeEmailAddress = (email: string): string =>
  email
    .trim()
    .replace(/^mailto:/i, "")
    .toLowerCase();

const getCalendarReplySecret = (): string =>
  process.env.CALENDAR_REPLY_SECRET || process.env.NEXTAUTH_SECRET || "";

const getSigningPayload = ({ iCalUID, attendeeEmail }: { iCalUID: string; attendeeEmail: string }): string =>
  `${iCalUID.trim().toLowerCase()}:${normalizeEmailAddress(attendeeEmail)}`;

export const getCalendarReplyInboundDomain = (): string =>
  process.env.CALENDAR_REPLY_INBOUND_DOMAIN?.trim().toLowerCase() || "";

export const createCalendarReplyToken = ({
  iCalUID,
  attendeeEmail,
}: {
  iCalUID: string | null | undefined;
  attendeeEmail: string | null | undefined;
}): string | null => {
  const secret = getCalendarReplySecret();
  if (!secret || !iCalUID || !attendeeEmail) return null;

  return createHmac("sha256", secret)
    .update(getSigningPayload({ iCalUID, attendeeEmail }))
    .digest("hex")
    .slice(0, CALENDAR_REPLY_TOKEN_LENGTH);
};

export const verifyCalendarReplyToken = ({
  token,
  iCalUID,
  attendeeEmail,
}: {
  token: string | null | undefined;
  iCalUID: string | null | undefined;
  attendeeEmail: string | null | undefined;
}): boolean => {
  if (!token) return false;

  const expectedToken = createCalendarReplyToken({ iCalUID, attendeeEmail });
  if (!expectedToken) return false;

  const tokenBuffer = Buffer.from(token);
  const expectedTokenBuffer = Buffer.from(expectedToken);
  if (tokenBuffer.byteLength !== expectedTokenBuffer.byteLength) return false;

  return timingSafeEqual(tokenBuffer, expectedTokenBuffer);
};

export const getCalendarReplyOrganizerEmail = ({
  iCalUID,
  attendeeEmail,
}: {
  iCalUID: string | null | undefined;
  attendeeEmail: string | null | undefined;
}): string | null => {
  const inboundDomain = getCalendarReplyInboundDomain();
  const token = createCalendarReplyToken({ iCalUID, attendeeEmail });
  if (!inboundDomain || !token) return null;

  return `${CALENDAR_REPLY_LOCAL_PART_PREFIX}${token}@${inboundDomain}`;
};

export const getCalendarReplyTokenFromAddress = (address: string): string | null => {
  const inboundDomain = getCalendarReplyInboundDomain();
  if (!inboundDomain) return null;

  const emailAddress = normalizeEmailAddress(address.match(/<([^>]+)>/)?.[1] ?? address);
  const [localPart, domain] = emailAddress.split("@");
  if (domain !== inboundDomain || !localPart?.startsWith(CALENDAR_REPLY_LOCAL_PART_PREFIX)) return null;

  const token = localPart.slice(CALENDAR_REPLY_LOCAL_PART_PREFIX.length);
  return token || null;
};
