// @vitest-environment node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/mcp/route";
import { authenticateMcp } from "./auth";
import { createMcpServer } from "./server";

const mocks = vi.hoisted(() => ({
  key: vi.fn(),
  bookings: vi.fn(),
  booking: vi.fn(),
  events: vi.fn(),
  event: vi.fn(),
  create: vi.fn(),
  reschedule: vi.fn(),
  cancel: vi.fn(),
  slots: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    apiKey: { findUnique: mocks.key },
    booking: { findMany: mocks.bookings, findFirst: mocks.booking },
    eventType: { findMany: mocks.events, findFirst: mocks.event },
  },
}));
vi.mock("@calcom/features/bookings/di/RegularBookingService.container", () => ({
  getRegularBookingService: () => ({ createBooking: mocks.create, rescheduleBooking: mocks.reschedule }),
}));
vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({ default: mocks.cancel }));
vi.mock("@calcom/features/di/containers/AvailableSlots", () => ({
  getAvailableSlotsService: () => ({ getAvailableSlots: mocks.slots }),
}));
vi.mock("@calcom/lib/server/getServerErrorFromUnknown", () => ({
  getServerErrorFromUnknown: (error: Error) => ({ statusCode: 400, message: error.message }),
}));

const user = { id: 7, uuid: "user-7", email: "owner@example.test", locked: false };
vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({ checkRateLimitAndThrowError: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());

it("gates HTTP access and completes a real MCP initialization", async () => {
  const request = (origin?: string) =>
    new Request("https://cal.example/api/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer cal_secret",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    });
  vi.stubEnv("MCP_ENABLED", "false");
  expect((await POST(request())).status).toBe(404);
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_WEBAPP_URL", "https://cal.example");
  expect((await POST(request("https://evil.example"))).status).toBe(403);
  expect((await POST(request())).status).toBe(401);
  mocks.key.mockResolvedValue({ user, expiresAt: null, teamId: null });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ result: { serverInfo: { name: "cal-diy" } } });
});

describe("MCP authentication", () => {
  const request = (authorization: string) =>
    new Request("https://cal.example/api/mcp", { headers: { authorization } });
  it("rejects missing credentials before querying the database", async () => {
    expect(await authenticateMcp(request(""))).toBeNull();
    expect(mocks.key).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { user, expiresAt: new Date(0), teamId: null },
    { user: { ...user, locked: true }, expiresAt: null, teamId: null },
    { user, expiresAt: null, teamId: 2 },
  ])("rejects invalid, expired, locked, and team keys", async (key) => {
    mocks.key.mockResolvedValue(key);
    expect(await authenticateMcp(request("Bearer cal_secret"))).toBeNull();
  });
  it("resolves only the owner of a valid personal key", async () => {
    mocks.key.mockResolvedValue({ user, expiresAt: null, teamId: null });
    expect(await authenticateMcp(request("Bearer cal_secret"))).toEqual(user);
    expect(mocks.key.mock.calls[0][0].where.hashedKey).not.toContain("secret");
  });
});

describe("MCP tool authorization", () => {
  let client: Client;
  let server: ReturnType<typeof createMcpServer>;
  beforeEach(async () => {
    server = createMcpServer(user);
    client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
  });
  it("advertises all six tools with write annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "cancel_booking",
      "create_booking",
      "get_availability",
      "list_bookings",
      "list_event_types",
      "reschedule_booking",
    ]);
    expect(tools.find((tool) => tool.name === "cancel_booking")?.annotations?.destructiveHint).toBe(true);
  });
  it.each([
    ["cancel_booking", { uid: "another-user", reason: "test" }],
    ["reschedule_booking", { uid: "another-user", start: "2030-01-01T10:00:00Z", timeZone: "UTC" }],
  ])("denies another user's booking before %s", async (name, args) => {
    mocks.booking.mockResolvedValue(null);
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError).toBe(true);
    expect(mocks.booking.mock.calls[0][0].where).toEqual({ uid: "another-user", userId: 7 });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.reschedule).not.toHaveBeenCalled();
  });
  it("denies creating bookings for other event types", async () => {
    mocks.event.mockResolvedValue(null);
    const response = await client.callTool({
      name: "create_booking",
      arguments: {
        eventTypeId: 99,
        start: "2030-01-01T10:00:00Z",
        timeZone: "UTC",
        name: "Guest",
        email: "guest@example.test",
      },
    });
    expect(response.isError).toBe(true);
    expect(mocks.event.mock.calls[0][0].where).toMatchObject({
      teamId: null,
      OR: [{ userId: 7 }, { users: { some: { id: 7 } } }],
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("bounds availability requests", async () => {
    mocks.event.mockResolvedValue({ id: 1 });
    const response = await client.callTool({
      name: "get_availability",
      arguments: {
        eventTypeId: 1,
        start: "2030-01-01T00:00:00Z",
        end: "2031-01-01T00:00:00Z",
        timeZone: "UTC",
      },
    });
    expect(response.isError).toBe(true);
    expect(mocks.slots).not.toHaveBeenCalled();
  });
  it("delegates creation without accepting bypass flags or returning internal fields", async () => {
    mocks.event.mockResolvedValue({ id: 1, length: 30 });
    mocks.create.mockResolvedValue({ uid: "created", secret: "internal" });
    mocks.booking.mockResolvedValue({ uid: "created", status: "ACCEPTED" });
    const response = await client.callTool({
      name: "create_booking",
      arguments: {
        eventTypeId: 1,
        start: "2030-01-01T10:00:00Z",
        timeZone: "UTC",
        name: "Guest",
        email: "guest@example.test",
        skipAvailabilityCheck: true,
      },
    });
    expect(response.isError).not.toBe(true);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      bookingMeta: { userId: 7 },
      bookingData: { end: "2030-01-01T10:30:00.000Z", responses: { email: "guest@example.test" } },
    });
    expect(mocks.create.mock.calls[0][0].bookingMeta.skipAvailabilityCheck).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain("internal");
  });
});
