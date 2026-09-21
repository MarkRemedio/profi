# Inventory / products / stock movements

**Status:** Missing
**Category:** Data model

## What this is

A product catalogue, stock-on-hand per location, and stock movement events with cost-accounting impact (COGS posting on sale).

## Current state

- POS UI uses hard-coded `mockProducts` in [components/pos/terminal.tsx:40](../../../components/pos/terminal.tsx#L40) and [components/pos/inventory-manager.tsx](../../../components/pos/inventory-manager.tsx).
- No `Product`, `StockLocation`, `StockMovement`, or `InventoryAdjustment` model in [prisma/schema.prisma](../../../prisma/schema.prisma).
- No COGS posting wiring even though `AccountReportCategory.COST_OF_SALES` exists.

## Why it's needed

- POS module currently can't actually sell anything; persistence layer is empty.
- Without stock movements, COGS and stock-on-hand are wrong in reports.

## Recommended approach

```prisma
model Product {
  id            String
  orgId         String
  sku           String
  name          String
  priceMinor    BigInt
  costMethod    CostMethod   // average | fifo
  taxCode       String
  revenueAccountId String
  cogsAccountId    String
  stockAccountId   String?   // null = non-stock item
  trackStock    Boolean
}
model StockMovement {
  id        String
  productId String
  locationId String
  type      MovementType  // receipt | sale | adjustment | transfer
  quantity  Decimal
  unitCostMinor BigInt
  sourceType String   // 'pos_sale' | 'bill' | 'manual'
  sourceId   String
  journalId  String?  // GL impact
}
```

## Implementation notes

- POS sale = `DR cash, CR sales, CR VAT` + `DR COGS, CR inventory`.
- Average-cost is simpler; FIFO needs a lot-tracking table.

## Related

- [POS models](pos-models.md), [Service / domain layer](../architecture/service-domain-layer.md), [POS UI stub](../ui-stubs/pos.md)
