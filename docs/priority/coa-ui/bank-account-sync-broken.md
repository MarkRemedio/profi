# Bank Account add throws errors / does not sync to COA

**Audit priority:** **P0 — top priority** (auditor's words: "This is very important. Let's make sure this is on top priority.")
**Section:** Chart of Accounts — UI / Bank integration

## What the auditor saw

Adding a bank account from the Banking tab throws errors. Screenshots show two failures inside the "Add Bank Account" modal:

- "You must be signed in to access this resource."
- "Failed to fetch"

The auditor's expectation: once a bank account is created, it should automatically appear in the Chart of Accounts.

## Why this matters

- Without a working bank-account add flow, the rest of banking (transactions, reconciliation, payment posting) cannot be tested or used.
- The COA → bank linkage is what lets invoice/bill payments post to a specific bank ledger account.

## Likely root cause

Banking is served by the separate Django service via [lib/django/client.ts](../../../lib/django/client.ts). The "must be signed in" error is the Django client failing to attach the Supabase JWT — the session lookup in `djangoFetch()` returns no `access_token`.

Possible contributors:

- Supabase session not present in the server context where the modal posts from.
- `NEXT_PUBLIC_DJANGO_API_URL` mis-set or Django not running locally on the auditor's machine.
- Django CORS / auth middleware rejecting the token format.

## What to do

1. Reproduce in dev with browser devtools open — inspect the network call to the Django endpoint and confirm the `Authorization: Bearer ...` header is present.
2. If header is missing, fix the client-side session retrieval in [lib/django/client.ts](../../../lib/django/client.ts) (likely the `createClient()` server-vs-client confusion).
3. If header is present but rejected, look at Django logs.
4. Once the add works, wire the success path to also surface the new bank account in the Chart of Accounts list (currently the COA reads from Prisma only).

## Related

- [docs/missing/data-models/bank-models.md](../../missing/data-models/bank-models.md) — the underlying architectural decision (mirror Django state into Prisma, or move banking into Prisma).
- [Add Bank Account button on the COA page](add-bank-account-button.md) — the convenience UX once this works.
- [Bank Transactions module untestable](../module-integration/bank-transactions-untestable.md) — same root dependency.
