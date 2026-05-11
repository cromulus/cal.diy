import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { getHolidayService } from "@calcom/lib/holidays";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { TToggleHolidaySchema } from "./toggleHoliday.schema";

type ToggleHolidayOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TToggleHolidaySchema;
};

/**
 * Toggle a holiday on/off for a user.
 *
 * Note: holidayId is the holiday set plus Google Calendar event ID, not the database id.
 * It is stored in UserHolidaySettings.disabledIds[] to track disabled holidays.
 */
export async function toggleHolidayHandler({ ctx, input }: ToggleHolidayOptions) {
  const holidayService = getHolidayService();

  try {
    return await holidayService.toggleHoliday(ctx.user.id, input.holidayId, input.enabled);
  } catch (error) {
    if (error instanceof ErrorWithCode) {
      throw new TRPCError({
        code: error.code === ErrorCode.NotFound ? "NOT_FOUND" : "BAD_REQUEST",
        message: error.message,
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Failed to toggle holiday",
    });
  }
}

export default toggleHolidayHandler;
