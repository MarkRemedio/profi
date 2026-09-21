# Invoice payment — no bank account source tracking

**Audit priority:** High
**Section:** Ledger correctness / posting

## What the auditor saw

> On the Balance Sheet, the Bank Current Account is showing the correct increase, but there is no visibility or linkage to the actual source bank or payment channel. Right now, it only shows that money entered the bank account, but we cannot trace which bank it came from or how it was received, which is a serious issue for audit and reconciliation.

The "Record Payment" UI on the invoice detail only takes an amount — no mode-of-payment or bank-account selector.

## The auditor's recommendation

> When a user records a payment for an invoice, there should be an option to select the mode of payment, including the specific bank account the payment is coming from and will be routed to.

Benefits cited:

- Proper fund tracing per bank account.
- Stronger reconciliation: every payment has a source and destination.
- Audit accuracy.
- Cash-flow per bank visible.

## Current state in the codebase

- `Invoice` has no payment FK at all. Payments are posted as one-off journals.
- No `Payment` / `PaymentAllocation` model — see [payments module missing](../module-integration/payments-module-missing.md).
- Generic "Bank Current Account" used everywhere instead of a specific bank.

## What to do

1. Introduce the [Payment model](../module-integration/payments-module-missing.md) (`Payment.bankAccountId`, `Payment.paymentMethod`).
2. Update the "Record Payment" modal on the invoice page:
   - **Payment method:** Bank transfer · Card · Cash · Cheque · Other.
   - **Bank account:** drop-down of the org's bank accounts (those `ChartAccount` rows whose `reportCategory = BANK`).
   - **Reference / memo:** free text for matching to a bank-transaction.
3. Posting becomes specific:
   - `DR <selected bank account> / CR Accounts Receivable` (sub-ledger: this invoice).
4. Reconciliation: the bank-transaction match search now has bank account + amount + date + reference to work with.

## Implementation notes

- Default the bank-account selector to the org's primary bank to keep the common case one-click.
- If multi-currency is on, validate that the bank account currency matches the invoice currency (or perform a recorded FX conversion).
- Store the `paymentMethod` even if it isn't strictly required for accounting — it's gold dust for AR reporting.

## Related

- [Payments module missing](../module-integration/payments-module-missing.md) — the model.
- [Bank account sync broken](../coa-ui/bank-account-sync-broken.md) — until bank accounts exist on the Prisma side this selector is empty.
- [Invoice status / outstanding](invoice-status-outstanding-display.md) — driven by the same payment rows.
