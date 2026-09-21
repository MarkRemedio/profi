# Email service

**Status:** Missing
**Category:** Architecture / Backend

## What this is

A transactional email integration for sending invoices, payment receipts, payslips, statement emails, password reset, and tenant invites.

## Current state

- No email provider integration in `package.json`.
- `InvoiceStatus.SENT` exists in [prisma/schema.prisma](../../../prisma/schema.prisma) but transitioning to "sent" only changes the row — no email is actually dispatched.
- Supabase handles auth emails only.

## Why it's needed

- "Send invoice" is a primary action in any accounting product.
- Statements, dunning, payroll payslip delivery all depend on email.

## Recommended approach

- Resend (simplest TS API) or Postmark for deliverability.
- Templates with React Email so they can be previewed in Storybook.
- Send via the [job queue](background-jobs.md), never inline with a Server Action.

## Implementation notes

- Persist every send in an `EmailMessage` table (recipient, template, ref to source `Invoice`/`Bill`, status, provider message id).
- Treat bounces/complaints as webhooks back into the system.

## Related

- [Background jobs](background-jobs.md), [Webhooks](webhooks.md), [Notifications](../cross-cutting/notifications.md), [PDF generation](pdf-generation.md)
