# Tracking categories / departments / projects

**Status:** Missing
**Category:** Data model

## What this is

A flexible dimensional tagging system on `JournalLine`, `InvoiceLine`, and `BillLine` for analytics that don't belong in the chart of accounts — typical Xero-style "tracking categories".

## Current state

- `JournalLine` only has `contactId` as an extra dimension ([prisma/schema.prisma:262](../../../prisma/schema.prisma#L262)).
- No project/department/cost-centre column anywhere.

## Why it's needed

- Without tracking, every analytical cut (per project, per location, per team) requires adding GL accounts — which bloats the COA.
- Standard requirement for any business larger than a sole trader.

## Recommended approach

```prisma
model TrackingCategory {
  id      String
  orgId   String
  name    String   // e.g. "Project", "Department"
  options TrackingOption[]
}
model TrackingOption {
  id          String
  categoryId  String
  name        String
}
// FK columns on lines:
journal_line.tracking_option_1_id
journal_line.tracking_option_2_id
```

## Implementation notes

- Limit to 2 categories per org (Xero precedent) to keep reports manageable.
- Report drill-down should pivot by tracking option.

## Related

- [Reporting periods](reporting-periods.md), [Caching layer](../architecture/caching-layer.md)
