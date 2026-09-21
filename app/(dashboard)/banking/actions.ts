"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

import { requireAccountingWorkspace, requireAccountantRole } from "@/lib/accounting/dal";
import { MAX_STATEMENT_BYTES, STATEMENT_BUCKET } from "@/lib/banking/statement-storage";
import { prisma } from "@/lib/prisma";
import { AuditAction, BillStatus, ContactType, CurrencyCode, InvoiceStatus, JournalStatus } from "@prisma/client";
import { proposeBankDocument } from "@/lib/banking/ai-document-proposal";
import { saveInvoiceDraft, approveInvoice, saveBillDraft, approveBill, payBill } from "@/lib/accounting/documents";
import { createSalesReceipt } from "@/lib/accounting/receipts";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import { parseStatement, StatementParseError } from "@/lib/banking/statement-parser";
import {
  parseCsvTable,
  suggestMapping,
  type ColumnMapping,
  type RawCsvTable,
} from "@/lib/banking/column-mapping";
import * as dal from "@/lib/banking/dal";
import {
  disconnectTrueLayerBankFeed,
  listTrueLayerAvailableAccounts,
  completeTrueLayerAccountSelection,
  cancelTrueLayerAccountSelection,
  listTrueLayerBankFeedStatuses,
  syncTrueLayerBankFeed,
  setTrueLayerBankFeedSync,
} from "@/lib/banking/truelayer-connection";
import type {
  CreateBankAccountInput,
  UpdateBankAccountInput,
  ParsedTransaction,
} from "@/lib/banking/types";

function revalidateBanking() {
  revalidatePath("/banking");
  revalidatePath("/banking/transactions");
  revalidatePath("/banking/statements");
}

