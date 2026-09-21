import "server-only";

import { AuditAction } from "@prisma/client";

import type { ExtendedPrismaClient } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/accounting/documents";

export type ChargeItemDto = {
  id: string;
  name: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  defaultAmountMinor: number;
  defaultTaxCode: string | null;
  isActive: boolean;
};

export type SaveChargeItemInput = {
  name: string;
  accountId: string;
  defaultAmountMinor: number;
  defaultTaxCode?: string | null;
};

const CHARGE_ITEM_SELECT = {
  id: true,
  name: true,
  accountId: true,
  defaultAmountMinor: true,
  defaultTaxCode: true,
  isActive: true,
  account: { select: { code: true, name: true } },
} as const;

function toDto(row: {
  id: string;
  name: string;
  accountId: string;
  defaultAmountMinor: number;
  defaultTaxCode: string | null;
  isActive: boolean;
  account: { code: string; name: string } | null;
}): ChargeItemDto {
  return {
    id: row.id,
    name: row.name,
    accountId: row.accountId,
    accountCode: row.account?.code ?? "----",
    accountName: row.account?.name ?? "Unknown account",
    defaultAmountMinor: row.defaultAmountMinor,
    defaultTaxCode: row.defaultTaxCode,
    isActive: row.isActive,
  };
}

/**
 * Validates and trims a catalogue entry; throws a user-facing message on bad
 * input. The account must be one this workspace's invoice lines may post to
 * (active REVENUE / sales or other income) — the same rule normalizeLines
 * enforces at invoice time, checked here so the mistake surfaces where it can
 * be fixed instead of on the next invoice.
 */
async function normalizeChargeItemInput(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  input: SaveChargeItemInput
) {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Give this charge a name.");
  if (name.length > 120) throw new Error("That charge name is too long.");

  const defaultAmountMinor = Math.round(Number(input.defaultAmountMinor));
  if (!Number.isFinite(defaultAmountMinor) || defaultAmountMinor < 0) {
    throw new Error("The default amount cannot be negative.");
  }

  const account = await prisma.chartAccount.findFirst({
    where: { id: input.accountId, organizationId, isActive: true },
    select: { id: true, accountType: true, reportCategory: true },
  });
  if (!account) throw new Error("Selected account is not available.");
  if (account.accountType !== "REVENUE" || !["SALES", "OTHER_INCOME"].includes(account.reportCategory)) {
    throw new Error("Charges must post to an income account, so they flow into sales reports.");
  }

  return {
    name,
    accountId: account.id,
    defaultAmountMinor,
    defaultTaxCode: input.defaultTaxCode?.trim() || null,
  };
}

/** Whole catalogue, active and archived — the settings UI shows both. */
export async function listChargeItems(
  prisma: ExtendedPrismaClient,
  organizationId: string
): Promise<ChargeItemDto[]> {
  const rows = await prisma.chargeItem.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: CHARGE_ITEM_SELECT,
  });
  return rows.map(toDto);
}

export async function createChargeItemRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: SaveChargeItemInput
): Promise<ChargeItemDto> {
  const data = await normalizeChargeItemInput(prisma, organizationId, input);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.chargeItem.create({
        data: { organizationId, ...data },
        select: CHARGE_ITEM_SELECT,
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "charge_item",
          entityId: row.id,
          action: AuditAction.CREATE,
          after: { name: row.name, defaultAmountMinor: row.defaultAmountMinor },
        },
      });
      return row;
    });
    return toDto(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("A charge with this name already exists.");
    }
    throw error;
  }
}

export async function updateChargeItemRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  chargeItemId: string,
  input: SaveChargeItemInput
): Promise<ChargeItemDto> {
  const existing = await prisma.chargeItem.findFirst({
    where: { id: chargeItemId, organizationId },
    select: { id: true },
  });
  if (!existing) throw new Error("That charge is no longer on your records.");

  const data = await normalizeChargeItemInput(prisma, organizationId, input);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.chargeItem.update({
        where: { id: existing.id },
        data,
        select: CHARGE_ITEM_SELECT,
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "charge_item",
          entityId: row.id,
          action: AuditAction.UPDATE,
          after: { name: row.name, defaultAmountMinor: row.defaultAmountMinor },
        },
      });
      return row;
    });
    return toDto(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("A charge with this name already exists.");
    }
    throw error;
  }
}

/**
 * Deactivate rather than delete: lines on saved invoices reference the item,
 * and a charge that was ever billed stays explainable. An archived item stops
 * being offered on new invoices but keeps its history.
 */
export async function setChargeItemActive(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  chargeItemId: string,
  isActive: boolean
): Promise<ChargeItemDto> {
  const existing = await prisma.chargeItem.findFirst({
    where: { id: chargeItemId, organizationId },
    select: { id: true },
  });
  if (!existing) throw new Error("That charge is no longer on your records.");

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.chargeItem.update({
      where: { id: existing.id },
      data: { isActive },
      select: CHARGE_ITEM_SELECT,
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "charge_item",
        entityId: row.id,
        action: AuditAction.UPDATE,
        after: { name: row.name, isActive },
      },
    });
    return row;
  });
  return toDto(updated);
}
