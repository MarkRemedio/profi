import type { User } from "@supabase/supabase-js";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import { PosValidationError, PosStockError, PosNotFoundError, PosForbiddenError, type PosActor, type PosRole, type ProcessSaleInput, type ProcessSaleResult, type StockShortage, type UpsertProductInput } from "@/lib/pos/types";
import {
  postPosSaleJournal,
  postPosCogsJournal,
  postPosDayCloseJournals,
  reversePosSaleJournal,
  reverseJournalById,
} from "@/lib/pos/posting";

type Db = typeof prisma;

export async function listPosProducts(client: Db, orgId: string) {
  const products = await client.pos_products.findMany({
    where: { org_id: orgId, deleted_at: null },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode ?? "",
    name: p.name,
    description: p.description ?? "",
    price: Number(p.price_minor),
    costPrice: Number(p.cost_minor),
    stockQuantity: p.stock_qty,
    minStockLevel: p.min_stock_level,
    category: p.category,
    unit: "pcs",
    taxRate: Number(p.tax_rate),
    isActive: p.is_active,
    imageUrl: p.image_url ?? "",
  }));
}

export async function listPosSales(client: Db, orgId: string) {
  return client.pos_sales.findMany({
    where: { org_id: orgId },
    include: {
      pos_sale_items: { include: { pos_products: true } },
      // Only the address: the transactions list uses it to decide whether a
      // receipt can be emailed without asking for one.
      contact: { select: { email: true } },
    },
    orderBy: { sold_at: "desc" },
  });
}

/**
 * The POS customer directory: real contacts, with the sales attributed to them.
 *
 * Read from the contacts table rather than assembled by grouping sales on their
 * free-text customer_name. That grouping could never reach a customer's email
 * or phone — which is why the page used to invent both — and it produced a
 * separate "customer" for every spelling of the same person.
 *
 * Contacts with no POS sales are included. Someone added at the counter this
 * morning is a customer before their first purchase, and a directory that hides
 * them is not a directory.
 */
export async function listPosCustomers(client: Db, orgId: string) {
  const [contacts, sales] = await Promise.all([
    client.contact.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        contactType: { in: ["CUSTOMER", "BOTH"] },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        createdAt: true,
        ...CONTACT_NAME_SELECT,
      },
      orderBy: { name: "asc" },
    }),
    client.pos_sales.findMany({
      where: { org_id: orgId, contact_id: { not: null }, status: "completed" },
      select: {
        id: true,
        contact_id: true,
        sale_number: true,
        total_minor: true,
        sold_at: true,
        pos_sale_items: { select: { quantity: true, product_name: true } },
      },
      orderBy: { sold_at: "desc" },
    }),
  ]);

  const byContact = new Map<string, typeof sales>();
  for (const sale of sales) {
    const key = sale.contact_id!;
    byContact.set(key, [...(byContact.get(key) ?? []), sale]);
  }

  return contacts.map((contact) => {
    const theirs = byContact.get(contact.id) ?? [];

    // The product bought most often across their sales. Genuinely derived —
    // the old page reported the first line of whichever sale happened to be
    // read first and called it their favourite.
    const tally = new Map<string, number>();
    for (const sale of theirs) {
      for (const item of sale.pos_sale_items) {
        tally.set(item.product_name, (tally.get(item.product_name) ?? 0) + item.quantity);
      }
    }
    const favourite =
      [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      id: contact.id,
      name: contactDisplayName(contact),
      email: contact.email,
      phone: contact.phone,
      createdAt: contact.createdAt,
      totalSpentMinor: theirs.reduce((sum, sale) => sum + Number(sale.total_minor), 0),
      visits: theirs.length,
      favourite,
      purchases: theirs.map((sale) => ({
        id: sale.id,
        receiptNo: sale.sale_number,
        soldAt: sale.sold_at,
        totalMinor: Number(sale.total_minor),
        itemsCount: sale.pos_sale_items.reduce((sum, item) => sum + item.quantity, 0),
      })),
    };
  });
}

export async function listPosRefunds(client: Db, orgId: string) {
  return client.pos_sales.findMany({
    where: { org_id: orgId, status: "refunded" },
    include: { pos_sale_items: true },
    orderBy: { sold_at: "desc" },
  });
}

export async function listPosStockLogs(client: Db, orgId: string, limit = 200) {
  return client.pos_stock_logs.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "desc" },
    take: limit,
  });
}

