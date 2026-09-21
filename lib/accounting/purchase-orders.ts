import "server-only";

import { CurrencyCode, type PurchaseOrderStatus } from "@prisma/client";
export type { PurchaseOrderStatus };

import { convertMinor, fetchExchangeRate } from "@/lib/accounting/exchange-rates";
import { toCurrencyCode } from "@/lib/currency";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { withDocNumberRetry } from "@/lib/accounting/documents";
import type { DbOrTx } from "@/lib/prisma";

export type PurchaseOrderLineInput = {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

export type PurchaseOrderDraftInput = {
  id?: string;
  poNumber: string;
  supplierName: string;
  supplierEmail?: string;
  orderDate: string;
  expectedDate?: string;
  currency?: CurrencyCode;
  exchangeRate?: number;
  reference?: string;
  notes?: string;
  status?: PurchaseOrderStatus;
  lines: PurchaseOrderLineInput[];
};

export type PurchaseOrderLineDto = {
  id: string;
  description: string;
  quantity: string;
  unitAmountMinor: number;
  subtotalMinor: number;
};

export type PurchaseOrderDto = {
  id: string;
  poNumber: string;
  supplierName: string;
  supplierEmail: string | null;
  orderDate: string;
  expectedDate: string | null;
  currency: string;
  exchangeRate: number;
  subtotalMinor: number;
  baseTotalMinor: number;
  reference: string | null;
  notes: string | null;
  status: PurchaseOrderStatus;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLineDto[];
};

type PurchaseOrderTx = DbOrTx & {
  organization: {
    findUnique: (args: any) => Promise<{ baseCurrency: string } | null>;
  };
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function optionalDate(value: string | undefined | null) {
  return value ? toDate(value) : null;
}

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function parseQuantityHundredths(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a positive quantity with up to 2 decimal places.");
  }

  const [whole, fractional = ""] = normalized.split(".");
  const quantity = BigInt(whole) * BigInt(100) + BigInt(fractional.padEnd(2, "0"));
  if (quantity <= BigInt(0)) {
    throw new Error("Line quantities must be positive.");
  }
  return quantity;
}

function parseMinor(value: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Enter a positive line amount.");
  }
  return Math.round(parsed * 100);
}

function lineSubtotalMinor(quantity: string, unitPrice: string) {
  const hundredths = parseQuantityHundredths(quantity);
  const unitMinor = BigInt(parseMinor(unitPrice));
  return Number((unitMinor * hundredths + BigInt(50)) / BigInt(100));
}

function nextPurchaseOrderNumber(existing: string[]) {
  const pattern = /^PO-(\d+)$/i;
  let max = 0;
  for (const value of existing) {
    const match = value.match(pattern);
    if (!match) continue;
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > max) max = numeric;
  }
  return `PO-${String(max + 1).padStart(4, "0")}`;
}

function normalizeStatus(value: unknown): PurchaseOrderStatus {
  const statuses: PurchaseOrderStatus[] = [
    "DRAFT",
    "SENT",
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "CANCELLED",
  ];

  const normalized = String(value ?? "").toUpperCase() as PurchaseOrderStatus;
  return statuses.includes(normalized) ? normalized : "DRAFT";
}

function quantityToHundredths(value: unknown) {
  const parsed = Number(String(value ?? 0));
  return BigInt(Math.round(parsed * 100));
}

/**
 * The currency this workspace keeps its books in.
 *
 * organizations.base_currency is a plain text column, so toCurrencyCode
 * normalises whatever it holds rather than trusting it into an enum position.
 * The organisation always exists here — it is the tenant this call is scoped to
 * — so the default only covers a row that has been deleted mid-request.
 */
async function workspaceCurrency(
  tx: PurchaseOrderTx,
  organizationId: string
): Promise<CurrencyCode> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  return toCurrencyCode(org?.baseCurrency);
}

async function resolveDocumentRate(
  tx: PurchaseOrderTx,
  organizationId: string,
  documentCurrency: CurrencyCode,
  issueDate: Date,
  supplied?: number
): Promise<number> {
  const base = await workspaceCurrency(tx, organizationId);

  if (documentCurrency === base) return 1;
  if (typeof supplied === "number" && Number.isFinite(supplied) && supplied > 0) {
    return supplied;
  }

  const looked = await fetchExchangeRate(documentCurrency, base, issueDate);
  if (!looked) {
    throw new Error(
      `No exchange rate available for ${documentCurrency} to ${base} on ${issueDate.toISOString().slice(0, 10)}.`
    );
  }

  return looked.rate;
}