// --- reads ---
export async function listBankAccounts() {
  const ws = await requireAccountingWorkspace();
  return dal.listBankAccounts(prisma, ws.organizationId);
}
export async function getDashboardSummary() {
  const ws = await requireAccountingWorkspace();
  return dal.getDashboardSummary(prisma, ws.organizationId);
}
export async function listFeedTransactions(opts: { bankAccountId?: string; search?: string } = {}) {
  const ws = await requireAccountingWorkspace();
  return dal.listFeedTransactions(prisma, ws.organizationId, opts);
}
export async function getFeedTransactionPage(
  opts: {
    bankAccountId?: string;
    search?: string;
    reconcileStatus?: import("@/lib/banking/types").FeedTransaction["reconcile_status"];
    page?: number;
    pageSize?: number;
  } = {},
) {
  const ws = await requireAccountingWorkspace();
  return dal.getFeedTransactionPage(prisma, ws.organizationId, opts);
}
export async function listImportedStatements() {
  const ws = await requireAccountingWorkspace();
  return dal.listImportedStatements(prisma, ws.organizationId);
}
export async function getImportedStatementPage(
  importedStatementId: string,
  opts: { page?: number; pageSize?: number; search?: string } = {},
) {
  const ws = await requireAccountingWorkspace();
  return dal.getImportedStatementPage(prisma, ws.organizationId, importedStatementId, opts);
}
export async function getOpeningClosingBalances() {
  const ws = await requireAccountingWorkspace();
  return dal.getOpeningClosingBalances(prisma, ws.organizationId);
}
export async function getFeedCandidates(txId: string) {
  const ws = await requireAccountingWorkspace();
  return dal.getFeedCandidates(prisma, ws.organizationId, txId);
}
export async function getReconciliationAnalysis(txId: string) {
  const ws = await requireAccountingWorkspace();
  return dal.getReconciliationAnalysis(prisma, ws.organizationId, txId);
}
export async function markAiReconciliationReviewed(txId: string) {
  const ws = await requireAccountantRole();
  const result = await prisma.banking_feed_transactions.updateMany({
    where: { id: txId, org_id: ws.organizationId, deleted_at: null, reconcile_status: "reconciled", ai_review_status: "needs_review" },
    data: { ai_review_status: "reviewed", ai_reviewed_at: new Date(), ai_reviewed_by_user_id: ws.userId, updated_at: new Date() },
  });
  if (!result.count) throw new Error("This AI-created reconciliation is not waiting for review.");
  await prisma.auditEvent.create({ data: { organizationId: ws.organizationId, actorUserId: ws.userId, entityType: "bank_feed_ai_document", entityId: txId, action: AuditAction.UPDATE, after: { reviewStatus: "reviewed" } } });
  revalidateBanking();
  return { reviewed: true as const };
}
export async function getAiDocumentProposal(txId: string) {
  const ws = await requireAccountantRole();
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: ws.organizationId, deleted_at: null },
    select: {
      id: true, description: true, debit_minor: true, credit_minor: true,
      reconcile_status: true, transaction_scope: true, transaction_kind: true,
      ai_document_kind: true, ai_document_confidence: true, ai_document_reason: true,
      ai_document_contact_id: true, ai_document_contact_name: true,
      ai_document_account_id: true, ai_review_status: true,
    },
  });
  if (!tx) throw new Error("Transaction not found.");
  if (tx.reconcile_status === "reconciled") throw new Error("This transaction is already reconciled.");
  if (tx.transaction_scope === "personal") return { transaction_id: tx.id, kind: null, confidence: 0, contact_id: null, contact_name: null, account_id: null, account_label: null, reason: "This is marked as personal, so no business invoice, sale, expense, or supplier bill will be created. Ask your accountant whether it belongs in drawings, owner contribution, or a director's loan account.", requires_manual_intervention: true } as const;
  const excludedGuidance: Record<string, string> = {
    transfer: "This looks like a transfer between accounts. Match it to the other bank account instead of creating income or an expense.",
    loan: "This may be a loan payment or receipt. Split any capital and interest correctly before reconciling it.",
    tax: "This may be a tax or VAT payment. Review the tax period and liability account before reconciling it.",
    payroll: "This may be payroll. Match it to the posted payroll journal rather than creating a supplier bill.",
    refund: "This may be a refund. Match it to the original sale or purchase so the income, expense, and VAT are reversed correctly.",
  };
  if (excludedGuidance[tx.transaction_kind]) return { transaction_id: tx.id, kind: null, confidence: 0, contact_id: null, contact_name: null, account_id: null, account_label: null, reason: excludedGuidance[tx.transaction_kind], requires_manual_intervention: true } as const;
  if (tx.ai_review_status === "proposed" && tx.ai_document_kind && tx.ai_document_account_id && tx.ai_document_contact_name) {
    const savedAccount = await prisma.chartAccount.findFirst({ where: { id: tx.ai_document_account_id, organizationId: ws.organizationId, isActive: true }, select: { code: true, name: true } });
    if (savedAccount) return {
      transaction_id: tx.id,
      kind: tx.ai_document_kind as import("@/lib/banking/types").AiDocumentKind,
      confidence: tx.ai_document_confidence ?? 0,
      contact_id: tx.ai_document_contact_id,
      contact_name: tx.ai_document_contact_name,
      account_id: tx.ai_document_account_id,
      account_label: `${savedAccount.code} · ${savedAccount.name}`,
      reason: tx.ai_document_reason ?? "Saved AI proposal",
      requires_manual_intervention: false,
      requires_post_review: true,
    };
  }
  const moneyIn = Number(tx.credit_minor) > 0;
  const [contacts, accounts, history] = await Promise.all([
    prisma.contact.findMany({ where: { organizationId: ws.organizationId, isActive: true, contactType: { in: moneyIn ? ["CUSTOMER", "BOTH"] : ["SUPPLIER", "BOTH"] } }, select: { id: true, contactType: true, ...CONTACT_NAME_SELECT }, take: 500 }),
    prisma.chartAccount.findMany({ where: { organizationId: ws.organizationId, isActive: true, accountType: moneyIn ? "REVENUE" : { in: ["EXPENSE", "ASSET"] }, reportCategory: { not: "BANK" } }, select: { id: true, code: true, name: true, accountType: true }, take: 500 }),
    prisma.$queryRaw<Array<{ description: string; contact_id: string }>>`
      SELECT DISTINCT ON (bft.description, jl.contact_id)
        bft.description, jl.contact_id
      FROM banking_feed_transactions bft
      JOIN journals j ON j.id = bft.matched_journal_id
      JOIN journal_lines jl ON jl.journal_id = j.id
      WHERE bft.org_id = ${ws.organizationId}::uuid
        AND bft.reconcile_status = 'reconciled'
        AND bft.deleted_at IS NULL
        AND jl.contact_id IS NOT NULL
      ORDER BY bft.description, jl.contact_id, bft.updated_at DESC
      LIMIT 500`,
  ]);
  const examplesByContact = new Map<string, string[]>();
  for (const item of history) examplesByContact.set(item.contact_id, [...(examplesByContact.get(item.contact_id) ?? []), item.description].slice(0, 5));
  const proposal = await proposeBankDocument(
    { id: tx.id, description: tx.description, moneyIn, amountMinor: Number(moneyIn ? tx.credit_minor : tx.debit_minor) },
    contacts.map((contact) => ({ id: contact.id, name: contactDisplayName(contact), type: contact.contactType.toLowerCase(), pastDescriptions: examplesByContact.get(contact.id) ?? [] })),
    accounts.map((account) => ({ id: account.id, code: account.code, name: account.name, type: account.accountType.toLowerCase() })),
  );
  if (!proposal.requires_manual_intervention && proposal.kind && proposal.account_id && proposal.contact_name) {
    await prisma.banking_feed_transactions.updateMany({
      where: { id: tx.id, org_id: ws.organizationId, deleted_at: null, reconcile_status: { in: ["unmatched", "ai_suggested"] } },
      data: {
        ai_document_kind: proposal.kind,
        ai_document_confidence: proposal.confidence,
        ai_document_reason: proposal.reason,
        ai_document_contact_id: proposal.contact_id,
        ai_document_contact_name: proposal.contact_name,
        ai_document_account_id: proposal.account_id,
        ai_review_status: "proposed",
        ai_reviewed_at: null,
        ai_reviewed_by_user_id: null,
        updated_at: new Date(),
      },
    });
  }
  return proposal;
}

