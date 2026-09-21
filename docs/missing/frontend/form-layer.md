# Form layer (react-hook-form)

**Status:** Missing
**Category:** Frontend

## What this is

A consistent forms layer with validation, field-level errors, dirty/touched state, and async submission handling.

## Current state

- No `react-hook-form` (or alternative) in `package.json`.
- Forms are raw `useState` per field — see [components/sales/add-invoice-dialog.tsx](../../../components/sales/add-invoice-dialog.tsx), [components/sales/add-customer-dialog.tsx](../../../components/sales/add-customer-dialog.tsx).
- Validation, where it exists, runs only at submit.

## Why it's needed

- Accounting forms are complex (line items, taxes, accounts) — manual `useState` doesn't scale.
- Server-side validation errors need to map back to specific fields cleanly.
- Inconsistent forms become inconsistent UX.

## Recommended approach

- `react-hook-form` + `@hookform/resolvers/zod`.
- Share the zod schema between Server Action input validation and the client form — see [shared validation](shared-validation.md).
- Build a few generic field components (`<MoneyInput>`, `<AccountPicker>`, `<TaxRatePicker>`) to enforce consistency.

## Implementation notes

- `useFormState`/`useActionState` from React 19 pairs well with Server Actions for inline error display.
- For invoice line tables, use `useFieldArray`.

## Related

- [Shared validation](shared-validation.md), [Service / domain layer](../architecture/service-domain-layer.md), [Error boundaries](error-boundaries.md)
