# Test coverage

**Status:** Partial
**Category:** DevOps / Quality

## What this is

A real test suite covering the ledger, posting, reversal, period close, AR/AP, payroll, banking, and core flows.

## Current state

- Only three test files in [tests/](../../../tests/): `smoke.test.ts`, `period-close.test.ts`, `bill-discount.test.ts`.
- Vitest is configured ([vitest.config.ts](../../../vitest.config.ts)).
- No tests for invoice posting, payment allocation, manual journals, VAT figures, multi-currency, or POS.

## Why it's needed

- Accounting correctness regressions are catastrophic — silent ledger bugs erode trust.
- Refactors (especially around posting) cannot be safe without coverage.

## Recommended approach

- Layered:
  - Unit tests for `lib/accounting/money.ts`, posting helpers, FX, allocation.
  - Integration tests against a real Postgres (testcontainers or per-run Supabase project).
  - Property-based tests for double-entry: every posted journal balances.
- Coverage target by area, not overall %.

## Implementation notes

- Per existing memory pattern: integration tests should hit a real DB, not mocks.
- Run tests in CI (see [ci-cd.md](ci-cd.md)).

## Related

- [E2E](e2e.md), [CI/CD](ci-cd.md), [Service / domain layer](../architecture/service-domain-layer.md)
