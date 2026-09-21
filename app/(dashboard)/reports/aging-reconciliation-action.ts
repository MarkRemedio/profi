"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import {
  computeAgingReconciliation,
  type AgingReconciliation,
} from "@/lib/accounting/aging-reconciliation";

export type { AgingReconciliation, AgingAdjustment } from "@/lib/accounting/aging-reconciliation";

/** The aged reports' reconciliation, scoped to the caller's workspace. */
export async function getAgingReconciliation(): Promise<AgingReconciliation> {
  const { organizationId } = await requireAccountingWorkspace();
  return computeAgingReconciliation(prisma, organizationId);
}
