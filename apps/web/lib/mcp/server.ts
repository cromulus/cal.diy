import { getRegularBookingService } from "@calcom/features/bookings/di/RegularBookingService.container";
import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { getAvailableSlotsService } from "@calcom/features/di/containers/AvailableSlots";
import { timeZoneSchema } from "@calcom/lib/dayjs/timeZone.schema";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import prisma from "@calcom/prisma";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

type User = { id: number; uuid: string; email: string };
const date = z.string().datetime({ offset: true });
const uid = z.string().min(1).max(100);
const mcpTimeZone = z
  .string()
  .refine((value) => timeZoneSchema.safeParse(value).success, "Invalid timezone")
  .transform((value) => timeZoneSchema.parse(value));
const bookingSelect = {
  uid: true,
  title: true,
  startTime: true,
  endTime: true,
  status: true,
  eventTypeId: true,
  attendees: { select: { name: true, email: true, timeZone: true } },
} as const;
const eventSelect = {
  id: true,
  title: true,
  slug: true,
  length: true,
  locations: true,
  bookingFields: true,
} as const;

function createScope(user: User) {
  const eventWhere = { teamId: null, OR: [{ userId: user.id }, { users: { some: { id: user.id } } }] };
  const ownedBooking = async (bookingUid: string) => {
    const booking = await prisma.booking.findFirst({
      where: { uid: bookingUid, userId: user.id },
      select: { ...bookingSelect, responses: true, recurringEventId: true },
    });
    if (!booking) throw new ErrorWithCode(ErrorCode.NotFound, "Booking not found");
    return booking;
  };
  const ownedEvent = async (id: number) => {
    const event = await prisma.eventType.findFirst({ where: { ...eventWhere, id }, select: eventSelect });
    if (!event) throw new ErrorWithCode(ErrorCode.NotFound, "Event type not found");
    return event;
  };
  return { user, eventWhere, ownedBooking, ownedEvent };
}

const result = async (action: () => Promise<unknown>) => {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(await action()) }] };
  } catch (cause) {
    const error = getServerErrorFromUnknown(cause);
    let text = "Booking service failed. Check bookings before retrying a write.";
    if (error.statusCode < 500) text = error.message;
    return { isError: true, content: [{ type: "text" as const, text }] };
  }
};
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

function registerReadTools(
  server: McpServer,
  { user, eventWhere, ownedEvent }: ReturnType<typeof createScope>
) {
  server.registerTool(
    "list_event_types",
    {
      description: "List your personal event types, locations, and booking questions.",
      inputSchema: { cursor: z.number().int().positive().optional() },
      annotations: read,
    },
    ({ cursor }) =>
      result(() =>
        prisma.eventType.findMany({
          where: { ...eventWhere, ...(cursor ? { id: { gt: cursor } } : {}) },
          select: eventSelect,
          orderBy: { id: "asc" },
          take: 100,
        })
      )
  );
  server.registerTool(
    "list_bookings",
    {
      description:
        "List bookings you host within a time range. Use the last UID as the cursor for the next page.",
      inputSchema: { start: date, end: date, cursor: uid.optional() },
      annotations: read,
    },
    ({ start, end, cursor }) =>
      result(() =>
        prisma.booking.findMany({
          where: {
            userId: user.id,
            startTime: { gte: new Date(start), lt: new Date(end) },
            ...(cursor ? { uid: { gt: cursor } } : {}),
          },
          select: bookingSelect,
          orderBy: { uid: "asc" },
          take: 100,
        })
      )
  );
  server.registerTool(
    "get_availability",
    {
      description: "Find available slots for one of your personal event types, up to 31 days at a time.",
      inputSchema: {
        eventTypeId: z.number().int().positive(),
        start: date,
        end: date,
        timeZone: mcpTimeZone,
      },
      annotations: read,
    },
    ({ eventTypeId, start, end, timeZone }) =>
      result(async () => {
        await ownedEvent(eventTypeId);
        const span = Date.parse(end) - Date.parse(start);
        if (span <= 0 || span > 31 * 86400000)
          throw new ErrorWithCode(ErrorCode.BadRequest, "Use a time range of 1 to 31 days");
        const availability = await getAvailableSlotsService().getAvailableSlots({
          input: { eventTypeId, startTime: start, endTime: end, timeZone, isTeamEvent: false },
        });
        return { slots: availability.slots };
      })
  );
}

