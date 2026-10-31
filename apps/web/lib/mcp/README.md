# Cal.diy MCP

`Claude / Codex → /api/mcp → Cal.diy booking services`

The endpoint uses stateless Streamable HTTP with JSON responses. Enable it with
`MCP_ENABLED=true`. GET/SSE streams and session deletion are not supported.

## Authentication

The existing standard OIDC provider is reused through `OIDC_LOGIN_ENABLED` and
`OIDC_ISSUER`. No proxy or second login service is required. Clients discover the
provider through `/.well-known/oauth-protected-resource/api/mcp` and the endpoint's
401 challenge. Configure an API resource in the identity provider with the exact
public `/api/mcp` URL and permission `cal:mcp`, and grant that permission to the
intended OAuth clients. Use authorization code with PKCE and the resource parameter.

Access tokens must have the configured issuer, resource audience, `cal:mcp` scope,
valid signature, subject, and expiration. The subject must match an existing
Cal.diy OIDC account; email alone never grants access. Locked users are rejected.
Website login tokens with a different audience cannot authorize MCP requests.
Personal Cal.diy API keys are also supported as Bearer tokens; expired and team
keys are rejected. Keep keys in client secret storage, never in URLs or source.

For this deployment the URL is `https://cal.nmc-atelier.com/api/mcp`, the issuer is
`https://id.nmc-atelier.com`, and the requested scope is `cal:mcp`. In Claude, add a
custom remote connector using that URL and Claude's published OAuth identity.
Codex supports remote HTTP MCP and either CIMD or an explicitly registered public
OAuth client. Register its loopback callback with Pocket ID and grant the API
permission before connecting. Do not reuse the website's confidential OAuth client.

The deployed Codex public client is `a61fbea4-d9d2-4eeb-b1be-5597cf4c14af`:

```sh
codex mcp add cal-diy --url https://cal.nmc-atelier.com/api/mcp \
  --oauth-client-id a61fbea4-d9d2-4eeb-b1be-5597cf4c14af \
  --oauth-resource https://cal.nmc-atelier.com/api/mcp
codex mcp login cal-diy --scopes cal:mcp
```

Its registered callbacks are `http://127.0.0.1/callback` and
`http://127.0.0.1/callback/LFJskw3Ix0RZ`; Pocket ID permits ephemeral loopback ports.
No client secret is required. Claude uses its existing published identity.

## Tools

- `list_event_types`: personal event types associated with the authenticated user,
  with locations and booking questions; pages contain at most 100 results.
- `list_bookings`: bookings hosted by the user, filtered by start time, with UID
  pagination and at most 100 results per page.
- `get_availability`: existing availability service, maximum 31-day range.
- `create_booking`: existing regular booking service, using the event type's
  default duration and required booking responses.
- `reschedule_booking`: existing rescheduling service; preserves responses and
  duration. Recurring bookings and deleted event types must use the website.
- `cancel_booking`: existing cancellation service, requiring a reason.

Booking changes send the normal calendar updates, notifications, and webhooks.
Tool annotations identify those side effects; client confirmation is the MCP
client's responsibility. Team event creation, payment completion, recurring
creation, and variable-duration selection are outside this first scope.
WebMCP browser integration is separate and is not included in this endpoint.

## Verification and rollback

```sh
TZ=UTC yarn test apps/web/lib/mcp/mcp.test.ts apps/web/lib/mcp/oidc.test.ts
NODE_OPTIONS=--max-old-space-size=8192 yarn type-check:ci --force
yarn biome check apps/web/lib/mcp apps/web/app/api/mcp apps/web/app/.well-known/oauth-protected-resource/api/mcp
```

Tests cover signed-token validation, linked-account ownership, protocol
initialization, bounded availability, and booking-service delegation with mocked
data. They do not establish successful calendar or email delivery.

Retain the previous image and database backup before rollout. Verify public
metadata, unauthenticated rejection, authenticated tools and reads, and a designated
test booking lifecycle before claiming end-to-end success. Setting
`MCP_ENABLED=false` and redeploying disables the endpoint. Revert the MCP commits
to roll back code; no schema migration is required.