export async function lookupReceiptForReturn(client: Db, orgId: string, receiptNo: string) {
  return client.pos_sales.findFirst({
    where: { org_id: orgId, sale_number: receiptNo.trim().toUpperCase(), status: "completed" },
    include: { pos_sale_items: true },
  });
}

const VALID_PAYMENT_METHODS = new Set(["cash", "card", "mobile", "split"]);

/**
 * How long a till transaction may take, and how long it may queue for a
 * connection. Prisma's defaults are 5s and 2s.
 *
 * Raised because the allowance has to cover the round trips, and the round
 * trips depend on how far the deployment sits from the database — the same
 * sale that completes locally can exceed five seconds from a region on
 * another continent. Still bounded: this holds row locks on the products being
 * sold, so a stuck sale must give up rather than block the till.
 */
const POS_TRANSACTION_TIMEOUT_MS = 20_000;
const POS_TRANSACTION_MAX_WAIT_MS = 10_000;

export async function processSale(
  client: Db,
  actor: Pick<PosActor, "organizationId" | "userId">,
  input: ProcessSaleInput
): Promise<ProcessSaleResult> {
  const orgId = actor.organizationId;

  if (!VALID_PAYMENT_METHODS.has(input.paymentMethod)) {
    throw new PosValidationError(`Unsupported payment method: ${input.paymentMethod}`);
  }
  const pct = Number(input.discountPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new PosValidationError("Discount percent must be between 0 and 100.");
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new PosValidationError("A sale must have at least one line.");
  }
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new PosValidationError("Each line quantity must be a positive integer.");
    }
  }

  /*
   * A sale posts the sale, its lines, the stock movement and two journals in
   * one transaction, which is a dozen or more sequential round trips. Prisma
   * defaults to giving that five seconds, which is generous next to a database
   * in the same region and not generous at all next to one on another
   * continent — this failed in production while passing locally purely on
   * latency. The work is unchanged; only the allowance is stated rather than
   * inherited.
   *
   * Not a licence for a slow transaction: it holds row locks on the products
   * being sold, so a genuinely stuck sale should still give up rather than
   * block the till.
   */
  return client.$transaction(
    async (tx) => {
    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const products = await tx.pos_products.findMany({
      where: { id: { in: ids }, org_id: orgId, deleted_at: null },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const id of ids) {
      const p = byId.get(id);
      if (!p || !p.is_active) {
        throw new PosValidationError("One or more products are unknown or inactive.");
      }
    }

    // Aggregate required quantity per product, then stock-guard.
    const required = new Map<string, number>();
    for (const line of input.lines) {
      required.set(line.productId, (required.get(line.productId) ?? 0) + line.quantity);
    }
    const shortages: StockShortage[] = [];
    for (const [pid, qty] of required) {
      const p = byId.get(pid)!;
      if (p.stock_qty < qty) shortages.push({ sku: p.sku, requested: qty, available: p.stock_qty });
    }
    if (shortages.length > 0) throw new PosStockError(shortages);

    // Re-derive money (mirrors client formula; Math.round, whole-cart discount, per-line tax).
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of input.lines) {
      const p = byId.get(line.productId)!;
      const lineTotal = Number(p.price_minor) * line.quantity;
      const lineDiscount = Math.round(lineTotal * (pct / 100));
      const lineTax = Math.round((lineTotal - lineDiscount) * (Number(p.tax_rate) / 100));
      subtotal += lineTotal;
      taxTotal += lineTax;
    }
    const discount = Math.round(subtotal * (pct / 100));
    const total = subtotal - discount + taxTotal;

    let tendered = total;
    let change = 0;
    if (input.paymentMethod === "cash") {
      tendered = Number(input.cashReceived ?? 0);
      if (!Number.isFinite(tendered) || tendered < total) {
        throw new PosValidationError("Cash tendered is less than the total due.");
      }
      change = tendered - total;
    }

    // Checked inside the transaction and scoped to this org: a contact id is
    // supplied by the browser, and attributing a sale to another tenant's
    // customer would leak that customer's name into this workspace's ledger.
    let contactId: string | null = null;
    let contactName: string | null = null;
    if (input.contactId) {
      const contact = await tx.contact.findFirst({
        where: { id: input.contactId, organizationId: orgId, isActive: true },
        select: { id: true, name: true, first_name: true, last_name: true, display_name_preference: true },
      });
      if (!contact) throw new PosValidationError("That customer is not available.");
      contactId = contact.id;
      contactName = contactDisplayName(contact);
    }

    const saleId = crypto.randomUUID();
    const soldAt = new Date();
    const sale = await tx.pos_sales.create({
      data: {
        id: saleId,
        org_id: orgId,
        sale_number: input.receiptNo,
        // The linked contact's name wins, so the receipt and the directory
        // agree. Falls back to whatever was typed, then to walk-in.
        customer_name: contactName || input.customerName?.trim() || "Walk-in Customer",
        contact_id: contactId,
        subtotal_minor: BigInt(subtotal),
        discount_percent: pct.toString(),
        discount_minor: BigInt(discount),
        tax_minor: BigInt(taxTotal),
        total_minor: BigInt(total),
        payment_method: input.paymentMethod,
        amount_tendered_minor: BigInt(tendered),
        change_minor: BigInt(change),
        status: "completed",
        sold_by_user_id: actor.userId,
        sold_at: soldAt,
      },
      select: { id: true, sale_number: true },
    });

    // Cost of the stock leaving, summed across the sale, for the COGS journal.
    let cogsMinor = BigInt(0);

    // Built first, written once. A create per line meant a network round trip
    // per line inside the transaction, and this transaction is already long
    // enough that the round trips are what it spends its time on.
    const itemRows = input.lines.map((line) => {
      const p = byId.get(line.productId)!;
      // Snapshot cost like name/sku/price: editing a product's cost later must
      // not retroactively change what historical journals were worth.
      const unitCost = p.cost_minor ?? BigInt(0);
      cogsMinor += unitCost * BigInt(line.quantity);

      return {
        id: crypto.randomUUID(),
        org_id: orgId,
        sale_id: saleId,
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku,
        unit_price_minor: p.price_minor,
        unit_cost_minor: unitCost,
        quantity: line.quantity,
        line_total_minor: BigInt(Number(p.price_minor) * line.quantity),
        tax_rate: p.tax_rate,
        created_at: soldAt,
      };
    });

    await tx.pos_sale_items.createMany({ data: itemRows });

    for (const [pid, qty] of required) {
      await tx.pos_products.updateMany({
        where: { id: pid, org_id: orgId },
        data: { stock_qty: { decrement: qty } },
      });
    }

    await postPosSaleJournal(tx, orgId, actor.userId, {
      saleId,
      saleNumber: sale.sale_number,
      soldAt,
      netMinor: BigInt(subtotal - discount),
      taxMinor: BigInt(taxTotal),
      totalMinor: BigInt(total),
      paymentMethod: input.paymentMethod,
    });

    // Cost side: Dr Cost of Sales / Cr Inventory. Without this the revenue is
    // recorded with no matching cost, overstating gross profit.
    await postPosCogsJournal(tx, orgId, actor.userId, {
      saleId,
      saleNumber: sale.sale_number,
      soldAt,
      cogsMinor,
    });

    return {
      id: sale.id,
      saleNumber: sale.sale_number,
      subtotalMinor: subtotal,
      discountMinor: discount,
      taxMinor: taxTotal,
      totalMinor: total,
      changeMinor: change,
      soldAt: soldAt.toISOString(),
    };
    },
    { timeout: POS_TRANSACTION_TIMEOUT_MS, maxWait: POS_TRANSACTION_MAX_WAIT_MS }
  );
}

