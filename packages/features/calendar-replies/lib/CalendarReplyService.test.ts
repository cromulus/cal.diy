import { createCalendarReplyToken } from "@calcom/lib/calendarReplyToken";
import { afterEach, describe, expect, test, vi } from "vitest";
import { processCalendarReply } from "./CalendarReplyService";

const { mockFindFirst, mockHandleCancelBooking } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockHandleCancelBooking: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    booking: {
      findFirst: mockFindFirst,
    },
  },
}));

vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({
  default: mockHandleCancelBooking,
}));

describe("processCalendarReply", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  test("cancels a booking when a verified attendee declines", async () => {
    vi.stubEnv("CALENDAR_REPLY_SECRET", "secret");
    const iCalUID = "booking-uid@app.cal.local";
    const attendeeEmail = "guest@example.com";
    const replyToken = createCalendarReplyToken({ iCalUID, attendeeEmail });

    mockFindFirst.mockResolvedValue({
      uid: "booking-uid",
      attendees: [
        {
          email: attendeeEmail,
          bookingSeat: null,
        },
      ],
    });
    mockHandleCancelBooking.mockResolvedValue({ success: true });

    const result = await processCalendarReply({
      iCalUID,
      attendeeEmail,
      partstat: "DECLINED",
      replyToken,
    });

    expect(result).toEqual({ action: "cancelled" });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        status: "ACCEPTED",
        OR: [{ iCalUID }, { uid: "booking-uid" }],
      },
      select: {
        uid: true,
        attendees: {
          select: {
            email: true,
            bookingSeat: {
              select: {
                referenceUid: true,
              },
            },
          },
        },
      },
    });
    expect(mockHandleCancelBooking).toHaveBeenCalledWith({
      userId: -1,
      bookingData: {
        uid: "booking-uid",
        seatReferenceUid: undefined,
        cancelledBy: attendeeEmail,
        cancellationReason: "Declined from calendar invite",
      },
    });
  });

  test("ignores replies with invalid tokens", async () => {
    vi.stubEnv("CALENDAR_REPLY_SECRET", "secret");

    const result = await processCalendarReply({
      iCalUID: "booking-uid@app.cal.local",
      attendeeEmail: "guest@example.com",
      partstat: "DECLINED",
      replyToken: "invalid-token",
    });

    expect(result).toEqual({ action: "ignored", reason: "invalid_token" });
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
  });
});
