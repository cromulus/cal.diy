import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { verifyCalendarReplyToken } from "@calcom/lib/calendarReplyToken";
import { isCalendarEventUidForInstance } from "@calcom/lib/getCalendarEventUid";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

const log = logger.getSubLogger({ prefix: ["CalendarReplyService"] });

export type CalendarReplyAction = "cancelled" | "removed_attendee" | "ignored";

export type ProcessCalendarReplyInput = {
  iCalUID: string | null;
  attendeeEmail: string | null;
  partstat: string | null;
  replyToken: string | null;
};

export type ProcessCalendarReplyResult = {
  action: CalendarReplyAction;
  reason?: string;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const processCalendarReply = async ({
  iCalUID,
  attendeeEmail,
  partstat,
  replyToken,
}: ProcessCalendarReplyInput): Promise<ProcessCalendarReplyResult> => {
  if (partstat !== "DECLINED") return { action: "ignored", reason: "not_declined" };
  if (!iCalUID || !attendeeEmail) return { action: "ignored", reason: "missing_reply_data" };
  if (!isCalendarEventUidForInstance(iCalUID)) return { action: "ignored", reason: "wrong_instance" };

  const normalizedAttendeeEmail = normalizeEmail(attendeeEmail);
  const isVerified = verifyCalendarReplyToken({
    token: replyToken,
    iCalUID,
    attendeeEmail: normalizedAttendeeEmail,
  });
  if (!isVerified) return { action: "ignored", reason: "invalid_token" };

  const [bookingUid] = iCalUID.split("@");
  const booking = await prisma.booking.findFirst({
    where: {
      status: BookingStatus.ACCEPTED,
      OR: [{ iCalUID }, { uid: bookingUid }],
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

  if (!booking) return { action: "ignored", reason: "booking_not_found" };

  const attendee = booking.attendees.find(
    (attendee) => normalizeEmail(attendee.email) === normalizedAttendeeEmail
  );
  if (!attendee) return { action: "ignored", reason: "attendee_not_found" };

  try {
    const result = await handleCancelBooking({
      userId: -1,
      bookingData: {
        uid: booking.uid,
        seatReferenceUid: attendee.bookingSeat?.referenceUid,
        cancelledBy: normalizedAttendeeEmail,
        cancellationReason: "Declined from calendar invite",
      },
    });

    if (!result.success) {
      log.warn("Unable to process calendar reply decline", {
        bookingUid: booking.uid,
        attendeeEmail: normalizedAttendeeEmail,
        result,
      });
      return { action: "ignored", reason: "cancel_failed" };
    }

    return { action: result.onlyRemovedAttendee ? "removed_attendee" : "cancelled" };
  } catch (error) {
    log.error("Failed to process calendar reply decline", {
      bookingUid: booking.uid,
      attendeeEmail: normalizedAttendeeEmail,
      error: safeStringify(error),
    });
    return { action: "ignored", reason: "cancel_error" };
  }
};