function registerWriteTools(
  server: McpServer,
  { user, ownedEvent, ownedBooking }: ReturnType<typeof createScope>
) {
  server.registerTool(
    "create_booking",
    {
      description:
        "Book one of your personal event types. Sends calendar invitations and notifications. Confirm the attendee and time with the user first. Supply booking-question responses from list_event_types.",
      inputSchema: {
        eventTypeId: z.number().int().positive(),
        start: date,
        timeZone: mcpTimeZone,
        name: z.string().min(1).max(200),
        email: z.string().email(),
        responses: z.record(z.unknown()).optional(),
      },
      annotations: { ...write, destructiveHint: false },
    },
    ({ eventTypeId, start, timeZone, name, email, responses }) =>
      result(async () => {
        const event = await ownedEvent(eventTypeId);
        const bookingData = {
          eventTypeId,
          start,
          end: new Date(Date.parse(start) + event.length * 60000).toISOString(),
          timeZone,
          language: "en",
          metadata: {},
          dub_id: null,
          responses: { ...responses, name, email },
        };
        const booking = await getRegularBookingService().createBooking({
          bookingData,
          bookingMeta: { userId: user.id, userUuid: user.uuid },
        });
        return prisma.booking.findFirst({
          where: { uid: booking.uid, userId: user.id },
          select: bookingSelect,
        });
      })
  );
  server.registerTool(
    "reschedule_booking",
    {
      description:
        "Move a booking you host to another time, retaining its attendees and responses. Sends update notifications. Confirm the change with the user first.",
      inputSchema: { uid, start: date, timeZone: mcpTimeZone },
      annotations: write,
    },
    ({ uid: bookingUid, start, timeZone }) =>
      result(async () => {
        const original = await ownedBooking(bookingUid);
        if (!original.eventTypeId || original.recurringEventId)
          throw new ErrorWithCode(
            ErrorCode.BadRequest,
            "Reschedule recurring or deleted-event bookings in the website"
          );
        await ownedEvent(original.eventTypeId);
        const bookingData = {
          eventTypeId: original.eventTypeId,
          rescheduleUid: bookingUid,
          rescheduledBy: user.email,
          start,
          end: new Date(
            Date.parse(start) + original.endTime.getTime() - original.startTime.getTime()
          ).toISOString(),
          timeZone,
          language: "en",
          metadata: {},
          dub_id: null,
          responses: original.responses,
        };
        const booking = await getRegularBookingService().rescheduleBooking({
          bookingData,
          bookingMeta: { userId: user.id, userUuid: user.uuid },
        });
        return prisma.booking.findFirst({
          where: { uid: booking.uid, userId: user.id },
          select: bookingSelect,
        });
      })
  );
  server.registerTool(
    "cancel_booking",
    {
      description:
        "Cancel a booking you host and send cancellation notifications. Confirm the cancellation with the user first.",
      inputSchema: { uid, reason: z.string().min(1).max(1000) },
      annotations: write,
    },
    ({ uid: bookingUid, reason }) =>
      result(async () => {
        await ownedBooking(bookingUid);
        const cancelled = await handleCancelBooking({
          userId: user.id,
          userUuid: user.uuid,
          bookingData: { uid: bookingUid, cancellationReason: reason, cancelledBy: user.email },
        });
        return { success: cancelled.success };
      })
  );
}

export function createMcpServer(user: User): McpServer {
  const server = new McpServer({ name: "cal-diy", version: "1.0.0" });
  const scope = createScope(user);
  registerReadTools(server, scope);
  registerWriteTools(server, scope);
  return server;
}
