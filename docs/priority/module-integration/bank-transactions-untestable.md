# Bank Transactions module untestable

**Audit priority:** High (blocks reconciliation testing)
**Section:** Module integration with the COA

## What the auditor saw

In the module-verification table:

| Module             | Verification                              |
|--------------------|-------------------------------------------|
| Bank Transactions  | **Can't be tested at all. (Module Not working)** |

The auditor could not exercise the module end-to-end.

## Current state in the codebase

- Banking is served by the separate Django service via [lib/django/client.ts](../../../lib/django/client.ts) and [lib/django/banking.ts](../../../lib/django/banking.ts).
- The Next route [app/banking/transactions/page.tsx](../../../app/banking/transactions/page.tsx) renders [components/banking/transactions-view.tsx](../../../components/banking/transactions-view.tsx) which calls Django.
- Adding a bank account currently fails (see [Bank account sync broken](../coa-ui/bank-account-sync-broken.md)) — without bank accounts there are no transactions to view.
- Memory: `/backend/` Django is out of scope for the Next/Prisma accounting work.

## Why this matters

- Bank reconciliation is one of the headline features expected of any accounting product. If it cannot be exercised, the whole banking promise is unverified.
- Reconciliation interacts with the Payments gap ([payments-module-missing](payments-module-missing.md)) and the bank source tracking gap ([invoice-payment-bank-source-tracking](../ledger-correctness/invoice-payment-bank-source-tracking.md)).

## What to do — short term

1. Fix the upstream sign-in / fetch error in the Add Bank Account modal first.
2. Confirm the Django service is reachable in the relevant environment (`NEXT_PUBLIC_DJANGO_API_URL`, CORS, auth).
3. Once a bank account exists, exercise: import statement → list transactions → match candidate journals → reconcile.

## What to do — medium term

Make a decision (see [Missing — Bank models](../../missing/data-models/bank-models.md)):

- mirror Django state into Prisma, or
- absorb the banking module into Prisma and deprecate the Django service.

Either way, the Next side must own the FK from `JournalLine` to a bank account for reconciliation queries to be performant.

## Related

- [Bank account sync broken](../coa-ui/bank-account-sync-broken.md) — prerequisite.
- [Missing — Bank models](../../missing/data-models/bank-models.md).
- [Missing — Bank feeds](../../missing/compliance/bank-feeds.md).
