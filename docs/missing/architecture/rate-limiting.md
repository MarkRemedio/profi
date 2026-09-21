# Rate limiting / WAF

**Status:** Missing
**Category:** Architecture / Backend

## What this is

Per-IP, per-user, and per-tenant request throttling, plus a basic Web Application Firewall for the Next.js surface.

## Current state

- No rate-limit middleware in [proxy.ts](../../../proxy.ts) (Supabase session refresh only).
- Server Actions and (future) HTTP API have no abuse protection.
- Login endpoints have no brute-force backoff beyond Supabase defaults.

## Why it's needed

- A finance product is a high-value target for credential stuffing and scraping.
- HMRC / Stripe webhooks need replay/timing protection.
- Cost control: report endpoints can be heavy and need a ceiling per tenant.

## Recommended approach

- Use `@upstash/ratelimit` with sliding-window keys: `ip`, `userId`, `orgId:endpoint`.
- Add bot detection via Vercel Firewall or Cloudflare in front of the app.
- Stricter limits on `/login`, `/api/v1/*`, and any export endpoints.

## Implementation notes

- Apply inside [proxy.ts](../../../proxy.ts) (Next.js middleware) so it covers both pages and actions.
- Return `429` with `Retry-After`; log the violation for review.

## Related

- [HTTP API layer](http-api-layer.md), [MFA / SSO](../cross-cutting/mfa-sso.md), [Observability](../cross-cutting/observability.md)
