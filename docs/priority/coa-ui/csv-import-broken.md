# CSV import for Chart of Accounts silently rejects valid-looking files

**Audit priority:** High
**Section:** Chart of Accounts — UI

## What the auditor saw

The auditor followed the instructions in the import dialog ("Headers: code, name, account_type, report_category, description, tax_code, tax_rate, is_active") and uploaded the following CSV:

```csv
code,name,account_type,report_category,Description,tax_code,tax_rate,is_active
2001,SJ CSV,Revenue,,TEST CSV UPLOAD,No Vat,,
```

The file was not accepted. No row-level explanation of why.

## What is actually wrong with that CSV

`report_category` is empty. In [prisma/schema.prisma](../../../prisma/schema.prisma) the `AccountReportCategory` column on `chart_of_accounts` has **no default** — it is required. So the row is correctly rejected, but the user cannot tell that from the UI.

Header `Description` is capitalised; depending on the parser it may or may not match `description`.

`tax_rate` and `is_active` are also empty; whether they have defaults depends on parser behaviour.

## The auditor's recommendation

The audit calls for:

1. A **downloadable CSV template** with example rows.
2. **Field rules** documented in-product (which columns are required, allowed values, format).
3. **Common validation rules** listed up front (account_type must be one of …, report_category must match the account_type, code must be unique, etc.).
4. **Error feedback per row** — tell the user *which line failed and why*, not a blanket "not accepted".
5. A short **"How to upload"** guide linked from the dialog.

Quote from the audit: "if you expect users to follow a structure, you must teach the structure inside the product."

## What to do

- Replace the silent reject with a row-by-row validation pass; show successful + failed rows in a preview before commit.
- Add a "Download template" link on the dialog itself.
- Auto-fill `report_category` when the user-supplied combination of `account_type` is unambiguous (e.g. `Revenue` → `sales`) and warn rather than reject if multiple categories are valid.
- Link to a short MD/HTML guide describing each column.

## Related

- [Missing — Shared validation (zod)](../../missing/frontend/shared-validation.md) — the parser should use the same zod schema as the create-account form.
- [Standardised numeric ranges](../coa-structure/standardised-numeric-ranges.md) — if ranges are enforced, the importer should validate ranges too.
