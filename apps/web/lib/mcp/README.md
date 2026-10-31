# Cal.diy MCP backend (draft)

The proposed deployment is:

`Claude / Codex → Pocket ID OIDC proxy → /api/mcp → Cal.diy booking services`

This branch implements the backend only. The proxy, Pocket ID client, production
configuration, client login verification, and WebMCP integration are not implemented.

## Backend

`POST /api/mcp` uses stateless Streamable HTTP with JSON responses. It is disabled
unless `MCP_ENABLED=true`. Requests require an existing personal Cal.diy API key in
the `Authorization: Bearer …` header. Expired keys, locked users, and team keys are
rejected. GET/SSE streams and session deletion are not supported.

The endpoint exposes:

- `list_event_types`: personal event types associated with the key owner, with
  locations and booking questions; pages contain at most 100 results.
- `list_bookings`: bookings hosted by the key owner, filtered by start time, with
  UID pagination and at most 100 results per page.
- `get_availability`: existing availability service, with a maximum 31-day range.
- `create_booking`: existing regular booking service, using the event type's
  default duration and required booking responses.
- `reschedule_booking`: existing rescheduling service; preserves responses and
  duration. Recurring bookings and deleted event types must use the website.
- `cancel_booking`: existing cancellation service, requiring a reason.

Booking changes send the normal calendar updates, notifications, and webhooks.
Tool annotations and descriptions identify those side effects; client confirmation
is the MCP client's responsibility. Team event creation is outside this first scope.
Payment completion, recurring creation, and variable-duration selection are not
provided as tools. Booking services remain responsible for their ordinary validation.

The proxy must keep the backend API key server-side, use a dedicated key, and permit
only the corresponding Pocket ID identity. A single backend key does not provide
per-user impersonation. Do not forward browser cookies or arbitrary incoming
authorization headers to the backend. Prefer private-network access to the backend.

## Verification and rollout

Before enabling production, run the focused tests and repository type check:

```sh
TZ=UTC yarn test apps/web/lib/mcp/mcp.test.ts
yarn type-check:ci --force
yarn biome check apps/web/lib/mcp apps/web/app/api/mcp apps/web/package.json
```

The focused tests exercise authentication, protocol initialization, ownership
boundaries, bounded availability, and booking-service delegation with mocked data.
They do not establish successful calendar or email delivery.

Rollout must provision the OIDC proxy, persist its encrypted OAuth storage, register
its callback with Pocket ID, and verify login from both intended clients. Record the
previous image and take a database backup before deploying. Verify unauthenticated
rejection, discovery, authenticated tool listing and reads, and an explicitly
designated test booking's create/reschedule/cancel lifecycle before claiming the
integration works end to end. `MCP_ENABLED=false` disables the backend as a kill switch.