/**
 * A purchase order row as the client may receive it.
 *
 * Prisma hands back Decimal instances for exchangeRate and quantity, and a
 * Decimal cannot cross from a server component or server action into a client
 * component — React refuses to serialise it. The listing and single-order
 * readers already converted them; the save path returned the raw row, which is
 * what broke creating an order.
 *
 * One function rather than three copies of the same twenty lines, so the next
 * reader added to the row cannot be converted in two places and forgotten in
 * the third. Output is identical to the mappings it replaces.
 */
function toPurchaseOrderDto(row: {
  id: string;
  poNumber: string;
  supplierName: string;
  supplierEmail: string | null;
  orderDate: Date;
  expectedDate: Date | null;
  currency: unknown;
  exchangeRate: unknown;
  subtotalMinor: unknown;
  baseTotalMinor: unknown;
  reference: string | null;
  notes: string | null;
  status: unknown;
  createdAt: Date;
  updatedAt: Date;
  lines: {
    id: string;
    description: string;
    quantity: unknown;
    unitAmountMinor: unknown;
    subtotalMinor: unknown;
  }[];
}): PurchaseOrderDto {
  return {
    id: row.id,
    poNumber: row.poNumber,
    supplierName: row.supplierName,
    supplierEmail: row.supplierEmail,
    orderDate: row.orderDate.toISOString().slice(0, 10),
    expectedDate: isoDate(row.expectedDate),
    currency: String(row.currency),
    exchangeRate: Number(row.exchangeRate),
    subtotalMinor: Number(row.subtotalMinor),
    baseTotalMinor: Number(row.baseTotalMinor),
    reference: row.reference,
    notes: row.notes,
    status: normalizeStatus(row.status as PurchaseOrderStatus),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: String(line.quantity),
      unitAmountMinor: Number(line.unitAmountMinor),
      subtotalMinor: Number(line.subtotalMinor),
    })),
  };
}

export async function listPurchaseOrders(prisma: DbOrTx, organizationId: string) {
  const rows = await prisma.purchaseOrder.findMany({
    where: { organizationId },
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });

  return rows.map(toPurchaseOrderDto);
}

export async function getPurchaseOrder(prisma: DbOrTx, organizationId: string, orderId: string) {
  const row = await prisma.purchaseOrder.findFirst({
    where: { organizationId, id: orderId },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });

  if (!row) return null;

  return toPurchaseOrderDto(row);
}

export async function recalculatePurchaseOrderStatuses(
  prisma: DbOrTx,
  organizationId: string,
  purchaseOrderIds: string[]
) {
  const ids = Array.from(new Set(purchaseOrderIds.filter(Boolean)));
  if (ids.length === 0) return;

  const orders = await prisma.purchaseOrder.findMany({
    where: { organizationId, id: { in: ids } },
    select: {
      id: true,
      status: true,
      lines: {
        select: {
          quantity: true,
          billLines: {
            where: { bill: { status: { not: "VOID" } } },
            select: { quantity: true },
          },
        },
      },
    },
  });

  for (const order of orders) {
    if (order.status === "CANCELLED") continue;

    let anyAllocated = false;
    let allFulfilled = order.lines.length > 0;

    for (const line of order.lines) {
      const ordered = quantityToHundredths(line.quantity);
      const used = line.billLines.reduce(
        (sum, billLine) => sum + quantityToHundredths(billLine.quantity),
        BigInt(0)
      );

      if (used > BigInt(0)) anyAllocated = true;
      if (used < ordered) allFulfilled = false;
    }

    let nextStatus = order.status;
    if (anyAllocated) {
      nextStatus = allFulfilled ? "RECEIVED" : "PARTIALLY_RECEIVED";
    } else if (order.status === "PARTIALLY_RECEIVED" || order.status === "RECEIVED") {
      nextStatus = "SENT";
    }

    if (nextStatus !== order.status) {
      await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: { status: nextStatus },
      });
    }
  }
}

