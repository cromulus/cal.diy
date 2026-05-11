import dayjs from "@calcom/dayjs";
import { HolidayRepository } from "@calcom/features/holidays/repositories/HolidayRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { CONFLICT_CHECK_MONTHS, GOOGLE_HOLIDAY_CALENDARS } from "./constants";
import {
  type CachedHoliday,
  getHolidayServiceCachingProxy,
  type HolidayServiceCachingProxy,
} from "./HolidayServiceCachingProxy";
import type { Country, Holiday, HolidayWithStatus } from "./types";

export interface ConflictingBooking {
  id: number;
  title: string;
  startTime: Date;
  endTime: Date;
  attendeeName: string | null;
}

export interface HolidayConflict {
  holidayId: string;
  holidayName: string;
  date: string;
  bookings: ConflictingBooking[];
}

const HOLIDAY_SET_SEPARATOR = ",";

const parseHolidaySetCodes = (holidaySetCodes: string | string[] | null | undefined): string[] => {
  const codes = Array.isArray(holidaySetCodes)
    ? holidaySetCodes
    : (holidaySetCodes?.split(HOLIDAY_SET_SEPARATOR) ?? []);

  return Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
};

const serializeHolidaySetCodes = (holidaySetCodes: string[]): string | null => {
  const codes = parseHolidaySetCodes(holidaySetCodes);
  return codes.length > 0 ? codes.join(HOLIDAY_SET_SEPARATOR) : null;
};

const getHolidayId = (holiday: { countryCode: string; eventId: string }): string =>
  `${holiday.countryCode}:${holiday.eventId}`;

const getLegacyHolidayId = (holidayId: string): string => {
  const separatorIndex = holidayId.lastIndexOf(":");
  return separatorIndex === -1 ? holidayId : holidayId.slice(separatorIndex + 1);
};

const isHolidayDisabled = (holiday: { countryCode: string; eventId: string }, disabledIds: Set<string>) =>
  disabledIds.has(getHolidayId(holiday)) || disabledIds.has(holiday.eventId);

export class HolidayService {
  private cachingProxy: HolidayServiceCachingProxy;
  private countriesCache: Country[] | null = null;

  constructor(cachingProxy?: HolidayServiceCachingProxy) {
    this.cachingProxy = cachingProxy || getHolidayServiceCachingProxy();
  }

  getSupportedCountries(): Country[] {
    if (this.countriesCache) {
      return this.countriesCache;
    }

    this.countriesCache = Object.entries(GOOGLE_HOLIDAY_CALENDARS).map(([code, config]) => ({
      code,
      name: config.name,
    }));

    return this.countriesCache;
  }

  isSupportedCountry(countryCode: string): boolean {
    return countryCode in GOOGLE_HOLIDAY_CALENDARS;
  }

  private validateHolidaySetCodes(holidaySetCodes: string[]): void {
    for (const code of holidaySetCodes) {
      if (!this.isSupportedCountry(code)) {
        throw new ErrorWithCode(ErrorCode.BadRequest, "Invalid holiday set");
      }
    }
  }

  async getUserSettings(
    userId: number
  ): Promise<{ countryCode: string | null; countryCodes: string[]; holidays: HolidayWithStatus[] }> {
    const settings = await HolidayRepository.findUserSettingsSelect({
      userId,
      select: { countryCode: true, disabledIds: true },
    });

    const countryCodes = parseHolidaySetCodes(settings?.countryCode);
    if (countryCodes.length === 0) {
      return { countryCode: null, countryCodes: [], holidays: [] };
    }

    const holidays = await this.getHolidaysWithStatus(countryCodes, settings?.disabledIds ?? []);
    return { countryCode: serializeHolidaySetCodes(countryCodes), countryCodes, holidays };
  }

