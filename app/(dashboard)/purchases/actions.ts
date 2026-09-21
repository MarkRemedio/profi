"use server";

import { revalidatePath } from "next/cache";
import { ContactType, CurrencyCode } from "@prisma/client";

import {
  approveBill,
  getDocumentOptions,
  listBills,
  payBill,
  revertBillToDraft,
  saveBillDraft,
  nextBillNumber,
  voidBill,
  type DocumentDraftInput,
  type PaymentMethod,
} from "@/lib/accounting/documents";
import { requireAccountingWorkspace, requireAccountantRole } from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";
import {
  saveDocumentTemplate,
  listDocumentTemplates,
  getDocumentTemplate,
  deleteDocumentTemplate,
  type SaveTemplateInput,
} from "@/lib/accounting/templates";
import { ensureShippingAccount } from "@/lib/accounting/chart-accounts";
import {
  deletePurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  recalculatePurchaseOrderStatuses,
  savePurchaseOrderDraft,
  updatePurchaseOrderStatus,
  type PurchaseOrderDraftInput,
  type PurchaseOrderStatus,
} from "@/lib/accounting/purchase-orders";

/** A new supplier defaults to the workspace's currency, not GBP. */
async function orgCurrency(organizationId: string): Promise<CurrencyCode> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  const base = org?.baseCurrency;
  return base && base in CurrencyCode ? (base as CurrencyCode) : CurrencyCode.GBP;
}

export type CreateSupplierInput = {
  name: string;
  email?: string;
  defaultCurrency?: CurrencyCode;
  /**
   * Which list this contact belongs in. A bill can be raised against a vendor
   * or against a member of staff reclaiming what they paid out of pocket, and
   * the two land in different places: suppliers in the Suppliers directory,
   * people in the Expense Claims claimant list. Defaults to supplier, which is
   * the overwhelmingly common case and preserves existing callers.
   */
  contactKind?: "supplier" | "person";
};

function revalidateBillViews() {
  revalidatePath("/purchases");
  // A contact created from the bill dialog may be a person rather than a
  // vendor, in which case they belong to the claimant list on this page.
  revalidatePath("/purchases/expense-claims");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/accounting/journals");
  revalidatePath("/taxes");
}

function revalidatePurchaseOrderViews() {
  revalidatePath("/purchases");
  revalidatePath("/purchases/orders");
  revalidatePath("/dashboard");
}