export async function deleteSale(client: Db, orgId: string, userId: string, saleId: string): Promise<void> {
  await client.$transaction(async (tx) => {
    const sale = await tx.pos_sales.findFirst({
      where: { id: saleId, org_id: orgId },
      select: { id: true, status: true },
    });
    if (!sale) throw new PosNotFoundError("Sale not found.");

    const items = await tx.pos_sale_items.findMany({
      where: { sale_id: saleId, org_id: orgId },
      select: { product_id: true, quantity: true },
    });

    // Only restore stock if it was not already returned by a refund.
    if (sale.status !== "refunded") {
      for (const item of items) {
        await tx.pos_products.updateMany({
          where: { id: item.product_id, org_id: orgId },
          data: { stock_qty: { increment: item.quantity } },
        });
      }

      await reversePosSaleJournal(tx, orgId, userId, saleId, "pos_sale_void");
    }

    await tx.pos_sale_items.deleteMany({ where: { sale_id: saleId, org_id: orgId } });
    await tx.pos_sales.deleteMany({ where: { id: saleId, org_id: orgId } });
  });
}

export async function refundSale(
  client: Db,
  actor: Pick<PosActor, "organizationId" | "userId">,
  saleId: string
): Promise<void> {
  const orgId = actor.organizationId;
  await client.$transaction(async (tx) => {
    const sale = await tx.pos_sales.findFirst({
      where: { id: saleId, org_id: orgId, status: "completed" },
      select: { id: true },
    });
    if (!sale) throw new PosNotFoundError("Completed sale not found.");

    const items = await tx.pos_sale_items.findMany({
      where: { sale_id: saleId, org_id: orgId },
      select: { product_id: true, quantity: true },
    });
    for (const item of items) {
      await tx.pos_products.updateMany({
        where: { id: item.product_id, org_id: orgId },
        data: { stock_qty: { increment: item.quantity } },
      });
    }
    await tx.pos_sales.updateMany({
      where: { id: saleId, org_id: orgId },
      data: { status: "refunded" },
    });

    await reversePosSaleJournal(tx, orgId, actor.userId, saleId, "pos_refund");
  });
}