  async updateSettings(
    userId: number,
    countryCode: string | string[] | null,
    resetDisabledHolidays: boolean
  ): Promise<{ countryCode: string | null; countryCodes: string[]; holidays: HolidayWithStatus[] }> {
    const countryCodes = parseHolidaySetCodes(countryCode);
    this.validateHolidaySetCodes(countryCodes);

    const settings = await HolidayRepository.upsertUserSettings({
      userId,
      countryCode: serializeHolidaySetCodes(countryCodes),
      resetDisabledHolidays,
    });

    const selectedCountryCodes = parseHolidaySetCodes(settings.countryCode);
    if (selectedCountryCodes.length > 0) {
      const holidays = await this.getHolidaysWithStatus(selectedCountryCodes, settings.disabledIds);
      return {
        countryCode: serializeHolidaySetCodes(selectedCountryCodes),
        countryCodes: selectedCountryCodes,
        holidays,
      };
    }

    return { countryCode: null, countryCodes: [], holidays: [] };
  }

  private cachedHolidayToHoliday(cached: CachedHoliday): Holiday {
    return {
      id: getHolidayId(cached),
      name: cached.name,
      // Use UTC to ensure consistent date formatting regardless of server timezone
      // Holiday dates are stored as UTC midnight (e.g., 2025-12-25T00:00:00.000Z)
      date: dayjs(cached.date).utc().format("YYYY-MM-DD"),
      year: cached.year,
    };
  }

  async getHolidaysForCountry(countryCode: string, year?: number): Promise<Holiday[]> {
    const targetYear = year || dayjs().year();
    const cached = await this.cachingProxy.getHolidaysForCountry(countryCode, targetYear);
    return cached.map((h) => this.cachedHolidayToHoliday(h));
  }

