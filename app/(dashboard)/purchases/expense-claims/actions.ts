"use server";

import { revalidatePath } from "next/cache";
import { ContactType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { saveBillDraft, approveBill, getDocumentOptions } from "@/lib/accounting/documents";
import type { BillAttachmentInput } from "@/lib/accounting/bill-attachments";

/**
 * Expense claims.
 *
 * A claim is a bill owed to whoever paid out of their own pocket: debit the
 * expense, credit accounts payable to the claimant, then settle it with an
 * ordinary bill payment. That is how Xero, Sage and QuickBooks model it, and it
 * means claims inherit posting, aging, payment and statements from the bill
 * machinery instead of duplicating any of it.
 *
 * The previous implementation kept claims in browser localStorage, posted
 * nothing to the ledger, and looked for claimants under a contact type that did
 * not exist — so its picker was always empty.
 */

export type ExpenseClaimRow = {
  id: string;
  claimNo: string;
  claimantId: string;
  claimantName: string;
  description: string;
  /** yyyy-mm-dd */
  date: string;
  currency: string;
  /** What the claimant is owed, in the currency the claim was raised in. */
  totalMinor: number;
  /**
   * The same amount in the workspace's own currency, fixed at the rate on the
   * day it was raised.
   *
   * Any figure that adds several claims together has to use this. Claims are no
   * longer guaranteed to share a currency: raising one against a person from
   * the bill dialog lets an accountant pick, so a workspace keeping its books
   * in pesos can hold a claim owed in pounds.
   */
  baseTotalMinor: number;
  status: string;
  paymentMethod: string | null;
  location: string | null;
  notes: string | null;
  receiptAttachmentFilename: string | null;
};

function revalidateClaimViews() {
  revalidatePath("/purchases/expense-claims");
  revalidatePath("/purchases/bills");
  revalidatePath("/dashboard");
}

/** Contacts who can claim. Kept separate from suppliers on purpose. */
export async function listClaimants() {
  const workspace = await requireAccountantRole();
  const rows = await prisma.contact.findMany({
    where: { organizationId: workspace.organizationId, contactType: ContactType.EMPLOYEE, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email }));
}

export async function createClaimant(input: { name: string; email?: string }) {
  const workspace = await requireAccountantRole();
  const name = input.name.trim();
  if (!name) throw new Error("A claimant name is required.");

  const contact = await prisma.contact.create({
    data: {
      organizationId: workspace.organizationId,
      name,
      email: input.email?.trim() || null,
      contactType: ContactType.EMPLOYEE,
      isActive: true,
    },
    select: { id: true, name: true, email: true },
  });

  revalidateClaimViews();
  return contact;
}

export async function listExpenseClaims(): Promise<ExpenseClaimRow[]> {
  const workspace = await requireAccountantRole();
  const rows = await prisma.bill.findMany({
    where: { organizationId: workspace.organizationId, isExpenseClaim: true },
    orderBy: { issueDate: "desc" },
    select: {
      id: true,
      invoiceNo: true,
      issueDate: true,
      status: true,
      paymentMethod: true,
      location: true,
      notes: true,
      totalMinor: true,
      baseTotalMinor: true,
      currency: true,
      contactId: true,
      contact: { select: { name: true } },
      lines: { select: { description: true }, take: 1 },
      attachment: { select: { filename: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    claimNo: row.invoiceNo,
    claimantId: row.contactId,
    claimantName: row.contact?.name ?? "Unknown",
    description: row.lines[0]?.description ?? "",
    date: row.issueDate.toISOString().slice(0, 10),
    totalMinor: Number(row.totalMinor),
    // Older claims predate the base column and stored zero in it; for those the
    // document total is the base total, because they could only ever have been
    // raised in the workspace's own currency.
    baseTotalMinor: Number(row.baseTotalMinor) || Number(row.totalMinor),
    // Prisma returns the enum name ("DRAFT"), not the mapped database value.
    // Lowercased here so the UI has one casing to reason about.
    status: String(row.status).toLowerCase(),
    currency: String(row.currency),
    paymentMethod: row.paymentMethod,
    location: row.location,
    notes: row.notes,
    receiptAttachmentFilename: row.attachment?.filename ?? null,
  }));
}

/**
 * Record a claim as a draft bill. It posts nothing until it is approved, which
 * mirrors how a bill behaves and gives the approver a chance to reject it.
 */
export async function createExpenseClaim(input: {
  claimantId: string;
  claimantName: string;
  description: string;
  /** yyyy-mm-dd */
  date: string;
  /** Expense account the cost belongs to. */
  accountId: string;
  /** Major units as typed, e.g. "12.50". */
  amount: string;
  currency?: string;
  paymentMethod?: string;
  location?: string;
  notes?: string;
  receiptAttachment?: BillAttachmentInput | null;
  taxCode?: string;
}) {
  const workspace = await requireAccountantRole();

  const description = input.description.trim();
  if (!description) throw new Error("Describe what the claim is for.");
  if (!input.claimantId) throw new Error("Select who is claiming.");
  if (!input.accountId) throw new Error("Choose which expense account this belongs to.");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }

  const id = await saveBillDraft(prisma, workspace.organizationId, workspace.userId, {
    contactId: input.claimantId,
    contactName: input.claimantName,
    documentNo: "",
    issueDate: input.date,
    // Reimbursements are due immediately; nobody sets payment terms with their
    // own staff.
    dueDate: input.date,
    currency: input.currency as any,
    isExpenseClaim: true,
    amountsAre: input.taxCode && input.taxCode !== "no_vat" ? "inclusive" : "no_vat",
    paymentMethod: input.paymentMethod,
    location: input.location,
    notes: input.notes,
    receiptAttachment: input.receiptAttachment ?? null,
    lines: [
      {
        description,
        quantity: "1",
        unitPrice: input.amount,
        accountId: input.accountId,
        taxCode: input.taxCode || "no_vat",
      },
    ],
  });

  revalidateClaimViews();
  return id;
}

/**
 * Approve a claim, which posts it: debit the expense account, credit accounts
 * payable to the claimant. Reimbursement is then an ordinary bill payment.
 */
export async function approveExpenseClaim(claimId: string) {
  const workspace = await requireAccountantRole();
  const result = await approveBill(prisma, workspace.organizationId, workspace.userId, claimId);
  revalidateClaimViews();
  return result;
}

/**
 * Everything the claim form needs in one round trip: existing claims, who can
 * claim, and the expense accounts a cost can be booked to.
 */
export async function getExpenseClaimWorkspace() {
  const workspace = await requireAccountantRole();
  const [claims, claimants, options] = await Promise.all([
    listExpenseClaims(),
    listClaimants(),
    getDocumentOptions(prisma, workspace.organizationId),
  ]);

  return {
    claims,
    claimants,
    // Same categories the bill dialog offers, minus the asset ones: a personal
    // expense claim is a cost, not a capital purchase.
    accounts: options.accounts.filter((account) =>
      ["expense", "cost_of_sales"].includes(account.reportCategory)
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
  };
}

export async function updateClaimant(input: { id: string; name: string; email?: string }) {
  const workspace = await requireAccountantRole();
  const name = input.name.trim();
  if (!name) throw new Error("A claimant name is required.");

  await prisma.contact.updateMany({
    // Scoped by organisation as well as id so one workspace cannot rename
    // another's contact by guessing an id.
    where: { id: input.id, organizationId: workspace.organizationId, contactType: ContactType.EMPLOYEE },
    data: { name, email: input.email?.trim() || null },
  });

  revalidateClaimViews();
}

/**
 * Remove a claimant, or deactivate them when they already have claims.
 *
 * Deleting a contact that documents point at would orphan those claims, so
 * anyone with history is archived instead — the same compromise the supplier
 * list makes.
 */
export async function deleteClaimant(id: string) {
  const workspace = await requireAccountantRole();

  const claimCount = await prisma.bill.count({
    where: { organizationId: workspace.organizationId, contactId: id },
  });

  if (claimCount > 0) {
    await prisma.contact.updateMany({
      where: { id, organizationId: workspace.organizationId, contactType: ContactType.EMPLOYEE },
      data: { isActive: false },
    });
    revalidateClaimViews();
    return { archived: true, claimCount };
  }

  await prisma.contact.deleteMany({
    where: { id, organizationId: workspace.organizationId, contactType: ContactType.EMPLOYEE },
  });
  revalidateClaimViews();
  return { archived: false, claimCount: 0 };
}

/**
 * Discard a claim. Only drafts can go: once approved it has posted to the
 * ledger, and the correct remedy there is to void the bill so the reversal is
 * recorded rather than the history rewritten.
 */
export async function deleteExpenseClaim(claimId: string) {
  const workspace = await requireAccountantRole();

  const claim = await prisma.bill.findFirst({
    where: { id: claimId, organizationId: workspace.organizationId, isExpenseClaim: true },
    select: { id: true, status: true },
  });
  if (!claim) throw new Error("Claim not found.");
  if (claim.status !== "DRAFT") {
    throw new Error("This claim has already been approved. Void it from Bills instead, so the reversal is recorded.");
  }

  await prisma.$transaction(async (tx) => {
    // BillLine is org-scoped, and the tenancy firewall rejects a deleteMany with
    // no organization filter — correctly, since a bare billId would delete
    // another tenant's lines if an id ever collided or leaked.
    await tx.billLine.deleteMany({
      where: { billId: claim.id, organizationId: workspace.organizationId },
    });
    await tx.bill.delete({ where: { id: claim.id } });
  });

  revalidateClaimViews();
}

/**
 * Amend a draft claim. Approved claims are out of scope: they have posted, so
 * the correct remedy is to void the bill and raise a new claim, leaving the
 * reversal on record.
 */
export async function updateExpenseClaim(input: {
  id: string;
  claimantId: string;
  claimantName: string;
  description: string;
  date: string;
  accountId: string;
  amount: string;
  currency?: string;
  paymentMethod?: string;
  location?: string;
  notes?: string;
  receiptAttachment?: BillAttachmentInput | null;
}) {
  const workspace = await requireAccountantRole();

  const existing = await prisma.bill.findFirst({
    where: { id: input.id, organizationId: workspace.organizationId, isExpenseClaim: true },
    select: { id: true, status: true, invoiceNo: true },
  });
  if (!existing) throw new Error("Claim not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("This claim has already been approved. Void it from Bills and raise a new one.");
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }

  await saveBillDraft(prisma, workspace.organizationId, workspace.userId, {
    id: existing.id,
    contactId: input.claimantId,
    contactName: input.claimantName,
    // Keep the number it was issued with rather than minting a new one.
    documentNo: existing.invoiceNo,
    issueDate: input.date,
    dueDate: input.date,
    currency: input.currency as any,
    isExpenseClaim: true,
    amountsAre: "no_vat",
    paymentMethod: input.paymentMethod,
    location: input.location,
    notes: input.notes,
    receiptAttachment: input.receiptAttachment ?? null,
    lines: [
      {
        description: input.description.trim(),
        quantity: "1",
        unitPrice: input.amount,
        accountId: input.accountId,
        taxCode: "no_vat",
      },
    ],
  });

  revalidateClaimViews();
}
