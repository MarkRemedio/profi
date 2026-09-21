"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  requirePosAccess, requirePosManager,
  listPosProducts, listPosSales, listPosRefunds, listPosStockLogs, listPosCustomers,
  lookupReceiptForReturn as lookupReceiptDal,
  processSale, refundSale, deleteSale, upsertProduct, deleteProduct,
  closePosDay, listPosDayCloses,
} from "@/lib/pos/dal";
import type { SaleLineInput } from "@/lib/pos/types";
import { formatMoney } from "@/lib/currency";
import { isMailConfigured, sendMail } from "@/lib/email/mailer";
import { posReceiptHtml } from "@/lib/pos/receipt-email";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";

type FailResult = { success: false; error: string; code?: string; details?: unknown };
type OkData<T> = { success: true; data: T; error?: never };
type OkMsg = { success: true; message?: string; archived?: boolean; error?: never };

function fail(error: unknown, fallback: string): FailResult {
  const e = error as { code?: string; message?: string; shortages?: unknown };
  if (e?.code === "INSUFFICIENT_STOCK") {
    return { success: false, error: "Insufficient stock for one or more items.", code: e.code, details: e.shortages };
  }
  if (e?.code === "VALIDATION" || e?.code === "FORBIDDEN" || e?.code === "NOT_FOUND") {
    return { success: false, error: e.message ?? fallback, code: e.code };
  }
  // A transaction that ran out of time. Named rather than folded into the
  // generic message, because the two need opposite responses: retrying a
  // timeout can work, whereas retrying a genuine failure will not, and a till
  // operator has no way to tell them apart from "Transaction failed."
  if (e?.code === "P2028") {
    return {
      success: false,
      error: "The sale took too long to record and was not completed. Nothing was charged — try again.",
      code: e.code,
    };
  }
  console.error(fallback, error);
  return { success: false, error: fallback };
}

export async function getPosProducts(): Promise<OkData<Awaited<ReturnType<typeof listPosProducts>>> | FailResult> {
  try {
    const actor = await requirePosAccess();
    return { success: true, data: await listPosProducts(prisma, actor.organizationId) };
  } catch (error) {
    return fail(error, "Failed to fetch products");
  }
}

export async function processLiveSale(saleData: any, cartItems: any[]): Promise<OkData<{ id: string; sold_at: string; discount_percent: number }> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const lines: SaleLineInput[] = (cartItems ?? []).map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    }));
    const result = await processSale(prisma, actor, {
      receiptNo: saleData.receiptNo,
      customerName: saleData.customerName,
      contactId: saleData.contactId,
      paymentMethod: saleData.paymentMethod,
      discountPercent: saleData.discountPercent ?? 0,
      cashReceived: saleData.cashReceived,
      lines,
    });
    revalidatePath("/pos");
    return {
      success: true,
      data: { id: result.id, sold_at: result.soldAt, discount_percent: saleData.discountPercent ?? 0 },
    };
  } catch (error) {
    // Friendly message for duplicate receipt numbers (unique [org_id, sale_number]).
    if ((error as { code?: string }).code === "P2002") {
      return { success: false, error: "That receipt number already exists. Please retry." };
    }
    return fail(error, "Transaction failed.");
  }
}

export async function upsertPosProduct(input: any): Promise<OkData<{ id: string; sku: string; barcode: string; name: string; description: string; price: number; costPrice: number; stockQuantity: number; minStockLevel: number; category: string; unit: string; taxRate: number; isActive: boolean; imageUrl: string } | null> | FailResult> {
  try {
    const actor = await requirePosManager();
    const { id } = await upsertProduct(prisma, actor, input);
    const [product] = await prisma.pos_products.findMany({ where: { id, org_id: actor.organizationId }, take: 1 });
    revalidatePath("/pos");
    return {
      success: true,
      data: product ? {
        id: product.id, sku: product.sku, barcode: product.barcode ?? "", name: product.name,
        description: product.description ?? "", price: Number(product.price_minor),
        costPrice: Number(product.cost_minor), stockQuantity: product.stock_qty,
        minStockLevel: product.min_stock_level, category: product.category, unit: "pcs",
        taxRate: Number(product.tax_rate), isActive: product.is_active, imageUrl: product.image_url ?? "",
      } : null,
    };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { success: false, error: "A product with that SKU already exists." };
    }
    return fail(error, "Failed to save product changes.");
  }
}

