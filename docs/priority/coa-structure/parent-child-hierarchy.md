# Parent / child account hierarchy (Phase 2)

**Audit priority:** Phase 2 (auditor explicitly defers this)
**Section:** Chart of Accounts — code structure

## What the auditor saw

The current COA is a flat list. The auditor proposes a QuickBooks-style parent/child structure where sub-accounts inherit category, tax, and reporting rules from a parent.

Quoted from the audit, on the QuickBooks "New account" modal:

> Make this a subaccount → Parent account: [picker]

Example:
- `SJ NEW ACCOUNT` (parent · Cost of sales)
  - `SJ 2ND ACCOUNT` (sub-account · Cost of sales)

## The auditor's reasoning

- Nested accounts inherit reporting/validation rules automatically.
- Reports stay tidy: roll up to parent, drill down to children.
- Scales as the business grows without a flat 200-row ledger.

The auditor recommends doing this in **Phase 2** because it requires code restructuring.

## What it implies for the schema

Add to `ChartAccount` in [prisma/schema.prisma](../../../prisma/schema.prisma):

```prisma
parentAccountId String?  @map("parent_account_id") @db.Uuid
parentAccount   ChartAccount?  @relation("AccountHierarchy", fields: [parentAccountId], references: [id])
children        ChartAccount[] @relation("AccountHierarchy")
```

Plus constraints:

- A child's `accountType` and `reportCategory` must match the parent's.
- No multi-level nesting initially (one level deep, like QuickBooks default) to keep reports manageable.
- Deleting/archiving a parent with children should require archiving the children first.

## Report changes

- P&L and Balance Sheet must collapse children into the parent row by default, with an expand-to-detail control.
- Trial Balance: keep one row per account (parent and children), but indent children.

## What to do (when Phase 2 starts)

1. Schema migration: add `parent_account_id` nullable + index.
2. Update report queries to roll up by parent.
3. Form changes: "Make this a sub-account" toggle + parent picker scoped to same `accountType`.
4. Importer: support an optional `parent_code` column.

## Implementation notes

- Cycles must be prevented (a parent can't be its own descendant).
- Reorder children with a `sort_order` column to keep report layout stable.

## Related

- [Standardised numeric ranges](standardised-numeric-ranges.md) — children typically take codes within the parent's range (parent 6000, children 6001–6009).
