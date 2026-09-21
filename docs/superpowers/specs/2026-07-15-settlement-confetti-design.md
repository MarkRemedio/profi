# Settlement Confetti — Design

**Date:** 2026-07-15
**Status:** Approved, ready for implementation plan

## Summary

Fire a short confetti burst when an invoice is **fully settled** — that is, when a
payment takes its outstanding balance to zero. Partial payments, money-out flows,
and batches that only part-pay do not celebrate.

## Motivation

`components/ui/confetti.tsx` and the `canvas-confetti` dependency (^1.9.4, plus
`@types/canvas-confetti`) are already installed but wired to nothing. The goal is
to mark the moment a debt actually closes — the real win in a receivables
workflow.

## Scope

### Fires

| Path | Condition |
| --- | --- |
| Single payment — `components/sales/view-invoice-dialog.tsx` | The payment clears the balance (`amountMinor >= balanceMinor`) |
| Bulk mark-paid — `components/sales/invoices.tsx` | Every row in the batch came back `paid` **and** `settled` |

### Does not fire

- **Partial payments** (e.g. £50 against a £5,000 invoice) — the debt is still open.
- **Batches with any skip or failure** — the sheet stays open for review; that is not a celebration moment.
- **Sales receipts** (`sales-receipts.tsx`) — always paid in full, but money at the till is a different feeling from a debt closing. Excluded by decision, trivially addable later.
- **Refund receipts** (`refund-receipts.tsx`) — money out.
- **Bill payments / expense claims** (`components/purchases/*`) — money out.

### Rationale for "settled only"

This is an accounting product. A bookkeeper reconciling forty invoices would see
forty bursts, and confetti that fires constantly stops meaning anything — it
becomes latency with glitter. Tying it to settlement keeps it rare enough to
retain meaning and safe to show in front of a client.

## Key constraint: `status: "paid"` does not mean "settled"

`runBulkInvoicePayments` (`lib/accounting/documents.ts` ~L2384) returns
`status: "paid"` for **any** successful payment. The guard at ~L2369 only rejects
amounts *greater* than the outstanding balance, so a partial payment returns
`"paid"`. The bulk sheet permits partials: `bulk-mark-paid-sheet.tsx` L172 treats
a row as valid when `amountMinor > 0 && amountMinor <= balanceMinor`.

Celebrating on the existing bulk-success branch would therefore fire on a batch of
partial payments, violating the scope above. A dedicated settled signal is required.

## Design

### 1. Server: add `settled` to `BulkPayResult` (chosen approach)

`runBulkInvoicePayments` already computes `outstanding` (~L2359) and `amount`
(~L2368). Add:

```ts
results.push({
  invoiceId: item.invoiceId,
  status: "paid",
  settled: amount === outstanding,
  journalId: r.journalId ?? undefined,
});
```

And extend the type (`lib/accounting/documents.ts` ~L2300):

```ts
export type BulkPayResult = {
  invoiceId: string;
  status: "paid" | "skipped" | "failed";
  settled?: boolean;   // true when this payment cleared the balance
  reason?: string;
  journalId?: string;
};
```

**Why server-side:** the server's `paidMap` is the authoritative balance at payment
time. A client-side computation would trust a possibly-stale `amountPaidMinor` and
drift under concurrent payments. Considered and rejected: computing in
`invoices.tsx` from the pre-payment `invoices` closure snapshot (no backend change,
but fuzzy).

`settled` is optional so existing consumers are unaffected.

### 2. Helper: `lib/celebrate.ts`

```ts
import confetti from "canvas-confetti";

/** Short brand-coloured burst under the top-center toast. No-op for
 *  reduced-motion users. Fire-and-forget: never blocks or gates anything. */
export function celebrateSettlement() {
  confetti({
    particleCount: 60,
    spread: 70,
    startVelocity: 35,
    ticks: 120,
    origin: { x: 0.5, y: 0.2 },
    colors: ["#2563eb", "#f97316", "#10b981"],
    disableForReducedMotion: true,
  });
}
```

A plain module, not a component — deliberately. Both call sites unmount on success
(the invoice dialog closes 500ms after full payment, `view-invoice-dialog.tsx`
L169; the bulk sheet closes on full success), so a ref-based `<canvas>` rendered
inside either would be destroyed mid-animation. The global `confetti()` appends its
own canvas to `document.body` and survives — the same pattern `ConfettiButton`
already uses (`components/ui/confetti.tsx` L127).

**`components/ui/confetti.tsx` is intentionally left untouched and remains unused.**
Whether to keep or delete it is a separate decision.

Visual: modest burst, top-center, origin `y: 0.2` so it reads as tied to the toast
(`<Toaster position="top-center" />`, `app/layout.tsx` L38). Colours are the
existing brand tokens — invoice blue `#2563eb`, accent orange `#f97316`, success
emerald `#10b981`.

### 3. Wiring

**`view-invoice-dialog.tsx`** — inside the existing settled branch, before the close:

```ts
if (amountMinor >= balanceMinor) {
  celebrateSettlement();
  setTimeout(() => onOpenChange(false), 500);
}
```

**`invoices.tsx`** — in the existing `unresolved === 0` branch:

```ts
if (res.every((r) => r.status === "paid" && r.settled)) celebrateSettlement();
```

Only reached when the whole batch succeeded, so it composes with the existing
success toast and sheet-close without restructuring them.

## Accessibility

`disableForReducedMotion: true` makes the burst a no-op under
`prefers-reduced-motion: reduce`. Nothing in the codebase respects reduced motion
today, so this is the first instance; if more motion is added later, it is worth
extracting a shared helper.

## Error handling

Fire-and-forget and non-blocking. It never gates the toast, the sheet close, or the
ledger write. If confetti throws, the payment has still succeeded and the toast
still shows — the celebration is decorative and must never be able to mask or
delay a financial outcome.

## Testing

Out of scope for this change per project cadence (implement first, one consolidated
testing pass at the end). The requirement most worth covering in that later pass:
**a partial payment must not celebrate.**

## Files touched

| File | Change |
| --- | --- |
| `lib/accounting/documents.ts` | Add `settled` to `BulkPayResult` type and to the `"paid"` result |
| `lib/celebrate.ts` | New — `celebrateSettlement()` |
| `components/sales/view-invoice-dialog.tsx` | Call in the existing settled branch |
| `components/sales/invoices.tsx` | Call in the `unresolved === 0` branch, gated on all-settled |