export function assertCanManagePos(role: PosRole): void {
  if (role !== "owner" && role !== "accountant") {
    throw new PosForbiddenError("Only owners and accountants can manage POS products and delete sales.");
  }
}

function parseMoneyMajorToMinor(label: string, value: string | number): bigint {
  const n = typeof value === "number" ? value : parseFloat(String(value).trim());
  if (!Number.isFinite(n) || n < 0) throw new PosValidationError(`${label} must be a non-negative number.`);
  return BigInt(Math.round(n * 100));
}

function parseCount(label: string, value: string | number | undefined, fallback?: number): number {
  if ((value === undefined || value === "") && fallback !== undefined) return fallback;
  const n = typeof value === "number" ? value : parseInt(String(value).trim(), 10);
  if (!Number.isInteger(n) || n < 0) throw new PosValidationError(`${label} must be a non-negative integer.`);
  return n;
}

export async function upsertProduct(
  client: Db,
  actor: Pick<PosActor, "organizationId" | "actorLabel">,
  input: UpsertProductInput
): Promise<{ id: string }> {
  const orgId = actor.organizationId;
  const name = (input.name ?? "").trim();
  const sku = (input.sku ?? "").trim();
  if (!name) throw new PosValidationError("Product name is required.");
  if (!sku) throw new PosValidationError("Product SKU is required.");

  const priceMinor = parseMoneyMajorToMinor("Price", input.price);
  const costMinor = parseMoneyMajorToMinor("Cost price", input.costPrice);
  const stockQty = parseCount("Stock quantity", input.stockQuantity, 0);
  const minStock = parseCount("Minimum stock level", input.minStockLevel ?? "", 5);
  const taxRate = input.taxRate === undefined || input.taxRate === "" ? 20 : Number(input.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0) throw new PosValidationError("Tax rate must be a non-negative number.");

  const now = new Date();
  const base = {
    name, description: input.description ?? "", sku, barcode: input.barcode ?? "",
    category: input.category ?? "General", price_minor: priceMinor, cost_minor: costMinor,
    tax_rate: taxRate.toString(), stock_qty: stockQty, min_stock_level: minStock,
    is_active: input.isActive ?? true, image_url: input.imageUrl ?? null, updated_at: now,
  };

  return client.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.pos_products.findFirst({
        where: { id: input.id, org_id: orgId },
        select: { stock_qty: true },
      });
      if (!existing) throw new PosNotFoundError("Product not found.");
      await tx.pos_products.updateMany({ where: { id: input.id, org_id: orgId }, data: base });
      const delta = stockQty - existing.stock_qty;
      if (delta !== 0) {
        await tx.pos_stock_logs.create({
          data: {
            org_id: orgId, product_id: input.id, product_name: name,
            action_type: delta > 0 ? "Restock" : "Adjustment",
            quantity_delta: delta, new_balance: stockQty, created_by: actor.actorLabel,
          },
        });
      }
      return { id: input.id };
    }

    const id = crypto.randomUUID();
    await tx.pos_products.create({ data: { ...base, id, org_id: orgId, created_at: now } });
    if (stockQty > 0) {
      await tx.pos_stock_logs.create({
        data: {
          org_id: orgId, product_id: id, product_name: name, action_type: "Initial Stock",
          quantity_delta: stockQty, new_balance: stockQty, created_by: actor.actorLabel,
        },
      });
    }
    return { id };
  });
}

