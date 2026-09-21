# HMRC PAYE RTI / FPS

**Status:** Stub
**Category:** Compliance

## What this is

Real-Time Information submissions to HMRC every pay period: Full Payment Submission (FPS) on or before payday, Employer Payment Summary (EPS) monthly, plus year-end and CIS where applicable.

## Current state

- Payroll tables exist: see migration [prisma/migrations/20260514000000_payroll_tables](../../../prisma/migrations/20260514000000_payroll_tables/) and `PayrollRun`, `Employee` in [prisma/schema.prisma](../../../prisma/schema.prisma).
- [components/payroll/run-payroll-view.tsx](../../../components/payroll/run-payroll-view.tsx) calculates payslips locally.
- No HMRC submission, no NI calculation engine that matches HMRC's published algorithm, no GL posting of payroll.

## Why it's needed

- Statutory: missing or late FPS attracts penalties from HMRC.
- Payroll figures (gross, PAYE, NI, employer NI, pension) must hit the ledger.

## Recommended approach

- HMRC's PAYE RTI is XML/SOAP-style (older than MTD); use a vetted library or build a thin wrapper.
- Run FPS via a job, gated by `PayrollRun.status = APPROVED`.
- After successful FPS, post the payroll journal: gross wages expense, employer NI expense, PAYE/NI/pension liabilities, net pay payable.

## Implementation notes

- Don't roll your own tax-code/NI calc — use HMRC's published tables.
- Persist the FPS XML and receipt against the `PayrollRun`.

## Related

- [CIS filing](cis-filing.md), [Reporting periods](../data-models/reporting-periods.md), [Background jobs](../architecture/background-jobs.md)
