# Expense Claims module not working

**Audit priority:** High (module broken)
**Section:** Module integration with the COA

## What the auditor saw

In the module-verification table:

| Module        | Verification                              |
|---------------|-------------------------------------------|
| Expenses      | **Expense Claims Module not working**     |

The module appears in the navigation but cannot be exercised end-to-end.

## Current state in the codebase

- Route exists: [app/purchases/expense-claims/](../../../app/purchases/expense-claims/).
- Component exists: [components/purchases/expense-claims.tsx](../../../components/purchases/expense-claims.tsx).
- No dedicated `ExpenseClaim` model in [prisma/schema.prisma](../../../prisma/schema.prisma); claims would need to flow through `Bill` or a new model.
- No Server Action / DAL for create/submit/approve/post flow.

## Why this matters

- Employees can't reimburse themselves through the system; finance has to fall back to manual journals.
- Without proper claim posting, the related expense isn't tied to a contact (employee) or to the bank/clearing account that pays them.

## What needs to be defined first

- **Storage model:** are expense claims a kind of bill (`Bill` rows with `contactType = EMPLOYEE`), or do they need their own model with multiple expense lines, attached receipts, status flow (`draft → submitted → approved → reimbursed`)?
- **Posting:** approved claim posts `DR expense / DR recoverable VAT / CR employee payable`; reimbursement posts `DR employee payable / CR bank`.
- **Attachments:** receipts must be attached — depends on [Missing — Attachments](../../missing/data-models/attachments.md).

## What to do

1. Decide model (bill-as-claim vs. new `ExpenseClaim` table).
2. Implement the create + submit + approve flow with a Server Action that posts journals on approval.
3. Wire reimbursement to a payment (depends on [Missing — Payments model](../../missing/data-models/payments.md)).
4. Surface in the UI: a manager-approval inbox and an employee-history view.

## Related

- [Missing — Payments model](../../missing/data-models/payments.md) — reimbursement is a payment.
- [Missing — Attachments](../../missing/data-models/attachments.md) — receipts.
- [Missing — RBAC](../../missing/cross-cutting/rbac.md) — manager approval permission.
