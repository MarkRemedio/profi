"use server";

import { revalidatePath } from "next/cache";

import {
  createRefundReceipt,
  listRefundReceipts,
  voidRefundReceipt,
  type ReceiptDraftInput,
} from "@/lib/accounting/receipts";
import { getDocumentOptions, type PaymentMethod } from "@/lib/accounting/documents";
import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

function revalidateRefundReceiptViews() {
  revalidatePath("/sales");
  revalidatePath("/sales/refund-receipts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/accounting/journals");
  revalidatePath("/taxes");
}

function clampPaymentMethod(method?: string | null): PaymentMethod | null {
  return method && (["cash", "cheque", "bank_transfer"] as readonly string[]).includes(method)
    ? (method as PaymentMethod)
    : null;
}

export async function getRefundReceiptWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [receipts, options] = await Promise.all([
    listRefundReceipts(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
  ]);

  return {
    receipts,
    contacts: options.contacts.filter((contact) =>
      ["customer", "both"].includes(contact.contactType)
    ),
    accounts: options.accounts.filter((account) =>
      ["sales", "other_income"].includes(account.reportCategory)
    ),
    bankAccounts: options.accounts.filter(
      (account) => account.reportCategory === "bank"
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function createRefundReceiptAction(input: ReceiptDraftInput) {
  const workspace = await requireAccountantRole();
  const result = await createRefundReceipt(prisma, workspace.organizationId, workspace.userId, {
    ...input,
    paymentMethod: clampPaymentMethod(input.paymentMethod),
  });
  revalidateRefundReceiptViews();
  return result;
}

export async function voidRefundReceiptAction(receiptId: string) {
  const workspace = await requireAccountantRole();
  const result = await voidRefundReceipt(
    prisma,
    workspace.organizationId,
    workspace.userId,
    receiptId
  );
  revalidateRefundReceiptViews();
  return result;
}
