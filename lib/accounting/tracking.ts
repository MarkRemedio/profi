import "server-only";

import { AuditAction } from "@prisma/client";

import type { DbOrTx, ExtendedPrismaClient } from "@/lib/prisma";
import {
  normalizeTrackingSettingsInput,
  type InvoiceTrackingSettingsDto,
  type SaveInvoiceTrackingSettingsInput,
  type TrackingAssignmentInput,
  type TrackingDimensionDto,
  type TrackingDimensionKey,
} from "@/lib/accounting/tracking-types";

const BASE_DIMENSIONS = [
  { key: "class", label: "Class", position: 0 },
  { key: "location", label: "Location", position: 1 },
] as const;

async function ensureBaseDimensions(db: DbOrTx, organizationId: string) {
  await db.trackingDimension.createMany({
    data: BASE_DIMENSIONS.map((dimension) => ({ organizationId, ...dimension })),
    skipDuplicates: true,
  });
}

function dimensionDto(row: {
  id: string;
  key: string;
  label: string;
  position: number;
  isActive: boolean;
  options: { id: string; name: string; isActive: boolean }[];
}): TrackingDimensionDto {
  return {
    id: row.id,
    key: row.key as TrackingDimensionKey,
    label: row.label,
    position: row.position,
    isActive: row.isActive,
    options: row.options.map((option) => ({ ...option })),
  };
}

export async function listInvoiceTrackingSettings(
  db: DbOrTx,
  organizationId: string,
  options: { ensureBuiltIns?: boolean; includeInactive?: boolean } = {}
): Promise<InvoiceTrackingSettingsDto> {
  if (options.ensureBuiltIns) await ensureBaseDimensions(db, organizationId);

  const [organization, dimensions] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { invoiceTrackingEnabled: true },
    }),
    db.trackingDimension.findMany({
      where: {
        organizationId,
        ...(options.includeInactive ? {} : { isActive: true }),
      },
      orderBy: { position: "asc" },
      select: {
        id: true,
        key: true,
        label: true,
        position: true,
        isActive: true,
        options: {
          where: options.includeInactive ? {} : { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, isActive: true },
        },
      },
    }),
  ]);

  return {
    enabled: organization.invoiceTrackingEnabled,
    dimensions: dimensions.map(dimensionDto),
  };
}

export async function saveInvoiceTrackingSettingsRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: SaveInvoiceTrackingSettingsInput
): Promise<InvoiceTrackingSettingsDto> {
  const normalized = normalizeTrackingSettingsInput(input);

  await prisma.$transaction(async (tx) => {
    await ensureBaseDimensions(tx, organizationId);
    await tx.organization.update({
      where: { id: organizationId },
      data: { invoiceTrackingEnabled: Boolean(input.enabled) },
    });

    for (const dimensionInput of normalized) {
      const dimension = await tx.trackingDimension.upsert({
        where: {
          organizationId_key: { organizationId, key: dimensionInput.key },
        },
        update: {
          label: dimensionInput.label,
          position: dimensionInput.position,
          isActive: dimensionInput.isActive,
        },
        create: {
          organizationId,
          key: dimensionInput.key,
          label: dimensionInput.label,
          position: dimensionInput.position,
          isActive: dimensionInput.isActive,
        },
        select: { id: true },
      });

      await tx.trackingOption.updateMany({
        where: { organizationId, dimensionId: dimension.id },
        data: { isActive: false },
      });

      for (const name of dimensionInput.options) {
        const normalizedName = name.toLowerCase();
        await tx.trackingOption.upsert({
          where: {
            organizationId_dimensionId_normalizedName: {
              organizationId,
              dimensionId: dimension.id,
              normalizedName,
            },
          },
          update: { name, isActive: dimensionInput.isActive },
          create: {
            organizationId,
            dimensionId: dimension.id,
            name,
            normalizedName,
            isActive: dimensionInput.isActive,
          },
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice_tracking_settings",
        entityId: organizationId,
        action: AuditAction.UPDATE,
        after: {
          enabled: Boolean(input.enabled),
          activeDimensions: normalized.filter((dimension) => dimension.isActive).map((dimension) => dimension.key),
        },
      },
    });
  });

  return listInvoiceTrackingSettings(prisma, organizationId, {
    ensureBuiltIns: true,
    includeInactive: true,
  });
}

/**
 * Resolve client-supplied ids to active, same-organization dimension/option
 * pairs. The database FKs guarantee existence; this check guarantees tenancy
 * and that an option actually belongs to the supplied dimension.
 */
export async function validateTrackingAssignments(
  db: DbOrTx,
  organizationId: string,
  assignments: TrackingAssignmentInput[]
): Promise<TrackingAssignmentInput[]> {
  const compact = assignments.filter((assignment) => assignment.dimensionId && assignment.optionId);
  const dimensionIds = new Set(compact.map((assignment) => assignment.dimensionId));
  if (dimensionIds.size !== compact.length) {
    throw new Error("Choose only one value for each tracking field.");
  }
  if (compact.length > 5) throw new Error("An invoice can use at most five tracking fields.");
  if (compact.length === 0) return [];

  const optionIds = compact.map((assignment) => assignment.optionId);
  const rows = await db.trackingOption.findMany({
    where: {
      organizationId,
      id: { in: optionIds },
      isActive: true,
      dimension: { isActive: true },
    },
    select: { id: true, dimensionId: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row.dimensionId]));
  for (const assignment of compact) {
    if (byId.get(assignment.optionId) !== assignment.dimensionId) {
      throw new Error("A selected tracking value is no longer available.");
    }
  }
  return compact;
}
