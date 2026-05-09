import process from "node:process";
import { parseCalendarReplies } from "@calcom/lib/calendarReplyIcs";
import { getCalendarReplyTokenFromAddress } from "@calcom/lib/calendarReplyToken";
import { extractCalendarIcsStrings } from "@calcom/lib/extractCalendarIcsStrings";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { ProcessCalendarReplyResult } from "./CalendarReplyService";
import { processCalendarReply } from "./CalendarReplyService";

const RESEND_API_BASE_URL = "https://api.resend.com";

const log = logger.getSubLogger({ prefix: ["ResendInboundCalendarReplyService"] });

type ResendEmailReceivedWebhook = {
  type: string;
  data?: {
    email_id?: string;
    to?: string[];
  };
};

type ResendReceivedEmailAttachment = {
  id: string;
  filename?: string | null;
  content_type?: string | null;
  download_url?: string | null;
};

type ResendReceivedEmail = {
  id: string;
  to: string[];
  text?: string | null;
  html?: string | null;
  raw?: {
    download_url?: string | null;
  } | null;
  attachments?: ResendReceivedEmailAttachment[];
};

type ResendAttachmentListResponse = {
  data?: ResendReceivedEmailAttachment[];
};

type FetchLike = typeof fetch;

export type HandleResendInboundCalendarReplyResult = {
  processed: number;
  results: ProcessCalendarReplyResult[];
};

const getResendApiKey = (): string => process.env.RESEND_API_KEY || "";

const isResendReceivedEmail = (
  response: { data?: ResendReceivedEmail } | ResendReceivedEmail
): response is ResendReceivedEmail => "id" in response && "to" in response;

const parseResendEmailReceivedWebhook = (event: unknown): ResendEmailReceivedWebhook | null => {
  if (!event || typeof event !== "object") return null;

  const candidate = event as { type?: unknown; data?: unknown };
  if (typeof candidate.type !== "string") return null;

  const data =
    candidate.data && typeof candidate.data === "object"
      ? (candidate.data as { email_id?: unknown; to?: unknown })
      : undefined;

  return {
    type: candidate.type,
    data: data
      ? {
          email_id: typeof data.email_id === "string" ? data.email_id : undefined,
          to: Array.isArray(data.to)
            ? data.to.filter((value): value is string => typeof value === "string")
            : [],
        }
      : undefined,
  };
};

const fetchResendJson = async <T>({ path, fetcher }: { path: string; fetcher: FetchLike }): Promise<T> => {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error("RESEND_API_KEY is required to process inbound calendar replies");

  const response = await fetcher(`${RESEND_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Resend API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchTextUrl = async (url: string, fetcher: FetchLike): Promise<string> => {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Resend attachment download failed: ${response.status}`);
  return await response.text();
};

const fetchResendReceivedEmail = async (
  emailId: string,
  fetcher: FetchLike
): Promise<ResendReceivedEmail> => {
  const response = await fetchResendJson<{ data?: ResendReceivedEmail } | ResendReceivedEmail>({
    path: `/emails/receiving/${emailId}`,
    fetcher,
  });

  if (isResendReceivedEmail(response)) return response;
  if (response.data) return response.data;

  throw new Error("Resend received email response is missing email data");
};

const fetchCalendarAttachmentStrings = async ({
  emailId,
  attachments,
  fetcher,
}: {
  emailId: string;
  attachments: ResendReceivedEmailAttachment[];
  fetcher: FetchLike;
}): Promise<string[]> => {
  if (attachments.length === 0) return [];

  const listedAttachments = await fetchResendJson<
    ResendAttachmentListResponse | ResendReceivedEmailAttachment[]
  >({
    path: `/emails/receiving/${emailId}/attachments`,
    fetcher,
  });
  const attachmentList = Array.isArray(listedAttachments)
    ? listedAttachments
    : (listedAttachments.data ?? []);

  const calendarAttachments = attachmentList.filter((attachment) => {
    const filename = attachment.filename?.toLowerCase() ?? "";
    const contentType = attachment.content_type?.toLowerCase() ?? "";
    return filename.endsWith(".ics") || contentType.includes("text/calendar");
  });

  const downloadedAttachments = await Promise.all(
    calendarAttachments
      .map((attachment) => attachment.download_url)
      .filter((downloadUrl): downloadUrl is string => !!downloadUrl)
      .map((downloadUrl) => fetchTextUrl(downloadUrl, fetcher))
  );

  if (downloadedAttachments.length > 0) return downloadedAttachments;
  return [];
};

const fetchCalendarIcsStrings = async ({
  email,
  fetcher,
}: {
  email: ResendReceivedEmail;
  fetcher: FetchLike;
}): Promise<string[]> => {
  const bodyCandidates = [email.text, email.html].flatMap(extractCalendarIcsStrings);
  const rawEmail = email.raw?.download_url ? await fetchTextUrl(email.raw.download_url, fetcher) : null;
  const rawCandidates = extractCalendarIcsStrings(rawEmail);
  const attachmentCandidates = await fetchCalendarAttachmentStrings({
    emailId: email.id,
    attachments: email.attachments ?? [],
    fetcher,
  });

  return Array.from(new Set(bodyCandidates.concat(rawCandidates, attachmentCandidates)));
};

export const handleResendInboundCalendarReply = async (
  event: unknown,
  dependencies: { fetcher?: FetchLike } = {}
): Promise<HandleResendInboundCalendarReplyResult> => {
  const parsedEvent = parseResendEmailReceivedWebhook(event);
  if (!parsedEvent) return { processed: 0, results: [{ action: "ignored", reason: "invalid_event" }] };
  if (parsedEvent.type !== "email.received") return { processed: 0, results: [] };

  const emailId = parsedEvent.data?.email_id;
  if (!emailId) return { processed: 0, results: [{ action: "ignored", reason: "missing_email_id" }] };

  const fetcher = dependencies.fetcher ?? fetch;
  const email = await fetchResendReceivedEmail(emailId, fetcher);
  const replyToken = [...(parsedEvent.data?.to ?? []), ...(email.to ?? [])]
    .map(getCalendarReplyTokenFromAddress)
    .find(Boolean);

  if (!replyToken) return { processed: 0, results: [{ action: "ignored", reason: "missing_reply_token" }] };

  try {
    const iCalStrings = await fetchCalendarIcsStrings({ email, fetcher });
    const replies = iCalStrings.flatMap((iCalString) => parseCalendarReplies(iCalString));

    const results = await Promise.all(
      replies.map((reply) =>
        processCalendarReply({
          iCalUID: reply.iCalUID,
          attendeeEmail: reply.attendeeEmail,
          partstat: reply.partstat,
          replyToken,
        })
      )
    );

    return { processed: results.length, results };
  } catch (error) {
    log.error("Failed to handle Resend inbound calendar reply", {
      emailId,
      error: safeStringify(error),
    });
    throw error;
  }
};