export async function deletePosProduct(id: string): Promise<OkMsg | FailResult> {
  try {
    const actor = await requirePosManager();
    const { archived } = await deleteProduct(prisma, actor.organizationId, id);
    revalidatePath("/pos");
    return archived
      ? { success: true, archived: true, message: "Product is linked to transactions. Archived to preserve history." }
      : { success: true, message: "Product permanently removed." };
  } catch (error) {
    return fail(error, "Failed to remove or archive product.");
  }
}

export async function getPosSales(): Promise<OkData<any[]> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const sales = await listPosSales(prisma, actor.organizationId);
    return {
      success: true,
      data: sales.map((sale) => {
        const itemsCount = sale.pos_sale_items.reduce((sum, i) => sum + i.quantity, 0);
        return {
          id: sale.id, receiptNo: sale.sale_number, customer: sale.customer_name || "Walk-in Customer",
          // Present when a real customer was attached at the till, so the
          // transactions list knows whether it can email a receipt straight
          // out or has to ask for an address.
          customerEmail: sale.contact?.email ?? null,
          itemsCount,
          productSummary: sale.pos_sale_items.map((i) => `${i.product_name} (x${i.quantity})`).join(", ") || `${itemsCount} items`,
          subtotal: Number(sale.subtotal_minor), tax: Number(sale.tax_minor), discount: Number(sale.discount_minor),
          total: Number(sale.total_minor), paymentMethod: sale.payment_method.toLowerCase(), status: sale.status,
          date: new Date(sale.sold_at).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
          cardLast4: sale.payment_method.toLowerCase() === "card" ? "XXXX" : undefined,
          lineItems: sale.pos_sale_items.map((i) => ({
            id: i.id, name: i.product_name, sku: i.product_sku, quantity: i.quantity, price: Number(i.unit_price_minor),
          })),
        };
      }),
    };
  } catch (error) {
    return fail(error, "Failed to fetch transaction logs.");
  }
}

/**
 * Email a receipt to the customer.
 *
 * The button this replaces waited 1.5 seconds and announced "Receipt securely
 * delivered to customer email!" without sending anything — so a shopkeeper
 * could tell a customer their receipt was on the way when nothing had been.
 *
 * The address comes from the linked contact where the sale has one, which is
 * what attaching a customer at the till now makes possible. Otherwise the
 * caller supplies it.
 */
export async function emailPosReceipt(
  saleId: string,
  overrideEmail?: string
): Promise<OkMsg | FailResult> {
  try {
    const actor = await requirePosAccess();

    if (!isMailConfigured()) {
      return {
        success: false,
        error: "Email is not set up on this deployment, so receipts cannot be sent.",
      };
    }

    const sale = await prisma.pos_sales.findFirst({
      where: { id: saleId, org_id: actor.organizationId },
      select: {
        sale_number: true,
        customer_name: true,
        sold_at: true,
        payment_method: true,
        subtotal_minor: true,
        discount_minor: true,
        tax_minor: true,
        total_minor: true,
        contact: { select: { email: true, ...CONTACT_NAME_SELECT } },
        pos_sale_items: {
          select: { product_name: true, quantity: true, unit_price_minor: true },
        },
      },
    });
    if (!sale) return { success: false, error: "That sale could not be found." };

    const to = (overrideEmail ?? sale.contact?.email ?? "").trim();
    if (!to) {
      return {
        success: false,
        error: "No email address for this sale. Attach a customer with an email, or enter one.",
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { success: false, error: "That email address does not look right." };
    }

    const organization = await prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: { name: true, baseCurrency: true },
    });

    const customerName = sale.contact
      ? contactDisplayName(sale.contact)
      : sale.customer_name === "Walk-in Customer"
        ? null
        : sale.customer_name;

    await sendMail({
      to,
      fromName: organization?.name || "WAWPROFI",
      subject: `Your receipt ${sale.sale_number}`,
      html: posReceiptHtml({
        businessName: organization?.name ?? "",
        receiptNo: sale.sale_number,
        soldAt: sale.sold_at,
        currency: organization?.baseCurrency ?? "GBP", // currency:allow falls back to the column default
        customerName,
        paymentMethod: sale.payment_method,
        subtotalMinor: Number(sale.subtotal_minor),
        discountMinor: Number(sale.discount_minor),
        taxMinor: Number(sale.tax_minor),
        totalMinor: Number(sale.total_minor),
        lines: sale.pos_sale_items.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          unitPriceMinor: Number(item.unit_price_minor),
        })),
      }),
    });

    return { success: true, message: `Receipt sent to ${to}.` };
  } catch (error) {
    return fail(error, "Could not send the receipt.");
  }
}

