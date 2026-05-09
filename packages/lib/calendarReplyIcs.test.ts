import { describe, expect, test } from "vitest";
import { parseCalendarReplies } from "./calendarReplyIcs";
import { extractCalendarIcsStrings } from "./extractCalendarIcsStrings";

const calendarReply = `BEGIN:VCALENDAR
METHOD:REPLY
BEGIN:VEVENT
UID:booking-uid@cal.nmc-atelier.com
ATTENDEE;PARTSTAT=DECLINED:mailto:guest@example.com
END:VEVENT
END:VCALENDAR`;

describe("calendar reply ICS parsing", () => {
  test("parses declined attendee replies", () => {
    expect(parseCalendarReplies(calendarReply)).toEqual([
      {
        method: "REPLY",
        iCalUID: "booking-uid@cal.nmc-atelier.com",
        attendeeEmail: "guest@example.com",
        partstat: "DECLINED",
      },
    ]);
  });

  test("extracts base64 text/calendar parts from raw MIME", () => {
    const encodedCalendarReply = Buffer.from(calendarReply).toString("base64");
    const rawEmail = `Content-Type: multipart/mixed; boundary="reply-boundary"

--reply-boundary
Content-Type: text/calendar
Content-Transfer-Encoding: base64

${encodedCalendarReply}
--reply-boundary--`;

    expect(extractCalendarIcsStrings(rawEmail)).toEqual([calendarReply]);
  });
});
