# API versioning

**Status:** Missing
**Category:** DevOps / Quality

## What this is

A versioning strategy for the (future) public HTTP API so external consumers don't break when internals change.

## Current state

- No public API yet — see [HTTP API layer](../architecture/http-api-layer.md).
- Server Actions are versioned implicitly with the app build (no external consumers).

## Why it's needed

- Once external integrations exist, breaking changes have an external cost.
- Webhook payload formats need the same discipline.

## Recommended approach

- URL-segment version: `/api/v1/...`.
- Deprecation policy: announce 6 months in advance; keep the previous major for 12 months after a new major.
- `Sunset` and `Deprecation` headers on responses for endpoints scheduled for removal.
- Same versioning for outbound webhooks (`event.version: "1.0"`).

## Implementation notes

- Generate the OpenAPI spec from zod schemas so the contract is single-sourced.
- Contract tests against the live spec on every PR.

## Related

- [HTTP API layer](../architecture/http-api-layer.md), [Webhooks](../architecture/webhooks.md), [Shared validation](../frontend/shared-validation.md)
