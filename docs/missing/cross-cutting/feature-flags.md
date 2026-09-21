# Feature flags

**Status:** Missing
**Category:** Cross-cutting

## What this is

Runtime toggles to gate features per org, per user, or per cohort — for staged rollouts, kill switches, and beta programs.

## Current state

- No GrowthBook / LaunchDarkly / Unleash / Statsig integration.
- `Organization.multicurrencyEnabled` is the only flag and it's a hard boolean ([prisma/schema.prisma:103](../../../prisma/schema.prisma#L103)).

## Why it's needed

- New accounting features (especially anything touching the ledger) must be rolled out behind a flag with a clear off-switch.
- Lets accountants/beta-orgs preview features before everyone.

## Recommended approach

- PostHog feature flags (free up to a generous tier) — pairs with the analytics decision.
- Define flags in code (typed enum) and resolve on the server with org + user context.
- Cache flag evaluations per request.

## Implementation notes

- Avoid letting flags accumulate forever — track an "owner" and "expiry date" per flag.
- For ledger-affecting features, the flag must be checked at _posting time_, not just UI display.

## Related

- [Analytics](analytics.md), [Observability](observability.md), [Service / domain layer](../architecture/service-domain-layer.md)