async function linkedPurchaseOrderIdsForBill(organizationId: string, billId: string) {
  const rows = await prisma.billLine.findMany({
    where: {
      organizationId,
      billId,
      purchaseOrderLineId: { not: null },
    },
    select: {
      purchaseOrderLine: {
        select: { purchaseOrderId: true },
      },
    },
  });

  return Array.from(
    new Set(
      rows
        .map((row) => row.purchaseOrderLine?.purchaseOrderId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function ensureBillShippingAccount() {
  const workspace = await requireAccountantRole();
  const account = await ensureShippingAccount(prisma, workspace.organizationId, "expense");
  revalidateBillViews();
  return account;
}

export async function getBillWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [bills, options] = await Promise.all([
    listBills(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
  ]);

  return {
    bills,
    // Employees are included so an expense claim — which is a bill owed to the
    // claimant — still resolves its contact when opened from Bills. Without
    // them the supplier field renders blank on any claim. They remain a
    // separate contact type, so they stay off the Suppliers page and out of
    // supplier statements and purchase reports.
    contacts: options.contacts.filter((contact) =>
      ["supplier", "both", "employee"].includes(contact.contactType),
    ),
    accounts: options.accounts.filter((account) =>
      [
        "cost_of_sales",
        "expense",
        "depreciation",
        "current_asset",
        "fixed_asset",
        "non_current_asset",
      ].includes(account.reportCategory),
    ),
    // Payment sources for "mark as paid". Must mirror the server-side check in
    // resolveDepositAccount (documents.ts): active BANK-category accounts only.
    bankAccounts: options.accounts.filter((account) => account.reportCategory === "bank"),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function getPurchaseOrderWorkspace() {
  const workspace = await requireAccountantRole();
  const [orders, options, org] = await Promise.all([
    listPurchaseOrders(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
    prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: { baseCurrency: true },
    }),
  ]);

  return {
    orders,
    contacts: options.contacts.filter((contact) =>
      ["supplier", "both"].includes(contact.contactType),
    ),
    baseCurrency: org?.baseCurrency ?? "GBP", // currency:allow last-resort default; the organisation is the tenant being read
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function getPurchaseOrderDocument(orderId: string) {
  const workspace = await requireAccountantRole();
  return getPurchaseOrder(prisma, workspace.organizationId, orderId);
}

/**
 * Whether a purchase document is an expense claim rather than a supplier bill.
 *
 * Decided from the payee's contact type, on the server, rather than taken from
 * the form. Money owed to one of your own people for something they paid out of
 * pocket is a claim; money owed to a supplier is a bill. That distinction picks
 * the numbering series, so letting the browser assert it would let a client
 * choose which sequence to consume.
 *
 * A brand-new payee has no record yet, so the caller's flag stands — that is
 * what tells resolveContact whether to create an employee or a supplier.
 */
async function isClaimForPayee(
  organizationId: string,
  contactId: string | undefined,
  fallback: boolean,
): Promise<boolean> {
  if (!contactId) return fallback;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { contactType: true },
  });
  if (!contact) return fallback;
  return contact.contactType === "EMPLOYEE";
}

export async function saveBill(input: DocumentDraftInput) {
  const workspace = await requireAccountantRole();
  const id = await saveBillDraft(prisma, workspace.organizationId, workspace.userId, {
    ...input,
    isExpenseClaim: await isClaimForPayee(
      workspace.organizationId,
      input.contactId,
      input.isExpenseClaim === true,
    ),
  });
  revalidateBillViews();
  revalidatePurchaseOrderViews();
  return id;
}

export async function savePurchaseOrderDocument(input: PurchaseOrderDraftInput) {
  const workspace = await requireAccountantRole();
  const order = await savePurchaseOrderDraft(prisma, workspace.organizationId, input);
  revalidatePurchaseOrderViews();
  return order;
}

export async function deletePurchaseOrderDocument(orderId: string) {
  const workspace = await requireAccountantRole();
  await deletePurchaseOrder(prisma, workspace.organizationId, orderId);
  revalidatePurchaseOrderViews();
  return { success: true };
}

export async function updatePurchaseOrderStatusDocument(
  orderId: string,
  status: PurchaseOrderStatus,
) {
  const workspace = await requireAccountantRole();
  await updatePurchaseOrderStatus(prisma, workspace.organizationId, orderId, status);
  revalidatePurchaseOrderViews();
  return { success: true };
}

/**
 * The number a purchase document would be given if saved now.
 *
 * Read-only — it does not consume the number, so two people previewing at once
 * both see the same one and whoever saves first takes it. The form shows this
 * as a placeholder so you can see whether you are about to raise a bill or a
 * claim before committing to it.
 */
export async function previewNextPurchaseNumber(contactId?: string): Promise<{
  number: string;
  isExpenseClaim: boolean;
}> {
  const workspace = await requireAccountantRole();
  const isExpenseClaim = await isClaimForPayee(workspace.organizationId, contactId, false);
  const number = await nextBillNumber(prisma, workspace.organizationId, isExpenseClaim);
  return { number, isExpenseClaim };
}

export async function createSupplier(input: CreateSupplierInput) {
  const workspace = await requireAccountantRole();
  const name = input.name.trim();
  if (!name) throw new Error("Supplier name is required.");

  const supplier = await prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({
      where: {
        organizationId: workspace.organizationId,
        name: { equals: name, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        contactType: true,
        paymentTermsDays: true,
        paymentScheduleType: true,
        paymentScheduleDay: true,
        billingAddress: true,
        defaultCurrency: true,
      },
    });

    if (existing) {
      // An existing contact keeps whatever it already is: somebody recorded as
      // an employee should not silently become a supplier because a bill was
      // raised against them, and vice versa. Only a customer is widened, since
      // being billed by someone you also sell to is genuinely "both".
      const contactType =
        existing.contactType === ContactType.CUSTOMER ? ContactType.BOTH : existing.contactType;

      return tx.contact.update({
        where: { id: existing.id },
        data: {
          contactType,
          email: input.email?.trim() || undefined,
          defaultCurrency: input.defaultCurrency ?? (await orgCurrency(workspace.organizationId)),
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          contactType: true,
          paymentTermsDays: true,
          paymentScheduleType: true,
          paymentScheduleDay: true,
          billingAddress: true,
          defaultCurrency: true,
        },
      });
    }

    return tx.contact.create({
      data: {
        organizationId: workspace.organizationId,
        contactType: input.contactKind === "person" ? ContactType.EMPLOYEE : ContactType.SUPPLIER,
        name,
        email: input.email?.trim() || null,
        defaultCurrency: input.defaultCurrency ?? (await orgCurrency(workspace.organizationId)),
        paymentTermsDays: 30,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        contactType: true,
        paymentTermsDays: true,
        paymentScheduleType: true,
        paymentScheduleDay: true,
        billingAddress: true,
        defaultCurrency: true,
      },
    });
  });

  revalidateBillViews();

  return {
    id: supplier.id,
    name: supplier.name,
    email: supplier.email ?? null,
    contactType: supplier.contactType.toLowerCase(),
    paymentTermsDays: supplier.paymentTermsDays,
    paymentScheduleType: supplier.paymentScheduleType as "day_of_month" | "end_of_month" | null,
    paymentScheduleDay: supplier.paymentScheduleDay,
    billingAddress: supplier.billingAddress ?? null,
    defaultCurrency: String(supplier.defaultCurrency),
  };
}

export async function approveBillDocument(billId: string) {
  const workspace = await requireAccountantRole();
  const result = await approveBill(prisma, workspace.organizationId, workspace.userId, billId);
  const orderIds = await linkedPurchaseOrderIdsForBill(workspace.organizationId, billId);
  await recalculatePurchaseOrderStatuses(prisma, workspace.organizationId, orderIds);
  revalidateBillViews();
  revalidatePurchaseOrderViews();
  return result;
}

export async function voidBillDocument(billId: string) {
  const workspace = await requireAccountantRole();
  const result = await voidBill(prisma, workspace.organizationId, workspace.userId, billId);
  const orderIds = await linkedPurchaseOrderIdsForBill(workspace.organizationId, billId);
  await recalculatePurchaseOrderStatuses(prisma, workspace.organizationId, orderIds);
  revalidateBillViews();
  revalidatePurchaseOrderViews();
  return result;
}

export async function payBillDocument(
  billId: string,
  paymentAccountId?: string,
  paymentMethod?: PaymentMethod,
) {
  const workspace = await requireAccountantRole();
  // Clamp to the allowed enum so an unexpected value stores NULL rather than
  // hitting the DB CHECK constraint with a raw, unfriendly error.
  const method =
    paymentMethod && (["cash", "cheque", "bank_transfer"] as const).includes(paymentMethod)
      ? paymentMethod
      : undefined;
  const result = await payBill(
    prisma,
    workspace.organizationId,
    workspace.userId,
    billId,
    paymentAccountId,
    method,
  );
  revalidateBillViews();
  return result;
}

export async function revertBillToDraftDocument(billId: string) {
  const workspace = await requireAccountantRole();
  const result = await revertBillToDraft(
    prisma,
    workspace.organizationId,
    workspace.userId,
    billId,
  );
  const orderIds = await linkedPurchaseOrderIdsForBill(workspace.organizationId, billId);
  await recalculatePurchaseOrderStatuses(prisma, workspace.organizationId, orderIds);
  revalidateBillViews();
  revalidatePurchaseOrderViews();
  return result;
}

export async function saveBillTemplate(input: Omit<SaveTemplateInput, "kind">) {
  const workspace = await requireAccountantRole();
  return saveDocumentTemplate(prisma, workspace.organizationId, workspace.userId, {
    ...input,
    kind: "bill",
  });
}

export async function listBillTemplates() {
  const workspace = await requireAccountantRole();
  return listDocumentTemplates(prisma, workspace.organizationId, "bill");
}

export async function getBillTemplate(id: string) {
  const workspace = await requireAccountantRole();
  return getDocumentTemplate(prisma, workspace.organizationId, id);
}

export async function deleteBillTemplate(id: string) {
  const workspace = await requireAccountantRole();
  await deleteDocumentTemplate(prisma, workspace.organizationId, id);
  return { success: true };
}
