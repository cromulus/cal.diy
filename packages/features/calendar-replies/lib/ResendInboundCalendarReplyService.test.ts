import { createCalendarReplyToken } from "@calcom/lib/calendarReplyToken";
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleResendInboundCalendarReply } from "./ResendInboundCalendarReplyService";

const { mockProcessCalendarReply } = vi.hoisted(() => ({
  mockProcessCalendarReply: vi.fn(),
}));

vi.mock("./CalendarReplyService", () => ({
  processCalendarReply: mockProcessCalendarReply,
}));

const iCalUID = "booking-uid@cal.nmc-atelier.com";
const attendeeEmail = "guest@example.com";
const calendarReply = `BEGIN:VCALENDAR
METHOD:REPLY
BEGIN:VEVENT
UID:${iCalUID}
ATTENDEE;PARTSTAT=DECLINED:mailto:${attendeeEmail}
END:VEVENT
END:VCALENDAR`;

describe("handleResendInboundCalendarReply", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  test("fetches a received email and processes calendar reply payloads", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("CALENDAR_REPLY_SECRET", "secret");
    vi.stubEnv("CALENDAR_REPLY_INBOUND_DOMAIN", "rsvp.cal.nmc-atelier.com");
    const replyToken = createCalendarReplyToken({ iCalUID, attendeeEmail });

    mockProcessCalendarReply.mockResolvedValue({ action: "cancelled" });

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/emails/receiving/email-id")) {
        return Response.json({
          id: "email-id",
          to: [`booking+${replyToken}@rsvp.cal.nmc-atelier.com`],
          raw: { download_url: "https://raw.resend.test/email-id" },
          attachments: [],
        });
      }

      if (url === "https://raw.resend.test/email-id") {
        return new Response(calendarReply);
      }

      return new Response("not found", { status: 404 });
    });

    const result = await handleResendInboundCalendarReply(
      {
        type: "email.received",
        data: {
          email_id: "email-id",
          to: [`booking+${replyToken}@rsvp.cal.nmc-atelier.com`],
        },
      },
      { fetcher }
    );

    expect(result).toEqual({ processed: 1, results: [{ action: "cancelled" }] });
    expect(mockProcessCalendarReply).toHaveBeenCalledWith({
      iCalUID,
      attendeeEmail,
      partstat: "DECLINED",
      replyToken,
    });
  });
});
