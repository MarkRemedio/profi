# CIS filing

**Status:** Stub
**Category:** Compliance

## What this is

Construction Industry Scheme monthly returns to HMRC: subcontractor verifications, deduction statements, and the CIS300 monthly return.

## Current state

- [components/taxes/cis-view.tsx](../../../components/taxes/cis-view.tsx) is a UI placeholder.
- No subcontractor model, no verification cache, no deduction calculation.
- No CIS300 submission integration.

## Why it's needed

- Mandatory monthly filing for contractors in construction.
- Wrong deduction rates trigger HMRC penalties.

## Recommended approach

- Extend `Contact` with a `cisStatus` block (UTR, verification number, deduction rate).
- Verification API: call HMRC monthly per subcontractor; cache the result.
- On bill payment to a CIS subcontractor: split payment into net + CIS deduction journal.
- CIS300 background job aggregates monthly and submits.

## Implementation notes

- CIS deductions apply only to labour, not materials — bill lines need a "subject to CIS" flag.
- Issue payment & deduction statement (PDF) to subcontractors each month.

## Related

- [HMRC PAYE RTI](hmrc-paye-rti.md), [PDF generation](../architecture/pdf-generation.md), [Email service](../architecture/email-service.md)
