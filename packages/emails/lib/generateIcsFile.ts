import { getCalendarReplyOrganizerEmail } from "@calcom/lib/calendarReplyToken";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import type { EventStatus } from "ics";
import generateIcsString from "./generateIcsString";

export enum GenerateIcsRole {
  ATTENDEE = "attendee",
  ORGANIZER = "organizer",
}

type GenerateIcsFileResult = {
  filename: string;
  content: string | undefined;
  method: "REQUEST";
} | null;

export default function generateIcsFile({
  calEvent,
  role,
  status,
  recipient,
  t,
}: {
  calEvent: CalendarEvent;
  role: GenerateIcsRole;
  status: EventStatus;
  recipient?: Person;
  t?: TFunction;
}): GenerateIcsFileResult {
  // O365 deletes emails if the calendar event is selected. Currently no option to disable this on the web
  if (
    role !== GenerateIcsRole.ATTENDEE &&
    calEvent.destinationCalendar &&
    calEvent.destinationCalendar[0]?.integration === "office365_calendar"
  )
    return null;

  let organizerEmailOverride: string | null = null;
  if (role === GenerateIcsRole.ATTENDEE) {
    organizerEmailOverride = getCalendarReplyOrganizerEmail({
      iCalUID: calEvent.iCalUID || calEvent.uid,
      attendeeEmail: recipient?.email ?? calEvent.attendees[0]?.email,
    });
  }

  return {
    filename: "event.ics",
    content: generateIcsString({
      event: calEvent,
      status,
      organizerEmailOverride,
      t,
    }),
    method: "REQUEST",
  };
}
