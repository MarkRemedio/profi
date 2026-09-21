# Payroll has no GL integration

**Audit priority:** High
**Section:** Module integration with the COA

## What the auditor saw

In the module-verification table:

| Module    | Verification                              |
|-----------|-------------------------------------------|
| Payroll   | **No Integration at all (Module not working)** |

Payroll exists as a UI area but does not affect the ledger.

## Current state in the codebase

- Schema present: `PayrollSettings`, `Employee`, `PayrollSchedule`, `PayrollRun`, `PayrollRunEmployee`, `Timesheet`, `TimesheetEntry` in [prisma/schema.prisma](../../../prisma/schema.prisma).
- UI present: [components/payroll/run-payroll-view.tsx](../../../components/payroll/run-payroll-view.tsx) computes payslips client-side.
- **No journal is posted** when a `PayrollRun` is approved. Wages, PAYE/NI, employer NI, pension liabilities never reach the ledger.
- No HMRC RTI / FPS submission. See [Missing — HMRC PAYE RTI](../../missing/compliance/hmrc-paye-rti.md).

## Why this matters

- P&L and Balance Sheet are wrong every pay period (payroll expense missing, liabilities missing).
- VAT and corporation tax computations downstream are wrong.
- The business owner can't see true cash position because the upcoming net-pay disbursement isn't accrued.

## Posting rules a payroll run should generate

For each pay period, one journal:

| DR / CR | Account                          | Notes                          |
|---------|----------------------------------|--------------------------------|
| DR      | Wages & Salaries expense         | gross pay                      |
| DR      | Employer NI expense              |                                |
| DR      | Employer pension expense         |                                |
| CR      | PAYE liability                   | owed to HMRC                   |
| CR      | Employee NI liability            | owed to HMRC                   |
| CR      | Employer NI liability            | owed to HMRC                   |
| CR      | Pension liability                | owed to pension provider       |
| CR      | Net pay payable                  | owed to employees              |

When the net pay is later paid from the bank: `DR Net pay payable / CR bank`.
When HMRC is paid: `DR PAYE/NI liability / CR bank`.

## What to do

1. Add a Server Action `postPayrollRun(runId)` that builds the journal above from `PayrollRunEmployee` totals.
2. Block re-posting (idempotent) and add a reversal path for corrected runs.
3. Persist the link `PayrollRun.postedJournalId` (mirror the pattern from `Invoice.postedJournalId`).
4. UI: show "Posted to ledger" status on the payroll run.

## Implementation notes

- Use HMRC's published NI / PAYE tables — do not roll your own calc.
- Pension contributions must respect each employee's pension scheme settings.
- A failed RTI submission should not prevent the journal from being posted (or vice versa — decide policy).

## Related

- [Missing — HMRC PAYE RTI / FPS](../../missing/compliance/hmrc-paye-rti.md) — the external submission side.
- [Missing — Payments model](../../missing/data-models/payments.md) — net-pay disbursement is a payment.
- [Missing — Reporting periods](../../missing/data-models/reporting-periods.md) — payroll period must lock once posted.
