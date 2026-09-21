# Product analytics

**Status:** Missing
**Category:** Cross-cutting

## What this is

Event tracking for product decisions: which features are used, where users drop off, which onboarding steps stall.

## Current state

- No PostHog, Amplitude, Mixpanel, or Segment.
- No event taxonomy.

## Why it's needed

- Cannot answer "how many orgs have posted their first invoice?" or "what % use the VAT module?".
- Activation and retention metrics drive product priorities.

## Recommended approach

- PostHog (self-host or cloud) — covers events + feature flags + session replay in one tool.
- Define an event taxonomy first: `invoice_posted`, `bill_paid`, `vat_return_submitted`, `bank_reconciled`.
- Send from both client and server (server-side for trust-worthy financial-action counts).

## Implementation notes

- Hash user IDs; do not send PII as event properties.
- Track per-org cohort (size, plan) so funnels can be segmented.
- Honour the user's "do not track" preference.

## Related

- [Feature flags](feature-flags.md), [Observability](observability.md), [GDPR](gdpr.md)