/**
 * The workspace's own name, for the top of a receipt.
 *
 * Every printed and on-screen receipt said "Demo Company" — hardcoded in four
 * places, so a real shop handed customers a slip with somebody else's name on
 * it. Fetched rather than passed down because these are client components deep
 * inside the POS with no workspace context of their own.
 */
export async function getPosBusinessName(): Promise<OkData<string> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const organization = await prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: { name: true },
    });
    return { success: true, data: organization?.name ?? "" };
  } catch (error) {
    return fail(error, "Failed to load the business name.");
  }
}

export type PosCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  totalSpentMinor: number;
  visits: number;
  favourite: string | null;
  /** ISO date, so the client does not have to carry a Date across the wire. */
  createdAt: string;
  purchases: Array<{
    id: string;
    receiptNo: string;
    soldAt: string;
    totalMinor: number;
    itemsCount: number;
  }>;
};

/**
 * The POS customer directory.
 *
 * Real contacts with their real email and phone, and the sales attributed to
 * them. The page this replaces derived "customers" by grouping sales on a
 * free-text name and then generated an @example.com address and a random phone
 * number for each — displayed behind mail and phone icons as though they had
 * come from a record.
 */
export async function getPosCustomers(): Promise<OkData<PosCustomer[]> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const customers = await listPosCustomers(prisma, actor.organizationId);

    return {
      success: true,
      data: customers.map((customer) => ({
        ...customer,
        createdAt: customer.createdAt.toISOString(),
        purchases: customer.purchases.map((purchase) => ({
          ...purchase,
          soldAt: purchase.soldAt.toISOString(),
        })),
      })),
    };
  } catch (error) {
    return fail(error, "Failed to load the customer directory.");
  }
}

/**
 * Add a customer from the POS.
 *
 * Writes a real contact, shared with the rest of the product — the same record
 * sales and statements use, not a POS-only one. The dialog this replaces waited
 * a second and reported success without writing anything.
 */
export async function createPosCustomer(input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<OkData<{ id: string }> | FailResult> {
  try {
    const actor = await requirePosAccess();

    const name = input.name.trim();
    if (!name) return { success: false, error: "A customer needs a name." };

    const email = input.email?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "That email address does not look right." };
    }

    // Catching the duplicate here rather than letting two records for the same
    // person accumulate — a directory with "J Smith" twice is worse than none.
    const existing = await prisma.contact.findFirst({
      where: {
        organizationId: actor.organizationId,
        name: { equals: name, mode: "insensitive" },
        contactType: { in: ["CUSTOMER", "BOTH"] },
      },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: `A customer called "${name}" already exists.` };
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId: actor.organizationId,
        contactType: "CUSTOMER",
        name,
        email,
        phone: input.phone?.trim() || null,
      },
      select: { id: true },
    });

    revalidatePath("/pos");
    revalidatePath("/sales/customers");
    return { success: true, data: { id: contact.id } };
  } catch (error) {
    return fail(error, "Failed to add the customer.");
  }
}

export async function deletePosSale(saleId: string): Promise<OkMsg | FailResult> {
  try {
    const actor = await requirePosManager();
    await deleteSale(prisma, actor.organizationId, actor.userId, saleId);
    revalidatePath("/pos");
    return { success: true };
  } catch (error) {
    return fail(error, "Failed to delete transaction.");
  }
}

export async function getPosRefunds(): Promise<OkData<any[]> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const refunds = await listPosRefunds(prisma, actor.organizationId);
    return {
      success: true,
      data: refunds.map((s) => ({
        id: `REF-${s.id.slice(0, 5).toUpperCase()}`, saleId: s.id, receiptNo: s.sale_number,
        customer: s.customer_name || "Walk-in Customer", amount: Number(s.total_minor),
        reason: "Customer Return / Refund", method: s.payment_method.toLowerCase(), status: "approved",
        date: new Date(s.sold_at).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        items: s.pos_sale_items.map((i) => ({ name: i.product_name, quantity: i.quantity, price: Number(i.unit_price_minor), total: Number(i.line_total_minor) })),
      })),
    };
  } catch (error) {
    return fail(error, "Failed to read returns ledger.");
  }
}

