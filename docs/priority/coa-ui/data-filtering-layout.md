# Data filter bar is dense — collapse behind a Filter button

**Audit priority:** Low (UX polish)
**Section:** Chart of Accounts — UI

## What the auditor saw

The current filter bar on the COA list has a row of dropdowns: search · `Current liability` · `All tax codes` · `All statuses` · `Type` · Non-zero · Clear. Visually dense and uses a lot of header width.

## The auditor's recommendation

Replace the row with a single **Filter** icon button that opens a collapsible container / popover containing the same selectors. Add a **badge** on the button when filters are active, e.g. `Filters · 2`, so users don't forget why their list is filtered.

## What to do

- Build a `<FilterPopover>` containing search + the existing selectors.
- Show a small count badge derived from how many non-default filters are set.
- Persist filter state in the URL query string so back/forward and shareable links still work.
- Keep "Clear all" inside the popover.

## Implementation notes

- Existing shadcn primitives (`Popover`, `Button`, `Badge`) cover this.
- Keep the search input visible outside the popover (most common action), only collapse the structured filters.

## Related

- [Dashboard metric cards](dashboard-metric-cards.md) — should set these filters on click.
