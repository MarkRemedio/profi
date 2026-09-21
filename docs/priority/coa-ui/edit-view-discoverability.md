# Edit / View discoverability — use natural click targets

**Audit priority:** Low–Medium (UX)
**Section:** Chart of Accounts — UI

## What the auditor saw

Each row in the COA list has a kebab (`⋮`) menu at the right edge with **View details** and **Edit account**. On narrower screens the column is hidden behind a horizontal scroll, so the actions are easy to miss.

## The auditor's recommendation

Use *natural click targets*:

- **Account Name** → hyperlink that opens **Edit account**.
- **MTD / YTD / Current Balance** figures → click to open **View transactions** for that account.
- Keep the kebab menu as well, so screen-reader and keyboard users still have a labelled menu.

## What to do

- Wrap the Name cell in a link (`<Link>` to the edit route or a dialog trigger).
- Wrap the balance figures in a button that opens the transactions drill-down.
- Keep keyboard semantics: an anchor for navigation, a button for in-page actions.
- Subtle visual hint on hover (underline on name, cursor pointer on balance).

## Implementation notes

- Don't remove the kebab — some users prefer the menu, and it remains the only place to surface destructive actions (Archive, Delete) without crowding the row.
- Make sure the row click-target does not also trigger row selection if there's a checkbox column.

## Related

- [Dashboard metric cards](dashboard-metric-cards.md) — same drill-down idea applied to the card-level metrics.
