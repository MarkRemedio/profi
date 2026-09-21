"use server";

import { revalidatePath } from "next/cache";

import {
  approveInvoice,
  getDocumentOptions,
  listInvoices,
  markInvoiceSent,
  saveInvoiceDraft,
  saveInvoiceDraftBatch,
  voidInvoice,
  payInvoice,
  revertInvoiceToDraft,
  runBulkInvoicePayments,
  type DocumentDraftInput,
  type PaymentMethod,
  type BulkPayResult,
} from "@/lib/accounting/documents";
import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";
import {
  saveDocumentTemplate,
  listDocumentTemplates,
  getDocumentTemplate,
  deleteDocumentTemplate,
  type SaveTemplateInput,
} from "@/lib/accounting/templates";
import { ensureShippingAccount } from "@/lib/accounting/chart-accounts";
import { listChargeItems } from "@/lib/accounting/charge-items";
import { listInvoiceTrackingSettings } from "@/lib/accounting/tracking";
import type { InvoiceBatchCreateResult } from "@/lib/accounting/invoice-batch";

function revalidateInvoiceViews() {
  revalidatePath("/sales");
  revalidatePath("/sales/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/accounting/journals");
  revalidatePath("/taxes");
}

export async function ensureInvoiceShippingAccount() {
  const workspace = await requireAccountantRole();
  const account = await ensureShippingAccount(prisma, workspace.organizationId, "income");
  revalidateInvoiceViews();
  return account;
}

export async function getInvoiceWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [invoices, options, chargeItems, trackingSettings] = await Promise.all([
    listInvoices(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
    listChargeItems(prisma, workspace.organizationId),
    listInvoiceTrackingSettings(prisma, workspace.organizationId),
  ]);

  return {
    invoices,
    // Only active catalogue entries are offered on a new invoice; archived
    // ones stay resolvable on documents that already carry them.
    chargeItems: chargeItems.filter((item) => item.isActive),
    contacts: options.contacts.filter((contact) =>
      ["customer", "both"].includes(contact.contactType)
    ),
    accounts: options.accounts.filter((account) =>
      ["sales", "other_income"].includes(account.reportCategory)
    ),
    // Deposit targets for cash sales and payment recording. Must mirror the
    // server-side check in resolveDepositAccount (documents.ts): active
    // BANK-category accounts only, which excludes AR/VAT control accounts
    // and non-liquid assets by construction.
    bankAccounts: options.accounts.filter(
      (account) => account.reportCategory === "bank"
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
    trackingSettings,
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function saveInvoice(input: DocumentDraftInput) {
  const workspace = await requireAccountantRole();
  
  // FIX: If ID is an empty string, strip it so Prisma knows it is a brand-new invoice!
  const sanitizedInput = { ...input };
  if (sanitizedInput.id === "") {
    delete sanitizedInput.id;
  }

  const id = await saveInvoiceDraft(
    prisma,
    workspace.organizationId,
    workspace.userId,
    sanitizedInput
  );
  revalidateInvoiceViews();
  return id;
}

export type BulkApproveResult = {
  invoiceId: string;
  invoiceNo: string;
  status: "approved" | "skipped" | "failed";
  reason?: string;
};

/**
 * Approve and post many invoices in one pass.
 *
 * Modelled on the bulk payment path: each invoice is approved in its own
 * transaction, so one failure never rolls back the others. Approving posts a
 * journal, so a batch that aborted halfway would leave the ledger with some
 * invoices posted and some not, and no record of which — worse than approving
 * them one at a time.
 *
 * Anything not a draft is skipped rather than failed: selecting fifty invoices
 * of which forty are already approved is a normal thing to do, not an error.
 */
export async function bulkApproveInvoices(
  invoiceIds: string[]
): Promise<BulkApproveResult[]> {
  const workspace = await requireAccountantRole();

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, organizationId: workspace.organizationId },
    select: { id: true, invoiceNo: true, status: true, totalMinor: true },
  });
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const results: BulkApproveResult[] = [];

  for (const invoiceId of invoiceIds) {
    const invoice = byId.get(invoiceId);
    if (!invoice) {
      results.push({ invoiceId, invoiceNo: invoiceId.slice(0, 8), status: "skipped", reason: "No longer on your records" });
      continue;
    }
    if (invoice.status !== "DRAFT") {
      results.push({
        invoiceId,
        invoiceNo: invoice.invoiceNo,
        status: "skipped",
        reason: `Already ${String(invoice.status).toLowerCase()}`,
      });
      continue;
    }
    // A zero-value invoice posts a zero journal, which the ledger rejects.
    if (Number(invoice.totalMinor) <= 0) {
      results.push({
        invoiceId,
        invoiceNo: invoice.invoiceNo,
        status: "failed",
        reason: "Nothing to post — the invoice totals zero",
      });
      continue;
    }

    try {
      await approveInvoice(prisma, workspace.organizationId, workspace.userId, invoiceId);
      results.push({ invoiceId, invoiceNo: invoice.invoiceNo, status: "approved" });
    } catch (error) {
      results.push({
        invoiceId,
        invoiceNo: invoice.invoiceNo,
        status: "failed",
        reason: (error as Error).message || "Could not be posted",
      });
    }
  }

  revalidateInvoiceViews();
  return results;
}