export async function deleteProduct(
  client: Db,
  orgId: string,
  productId: string
): Promise<{ archived: boolean }> {
  const existing = await client.pos_products.findFirst({
    where: { id: productId, org_id: orgId },
    select: { id: true },
  });
  if (!existing) throw new PosNotFoundError("Product not found.");
  try {
    await client.pos_products.deleteMany({ where: { id: productId, org_id: orgId } });
    return { archived: false };
  } catch (err) {
    // FK violation (P2003): product is referenced by sale items — archive instead.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2003") {
      await client.pos_products.updateMany({
        where: { id: productId, org_id: orgId },
        data: { is_active: false },
      });
      return { archived: true };
    }
    throw err;
  }
}

export function deriveActorLabel(user: Pick<User, "id" | "email" | "user_metadata">): string {
  const meta = user.user_metadata as { full_name?: string } | null | undefined;
  return meta?.full_name || user.email || user.id;
}

async function buildActor(workspace: { userId: string; organizationId: string; role: any }): Promise<PosActor> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const actorLabel = data.user ? deriveActorLabel(data.user) : workspace.userId;
  return { ...workspace, actorLabel } as any;
}

export async function requirePosAccess(): Promise<PosActor> {
  const workspace = await requireAccountingWorkspace(); // any authenticated member
  return buildActor(workspace);
}

export async function requirePosManager(): Promise<PosActor> {
  const workspace = await requireAccountingWorkspace(); // any authenticated member
  assertCanManagePos(workspace.role as any);             // 🚀 Bypass PosRole compatibility check
  return buildActor(workspace);
}

/**
 * Close the register for a business day.
 *
 * Records the till count and posts the resulting journals: any variance between
 * expected and counted cash, and any cash physically taken to the bank.
 *
 * Re-closing the same day updates the existing row. Journals already posted for
 * that day are reversed first, so a corrected count never double-counts.
 */
export async function closePosDay(
  client: Db,
  orgId: string,
  userId: string,
  input: {
    businessDate: Date;
    expectedCashMinor: bigint;
    countedCashMinor: bigint;
    bankedMinor: bigint;
    expectedCardMinor: bigint;
    notes?: string | null;
  }
): Promise<{ id: string; varianceMinor: bigint }> {
  if (input.bankedMinor < BigInt(0)) {
    throw new PosValidationError("Banked amount cannot be negative.");
  }
  if (input.bankedMinor > input.countedCashMinor) {
    throw new PosValidationError("You cannot bank more cash than was counted.");
  }

  const varianceMinor = input.countedCashMinor - input.expectedCashMinor;

  return client.$transaction(async (tx) => {
    const existing = await tx.pos_day_closes.findFirst({
      where: { org_id: orgId, business_date: input.businessDate },
      select: { id: true, variance_journal_id: true, banking_journal_id: true },
    });

    // Reversing rather than editing keeps the original entries in the ledger,
    // which is what an auditor expects to see.
    if (existing) {
      for (const journalId of [existing.variance_journal_id, existing.banking_journal_id]) {
        if (journalId) {
          await reverseJournalById(tx, orgId, userId, journalId, "pos_day_close_correction");
        }
      }
    }

    const journals = await postPosDayCloseJournals(tx, orgId, userId, {
      businessDate: input.businessDate,
      varianceMinor,
      bankedMinor: input.bankedMinor,
    });

    const row = await tx.pos_day_closes.upsert({
      where: { org_id_business_date: { org_id: orgId, business_date: input.businessDate } },
      create: {
        org_id: orgId,
        business_date: input.businessDate,
        expected_cash_minor: input.expectedCashMinor,
        counted_cash_minor: input.countedCashMinor,
        variance_minor: varianceMinor,
        banked_minor: input.bankedMinor,
        expected_card_minor: input.expectedCardMinor,
        notes: input.notes ?? null,
        variance_journal_id: journals.varianceJournalId,
        banking_journal_id: journals.bankingJournalId,
        closed_by_user_id: userId,
      },
      update: {
        expected_cash_minor: input.expectedCashMinor,
        counted_cash_minor: input.countedCashMinor,
        variance_minor: varianceMinor,
        banked_minor: input.bankedMinor,
        expected_card_minor: input.expectedCardMinor,
        notes: input.notes ?? null,
        variance_journal_id: journals.varianceJournalId,
        banking_journal_id: journals.bankingJournalId,
        closed_by_user_id: userId,
        closed_at: new Date(),
      },
      select: { id: true },
    });

    return { id: row.id, varianceMinor };
  });
}

/** The most recent closes, newest first — powers the End of Day history. */
export async function listPosDayCloses(client: Db, orgId: string, limit = 30) {
  return client.pos_day_closes.findMany({
    where: { org_id: orgId },
    orderBy: { business_date: "desc" },
    take: limit,
  });
}
