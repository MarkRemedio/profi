# Missing Export option (CSV / Excel / PDF)

**Audit priority:** Medium
**Section:** Chart of Accounts — UI

## What the auditor saw

The COA page has Import but no Export. Users cannot download the chart of accounts in any format.

## The auditor's recommendation

> To improve data portability, I recommend adding an Export button to the interface. Providing downloads in CSV, Excel, and PDF formats ensures we meet different user requirements.

## What to do

- Add an **Export** button next to **Import** on the COA toolbar.
- Minimum: CSV using the same column order as the import format so round-tripping works.
- Excel (`.xlsx`) via SheetJS or similar.
- PDF: server-side render (see [docs/missing/architecture/pdf-generation.md](../../missing/architecture/pdf-generation.md)) using the same data.
- Apply current filters to the export — if the user has filtered to assets only, export only those.

## Implementation notes

- CSV first; Excel/PDF can ship in a follow-up.
- Server Action returns the CSV bytes; client downloads with `Blob`.
- File name: `chart-of-accounts_{org_slug}_{YYYY-MM-DD}.csv`.

## Related

- [CSV import broken](csv-import-broken.md) — export should produce the exact format the importer accepts.
- [Missing — PDF generation](../../missing/architecture/pdf-generation.md).
