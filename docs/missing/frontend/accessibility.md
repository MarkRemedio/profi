# Accessibility testing

**Status:** Missing
**Category:** Frontend

## What this is

Automated and manual accessibility checks: axe-core in tests, keyboard-only navigation review, screen-reader testing of core flows.

## Current state

- No `@axe-core/playwright` or `jest-axe` in `package.json`.
- No ARIA review pass on custom components in [components/](../../../components/).
- shadcn primitives are mostly accessible by default but composites need review.

## Why it's needed

- Accounting work is repetitive — keyboard usability is a major productivity factor.
- Many users have visual impairments; numeric data needs proper labelling.
- Public-sector / enterprise customers ask about WCAG 2.1 AA compliance.

## Recommended approach

- Add axe checks to Playwright E2E specs.
- Lint pass: `eslint-plugin-jsx-a11y` (likely already pulled in by `eslint-config-next`).
- Manual checks: tab through invoice creation; ensure `aria-live` for posting status.

## Implementation notes

- Money inputs need `aria-label` describing currency.
- Tables of journal lines must have proper `<th scope>` and column headers.

## Related

- [E2E](../devops/e2e.md), [Storybook](storybook.md), [Form layer](form-layer.md)
