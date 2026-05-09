/// <reference path="../types/ical.d.ts"/>

import ICAL from "ical.js";

export type ParsedCalendarReply = {
  method: string | null;
  iCalUID: string | null;
  attendeeEmail: string | null;
  partstat: string | null;
};

const normalizeCalendarEmail = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return (
    value
      .replace(/^mailto:/i, "")
      .trim()
      .toLowerCase() || null
  );
};

const getPropertyParameter = (property: ICAL.Property, parameterName: string): string | null => {
  const propertyJson = property.toJSON();
  if (!Array.isArray(propertyJson)) return null;

  const parameters = propertyJson[1];
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return null;

  const value = (parameters as Record<string, unknown>)[parameterName.toLowerCase()];
  if (Array.isArray(value)) return value[0]?.toString() ?? null;

  return value?.toString() ?? null;
};

export const parseCalendarReplies = (iCalString: string): ParsedCalendarReply[] => {
  const calendar = new ICAL.Component(ICAL.parse(iCalString));
  const method = calendar.getFirstPropertyValue("method")?.toString().toUpperCase() ?? null;

  return calendar.getAllSubcomponents("vevent").flatMap((event) => {
    const iCalUID = event.getFirstPropertyValue("uid")?.toString() ?? null;

    return event.getAllProperties("attendee").map((attendee) => ({
      method,
      iCalUID,
      attendeeEmail: normalizeCalendarEmail(attendee.getFirstValue()?.toString()),
      partstat: getPropertyParameter(attendee, "partstat")?.toUpperCase() ?? null,
    }));
  });
};
