# Notifications

**Status:** Missing
**Category:** Cross-cutting

## What this is

In-app notifications + email digests + (optionally) push, telling users about events that need their attention: bill due, invoice overdue, bank feed broken, VAT deadline.

## Current state

- Only Sonner toasts for in-page feedback.
- No persistent `Notification` model, no notification centre UI, no email digest job.

## Why it's needed

- Bookkeepers and owners are not in the app 24/7 — they need pings for time-critical things (VAT, payroll dates, overdue invoices).
- Bank feed disconnections are silent failures unless surfaced explicitly.

## Recommended approach

```prisma
model Notification {
  id        String
  orgId     String
  userId    String?    // null = broadcast to org
  type      String     // 'invoice_overdue', 'bank_feed_broken', etc.
  payload   Json
  readAt    DateTime?
  createdAt DateTime
}
```

- Producer side: domain events → notification rows.
- Delivery: in-app feed + daily/weekly email digest job + (later) push via web push.

## Implementation notes

- Allow user-level mute per notification type.
- Don't double-deliver if the user is actively in the app when the event fires.

## Related

- [Email service](../architecture/email-service.md), [Background jobs](../architecture/background-jobs.md), [Observability](observability.md)
