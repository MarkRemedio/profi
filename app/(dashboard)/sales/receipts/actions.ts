"use server";

import { revalidatePath } from "next/cache";

import {
  createSalesReceipt,
  listSalesReceipts,
  voidSalesReceipt,
  type ReceiptDraftInput,
} from "@/lib/accounting/receipts";
import { getDocumentOptions, type PaymentMethod } from "@/lib/accounting/documents";
import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

function revalidateReceiptViews() {
  revalidatePath("/sales");
  revalidatePath("/sales/receipts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/accounting/journals");
  revalidatePath("/taxes");
}

// Clamp to the allowed enum so an unexpected value stores NULL rather than
// hitting the DB CHECK constraint with a raw, unfriendly error.
function clampPaymentMethod(method?: string | null): PaymentMethod | null {
  return method && (["cash", "cheque", "bank_transfer"] as readonly string[]).includes(method)
    ? (method as PaymentMethod)
    : null;
}

export async function getSalesReceiptWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [receipts, options] = await Promise.all([
    listSalesReceipts(prisma, workspace.organizationId),
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
    // Must mirror the server-side check in resolveDepositAccount: active
    // BANK-category accounts only.
    bankAccounts: options.accounts.filter(
      (account) => account.reportCategory === "bank"
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function createSalesReceiptAction(input: ReceiptDraftInput) {
  const workspace = await requireAccountantRole();
  const result = await createSalesReceipt(prisma, workspace.organizationId, workspace.userId, {
    ...input,
    paymentMethod: clampPaymentMethod(input.paymentMethod),
  });
  revalidateReceiptViews();
  return result;
}

export async function voidSalesReceiptAction(receiptId: string) {
  const workspace = await requireAccountantRole();
  const result = await voidSalesReceipt(
    prisma,
    workspace.organizationId,
    workspace.userId,
    receiptId
  );
  revalidateReceiptViews();
  return result;
}
