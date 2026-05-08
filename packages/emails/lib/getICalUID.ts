import { getCalendarEventUidSuffix } from "@calcom/lib/getCalendarEventUid";
import short from "short-uuid";
import { v4 as uuidv4 } from "uuid";

const CALENDAR_EVENT_UID_SUFFIX: string = getCalendarEventUidSuffix();

type EventLike = {
  iCalUID?: string | null;
  uid?: string | null;
  [key: string]: unknown;
};

/**
 * This function returns the iCalUID if a uid is passed or if it is present in the event that is passed
 * @param uid - the uid of the event
 * @param event - an event that already has an iCalUID or one that has a uid
 * @param defaultToEventUid - if true, will default to the event.uid if present
 *
 * @returns the iCalUID whether already present or generated
 */
const getICalUID = ({
  uid,
  event,
  defaultToEventUid,
  attendeeId,
}: {
  uid?: string;
  event?: EventLike;
  defaultToEventUid?: boolean;
  attendeeId?: number;
}): string => {
  if (event?.iCalUID) return event.iCalUID;

  if (defaultToEventUid && event?.uid) return `${event.uid}${CALENDAR_EVENT_UID_SUFFIX}`;

  if (uid) return `${uid}${CALENDAR_EVENT_UID_SUFFIX}`;

  const translator = short();

  uid = translator.fromUUID(uuidv4());
  let attendeeSuffix = "";
  if (attendeeId) attendeeSuffix = String(attendeeId);
  return `${uid}${attendeeSuffix}${CALENDAR_EVENT_UID_SUFFIX}`;
};

export default getICalUID;
