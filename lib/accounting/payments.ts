import "server-only";
import { JournalStatus } from "@prisma/client";
import type { DbOrTx } from "@/lib/prisma";

/**
 * How much of each document has been settled, in the workspace's currency.
 *
 * Measured from the receivable or payable relieved, not from the cash moved.
 * For a foreign document those differ: the payment journal debits the bank at
 * the settlement rate, credits the receivable at the rate the invoice was
 * raised at, and books the difference to foreign exchange. Summing every debit
 * therefore gave the cash figure on a gain and the receivable figure on a loss
 * — two different measures depending on which way rates had moved.
 *
 * The control-account side is the right one: it is always the document's own
 * value at its own rate, so dividing by that rate returns the amount in the
 * currency the customer actually paid in.
 *
 * Excludes payments that have a POSTED reversal.
 * sourceType is e.g. "invoice_payment" or "bill_payment".
 */
export async function getAmountPaidMap(
  db: DbOrTx,
  organizationId: string,
  sourceType: string,
  /**
   * Receivable (invoices) or payable (bills). When omitted the old behaviour
   * of summing debits is kept, which is correct for single-currency data.
   */
  controlAccountId?: string
): Promise<Map<string, bigint>> {
  const paymentJournals = await db.journal.findMany({
    where: { organizationId, sourceType, status: JournalStatus.POSTED },
    select: {
      id: true,
      sourceId: true,
      lines: { select: { debitMinor: true, creditMinor: true, accountId: true } },
    },
  });
  const paymentIds = paymentJournals.map((j) => j.id);
  const reversals = paymentIds.length
    ? await db.journal.findMany({
        where: { organizationId, reversedJournalId: { in: paymentIds }, status: JournalStatus.POSTED },
        select: { reversedJournalId: true },
      })
    : [];
  const reversedSet = new Set(reversals.map((r) => r.reversedJournalId));
  const map = new Map<string, bigint>();
  for (const j of paymentJournals) {
    if (!j.sourceId || reversedSet.has(j.id)) continue;
    const paid = controlAccountId
      ? j.lines
          .filter((l) => l.accountId === controlAccountId)
          // One side is always zero, so adding both yields the movement
          // whichever direction the control account was relieved in.
          .reduce(
            (sum, l) => sum + BigInt(l.debitMinor.toString()) + BigInt(l.creditMinor.toString()),
            BigInt(0)
          )
      : j.lines.reduce((sum, l) => sum + BigInt(l.debitMinor.toString()), BigInt(0));
    map.set(j.sourceId, (map.get(j.sourceId) ?? BigInt(0)) + paid);
  }
  return map;
}

export type PaymentAccountDetail = {
  accountCode: string;
  accountName: string;
  amountMinor: bigint;
  paidAt: string; // ISO date (yyyy-mm-dd)
};

/**
 * Per source document, the POSTED payments with the account the money moved
 * through (the debit side — the bank/deposit account for invoice payments),
 * excluding payments that have a POSTED reversal. Ordered oldest first.
 */
export async function getPaymentDetailsMap(
  db: DbOrTx,
  organizationId: string,
  sourceType: string
): Promise<Map<string, PaymentAccountDetail[]>> {
  const paymentJournals = await db.journal.findMany({
    where: { organizationId, sourceType, status: JournalStatus.POSTED },
    orderBy: { journalDate: "asc" },
    select: {
      id: true,
      sourceId: true,
      journalDate: true,
      lines: {
        select: {
          debitMinor: true,
          account: { select: { code: true, name: true } },
        },
      },
    },
  });
  const paymentIds = paymentJournals.map((j) => j.id);
  const reversals = paymentIds.length
    ? await db.journal.findMany({
        where: { organizationId, reversedJournalId: { in: paymentIds }, status: JournalStatus.POSTED },
        select: { reversedJournalId: true },
      })
    : [];
  const reversedSet = new Set(reversals.map((r) => r.reversedJournalId));
  const map = new Map<string, PaymentAccountDetail[]>();
  for (const j of paymentJournals) {
    if (!j.sourceId || reversedSet.has(j.id)) continue;
    for (const line of j.lines) {
      const amountMinor = BigInt(line.debitMinor.toString());
      if (amountMinor <= BigInt(0)) continue;
      const details = map.get(j.sourceId) ?? [];
      details.push({
        accountCode: line.account?.code ?? "----",
        accountName: line.account?.name ?? "Unknown account",
        amountMinor,
        paidAt: j.journalDate.toISOString().slice(0, 10),
      });
      map.set(j.sourceId, details);
    }
  }
  return map;
}
