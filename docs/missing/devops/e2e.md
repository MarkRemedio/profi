# E2E test framework

**Status:** Missing
**Category:** DevOps / Quality

## What this is

Browser-driven end-to-end tests of golden flows: sign-up, create invoice, post, mark paid, run report.

## Current state

- No Playwright or Cypress in `package.json`.
- No `e2e/` directory.

## Why it's needed

- Server Actions, RSC streaming, and TanStack Query cache interactions are tricky — they break in ways that unit tests can't catch.
- Multi-step financial flows (post → reverse → re-post) need full-stack validation.

## Recommended approach

- Playwright (best TS DX, multi-browser, trace viewer).
- Run against a seeded test org in a disposable Postgres.
- Cover ~10 critical flows, not exhaustive UI:
  - Auth + org creation
  - Invoice draft → approved → posted
  - Bill draft → approved → paid
  - Manual journal post + reverse
  - VAT return preview
  - Report load (P&L, balance sheet)

## Implementation notes

- Run on CI on every PR for the 10 critical flows; nightly for the full suite.
- Screenshots + traces on failure.

## Related

- [Tests](tests.md), [CI/CD](ci-cd.md), [Frontend error boundaries](../frontend/error-boundaries.md)