export async function savePurchaseOrderDraft(
  prisma: DbOrTx,
  organizationId: string,
  input: PurchaseOrderDraftInput
) {
  return withDocNumberRetry(async () =>
    prisma.$transaction(async (tx) => {
      const supplierName = input.supplierName.trim();
      if (!supplierName) throw new Error("Supplier name is required.");

      const lines = input.lines
        .map((line) => ({
          ...line,
          description: line.description.trim(),
          quantity: line.quantity.trim(),
          unitPrice: line.unitPrice.trim(),
        }))
        .filter((line) => line.description.length > 0);

      if (lines.length === 0) {
        throw new Error("Add at least one line item.");
      }

      const normalizedLines = lines.map((line) => ({
        id: line.id ?? crypto.randomUUID(),
        description: line.description,
        quantity: line.quantity,
        unitAmountMinor: parseMinor(line.unitPrice),
        subtotalMinor: lineSubtotalMinor(line.quantity, line.unitPrice),
      }));

      const subtotalMinor = normalizedLines.reduce((sum, line) => sum + line.subtotalMinor, 0);
      const issueDate = toDate(input.orderDate || accountingToday());
      /* The workspace’s own currency when the form did not name one — not GBP.
         This is a write: a Canadian workspace saving an order got a document
         marked GBP, then converted at a GBP rate, so its base total was a
         conversion of a number the buyer had typed as dollars. Nothing on
         screen said so, because the order rendered in the currency it had
         been wrongly given. */
      const currency = input.currency ?? (await workspaceCurrency(tx as PurchaseOrderTx, organizationId));
      const exchangeRate = await resolveDocumentRate(tx as PurchaseOrderTx, organizationId, currency, issueDate, input.exchangeRate);
      const baseTotalMinor = convertMinor(subtotalMinor, exchangeRate);
      const expectedDate = optionalDate(input.expectedDate?.trim() || null);
      const status = normalizeStatus(input.status);
      const desiredNumber = input.poNumber.trim();

      const existing = input.id
        ? await tx.purchaseOrder.findFirst({
            where: { id: input.id, organizationId },
            select: { id: true, poNumber: true },
          })
        : null;

      const duplicateNumber = desiredNumber
        ? await tx.purchaseOrder.findFirst({
            where: {
              organizationId,
              poNumber: desiredNumber,
              ...(input.id ? { NOT: { id: input.id } } : {}),
            },
            select: { id: true },
          })
        : null;

      const poNumber =
        desiredNumber && !duplicateNumber ? desiredNumber : nextPurchaseOrderNumber(
          (
            await tx.purchaseOrder.findMany({
              where: { organizationId },
              select: { poNumber: true },
            })
          ).map((row) => row.poNumber)
        );

      if (existing) {
        await tx.purchaseOrderLine.deleteMany({
          where: { organizationId, purchaseOrderId: existing.id },
        });

        const updated = await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: {
            poNumber,
            supplierName,
            supplierEmail: input.supplierEmail?.trim() || null,
            orderDate: issueDate,
            expectedDate,
            currency,
            exchangeRate,
            subtotalMinor,
            baseTotalMinor,
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            status,
            lines: {
              createMany: {
                data: normalizedLines.map((line) => ({
                  organizationId,
                  description: line.description,
                  quantity: line.quantity,
                  unitAmountMinor: line.unitAmountMinor,
                  subtotalMinor: line.subtotalMinor,
                })),
              },
            },
          },
          include: { lines: { orderBy: { createdAt: "asc" } } },
        });

        return updated;
      }

      const created = await tx.purchaseOrder.create({
        data: {
          organizationId,
          poNumber,
          supplierName,
          supplierEmail: input.supplierEmail?.trim() || null,
          orderDate: issueDate,
          expectedDate,
          currency,
          exchangeRate,
          subtotalMinor,
          baseTotalMinor,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          status,
          lines: {
            createMany: {
              data: normalizedLines.map((line) => ({
                organizationId,
                description: line.description,
                quantity: line.quantity,
                unitAmountMinor: line.unitAmountMinor,
                subtotalMinor: line.subtotalMinor,
              })),
            },
          },
        },
        include: { lines: { orderBy: { createdAt: "asc" } } },
      });

      // Mapped, not raw: this is returned through a server action to a client
      // component, and Prisma's Decimal cannot make that crossing.
      return toPurchaseOrderDto(created);
    })
  );
}

export async function deletePurchaseOrder(prisma: DbOrTx, organizationId: string, purchaseOrderId: string) {
  await prisma.purchaseOrder.deleteMany({
    where: { id: purchaseOrderId, organizationId },
  });
}

export async function updatePurchaseOrderStatus(
  prisma: DbOrTx,
  organizationId: string,
  purchaseOrderId: string,
  status: PurchaseOrderStatus
) {
  await prisma.purchaseOrder.updateMany({
    where: { id: purchaseOrderId, organizationId },
    data: { status },
  });
}
