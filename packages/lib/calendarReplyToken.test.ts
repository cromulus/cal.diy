import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createCalendarReplyToken,
  getCalendarReplyOrganizerEmail,
  getCalendarReplyTokenFromAddress,
  verifyCalendarReplyToken,
} from "./calendarReplyToken";

describe("calendarReplyToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("creates and verifies a compact RSVP reply address token", () => {
    vi.stubEnv("CALENDAR_REPLY_SECRET", "secret");
    vi.stubEnv("CALENDAR_REPLY_INBOUND_DOMAIN", "rsvp.cal.nmc-atelier.com");

    const iCalUID = "booking-uid@cal.nmc-atelier.com";
    const attendeeEmail = "Guest@Example.com";
    const token = createCalendarReplyToken({ iCalUID, attendeeEmail });

    expect(token).toHaveLength(22);
    expect(verifyCalendarReplyToken({ token, iCalUID, attendeeEmail: "guest@example.com" })).toBe(true);
    expect(verifyCalendarReplyToken({ token, iCalUID, attendeeEmail: "other@example.com" })).toBe(false);
    expect(getCalendarReplyOrganizerEmail({ iCalUID, attendeeEmail })).toEqual(
      `booking+${token}@rsvp.cal.nmc-atelier.com`
    );
    expect(getCalendarReplyTokenFromAddress(`Cal <booking+${token}@rsvp.cal.nmc-atelier.com>`)).toEqual(
      token
    );
  });

  test("does not create an RSVP reply address without inbound configuration", () => {
    vi.stubEnv("CALENDAR_REPLY_SECRET", "secret");
    vi.stubEnv("CALENDAR_REPLY_INBOUND_DOMAIN", "");

    expect(
      getCalendarReplyOrganizerEmail({
        iCalUID: "booking-uid@cal.nmc-atelier.com",
        attendeeEmail: "guest@example.com",
      })
    ).toBeNull();
  });
});