export async function confirmAiDocumentProposal(input: { txId: string }) {
  const ws = await requireAccountantRole();
  const feed = await prisma.banking_feed_transactions.findFirst({
    where: { id: input.txId, org_id: ws.organizationId, deleted_at: null, reconcile_status: { in: ["unmatched", "ai_suggested"] }, transaction_scope: "company" },
    include: { banking_bank_accounts: { select: { chart_account_id: true, currency: true } } },
  });
  if (!feed) throw new Error("This transaction is no longer available for document creation.");
  if (!feed.ai_document_kind || !feed.ai_document_account_id || !feed.ai_document_contact_name || feed.ai_review_status !== "proposed") throw new Error("This AI proposal is no longer available. Prepare the review again before confirming it.");
  const proposalKind = feed.ai_document_kind as import("@/lib/banking/types").AiDocumentKind;
  if (["transfer", "loan", "tax", "payroll", "refund"].includes(feed.transaction_kind)) throw new Error("This transaction type requires manual intervention.");
  const moneyIn = Number(feed.credit_minor) > 0;
  if (moneyIn !== ["sales_receipt", "invoice"].includes(proposalKind)) throw new Error("The saved proposal does not match the transaction direction.");
  let contact = feed.ai_document_contact_id ? await prisma.contact.findFirst({ where: { id: feed.ai_document_contact_id, organizationId: ws.organizationId, isActive: true, contactType: { in: moneyIn ? ["CUSTOMER", "BOTH"] : ["SUPPLIER", "BOTH"] } }, select: { id: true, ...CONTACT_NAME_SELECT } }) : null;
  const account = await prisma.chartAccount.findFirst({ where: { id: feed.ai_document_account_id, organizationId: ws.organizationId, isActive: true, accountType: moneyIn ? "REVENUE" : { in: ["EXPENSE", "ASSET"] }, reportCategory: { not: "BANK" } }, select: { id: true } });
  const proposedContactName = feed.ai_document_contact_name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!contact && proposedContactName) {
    contact = await prisma.contact.findFirst({ where: { organizationId: ws.organizationId, name: { equals: proposedContactName, mode: "insensitive" }, isActive: true, contactType: { in: moneyIn ? [ContactType.CUSTOMER, ContactType.BOTH] : [ContactType.SUPPLIER, ContactType.BOTH] } }, select: { id: true, ...CONTACT_NAME_SELECT } });
    if (!contact) contact = await prisma.contact.create({ data: { organizationId: ws.organizationId, contactType: moneyIn ? ContactType.CUSTOMER : ContactType.SUPPLIER, name: proposedContactName, paymentTermsDays: 30, defaultCurrency: feed.banking_bank_accounts.currency as CurrencyCode, isActive: true, notes: "Created automatically from a bank transaction. Please review this contact." }, select: { id: true, ...CONTACT_NAME_SELECT } });
  }
  if (!contact || !account) throw new Error("The record type or accounting category could not be verified. Review this transaction manually.");
  const amountMinor = Number(moneyIn ? feed.credit_minor : feed.debit_minor);
  const amount = (amountMinor / 100).toFixed(2);
  const date = feed.transaction_date.toISOString().slice(0, 10);
  const contactName = contactDisplayName(contact);
  const currency = feed.banking_bank_accounts.currency as CurrencyCode;
  const marker = `bank-feed:${feed.id}`;
  const bankChartAccountId = await dal.ensureBankAccountChartAccount(prisma, ws.organizationId, feed.bank_account_id);

  const finishReconciliation = async (documentId: string, journalId: string) => {
    await dal.categorizeFeedTransaction(prisma, ws.organizationId, ws.userId, feed.id, account.id);
    await dal.reconcileFeed(prisma, ws.organizationId, ws.userId, feed.id, journalId);
    await prisma.auditEvent.create({ data: { organizationId: ws.organizationId, actorUserId: ws.userId, entityType: "bank_feed_ai_document", entityId: feed.id, action: AuditAction.CREATE, after: { documentId, kind: proposalKind, journalId, confidence: feed.ai_document_confidence } } });
    await prisma.banking_feed_transactions.update({ where: { id: feed.id }, data: { ai_match_label: `AI-created ${proposalKind.replaceAll("_", " ")} — review`, ai_document_id: documentId, ai_document_journal_id: journalId, ai_review_status: "needs_review", updated_at: new Date() } });
    return { documentId, kind: proposalKind, status: "reconciled" as const };
  };

  // A previous attempt may have posted the supporting document before the
  // final reconciliation failed. Resume that work instead of creating a
  // duplicate document or forcing the user to repair it manually.
  const invoiceSelect = { id: true, status: true, contactId: true, issueDate: true, currency: true, totalMinor: true } as const;
  const receiptSelect = { id: true, postedJournalId: true, contactId: true, receiptDate: true, currency: true, totalMinor: true } as const;
  const billSelect = { id: true, status: true, paidJournalId: true, contactId: true, issueDate: true, currency: true, totalMinor: true } as const;

  // Prefer the persisted relationship. If an earlier request created the
  // document but stopped before saving that relationship, recover it from the
  // immutable bank-feed marker embedded in the document.
  let existingInvoice = proposalKind === "invoice" && feed.ai_document_id
    ? await prisma.invoice.findFirst({ where: { id: feed.ai_document_id, organizationId: ws.organizationId }, select: invoiceSelect })
    : null;
  let existingReceipt = proposalKind === "sales_receipt" && feed.ai_document_id
    ? await prisma.salesReceipt.findFirst({ where: { id: feed.ai_document_id, organizationId: ws.organizationId }, select: receiptSelect })
    : null;
  let existingBill = ["expense", "supplier_bill"].includes(proposalKind) && feed.ai_document_id
    ? await prisma.bill.findFirst({ where: { id: feed.ai_document_id, organizationId: ws.organizationId }, select: billSelect })
    : null;

  if (proposalKind === "invoice" && !existingInvoice) {
    const matches = await prisma.invoice.findMany({
      where: { organizationId: ws.organizationId, reference: marker },
      select: invoiceSelect,
      take: 2,
    });
    if (matches.length > 1) throw new Error("More than one invoice is linked to this bank transaction. Nothing else was created. Please review the duplicate invoices.");
    existingInvoice = matches[0] ?? null;
  } else if (proposalKind === "sales_receipt" && !existingReceipt) {
    const matches = await prisma.salesReceipt.findMany({
      where: { organizationId: ws.organizationId, notes: { contains: marker } },
      select: receiptSelect,
      take: 2,
    });
    if (matches.length > 1) throw new Error("More than one sales receipt is linked to this bank transaction. Nothing else was created. Please review the duplicate receipts.");
    existingReceipt = matches[0] ?? null;
  } else if (["expense", "supplier_bill"].includes(proposalKind) && !existingBill) {
    const matches = await prisma.bill.findMany({
      where: { organizationId: ws.organizationId, notes: { contains: marker } },
      select: billSelect,
      take: 2,
    });
    if (matches.length > 1) throw new Error("More than one bill is linked to this bank transaction. Nothing else was created. Please review the duplicate bills.");
    existingBill = matches[0] ?? null;
  }

  const recoveredDocument = existingInvoice
    ? { contactId: existingInvoice.contactId, date: existingInvoice.issueDate, currency: existingInvoice.currency, totalMinor: existingInvoice.totalMinor }
    : existingReceipt
      ? { contactId: existingReceipt.contactId, date: existingReceipt.receiptDate, currency: existingReceipt.currency, totalMinor: existingReceipt.totalMinor }
      : existingBill
        ? { contactId: existingBill.contactId, date: existingBill.issueDate, currency: existingBill.currency, totalMinor: existingBill.totalMinor }
        : null;
  if (recoveredDocument && (
    recoveredDocument.contactId !== contact.id
    || recoveredDocument.date.toISOString().slice(0, 10) !== date
    || recoveredDocument.currency !== currency
    || recoveredDocument.totalMinor !== BigInt(amountMinor)
  )) {
    throw new Error("The existing accounting record does not match this bank transaction. Nothing else was created. Please review the record manually.");
  }
  if (existingInvoice || existingReceipt || existingBill) {
    const documentId = existingInvoice?.id ?? existingReceipt?.id ?? existingBill!.id;
    if (existingInvoice?.status === InvoiceStatus.DRAFT) await approveInvoice(prisma, ws.organizationId, ws.userId, existingInvoice.id, true, bankChartAccountId);
    if (existingBill?.status === BillStatus.DRAFT) await approveBill(prisma, ws.organizationId, ws.userId, existingBill.id);
    const resumedBillPayment = existingBill && existingBill.status !== BillStatus.PAID
      ? await payBill(prisma, ws.organizationId, ws.userId, existingBill.id, bankChartAccountId, "bank_transfer")
      : null;
    const journalId = existingReceipt?.postedJournalId ?? existingBill?.paidJournalId ?? resumedBillPayment?.journalId ?? (existingInvoice
      ? (await prisma.journal.findFirst({ where: { organizationId: ws.organizationId, sourceId: existingInvoice.id, sourceType: "invoice_payment", status: JournalStatus.POSTED }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id
      : null);
    if (!journalId) throw new Error("The supporting record exists, but its payment is not posted yet. Open that record and finish the payment before trying again.");
    const resumed = await finishReconciliation(documentId, journalId);
    revalidateBanking();
    return resumed;
  }
  let documentId: string;
  let journalId: string;
  if (proposalKind === "sales_receipt") {
    const result = await createSalesReceipt(prisma, ws.organizationId, ws.userId, { contactId: contact.id, receiptDate: date, currency, amountsAre: "no_vat", paymentMethod: "bank_transfer", bankAccountId: bankChartAccountId, reference: feed.description, notes: `Created from a confirmed bank transaction suggestion. ${marker}`, lines: [{ accountId: account.id, description: feed.description, quantity: "1", unitPrice: amount, taxCode: "NO_VAT" }] });
    documentId = result.documentId; journalId = result.journalId;
    await prisma.banking_feed_transactions.update({ where: { id: feed.id }, data: { ai_document_id: documentId, ai_document_journal_id: journalId, updated_at: new Date() } });
  } else if (proposalKind === "invoice") {
    documentId = await saveInvoiceDraft(prisma, ws.organizationId, ws.userId, { contactId: contact.id, contactName, documentNo: "", issueDate: date, dueDate: date, currency, amountsAre: "no_vat", isCashSale: true, depositAccountId: bankChartAccountId, reference: marker, lines: [{ accountId: account.id, description: feed.description, quantity: "1", unitPrice: amount, taxCode: "NO_VAT" }] });
    await prisma.banking_feed_transactions.update({ where: { id: feed.id }, data: { ai_document_id: documentId, updated_at: new Date() } });
    await approveInvoice(prisma, ws.organizationId, ws.userId, documentId, true, bankChartAccountId);
    const payment = await prisma.journal.findFirst({ where: { organizationId: ws.organizationId, sourceId: documentId, sourceType: "invoice_payment", status: JournalStatus.POSTED }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!payment) throw new Error("The invoice was created, but its payment journal could not be found. Manual intervention is required.");
    journalId = payment.id;
    await prisma.banking_feed_transactions.update({ where: { id: feed.id }, data: { ai_document_journal_id: journalId, updated_at: new Date() } });
  } else {
    documentId = await saveBillDraft(prisma, ws.organizationId, ws.userId, { contactId: contact.id, contactName, documentNo: "", issueDate: date, dueDate: date, currency, amountsAre: "no_vat", notes: `Created from a confirmed bank transaction suggestion. ${marker}`, lines: [{ accountId: account.id, description: feed.description, quantity: "1", unitPrice: amount, taxCode: "NO_VAT" }] });
    await prisma.banking_feed_transactions.update({ where: { id: feed.id }, data: { ai_document_id: documentId, updated_at: new Date() } });
    await approveBill(prisma, ws.organizationId, ws.userId, documentId);
    const paid = await payBill(prisma, ws.organizationId, ws.userId, documentId, bankChartAccountId, "bank_transfer");
    if (!paid.journalId) throw new Error("The bill was created, but its payment journal could not be found. Manual intervention is required.");
    journalId = paid.journalId;
    await prisma.banking_feed_transactions.update({ where: { id: feed.id }, data: { ai_document_journal_id: journalId, updated_at: new Date() } });
  }
  const result = await finishReconciliation(documentId, journalId);
  revalidateBanking();
  return result;
}
export async function listExpenseAccounts() {
  const ws = await requireAccountingWorkspace();
  return dal.listExpenseAccounts(prisma, ws.organizationId);
}
export async function listCategorizationAccounts() {
  const ws = await requireAccountingWorkspace();
  return dal.listCategorizationAccounts(prisma, ws.organizationId);
}
export async function listContacts(type: "customer" | "supplier" | "both" = "both") {
  const ws = await requireAccountingWorkspace();
  return dal.listContacts(prisma, ws.organizationId, type);
}
export async function listTrueLayerBankFeedStatusesAction() {
  const ws = await requireAccountingWorkspace();
  return listTrueLayerBankFeedStatuses(ws.organizationId);
}
export async function listTrueLayerAvailableAccountsAction(connectionId: string) {
  const ws = await requireAccountantRole();
  return listTrueLayerAvailableAccounts({ organizationId: ws.organizationId, connectionId });
}

// --- mutations ---
export async function createBankAccount(input: CreateBankAccountInput) {
  const ws = await requireAccountantRole();
  const res = await dal.createBankAccount(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function updateBankAccount(id: string, input: UpdateBankAccountInput) {
  const ws = await requireAccountantRole();
  const res = await dal.updateBankAccount(prisma, ws.organizationId, id, input);
  revalidateBanking();
  return res;
}
export async function deleteBankAccount(id: string) {
  const ws = await requireAccountantRole();
  // A bank account may be removed from the workspace without erasing its
  // accounting history. Remove the live-feed credentials first so the daily
  // sync cannot keep attempting to read a deleted account.
  const connection = await prisma.trueLayerBankFeedConnection.findFirst({
    where: { organizationId: ws.organizationId, bankAccountId: id },
    select: { id: true },
  });
  if (connection) {
    await disconnectTrueLayerBankFeed({
      organizationId: ws.organizationId,
      bankAccountId: id,
    });
  }
  await dal.deleteBankAccount(prisma, ws.organizationId, id);
  revalidateBanking();
}
export async function syncTrueLayerBankFeedAction(connectionId: string) {
  const ws = await requireAccountantRole();
  const result = await syncTrueLayerBankFeed({
    organizationId: ws.organizationId,
    connectionId,
  });
  revalidateBanking();
  return result;
}
export async function setTrueLayerBankFeedSyncAction(bankAccountId: string, enabled: boolean) {
  const ws = await requireAccountantRole();
  await setTrueLayerBankFeedSync({ organizationId: ws.organizationId, bankAccountId, enabled });
  let result = { imported: 0, duplicates: 0 };
  if (enabled) {
    const connection = await prisma.trueLayerBankFeedConnection.findFirst({
      where: { organizationId: ws.organizationId, bankAccountId, status: "CONNECTED" },
      select: { id: true },
    });
    if (!connection) throw new Error("This bank connection could not be turned on. Please reconnect TrueLayer.");
    // Resuming is also an explicit request for fresh data. Sync immediately,
    // then let the five-minute background schedule take over.
    result = await syncTrueLayerBankFeed({ organizationId: ws.organizationId, connectionId: connection.id });
  }
  revalidateBanking();
  return result;
}
export async function disconnectTrueLayerBankFeedAction(bankAccountId: string) {
  const ws = await requireAccountantRole();
  await disconnectTrueLayerBankFeed({
    organizationId: ws.organizationId,
    bankAccountId,
  });
  revalidateBanking();
}
export async function completeTrueLayerAccountSelectionAction(connectionId: string, providerAccountIds: string[]) {
  const ws = await requireAccountantRole();
  const result = await completeTrueLayerAccountSelection({
    organizationId: ws.organizationId,
    connectionId,
    userId: ws.userId,
    providerAccountIds: [...new Set(providerAccountIds)],
  });
  revalidateBanking();
  return result;
}
export async function cancelTrueLayerAccountSelectionAction(connectionId: string) {
  const ws = await requireAccountantRole();
  await cancelTrueLayerAccountSelection({ organizationId: ws.organizationId, connectionId });
}
export async function confirmStatementImport(bankAccountId: string, transactions: ParsedTransaction[]) {
  const ws = await requireAccountantRole();
  const res = await dal.confirmStatementImport(
    prisma,
    ws.organizationId,
    bankAccountId,
    transactions,
  );
  // Matching happens after rows exist in the feed. Only high-confidence
  // suggestions are accepted automatically; every newly created journal still
  // requires confirmation in the post-import review.
  await dal.runAiMatch(prisma, ws.organizationId, { importedStatementId: res.imported_statement_id });
  const autoMatched = await dal.bulkAcceptSuggestedMatches(prisma, ws.organizationId, ws.userId, {
    importedStatementId: res.imported_statement_id,
    minConfidence: 90,
  });
  const review = await dal.getStatementReconciliationReview(
    prisma,
    ws.organizationId,
    res.imported_statement_id,
  );
  revalidateBanking();
  return { ...res, auto_reconciled: autoMatched.accepted, review };
}
export async function recordStatementReviewRows(input: {
  items: Array<{ txId: string; categoryAccountId?: string }>;
  scopeUpdates?: Array<{ txId: string; scope: import("@/lib/banking/types").FeedTransaction["transaction_scope"] }>;
}) {
  const ws = await requireAccountantRole();
  for (const update of input.scopeUpdates ?? []) {
    await dal.setFeedTransactionScope(prisma, ws.organizationId, ws.userId, update.txId, update.scope);
  }
  const uniqueItems = [...new Map(input.items.map((item) => [item.txId, item])).values()].slice(0, 5_000);
  let recorded = 0;
  let cursor = 0;
  const errors: Array<{ tx_id: string; message: string }> = [];

  // The review confirmation is the user's permission to create the proposed
  // business document. Each proposal is still rechecked by the normal Sales
  // or Purchases creation path before its payment journal can be reconciled.
  const worker = async () => {
    while (cursor < uniqueItems.length) {
      const item = uniqueItems[cursor++];
      try {
        const proposal = await getAiDocumentProposal(item.txId);
        if (
          proposal.requires_manual_intervention ||
          !proposal.kind ||
          !proposal.contact_name ||
          !(item.categoryAccountId ?? proposal.account_id)
        ) {
          throw new Error(proposal.reason || "This transaction needs a manual review before a record can be created.");
        }
        if (item.categoryAccountId && item.categoryAccountId !== proposal.account_id) {
          await prisma.banking_feed_transactions.updateMany({
            where: { id: item.txId, org_id: ws.organizationId, deleted_at: null, ai_review_status: "proposed" },
            data: { ai_document_account_id: item.categoryAccountId, updated_at: new Date() },
          });
        }
        await confirmAiDocumentProposal({ txId: item.txId });
        recorded += 1;
      } catch (cause) {
        errors.push({
          tx_id: item.txId,
          message: cause instanceof Error ? cause.message : "This transaction needs a manual review before it can be recorded.",
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, uniqueItems.length) }, worker));
  const result = { recorded, skipped: uniqueItems.length - recorded, errors };
  revalidateBanking();
  return result;
}
export async function getReconciliationReview() {
  const ws = await requireAccountantRole();
  // Generate or refresh safe category suggestions before returning the review
  // list. The dialog is therefore prefilled instead of making the user run a
  // separate matching action first.
  const match = await dal.runAiMatch(prisma, ws.organizationId);
  const transactions = await dal.getReconciliationReview(prisma, ws.organizationId);
  return {
    transactions,
    categorizationWarning: match.categories_failed > 0
      ? `${match.categories_failed} transaction${match.categories_failed === 1 ? " could" : "s could"} not be categorized because the AI service took too long. You can choose their categories manually or try preparing the review again.`
      : null,
  };
}
export async function bulkDeleteFeed(ids: string[]) {
  const ws = await requireAccountantRole();
  const res = await dal.bulkDeleteFeed(prisma, ws.organizationId, ids);
  revalidateBanking();
  return res;
}
export async function bulkDeleteAllFeed(input: {
  search?: string;
  reconcileStatus?: import("@/lib/banking/types").FeedTransaction["reconcile_status"];
} = {}) {
  const ws = await requireAccountantRole();
  const res = await dal.bulkDeleteAllFeed(prisma, ws.organizationId, input);
  revalidateBanking();
  return res;
}
export async function reconcileFeed(txId: string, journalId: string) {
  const ws = await requireAccountantRole();
  const feed = await prisma.banking_feed_transactions.findFirst({ where: { id: txId, org_id: ws.organizationId, deleted_at: null }, select: { bank_account_id: true } });
  if (!feed) throw new Error("Transaction not found.");
  await dal.ensureBankAccountChartAccount(prisma, ws.organizationId, feed.bank_account_id);
  const res = await dal.reconcileFeed(prisma, ws.organizationId, ws.userId, txId, journalId);
  revalidateBanking();
  return res;
}
export async function unreconcileFeed(txId: string) {
  const ws = await requireAccountantRole();
  const res = await dal.unreconcileFeed(prisma, ws.organizationId, ws.userId, txId);
  revalidateBanking();
  return res;
}
export async function rejectAiSuggestion(txId: string) {
  const ws = await requireAccountantRole();
  const res = await dal.rejectAiSuggestion(prisma, ws.organizationId, txId);
  revalidateBanking();
  return res;
}
export async function runAiMatch() {
  const ws = await requireAccountantRole();
  const res = await dal.runAiMatch(prisma, ws.organizationId);
  revalidateBanking();
  return res;
}
export async function bulkAcceptSuggestedMatches(
  input: { ids?: string[]; minConfidence?: number } = {},
) {
  const ws = await requireAccountantRole();
  const res = await dal.bulkAcceptSuggestedMatches(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function recordFeedTransaction(
  txId: string,
  input: {
    category_account_id?: string;
    expense_account_id?: string;
    contact_id?: string | null;
    memo?: string;
  },
) {
  const ws = await requireAccountantRole();
  const res = await dal.recordFeedTransaction(prisma, ws.organizationId, ws.userId, txId, input);
  revalidateBanking();
  return res;
}
export async function categorizeFeedTransaction(txId: string, accountId: string | null) {
  const ws = await requireAccountantRole();
  const res = await dal.categorizeFeedTransaction(
    prisma,
    ws.organizationId,
    ws.userId,
    txId,
    accountId,
  );
  revalidateBanking();
  return res;
}
export async function setFeedTransactionScope(
  txId: string,
  scope: import("@/lib/banking/types").FeedTransaction["transaction_scope"],
) {
  const ws = await requireAccountantRole();
  const result = await dal.setFeedTransactionScope(prisma, ws.organizationId, ws.userId, txId, scope);
  revalidateBanking();
  return result;
}
export async function updateImportedStatementRows(
  importedStatementId: string,
  updates: import("@/lib/banking/types").ImportedStatementRowUpdate[],
) {
  const ws = await requireAccountantRole();
  const result = await dal.updateImportedStatementRows(
    prisma,
    ws.organizationId,
    ws.userId,
    importedStatementId,
    updates,
  );
  revalidateBanking();
  return result;
}
export async function setOpeningBalance(accountId: string, openingBalanceMinor: number) {
  const ws = await requireAccountantRole();
  const res = await dal.setOpeningBalance(
    prisma,
    ws.organizationId,
    ws.userId,
    accountId,
    openingBalanceMinor,
  );
  revalidateBanking();
  return res;
}
export async function createTransfer(input: Parameters<typeof dal.createTransfer>[3]) {
  const ws = await requireAccountantRole();
  const res = await dal.createTransfer(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function createReceivedPayment(
  input: Parameters<typeof dal.createReceivedPayment>[3],
) {
  const ws = await requireAccountantRole();
  const res = await dal.createReceivedPayment(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function createPaidExpense(input: Parameters<typeof dal.createPaidExpense>[3]) {
  const ws = await requireAccountantRole();
  const res = await dal.createPaidExpense(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}

export async function getAccountTransactions(chartAccountId: string) {
  const ws = await requireAccountingWorkspace();
  return dal.getAccountTransactions(prisma, ws.organizationId, chartAccountId);
}

export async function checkStatementDuplicates(
  bankAccountId: string,
  transactions: ParsedTransaction[],
): Promise<{ duplicate_count: number; existing_row_keys: string[] }> {
  const ws = await requireAccountantRole();
  if (!bankAccountId || !Array.isArray(transactions) || transactions.length === 0) {
    return { duplicate_count: 0, existing_row_keys: [] };
  }

  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: bankAccountId, org_id: ws.organizationId, deleted_at: null },
    select: { id: true },
  });
  if (!account) return { duplicate_count: 0, existing_row_keys: [] };

  const times = transactions
    .map((t) => new Date(`${t.date}T00:00:00.000Z`).getTime())
    .filter((time) => !Number.isNaN(time));

  if (times.length === 0) return { duplicate_count: 0, existing_row_keys: [] };

  const existing = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: ws.organizationId,
      bank_account_id: account.id,
      deleted_at: null,
      transaction_date: {
        gte: new Date(Math.min(...times)),
        lte: new Date(Math.max(...times)),
      },
    },
    select: { transaction_date: true, description: true, debit_minor: true, credit_minor: true },
  });

  const buildKey = (dateStr: string, deb: number, cred: number, desc: string) =>
    `${dateStr}|${deb}|${cred}|${(desc ?? "").trim().slice(0, 500) || "—"}`;

  const existingSet = new Set(
    existing.map((e) =>
      buildKey(
        e.transaction_date.toISOString().slice(0, 10),
        Number(e.debit_minor),
        Number(e.credit_minor),
        e.description,
      ),
    ),
  );

  const existing_row_keys = Array.from(
    new Set(
      transactions
        .map((t) => buildKey(t.date, t.debit || 0, t.credit || 0, t.description || ""))
        .filter((key) => existingSet.has(key)),
    ),
  );

  const duplicate_count = transactions.filter((t) =>
    existingSet.has(buildKey(t.date, t.debit || 0, t.credit || 0, t.description || "")),
  ).length;

  return { duplicate_count, existing_row_keys };
}

// --- statement import (file upload) ---

/**
 * Fetch a statement the browser uploaded straight to storage, bypassing the
 * 4.5 MB cap Vercel puts on Server Action request bodies.
 *
 * The path comes from the client, so it is pinned to the caller's own prefix
 * before the service role — which bypasses RLS — is allowed near it.
 */
async function readStatementFromStorage(path: string, userId: string): Promise<Buffer> {
  if (!path.startsWith(`${userId}/`) || path.includes("..")) {
    throw new Error("Uploaded statement not found.");
  }

  const admin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const { data, error } = await admin.storage.from(STATEMENT_BUCKET).download(path);
  if (error || !data) {
    console.error("[banking] statement download failed:", error);
    throw new Error("The uploaded statement could not be read. Please try again.");
  }
  if (data.size > MAX_STATEMENT_BYTES) throw new Error("File too large. Max 10 MB.");

  return Buffer.from(await data.arrayBuffer());
}

/** Best-effort removal of a parsed statement. Never fails the import. */
async function discardStoredStatement(path: string): Promise<void> {
  try {
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    await admin.storage.from(STATEMENT_BUCKET).remove([path]);
  } catch (err) {
    console.warn("[banking] could not delete stored statement:", err);
  }
}

export async function importStatement(formData: FormData) {
  const ws = await requireAccountantRole();
  const file = formData.get("file") as File | null;
  const storagePath = formData.get("storage_path") as string | null;
  const bankAccountId = formData.get("bank_account_id") as string | null;
  const allowUnverified = formData.get("allow_unverified") === "true";
  if (!file && !storagePath) throw new Error("No file provided.");
  if (!bankAccountId) throw new Error("bank_account_id is required.");

  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: bankAccountId, org_id: ws.organizationId, deleted_at: null },
    select: { id: true, display_name: true, currency: true },
  });
  if (!account) throw new Error("Bank account not found.");

  // The original name survives the storage round trip separately — the parser
  // keys off its extension to choose the PDF or CSV path.
  const filename = (formData.get("filename") as string | null) || file?.name || "statement.pdf";

  try {
    let bytes: Buffer;
    if (storagePath) {
      bytes = await readStatementFromStorage(storagePath, ws.userId);
    } else {
      if (file!.size > MAX_STATEMENT_BYTES) throw new Error("File too large. Max 10 MB.");
      bytes = Buffer.from(await file!.arrayBuffer());
    }

    let result: Awaited<ReturnType<typeof parseStatement>>;
    try {
      result = await parseStatement(filename, bytes, {
        allowUnverified,
        defaultCurrency: account.currency,
      });
    } catch (err) {
      // Typed parse failures carry a user-facing message and a code the modal
      // uses to decide whether to offer the "I've checked these myself" override.
      if (err instanceof StatementParseError) {
        const { unverifiedResult, ...errorDetails } = err.details ?? {};

        // The parser has already read these rows. Return them with the warning
        // so the modal can accept the user's attestation instantly, without a
        // second storage upload or OCR request.
        if (err.code === "Unverifiable" && unverifiedResult) {
          const { duplicate_count, existing_row_keys } = await checkStatementDuplicates(
            account.id,
            unverifiedResult.transactions,
          );
          return {
            bank_account_id: account.id,
            bank_account_name: account.display_name,
            filename,
            transaction_count: unverifiedResult.transactions.length,
            transactions: unverifiedResult.transactions,
            currency: unverifiedResult.currency,
            extraction_path: unverifiedResult.path,
            statement_date: unverifiedResult.statementDate,
            statement_period: unverifiedResult.statementPeriod,
            diagnostics: unverifiedResult.diagnostics,
            duplicate_count,
            existing_row_keys,
            error: { code: err.code, message: err.message, ...errorDetails },
          };
        }

        return {
          bank_account_id: account.id,
          bank_account_name: account.display_name,
          filename,
          error: { code: err.code, message: err.message, ...errorDetails },
        };
      }
      throw err;
    }

    // For CSVs, also return the raw table + detected mapping so the modal can
    // offer manual column remapping without another server round trip.
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    let raw_csv: RawCsvTable | undefined;
    let suggested_mapping: ColumnMapping | undefined;
    if (ext === "csv" || ext === "txt") {
      raw_csv = parseCsvTable(bytes);
      suggested_mapping = suggestMapping(raw_csv.headers);
    }

    // Pre-check for existing transactions in the bank feed to flag duplicates in preview
    const { duplicate_count, existing_row_keys } = await checkStatementDuplicates(
      account.id,
      result.transactions,
    );

    return {
      bank_account_id: account.id,
      bank_account_name: account.display_name,
      filename,
      transaction_count: result.transactions.length,
      transactions: result.transactions,
      currency: result.currency,
      verification: result.verification,
      extraction_path: result.path,
      statement_date: result.statementDate,
      statement_period: result.statementPeriod,
      diagnostics: result.diagnostics,
      raw_csv,
      suggested_mapping,
      duplicate_count,
      existing_row_keys,
    };
  } finally {
    // Covers the download step too, not just the parse: a failed or aborted
    // download still leaves an object in the bucket that only this request
    // knows about, so the cleanup has to run whichever step throws.
    if (storagePath) await discardStoredStatement(storagePath);
  }
}
