import "server-only";

import type { ExtendedPrismaClient } from "@/lib/prisma";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";
import { listSalesReceipts, listRefundReceipts } from "@/lib/accounting/receipts";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import type {
  CustomerStatementBundle,
  StatementDoc,
  StatementInvoice,
} from "@/lib/accounting/customer-statement";

/**
 * Load every customer's statement raw data in a small fixed number of grouped
 * queries (not one per customer), then bucket it by contact. The pure
 * computeCustomerStatement() runs client-side against these bundles so date-range
 * and view changes are instant.
 */
export async function loadCustomerStatementBundles(
  prisma: ExtendedPrismaClient,
  organizationId: string
): Promise<CustomerStatementBundle[]> {
  const orgRow = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  const workspaceCurrency = orgRow?.baseCurrency ?? "GBP"; // currency:allow last-resort default

  const [contacts, invoices, salesReceipts, refundReceipts, creditNotes] = await Promise.all([
    prisma.contact.findMany({
      where: {
        organizationId,
        contactType: { in: ["CUSTOMER", "BOTH"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, ...CONTACT_NAME_SELECT, email: true, billingAddress: true },
    }),
    listInvoices(prisma, organizationId) as Promise<InvoiceWithLines[]>,
    listSalesReceipts(prisma, organizationId),
    listRefundReceipts(prisma, organizationId),
    // Credit notes stay informational until the credit-note rebuild lands, so we
    // only need the header (no lines / no journal). Void/cancelled are excluded.
    prisma.creditNote.findMany({
      where: { organizationId, status: { notIn: ["void", "cancelled"] } },
      select: { id: true, contactId: true, cnNo: true, date: true, totalMinor: true },
    }),
  ]);

  // --- Bucket each document type by contactId. ---
  const invoicesByContact = new Map<string, StatementInvoice[]>();
  for (const inv of invoices) {
    const mapped: StatementInvoice = {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      poNumber: inv.poNumber,
      reference: inv.reference,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      status: inv.status,
      currency: inv.currency,
      subtotalMinor: inv.subtotalMinor,
      taxMinor: inv.taxMinor,
      discountMinor: inv.discountMinor,
      totalMinor: inv.totalMinor,
      amountsAre: inv.amountsAre,
      payments: inv.payments.map((p) => ({
        amountMinor: p.amountMinor,
        paidAt: p.paidAt,
        accountName: p.accountName,
      })),
      lines: inv.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        subtotalMinor: line.subtotalMinor,
        taxCode: line.taxCode,
        taxRate: line.taxRate,
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
      })),
    };
    const list = invoicesByContact.get(inv.contactId) ?? [];
    list.push(mapped);
    invoicesByContact.set(inv.contactId, list);
  }

  const docsByContact = new Map<string, StatementDoc[]>();
  const pushDoc = (contactId: string, doc: StatementDoc) => {
    const list = docsByContact.get(contactId) ?? [];
    list.push(doc);
    docsByContact.set(contactId, list);
  };

  for (const sr of salesReceipts) {
    if (sr.status === "void") continue;
    pushDoc(sr.contactId, {
      id: sr.id,
      kind: "sales_receipt",
      docNo: sr.receiptNo,
      date: sr.receiptDate,
      totalMinor: sr.totalMinor,
      currency: sr.currency,
    });
  }
  for (const rr of refundReceipts) {
    if (rr.status === "void") continue;
    pushDoc(rr.contactId, {
      id: rr.id,
      kind: "refund_receipt",
      docNo: rr.receiptNo,
      date: rr.receiptDate,
      totalMinor: rr.totalMinor,
      currency: rr.currency,
    });
  }
  for (const cn of creditNotes) {
    pushDoc(cn.contactId, {
      id: cn.id,
      kind: "credit_note",
      docNo: cn.cnNo,
      date: cn.date.toISOString().slice(0, 10),
      totalMinor: Number(cn.totalMinor),
      // Credit notes carry no currency column of their own, so they take the
      // workspace's. Hardcoding GBP made them fail the statement's
      // mixed-currency guard in any other workspace and vanish from the run.
      currency: workspaceCurrency,
    });
  }

  return contacts.map((contact) => ({
    customer: {
      id: contact.id,
      name: contactDisplayName(contact),
      email: contact.email ?? null,
      billingAddress: contact.billingAddress ?? null,
    },
    invoices: invoicesByContact.get(contact.id) ?? [],
    documents: docsByContact.get(contact.id) ?? [],
  }));
}
