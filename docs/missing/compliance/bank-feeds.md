# Bank feeds (Plaid / TrueLayer / GoCardless)

**Status:** Partial (delegated to Django)
**Category:** Compliance / Integration

## What this is

Live bank account connections that push transactions into the system daily so the user doesn't have to upload CSV statements.

## Current state

- Banking + statement import live in the Django service ([lib/django/banking.ts](../../../lib/django/banking.ts)).
- Project memory: `/backend/` Django is **out of scope** for the Next-side accounting work.
- No native Next-side feed integration; no `BankFeedConnection` model in Prisma.

## Why it's needed

- Manual CSV import is friction and a top reason users leave one accounting tool for another.
- Reconciliation UX depends on transactions arriving automatically and quickly.

## Recommended approach

Two options aligned with the [bank models decision](../data-models/bank-models.md):

1. Keep feeds inside Django, but mirror connection + last-sync metadata in Prisma so the Next UI can show health.
2. Move feeds into the Next side using TrueLayer (UK), GoCardless Bank Account Data (formerly Nordigen, EU), or Plaid (US).

## Implementation notes

- Open Banking consent expires every ~90 days — need a re-consent reminder flow.
- Persist webhook events from the provider before any sync work.
- Reconciliation rules engine (auto-match by amount + reference + date window) is the next layer up.

## Related

- [Bank models](../data-models/bank-models.md), [Webhooks](../architecture/webhooks.md), [Background jobs](../architecture/background-jobs.md), [Notifications](../cross-cutting/notifications.md)
