"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { loadCustomerStatementBundles } from "@/lib/accounting/customer-statement-loader";
import { computeCustomerStatement } from "@/lib/accounting/customer-statement";
import { listBills, type BillWithLines } from "@/lib/accounting/documents";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { formatMoney } from "@/lib/currency";
import { isMailConfigured, sendMail } from "@/lib/email/mailer";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import {
  arStatementEmailHtml,
  arStatementSubject,
  apRemittanceEmailHtml,
  apRemittanceSubject,
  type AgingEmailItem,
} from "@/lib/reports/aging-email";

type Fail = { success: false; error: string };
type Ok = { success: true; sentTo: string };

/**
 * The aging reports group by contact, so these take a contact id rather than
 * the display name the tables used to key on. A name is not a handle: two
 * customers can share one, and a name can never be resolved back to an email.
 */

function fail(error: string): Fail {
  return { success: false, error };
}

/** dd/mm/yyyy from an ISO date, matching how the reports read on screen. */
function ukDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

async function orgContext() {
  const workspace = await requireAccountingWorkspace();
  const org = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { name: true, baseCurrency: true },
  });
  return {
    organizationId: workspace.organizationId,
    orgName: org?.name || "Your Company",
    currency: org?.baseCurrency ?? "GBP", // currency:allow last-resort default
  };
}

/**
 * Emails a customer their outstanding balance from the aged receivables report.
 *
 * Every figure is recomputed here from the ledger rather than accepted from the
 * browser. The client already holds the same numbers, but this is a demand for
 * payment leaving the business — it is not something to render from whatever
 * the page happened to be holding.
 */
export async function emailArStatement(contactId: string): Promise<Ok | Fail> {
  try {
    if (!contactId) return fail("This customer has no contact record to email.");

    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so statements cannot be sent.");
    }

    const { organizationId, orgName, currency } = await orgContext();

    const bundles = await loadCustomerStatementBundles(prisma, organizationId);
    // Only the caller's own customers are in the bundle, so a miss is both
    // "not found" and the cross-organisation guard.
    const bundle = bundles.find((entry) => entry.customer.id === contactId);
    if (!bundle) return fail("That customer is no longer on your records.");

    const email = bundle.customer.email?.trim();
    if (!email) {
      return fail(`${bundle.customer.name} has no email address on file. Add one in Sales → Customers.`);
    }

    const asOfDate = accountingToday();
    const statement = computeCustomerStatement({
      invoices: bundle.invoices,
      documents: bundle.documents,
      params: { fromDate: null, toDate: null, asOfDate, currency },
    });

    if (statement.aging.total <= 0) {
      return fail(`${bundle.customer.name} has nothing outstanding, so there is nothing to chase.`);
    }

    const money = (minor: number) => formatMoney(minor, currency);

    const items: AgingEmailItem[] = statement.outstandingItems.map((item) => ({
      reference: item.invoiceNo,
      issueDate: ukDate(item.issueDate),
      dueDate: ukDate(item.dueDate),
      amount: money(item.outstandingMinor),
      overdue: item.daysOverdue > 0 ? `${item.daysOverdue} days overdue` : "",
    }));

    const html = arStatementEmailHtml({
      orgName,
      recipientName: bundle.customer.name,
      asOfDate: ukDate(asOfDate),
      totalOutstanding: money(statement.aging.total),
      buckets: [
        { label: "Not yet due", amount: money(statement.aging.current) },
        { label: "1 – 30 days overdue", amount: money(statement.aging.d1_30) },
        { label: "31 – 60 days overdue", amount: money(statement.aging.d31_60) },
        { label: "61 – 90 days overdue", amount: money(statement.aging.d61_90) },
        { label: "Over 90 days overdue", amount: money(statement.aging.d90plus) },
      ],
      items,
    });

    await sendMail({
      to: email,
      subject: arStatementSubject(orgName, money(statement.aging.total)),
      html,
      fromName: orgName,
    });

    return { success: true, sentTo: email };
  } catch (error) {
    console.error("Failed to email the customer statement", error);
    return fail("Could not send the statement. Check the mail settings and try again.");
  }
}

