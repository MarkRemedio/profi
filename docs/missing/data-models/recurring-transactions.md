# Recurring invoices / journals

**Status:** Missing
**Category:** Data model

## What this is

Templates that automatically generate invoices, bills, or manual journals on a schedule (weekly rent, monthly subscription billing, accruals, prepayments).

## Current state

- `Journal.autoReversalDate` exists ([prisma/schema.prisma:236](../../../prisma/schema.prisma#L236)) for one-shot auto-reversals, but no recurring schedule.
- No `RecurringInvoice` or `RecurringBill` model.
- No scheduler to fire them.

## Why it's needed

- Subscription-model businesses raise the same invoice every month.
- Accruals and prepayments are commonly modelled as recurring journals.

## Recommended approach

```prisma
model RecurringInvoiceTemplate {
  id            String
  orgId         String
  contactId     String
  cadence       Cadence   // monthly | weekly | quarterly | annual
  nextRunDate   Date
  endDate       Date?
  template      Json      // line items, accounts, tax codes
  active        Boolean
}
```

- A daily job iterates `nextRunDate <= today` rows and generates a draft invoice (or auto-approves based on a flag), then bumps `nextRunDate`.

## Implementation notes

- Idempotency: store the run date on the generated invoice; skip if a doc already exists for that template+date.
- Keep templates editable but versioned so historic generation is auditable.

## Related

- [Background jobs](../architecture/background-jobs.md), [Service / domain layer](../architecture/service-domain-layer.md)