  async getHolidaysWithStatus(
    countryCode: string | string[],
    disabledIds: string[]
  ): Promise<HolidayWithStatus[]> {
    const currentYear = dayjs().year();
    const nextYear = currentYear + 1;
    const countryCodes = parseHolidaySetCodes(countryCode);

    const holidaySets = await Promise.all(
      countryCodes.flatMap((countryCode) => [
        this.cachingProxy.getHolidaysForCountry(countryCode, currentYear),
        this.cachingProxy.getHolidaysForCountry(countryCode, nextYear),
      ])
    );

    const allHolidays = Array.from(
      new Map(holidaySets.flat().map((holiday) => [getHolidayId(holiday), holiday])).values()
    );
    const disabledSet = new Set(disabledIds);
    const today = dayjs().utc().startOf("day");

    return allHolidays
      .filter((h) => dayjs(h.date).utc().isAfter(today) || dayjs(h.date).utc().isSame(today))
      .map((h) => ({
        id: getHolidayId(h),
        name: h.name,
        // Use UTC for consistent date formatting
        date: dayjs(h.date).utc().format("YYYY-MM-DD"),
        year: h.year,
        enabled: !isHolidayDisabled(h, disabledSet),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getHolidayDatesInRange(
    countryCode: string | string[],
    disabledIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; holiday: Holiday }>> {
    const countryCodes = parseHolidaySetCodes(countryCode);
    const disabledSet = new Set(disabledIds);

    const holidays = (
      await Promise.all(
        countryCodes.map((countryCode) =>
          this.cachingProxy.getHolidaysInRange(countryCode, startDate, endDate)
        )
      )
    ).flat();

    return holidays
      .filter((h) => !isHolidayDisabled(h, disabledSet))
      .map((h) => ({
        // Use UTC for consistent date formatting
        date: dayjs(h.date).utc().format("YYYY-MM-DD"),
        holiday: this.cachedHolidayToHoliday(h),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async hasHolidaysInRange(
    countryCode: string | string[],
    disabledIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    const holidays = await this.getHolidayDatesInRange(countryCode, disabledIds, startDate, endDate);
    return holidays.length > 0;
  }

  async toggleHoliday(
    userId: number,
    holidayId: string,
    enabled: boolean
  ): Promise<{ countryCode: string; countryCodes: string[]; holidays: HolidayWithStatus[] }> {
    const settings = await HolidayRepository.findUserSettingsSelect({
      userId,
      select: { countryCode: true, disabledIds: true },
    });

    const countryCodes = parseHolidaySetCodes(settings?.countryCode);
    if (!settings || countryCodes.length === 0) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "No holiday set selected");
    }

    // Validate against both current and next year holidays (matching getHolidaysWithStatus)
    const currentYear = dayjs().year();
    const nextYear = currentYear + 1;
    const allHolidays = (
      await Promise.all(
        countryCodes.flatMap((countryCode) => [
          this.getHolidaysForCountry(countryCode, currentYear),
          this.getHolidaysForCountry(countryCode, nextYear),
        ])
      )
    ).flat();

    const normalizedHolidayId =
      allHolidays.find((holiday) => holiday.id === holidayId || holiday.id.endsWith(`:${holidayId}`))?.id ??
      holidayId;
    const legacyHolidayId = getLegacyHolidayId(normalizedHolidayId);

    if (!allHolidays.some((h) => h.id === normalizedHolidayId)) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Holiday not found for these holiday sets");
    }

    let disabledIds = [...settings.disabledIds];
    if (enabled) {
      disabledIds = disabledIds.filter((id) => id !== normalizedHolidayId && id !== legacyHolidayId);
    } else if (!disabledIds.includes(normalizedHolidayId)) {
      disabledIds.push(normalizedHolidayId);
    }

    await HolidayRepository.updateDisabledIds({ userId, disabledIds });

    const updatedHolidays = await this.getHolidaysWithStatus(countryCodes, disabledIds);
    return {
      countryCode: serializeHolidaySetCodes(countryCodes) ?? "",
      countryCodes,
      holidays: updatedHolidays,
    };
  }

  async checkConflicts(
    userId: number,
    countryCode: string | string[],
    disabledIds: string[]
  ): Promise<{ conflicts: HolidayConflict[] }> {
    const countryCodes = parseHolidaySetCodes(countryCode);
    if (countryCodes.length === 0) {
      return { conflicts: [] };
    }

    const startDate = new Date();
    const endDate = dayjs().add(CONFLICT_CHECK_MONTHS, "months").toDate();

    const holidayDates = await this.getHolidayDatesInRange(countryCodes, disabledIds, startDate, endDate);
    if (holidayDates.length === 0) {
      return { conflicts: [] };
    }

    const dateRanges = holidayDates.map((h) => ({
      start: dayjs.utc(h.date).startOf("day").toDate(),
      end: dayjs.utc(h.date).endOf("day").toDate(),
    }));

    const bookings = await HolidayRepository.findBookingsInDateRanges({ userId, dateRanges });
    if (bookings.length === 0) {
      return { conflicts: [] };
    }

    const bookingsWithTimestamps = bookings.map((b) => ({
      ...b,
      startTimestamp: b.startTime.getTime(),
      endTimestamp: b.endTime.getTime(),
    }));

    const conflicts: HolidayConflict[] = [];

    for (const holidayDate of holidayDates) {
      const holidayStart = dayjs.utc(holidayDate.date).startOf("day").valueOf();
      const holidayEnd = dayjs.utc(holidayDate.date).endOf("day").valueOf();

      const conflictingBookings = bookingsWithTimestamps.filter(
        (booking) => booking.startTimestamp < holidayEnd && booking.endTimestamp > holidayStart
      );

      if (conflictingBookings.length > 0) {
        conflicts.push({
          holidayId: holidayDate.holiday.id,
          holidayName: holidayDate.holiday.name,
          date: holidayDate.date,
          bookings: conflictingBookings.map((b) => ({
            id: b.id,
            title: b.title,
            startTime: b.startTime,
            endTime: b.endTime,
            attendeeName: b.attendees[0]?.name || null,
          })),
        });
      }
    }

    return { conflicts };
  }
}

let defaultService: HolidayService | null = null;

export function getHolidayService(): HolidayService {
  if (!defaultService) {
    defaultService = new HolidayService();
  }
  return defaultService;
}
