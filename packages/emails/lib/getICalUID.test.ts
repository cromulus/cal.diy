import { getCalendarEventUidSuffix, isCalendarEventUidForInstance } from "@calcom/lib/getCalendarEventUid";
import { buildCalendarEvent } from "@calcom/lib/test/builder";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect } from "vitest";
import getICalUID from "./getICalUID";

const CALENDAR_EVENT_UID_SUFFIX: string = getCalendarEventUidSuffix();

describe("getICalUid", () => {
  test("returns iCalUID when passing a uid", () => {
    const iCalUID = getICalUID({ uid: "123" });
    expect(iCalUID).toEqual(`123${CALENDAR_EVENT_UID_SUFFIX}`);
  });
  test("returns iCalUID when passing an event", () => {
    const event = buildCalendarEvent({ iCalUID: `123${CALENDAR_EVENT_UID_SUFFIX}` });
    const iCalUID = getICalUID({ event });
    expect(iCalUID).toEqual(`123${CALENDAR_EVENT_UID_SUFFIX}`);
  });
  test("returns new iCalUID when passing in an event with no iCalUID but has an uid", () => {
    const event = buildCalendarEvent({ iCalUID: "" });
    const iCalUID = getICalUID({ event, defaultToEventUid: true });
    expect(iCalUID).toEqual(`${event.uid}${CALENDAR_EVENT_UID_SUFFIX}`);
  });
  test("returns new iCalUID when passing in an event with no iCalUID and uses uid passed", () => {
    const event = buildCalendarEvent({ iCalUID: "" });
    const iCalUID = getICalUID({ event, uid: "123" });
    expect(iCalUID).toEqual(`123${CALENDAR_EVENT_UID_SUFFIX}`);
  });
  test("uses the current instance hostname as the iCalUID suffix", () => {
    expect(getCalendarEventUidSuffix("https://cal.nmc-atelier.com")).toEqual("@cal.nmc-atelier.com");
  });
  test("only treats the current instance hostname as sync-owned", () => {
    expect(isCalendarEventUidForInstance("123@cal.nmc-atelier.com", "https://cal.nmc-atelier.com")).toBe(
      true
    );
    expect(isCalendarEventUidForInstance("123@cal.com", "https://cal.nmc-atelier.com")).toBe(false);
    expect(isCalendarEventUidForInstance("123@Cal.diy", "https://cal.nmc-atelier.com")).toBe(false);
  });
});