/**
 * Emails a supplier a summary of the bills still open with them, from the aged
 * payables report — the counterpart to the customer statement above.
 *
 * There is no supplier-statement module to lean on, so the open bills are read
 * here directly. Base amounts are used for the same reason the report does:
 * one figure per supplier means one currency.
 */
export async function emailApRemittance(contactId: string): Promise<Ok | Fail> {
  try {
    if (!contactId) return fail("This supplier has no contact record to email.");

    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so summaries cannot be sent.");
    }

    const { organizationId, orgName, currency } = await orgContext();

    // findFirst, not findUnique: Contact is org-scoped, and the tenancy layer
    // rejects unique-only lookups because it cannot inject organizationId.
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { id: true, ...CONTACT_NAME_SELECT, email: true },
    });
    if (!contact) return fail("That supplier is no longer on your records.");

    const supplierName = contactDisplayName(contact);
    const email = contact.email?.trim();
    if (!email) {
      return fail(`${supplierName} has no email address on file. Add one in Purchases → Suppliers.`);
    }

    // Read through the same DAL the report renders from, so the figures a
    // supplier receives cannot disagree with the ones on screen — including
    // the settled amount, which listBills now carries.
    // Cast for the same reason the statement loader does: listBills has no
    // declared return type, so it widens to unknown at the call site.
    const allBills = (await listBills(prisma, organizationId)) as BillWithLines[];
    const bills = allBills
      .filter(
        (bill) =>
          bill.contactId === contactId &&
          bill.status !== "draft" &&
          bill.status !== "void" &&
          bill.status !== "paid"
      )
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate));

    const asOfDate = accountingToday();
    const asOf = new Date(`${asOfDate}T00:00:00Z`);
    const money = (minor: number) => formatMoney(minor, currency);

    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
    const items: AgingEmailItem[] = [];

    for (const bill of bills) {
      const totalMinor = Number(bill.baseTotalMinor || bill.totalMinor || 0);
      // Base on both sides. Mixing the base total with a payment recorded in
      // the supplier's currency would put a wrong figure in front of them.
      const paidMinor = Number(bill.baseAmountPaidMinor ?? bill.amountPaidMinor ?? 0);
      const outstanding = totalMinor - paidMinor;
      if (outstanding <= 0) continue;

      const due = bill.dueDate ? new Date(`${bill.dueDate}T00:00:00Z`) : null;
      const daysOverdue = due
        ? Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / 86_400_000))
        : 0;

      if (daysOverdue <= 0) buckets.current += outstanding;
      else if (daysOverdue <= 30) buckets.d1_30 += outstanding;
      else if (daysOverdue <= 60) buckets.d31_60 += outstanding;
      else if (daysOverdue <= 90) buckets.d61_90 += outstanding;
      else buckets.d90plus += outstanding;
      buckets.total += outstanding;

      items.push({
        reference: bill.invoiceNo || "—",
        issueDate: ukDate(bill.issueDate),
        dueDate: ukDate(bill.dueDate),
        amount: money(outstanding),
        overdue: daysOverdue > 0 ? `${daysOverdue} days overdue` : "",
      });
    }

    if (buckets.total <= 0) {
      return fail(`Nothing is outstanding with ${supplierName}, so there is nothing to send.`);
    }

    const html = apRemittanceEmailHtml({
      orgName,
      recipientName: supplierName,
      asOfDate: ukDate(asOfDate),
      totalOutstanding: money(buckets.total),
      buckets: [
        { label: "Not yet due", amount: money(buckets.current) },
        { label: "1 – 30 days late", amount: money(buckets.d1_30) },
        { label: "31 – 60 days late", amount: money(buckets.d31_60) },
        { label: "61 – 90 days late", amount: money(buckets.d61_90) },
        { label: "Over 90 days late", amount: money(buckets.d90plus) },
      ],
      items,
      note: `Sent by ${orgName}. Reply to this email if this does not match your records.`,
    });

    await sendMail({
      to: email,
      subject: apRemittanceSubject(orgName, money(buckets.total)),
      html,
      fromName: orgName,
    });

    return { success: true, sentTo: email };
  } catch (error) {
    console.error("Failed to email the supplier summary", error);
    return fail("Could not send the summary. Check the mail settings and try again.");
  }
}
