"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";

export type CreateTaxRateInput = {
  code?: string;
  name: string;
  rate: number;
  description?: string;
  isActive?: boolean;
};

export type ManagedTaxRate = {
  id: string;
  code: string;
  name: string;
  rate: number;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
};

function slugifyCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function refreshTaxPaths() {
  revalidatePath("/taxes");
  revalidatePath("/sales/invoices");
  revalidatePath("/purchases/bills");
  revalidatePath("/accounting/chart-of-accounts");
}

/** System rates (read-only) plus this organization's custom rates. */
export async function listManagedTaxRates(): Promise<ManagedTaxRate[]> {
  const workspace = await requireAccountantRole();

  const rows = await prisma.taxRate.findMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: workspace.organizationId }],
    },
    orderBy: [{ organizationId: "asc" }, { code: "asc" }],
    select: {
      id: true,
      organizationId: true,
      code: true,
      name: true,
      rate: true,
      description: true,
      isActive: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    rate: Number(row.rate),
    description: row.description,
    isActive: row.isActive,
    isSystem: row.organizationId === null,
  }));
}

/** Creates a custom tax rate owned by the caller's organization. */
export async function createTaxRate(input: CreateTaxRateInput) {
  const workspace = await requireAccountantRole();

  const name = input.name.trim();
  const rate = input.rate;
  const description = input.description?.trim() || null;
  const code = slugifyCode(input.code?.trim() || name);

  if (!name) {
    throw new Error("Tax rate name is required.");
  }

  if (!code || !/^[a-z0-9_]+$/.test(code)) {
    throw new Error("Could not derive a valid code — use letters and numbers in the name.");
  }

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("Tax rate must be between 0 and 100.");
  }

  // A custom code must not shadow a system code or duplicate one of the
  // organization's own codes (matches the partial unique indexes in SQL).
  const existing = await prisma.taxRate.findFirst({
    where: {
      code,
      OR: [{ organizationId: null }, { organizationId: workspace.organizationId }],
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`A tax rate with code "${code}" already exists.`);
  }

  await prisma.taxRate.create({
    data: {
      organizationId: workspace.organizationId,
      code,
      name,
      rate,
      description,
      isActive: input.isActive ?? true,
    },
  });

  refreshTaxPaths();

  return { code, name };
}

export type UpdateTaxRateInput = {
  name?: string;
  rate?: number;
  isActive?: boolean;
};

/**
 * Updates a custom tax rate owned by the caller's organization. System rates
 * cannot be edited. Rate changes only affect documents saved from now on —
 * existing invoice/bill lines snapshot their rate at save time.
 */
export async function updateCustomTaxRate(id: string, input: UpdateTaxRateInput) {
  const workspace = await requireAccountantRole();

  const existing = await prisma.taxRate.findFirst({
    where: { id, organizationId: workspace.organizationId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error("Tax rate not found, or it is a system rate and cannot be edited.");
  }

  const data: { name?: string; rate?: number; isActive?: boolean } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Tax rate name is required.");
    data.name = name;
  }

  if (input.rate !== undefined) {
    if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
      throw new Error("Tax rate must be between 0 and 100.");
    }
    data.rate = input.rate;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  await prisma.taxRate.update({
    where: { id: existing.id },
    data,
  });

  refreshTaxPaths();

  return { id: existing.id };
}

/**
 * Permanently deletes a custom tax rate — allowed only when nothing in the
 * organization references its code (invoice lines, bill lines, or chart
 * account defaults). Used rates must be deactivated instead so historical
 * documents keep resolving their tax code.
 */
export async function deleteCustomTaxRate(id: string) {
  const workspace = await requireAccountantRole();
  const organizationId = workspace.organizationId;

  const existing = await prisma.taxRate.findFirst({
    where: { id, organizationId },
    select: { id: true, code: true },
  });

  if (!existing) {
    throw new Error("Tax rate not found, or it is a system rate and cannot be deleted.");
  }

  const [invoiceLineCount, billLineCount, accountCount] = await Promise.all([
    prisma.invoiceLine.count({ where: { organizationId, taxCode: existing.code } }),
    prisma.billLine.count({ where: { organizationId, taxCode: existing.code } }),
    prisma.chartAccount.count({ where: { organizationId, taxCode: existing.code } }),
  ]);

  const usageCount = invoiceLineCount + billLineCount + accountCount;
  if (usageCount > 0) {
    throw new Error(
      `"${existing.code}" is used by ${usageCount} record(s) (invoice/bill lines or account defaults). Deactivate it instead of deleting.`
    );
  }

  await prisma.taxRate.delete({ where: { id: existing.id } });

  refreshTaxPaths();

  return { id: existing.id };
}