export async function lookupReceiptForReturn(receiptNo: string): Promise<OkData<{ id: string; receiptNo: string; customer: string; total: number; date: string; items: { name: string; quantity: number; total: number }[] }> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const sale = await lookupReceiptDal(prisma, actor.organizationId, receiptNo);
    if (!sale) return { success: false, error: "No active completed transaction matches this receipt number." };
    return {
      success: true,
      data: {
        id: sale.id, receiptNo: sale.sale_number, customer: sale.customer_name || "Walk-in Customer",
        total: Number(sale.total_minor), date: new Date(sale.sold_at).toLocaleDateString("en-GB"),
        items: sale.pos_sale_items.map((i) => ({ name: i.product_name, quantity: i.quantity, total: Number(i.line_total_minor) })),
      },
    };
  } catch (error) {
    return fail(error, "Error verifying receipt history.");
  }
}

export async function executeReceiptRefund(saleId: string): Promise<OkMsg | FailResult> {
  try {
    const actor = await requirePosAccess();
    await refundSale(prisma, actor, saleId);
    revalidatePath("/pos");
    return { success: true };
  } catch (error) {
    return fail(error, "Failed to reverse transaction.");
  }
}

export async function getPosStockLogs(): Promise<OkData<any[]> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const logs = await listPosStockLogs(prisma, actor.organizationId);
    return {
      success: true,
      data: logs.map((log) => ({
        id: log.id, product: log.product_name, action: log.action_type, quantity: log.quantity_delta,
        balance: log.new_balance,
        date: new Date(log.created_at).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        rawTimestamp: new Date(log.created_at).getTime(), user: log.created_by ?? "Unknown",
      })),
    };
  } catch (error) {
    return fail(error, "Failed to fetch stock logs.");
  }
}

export async function closeRegisterDay(input: {
  businessDate: string;
  expectedCashMinor: number;
  countedCashMinor: number;
  bankedMinor: number;
  expectedCardMinor: number;
  notes?: string;
}): Promise<OkMsg | FailResult> {
  try {
    const actor = await requirePosManager();

    const { varianceMinor } = await closePosDay(prisma, actor.organizationId, actor.userId, {
      businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
      expectedCashMinor: BigInt(Math.round(input.expectedCashMinor)),
      countedCashMinor: BigInt(Math.round(input.countedCashMinor)),
      bankedMinor: BigInt(Math.round(input.bankedMinor)),
      expectedCardMinor: BigInt(Math.round(input.expectedCardMinor)),
      notes: input.notes ?? null,
    });

    revalidatePath("/pos/reconciliation");

    // The toast quotes an amount, so it needs the workspace currency; PosActor
    // does not carry one.
    const org = await prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: { baseCurrency: true },
    });

    const variance = Number(varianceMinor) / 100;
    const message =
      varianceMinor === BigInt(0)
        ? "Register closed. Till balanced exactly."
        : varianceMinor < BigInt(0)
          ? `Register closed. Till short by ${formatMoney(Math.round(Math.abs(variance) * 100), org?.baseCurrency)}.`
          : `Register closed. Till over by ${formatMoney(Math.round(variance * 100), org?.baseCurrency)}.`;

    return { success: true, message };
  } catch (error) {
    return fail(error, "Failed to close the register");
  }
}

export type RegisterDayClose = {
  id: string;
  /** yyyy-mm-dd, so the client can match it without timezone drift. */
  businessDate: string;
  expectedCashMinor: number;
  countedCashMinor: number;
  varianceMinor: number;
  bankedMinor: number;
  expectedCardMinor: number;
  notes: string | null;
  closedAt: string;
};

export type RegisterCloseHistory = {
  closes: RegisterDayClose[];
  /** Printed on the Z-report, which a business keeps as an audit record. */
  organizationName: string;
};

export async function getRegisterDayCloses(): Promise<OkData<RegisterCloseHistory> | FailResult> {
  try {
    const actor = await requirePosAccess();
    const [rows, org] = await Promise.all([
      listPosDayCloses(prisma, actor.organizationId),
      prisma.organization.findUnique({
        where: { id: actor.organizationId },
        select: { name: true },
      }),
    ]);
    return {
      success: true,
      data: {
        organizationName: org?.name ?? "",
        // Minor units are BigInt in the database but always well within
        // Number's safe range, and plain numbers keep the payload simple.
        closes: rows.map((row) => ({
          id: row.id,
          businessDate: row.business_date.toISOString().slice(0, 10),
          expectedCashMinor: Number(row.expected_cash_minor),
          countedCashMinor: Number(row.counted_cash_minor),
          varianceMinor: Number(row.variance_minor),
          bankedMinor: Number(row.banked_minor),
          expectedCardMinor: Number(row.expected_card_minor),
          notes: row.notes,
          closedAt: row.closed_at.toISOString(),
        })),
      },
    };
  } catch (error) {
    return fail(error, "Failed to fetch register closes");
  }
}