export async function approveInvoiceDocument(
  invoiceId: string, 
  targetStatus?: "approved" | "sent",
  isCashSale: boolean = false,            // <-- NEW
  depositAccountId?: string | null        // <-- NEW
) {
  const workspace = await requireAccountantRole();
  const result = await approveInvoice(
    prisma,
    workspace.organizationId,
    workspace.userId,
    invoiceId,
    isCashSale,                           // <-- PASS TO DB
    depositAccountId                      // <-- PASS TO DB
  );

  // If they clicked "Approve & mark sent", flip the status *and* record an audit event.
  if (targetStatus === "sent") {
    await markInvoiceSent(prisma, workspace.organizationId, workspace.userId, invoiceId);
  }

  revalidateInvoiceViews();
  return result;
}

/**
 * Marks an already-approved invoice as sent, with the same audit event the
 * approve-and-mark-sent path records. The create view calls this only AFTER
 * the email actually went out — the books must never say "sent" about an
 * email that never left.
 */
export async function markInvoiceSentDocument(invoiceId: string) {
  const workspace = await requireAccountantRole();
  await markInvoiceSent(prisma, workspace.organizationId, workspace.userId, invoiceId);
  revalidateInvoiceViews();
  return { success: true };
}

export async function voidInvoiceDocument(invoiceId: string) {
  const workspace = await requireAccountantRole();
  const result = await voidInvoice(
    prisma,
    workspace.organizationId,
    workspace.userId,
    invoiceId
  );
  revalidateInvoiceViews();
  return result;
}

export async function payInvoiceDocument(
  invoiceId: string,
  amountMinor?: number,
  depositAccountId?: string,
  paymentMethod?: PaymentMethod
) {
  const workspace = await requireAccountantRole();
  // Clamp to the allowed enum so an unexpected value stores NULL rather than
  // hitting the DB CHECK constraint with a raw, unfriendly error.
  const method =
    paymentMethod && (["cash", "cheque", "bank_transfer"] as const).includes(paymentMethod)
      ? paymentMethod
      : undefined;
  const result = await payInvoice(
    prisma,
    workspace.organizationId,
    workspace.userId,
    invoiceId,
    amountMinor ? BigInt(amountMinor) : undefined,
    depositAccountId,
    method
  );
  revalidateInvoiceViews();
  return result;
}

// NOTE: do not re-export types from this file. It carries "use server", so Next
// registers every export as a Server Function — a type-only export erases at
// compile time and then throws "X is not defined" at runtime. Client components
// import BulkPayResult straight from @/lib/accounting/documents instead.

export async function bulkPayInvoices(
  items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
  paymentMethod?: PaymentMethod
): Promise<BulkPayResult[]> {
  const workspace = await requireAccountantRole();
  const results = await runBulkInvoicePayments(
    prisma,
    workspace.organizationId,
    workspace.userId,
    items,
    paymentMethod
  );
  revalidateInvoiceViews();
  return results;
}

export async function revertInvoiceDocument(invoiceId: string) {
  const workspace = await requireAccountantRole();
  const result = await revertInvoiceToDraft(
    prisma,
    workspace.organizationId,
    workspace.userId,
    invoiceId
  );
  revalidateInvoiceViews();
  return result;
}

export async function saveInvoiceTemplate(input: Omit<SaveTemplateInput, "kind">) {
  const workspace = await requireAccountantRole();
  return saveDocumentTemplate(prisma, workspace.organizationId, workspace.userId, { ...input, kind: "invoice" });
}

export async function listInvoiceTemplates() {
  const workspace = await requireAccountantRole();
  return listDocumentTemplates(prisma, workspace.organizationId, "invoice");
}

export async function getInvoiceTemplate(id: string) {
  const workspace = await requireAccountantRole();
  return getDocumentTemplate(prisma, workspace.organizationId, id);
}

export async function deleteInvoiceTemplate(id: string) {
  const workspace = await requireAccountantRole();
  await deleteDocumentTemplate(prisma, workspace.organizationId, id);
  return { success: true };
}

/** Create independently-owned drafts from one customer batch. */
export async function createInvoiceBatch(
  rows: Array<{ rowId: string; input: DocumentDraftInput }>
): Promise<InvoiceBatchCreateResult[]> {
  const workspace = await requireAccountantRole();
  const results = await saveInvoiceDraftBatch(
    prisma,
    workspace.organizationId,
    workspace.userId,
    rows
  );

  revalidateInvoiceViews();
  return results;
}
