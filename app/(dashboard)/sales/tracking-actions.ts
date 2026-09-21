"use server";

import { revalidatePath } from "next/cache";

import { requireAccountingWorkspace, requireAccountantRole } from "@/lib/accounting/dal";
import {
  listInvoiceTrackingSettings,
  saveInvoiceTrackingSettingsRecord,
} from "@/lib/accounting/tracking";
import type { SaveInvoiceTrackingSettingsInput } from "@/lib/accounting/tracking-types";
import { prisma } from "@/lib/prisma";

export async function getInvoiceTrackingSettings() {
  const workspace = await requireAccountingWorkspace();
  return listInvoiceTrackingSettings(prisma, workspace.organizationId, {
    ensureBuiltIns: workspace.role === "owner" || workspace.role === "accountant",
    includeInactive: true,
  });
}

export async function saveInvoiceTrackingSettings(input: SaveInvoiceTrackingSettingsInput) {
  const workspace = await requireAccountantRole();
  const result = await saveInvoiceTrackingSettingsRecord(
    prisma,
    workspace.organizationId,
    workspace.userId,
    input
  );
  revalidatePath("/sales/invoices");
  revalidatePath("/settings/sales");
  return result;
}
