# Storybook / design-system docs

**Status:** Missing
**Category:** Frontend

## What this is

A component catalogue for the design system (shadcn-based) and for domain components (`<InvoiceForm>`, `<JournalLineTable>`, `<MoneyInput>`, email templates).

## Current state

- shadcn/ui under [components/ui/](../../../components/ui/) but no Storybook.
- No visual review on PRs.
- New devs have no map of available components and must read sources.

## Why it's needed

- A11y and visual regressions slip into PRs without visual review.
- Components with many states (loading, empty, error, with/without permissions) need a visible matrix.
- Email and PDF templates especially benefit from isolated preview.

## Recommended approach

- Storybook 8 with the Next.js framework adapter.
- Stories per component covering empty / loading / error / typical states.
- Add Chromatic (or storybook-test-runner) in CI to catch visual diffs.

## Implementation notes

- Skip Storybook for whole pages — keep it for reusable UI and domain components.
- Mock TanStack Query in story decorators.

## Related

- [Accessibility](accessibility.md), [Email service](../architecture/email-service.md), [PDF generation](../architecture/pdf-generation.md)
