# Bills default to draft — drafts are invisible in reports

**Audit priority:** Medium
**Section:** Ledger correctness / posting

## What the auditor saw

The Add Bill modal defaults `Status = Draft`. During testing the auditor saved a bill expecting it to post; nothing appeared in any report. From the audit:

> When the invoice was saved as a draft instead of being posted, it did not appear in the accounting records, which can easily lead to missing entries and confusion in reporting if a user forgets to post it.

> Current results after testing posted entries are correct across all reports: Profit and Loss, Balance Sheet, Trial Balance, and General Ledger are all working as expected. The issue only appears when documents remain in draft status, which bypasses the accounting entries entirely.

## The auditor's recommendation

Enable **auto-post on create**, or at least a clear default setting, so all financial documents are consistently reflected without relying on the user to remember.

## My calibration

Draft-first is the conventional design across Xero / FreeAgent / QuickBooks. The hidden assumption is "drafts should be visible somewhere even if not in the ledger." The right fix is **not** to default to posting — it's to make drafts *discoverable* and remove the surprise.

## Proposed solution (combines both views)

1. Keep `BillStatus = DRAFT` as the default. Reason: irreversibility of posting; mistakes cost reversal journals.
2. Add a per-org setting: **Auto-approve bills on create** (default off, surfaced in Org settings). Power users can opt in.
3. Make drafts visible:
   - Dashboard banner: "You have 4 draft bills not in your reports. [Review]".
   - Bills list default filter should show drafts mixed with approved (with badge), not hide them.
4. Add a daily reminder notification when drafts older than 7 days exist (see [Missing — Notifications](../../missing/cross-cutting/notifications.md)).
5. On bill save with `Draft`, surface inline: "Saved as draft. This will not appear in reports until approved."

## What to do

- Server: support the per-org "auto-approve" setting; if on, the create Server Action immediately calls the approve+post path.
- Client: add the inline draft-warning message and the dashboard banner.
- Settings UI: a single toggle under Org settings → Accounting.

## Related

- [Bill payment traceability](bill-payment-traceability.md) — the next step after a bill is posted.
- [Missing — Notifications](../../missing/cross-cutting/notifications.md) — driver of the draft reminder.
- [Reactive creation guide](../coa-ui/reactive-creation-guide.md) — same "show the user what will happen" philosophy.
