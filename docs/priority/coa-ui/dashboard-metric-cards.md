# Dashboard metric cards should be clickable

**Audit priority:** Medium (UX)
**Section:** Chart of Accounts — UI

## What the auditor saw

The COA dashboard shows four metric cards: `TOTAL ACCOUNTS · 29`, `ACTIVE ASSETS · 12`, `LIABILITIES · 3`, `TAX MAPPING · Ready`. The numbers are aggregates only — nothing happens when you click them.

## The auditor's recommendation

> Each Dashboard Metric/Info card should act as an entry point to a detailed breakdown view (e.g., a list, table, or modal) showing the records that contribute to that metric.

Example given: clicking "Active Assets" should drill into the list of asset accounts that make up that count.

## What to do

- Wrap each card in a link / button.
- On click, route to the filtered COA list view (e.g. `/accounting/chart-of-accounts?type=asset&active=true` for Active Assets).
- Reuse the existing list filter state so it pre-applies the matching filter.
- `TAX MAPPING · Ready` could open a modal listing accounts without a tax code set, or routing to the Taxes settings page.

## Implementation notes

- Card → URL with query-string filters; the list view already supports filtering.
- Add a hover affordance (cursor pointer, subtle background) so users discover it's interactive.
- Keyboard-accessible: button or anchor, not a `div onClick`.

## Related

- [Data filtering layout](data-filtering-layout.md) — pairs naturally: card click sets a filter, the badge on the filter button shows which one is active.
