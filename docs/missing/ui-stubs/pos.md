# POS module — UI-only stub

**Status:** Stub
**Category:** UI awaiting backend

## What this is

The `/pos` area: terminal, inventory, customers, refunds, transactions, reconciliation, staff, timeclock, integrations, hardware, loyalty, offline, permissions.

## Current state

- All pages are present under [app/pos/](../../../app/pos/).
- All components in [components/pos/](../../../components/pos/) operate on mock data — see `mockProducts` in [components/pos/terminal.tsx:40](../../../components/pos/terminal.tsx#L40) and the `mock`-prefixed identifiers in `customers.tsx`, `inventory-manager.tsx`, `offline.tsx`, `refunds.tsx`, `stock.tsx`, `transactions.tsx`.
- Nothing posts to the ledger; cart state lives only in component state.

## Why this matters

- The UI is misleading: it looks finished, but no transaction ever leaves the browser.
- Each sale should produce a GL impact (`DR cash/card / CR sales / CR VAT [+ DR COGS / CR inventory]`).

## What's needed before this is real

- Models: [Inventory](../data-models/inventory.md) and [POS sales / tills / shifts](../data-models/pos-models.md).
- Wiring: a Server Action / API endpoint per cart commit that opens a `Shift`, writes the `PosSale`, posts the journal.
- Hardware: receipt printer + payment terminal integrations live behind feature flags.
- Offline: see [PWA / offline](../frontend/pwa-offline.md).

## Suggested cleanup before backend work

- Add a top-of-file `TODO(pos-backend)` comment in each component using mock data, so future devs don't ship the mocks accidentally.
- Hide the POS area behind a [feature flag](../cross-cutting/feature-flags.md) for new orgs until real.

## Related

- [Inventory](../data-models/inventory.md), [POS models](../data-models/pos-models.md), [PWA / offline](../frontend/pwa-offline.md)
