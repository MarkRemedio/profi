import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Whether a workspace may still change its base currency.
 *
 * Amounts are stored as bare integers in minor units with no conversion. The
 * currency is only a label applied at the point of display, so changing it does
 * not convert anything: a workspace with £10,000 of history that switches to PHP
 * shows ₱10,000 — the same integer, relabelled, and worth roughly a seventieth
 * as much. Every report, VAT return and balance would be internally consistent
 * and completely wrong, with no error to warn anyone.
 *
 * Worse, documents keep the currency they were saved with, and the customer
 * statement refuses to sum mixed currencies. Existing invoices would quietly
 * disappear from statements rather than show a wrong total.
 *
 * So the currency is free to change while the books are empty — which covers the
 * real case of picking the wrong one at signup — and fixed once anything has
 * been recorded. Xero and QuickBooks both work this way.
 *
 * Unlocking would require converting every stored amount at a chosen rate and
 * posting the difference, which is a deliberate migration, not a settings toggle.
 */
export type CurrencyLock = {
  locked: boolean;
  /** Human-readable explanation, or null when still unlocked. */
  reason: string | null;
};

export async function getCurrencyLock(organizationId: string): Promise<CurrencyLock> {
  // Anything that carries an amount counts, not just posted journals: a draft
  // invoice already stores a currency, and relabelling it would drop it from
  // statements the moment the workspace currency moved on.
  const [postedJournals, invoices, bills, salesReceipts, refundReceipts, posSales] =
    await Promise.all([
      prisma.journal.count({ where: { organizationId, status: "POSTED" } }),
      prisma.invoice.count({ where: { organizationId } }),
      prisma.bill.count({ where: { organizationId } }),
      prisma.salesReceipt.count({ where: { organizationId } }),
      prisma.refundReceipt.count({ where: { organizationId } }),
      prisma.pos_sales.count({ where: { org_id: organizationId } }),
    ]);

  const found: string[] = [];
  if (postedJournals) found.push(`${postedJournals} posted journal${postedJournals === 1 ? "" : "s"}`);
  if (invoices) found.push(`${invoices} invoice${invoices === 1 ? "" : "s"}`);
  if (bills) found.push(`${bills} bill${bills === 1 ? "" : "s"}`);
  if (salesReceipts) found.push(`${salesReceipts} sales receipt${salesReceipts === 1 ? "" : "s"}`);
  if (refundReceipts) found.push(`${refundReceipts} refund receipt${refundReceipts === 1 ? "" : "s"}`);
  if (posSales) found.push(`${posSales} POS sale${posSales === 1 ? "" : "s"}`);

  if (found.length === 0) return { locked: false, reason: null };

  return {
    locked: true,
    reason:
      `This workspace already has ${found.join(", ")}. Changing the currency now would ` +
      `relabel those figures rather than convert them, so every historical total would be wrong.`,
  };
}
