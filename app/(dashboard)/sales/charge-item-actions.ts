"use server";

import { revalidatePath } from "next/cache";

import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import {
  createChargeItemRecord,
  listChargeItems,
  setChargeItemActive,
  updateChargeItemRecord,
  type ChargeItemDto,
  type SaveChargeItemInput,
} from "@/lib/accounting/charge-items";
import { getDocumentOptions } from "@/lib/accounting/documents";
import { prisma } from "@/lib/prisma";

function revalidateChargeViews() {
  revalidatePath("/sales");
  revalidatePath("/sales/invoices");
}

/**
 * Everything the additional-charges settings section needs in one round trip:
 * the catalogue plus the income accounts and tax rates its pickers offer.
 */
export async function getChargeItemWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [chargeItems, options] = await Promise.all([
    listChargeItems(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
  ]);
  return {
    chargeItems,
    accounts: options.accounts.filter((account) =>
      ["sales", "other_income"].includes(account.reportCategory)
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
  };
}

export async function createChargeItem(
  input: SaveChargeItemInput
): Promise<ChargeItemDto> {
  const workspace = await requireAccountantRole();
  const item = await createChargeItemRecord(
    prisma,
    workspace.organizationId,
    workspace.userId,
    input
  );
  revalidateChargeViews();
  return item;
}

export async function updateChargeItem(
  chargeItemId: string,
  input: SaveChargeItemInput
): Promise<ChargeItemDto> {
  const workspace = await requireAccountantRole();
  const item = await updateChargeItemRecord(
    prisma,
    workspace.organizationId,
    workspace.userId,
    chargeItemId,
    input
  );
  revalidateChargeViews();
  return item;
}

export async function setChargeItemActiveState(
  chargeItemId: string,
  isActive: boolean
): Promise<ChargeItemDto> {
  const workspace = await requireAccountantRole();
  const item = await setChargeItemActive(
    prisma,
    workspace.organizationId,
    workspace.userId,
    chargeItemId,
    isActive
  );
  revalidateChargeViews();
  return item;
}
