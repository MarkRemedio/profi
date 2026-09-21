# POS sales / tills / shifts

**Status:** Missing
**Category:** Data model

## What this is

Models specific to point-of-sale operations: tills (registers), shifts (cash-in/cash-out per session), POS sales (different from accounting invoices), tenders, and end-of-day reconciliation.

## Current state

- All POS components in [components/pos/](../../../components/pos/) are mock-data only — see [components/pos/terminal.tsx](../../../components/pos/terminal.tsx), [components/pos/transactions.tsx](../../../components/pos/transactions.tsx), [components/pos/reconciliation.tsx](../../../components/pos/reconciliation.tsx).
- No `PosSale`, `PosTender`, `Till`, `Shift`, or `EndOfDayReconciliation` model.

## Why it's needed

- POS volume is high and per-line; merging into the main `Invoice` table is wrong (different lifecycle, no contact required, immediate settlement).
- Each shift opens with a float and closes with cash-counted vs. expected.

## Recommended approach

```prisma
model Till { id, orgId, name, defaultCashAccountId }
model Shift {
  id, tillId, openedByUserId, openedAt, closedAt,
  openingFloatMinor BigInt,
  countedClosingMinor BigInt?,
  status            // open | closed | reconciled
}
model PosSale {
  id, orgId, shiftId, soldAt, contactId?, totalMinor, taxMinor,
  journalId String,   // GL impact at sale time
  lines     PosSaleLine[]
  tenders   PosTender[]   // cash / card / wallet split
}
```

## Implementation notes

- Each `PosSale` posts immediately on commit: `DR cash/card-clearing / CR sales / CR VAT (+ COGS/inventory)`.
- Shift close posts an over/short adjustment if counted != expected.

## Related

- [Inventory](inventory.md), [POS UI stub](../ui-stubs/pos.md), [Payments](payments.md)
