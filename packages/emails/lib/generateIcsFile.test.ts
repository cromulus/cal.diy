import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import { afterEach, describe, expect, test, vi } from "vitest";
import generateIcsFile, { GenerateIcsRole } from "./generateIcsFile";

describe("generateIcsFile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("uses signed inbound RSVP organizer address for attendee ICS files", () => {
    vi.stubEnv("CALENDAR_REPLY_SECRET", "secret");
    vi.stubEnv("CALENDAR_REPLY_INBOUND_DOMAIN", "rsvp.cal.nmc-atelier.com");

    const attendee = buildPerson({ email: "guest@example.com" });
    const event = buildCalendarEvent({
      iCalUID: "booking-uid@cal.nmc-atelier.com",
      organizer: buildPerson({ name: "Host", email: "host@example.com" }),
      attendees: [attendee],
    });

    const icsFile = generateIcsFile({
      calEvent: event,
      role: GenerateIcsRole.ATTENDEE,
      status: "CONFIRMED",
      recipient: attendee,
    });

    const unfoldedContent = icsFile?.content.replace(/\r?\n[ \t]/g, "") ?? "";

    expect(unfoldedContent).toContain("ORGANIZER;CN=Host:mailto:booking+");
    expect(unfoldedContent).toContain("@rsvp.cal.nmc-atelier.com");
    expect(unfoldedContent).not.toContain("ORGANIZER;CN=Host:mailto:host@example.com");
  });
});
