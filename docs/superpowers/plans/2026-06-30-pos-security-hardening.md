# POS Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticate and org-scope every POS server action, hard-reject overselling, re-derive sale money server-side, and fix three POS data-integrity bugs — all behind a testable `lib/pos/dal.ts`.

**Architecture:** Introduce a POS data-access layer (`lib/pos/dal.ts`) holding two auth guards plus pure, org-scoped data functions that take an explicit `orgId`/actor and read no ambient state. The server actions in `app/(dashboard)/pos/actions.ts` become thin wrappers: authenticate → call the dal → shape the existing `{ success, … }` response. POS tables use `org_id` and are excluded from the tenancy auto-guard, so every query is scoped manually in this one file.

**Tech Stack:** Next.js (server actions, `"use server"`), Prisma 7 (`@prisma/client`), Supabase auth, Vitest (real-Postgres integration tests via `tests/fixtures.ts`).

## Global Constraints

- Money is stored in **minor units (pence)** as Prisma `BigInt`; `pos_products.price_minor`, `tax_rate` (Decimal) are authoritative — never trust client-sent amounts.
- POS Prisma models use the field name **`org_id`** (snake_case), NOT `organizationId`; the tenancy auto-guard does NOT cover them — scope every query manually.
- Reads filter `where: { org_id: orgId }`. Writes-by-id use `updateMany`/`deleteMany` filtered by `{ id, org_id: orgId }` with a `count === 1` assertion, or a pre-fetch `findFirst({ id, org_id })`.
- `pos_products.id`, `pos_sales.id`, `pos_sale_items.id` have **no DB default** — supply `crypto.randomUUID()` on create. `pos_stock_logs.id` has a default.
- Role tiers: `requirePosAccess` = any member (owner/accountant/employee); `requirePosManager` = owner/accountant only.
- Test command: `pnpm test` (Vitest, `vitest run`). Typecheck: `pnpm typecheck`. Both must be green at every commit.
- Tests run serially against a shared dev Postgres; always clean up via `dropTestOrg`.
- **Commits:** the repo owner commits manually. Each "Commit" step below is a checkpoint — stage the listed files and pause for the owner to commit (or commit only if they've authorized it for this session).

---

## File structure

| File | Responsibility |
|---|---|
| `lib/pos/types.ts` (create) | Shared types: `PosActor`, `SaleLineInput`, `ProcessSaleInput`, `ProcessSaleResult`, `UpsertProductInput`, error classes. |
| `lib/pos/dal.ts` (create) | Auth guards (`requirePosAccess`, `requirePosManager`, `assertCanManagePos`, `deriveActorLabel`) + org-scoped data functions (`listPosProducts`, `listPosSales`, `listPosRefunds`, `listPosStockLogs`, `lookupReceiptForReturn`, `processSale`, `refundSale`, `deleteSale`, `upsertProduct`, `deleteProduct`). |
| `app/(dashboard)/pos/actions.ts` (modify) | Thin `"use server"` wrappers: guard → dal → `{ success, … }`. Delete `TEMP_ORG_ID`. |
| `tests/fixtures.ts` (modify) | Add `createTestPosProduct`; extend `dropTestOrg` to clean `pos_*`. |
| `tests/pos/dal-scoping.test.ts` (create) | Tenant-isolation + read scoping. |
| `tests/pos/sale.test.ts` (create) | Stock guard, amount re-derivation, validation. |
| `tests/pos/mutations.test.ts` (create) | Delete-restores-stock, refund, product validation, role helper. |

---

### Task 1: Test fixtures for POS + shared types

**Files:**
- Create: `lib/pos/types.ts`
- Modify: `tests/fixtures.ts` (add `createTestPosProduct`; extend `dropTestOrg`)
- Test: `tests/pos/dal-scoping.test.ts` (smoke only in this task)

**Interfaces:**
- Produces: `createTestPosProduct(orgId, opts?) => Promise<{ id, sku }>`; extended `dropTestOrg` that also deletes `pos_sale_items`/`pos_sales`/`pos_stock_logs`/`pos_products` for the org.
- Produces (types): see code below; consumed by all later tasks.

- [ ] **Step 1: Create `lib/pos/types.ts`**

```ts
export type PosRole = "owner" | "accountant" | "employee";

export type PosActor = {
  organizationId: string;
  userId: string;
  role: PosRole;
  actorLabel: string; // human-readable, for pos_stock_logs.created_by
};

export type SaleLineInput = { productId: string; quantity: number };

export type ProcessSaleInput = {
  receiptNo: string;
  customerName?: string;
  paymentMethod: string; // cash | card | mobile | split
  discountPercent: number; // 0..100
  cashReceived?: number; // minor units; required when paymentMethod === "cash"
  lines: SaleLineInput[];
};

export type ProcessSaleResult = {
  id: string;
  saleNumber: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  changeMinor: number;
  soldAt: string; // ISO
};

export type UpsertProductInput = {
  id?: string;
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  description?: string;
  price: string | number; // major units (pounds)
  costPrice: string | number; // major units
  stockQuantity: string | number;
  minStockLevel?: string | number;
  taxRate?: string | number; // percent
  isActive?: boolean;
  imageUrl?: string;
};

export class PosValidationError extends Error {
  code = "VALIDATION" as const;
}
export class PosNotFoundError extends Error {
  code = "NOT_FOUND" as const;
}
export class PosForbiddenError extends Error {
  code = "FORBIDDEN" as const;
}
export type StockShortage = { sku: string; requested: number; available: number };
export class PosStockError extends Error {
  code = "INSUFFICIENT_STOCK" as const;
  shortages: StockShortage[];
  constructor(shortages: StockShortage[]) {
    super("Insufficient stock for one or more items.");
    this.shortages = shortages;
  }
}
```

- [ ] **Step 2: Add `createTestPosProduct` to `tests/fixtures.ts`**

Add at the end of the file (note all non-nullable columns must be supplied; `id` has no DB default):

```ts
export async function createTestPosProduct(
  orgId: string,
  opts: {
    sku?: string;
    name?: string;
    priceMinor?: number;
    costMinor?: number;
    taxRate?: number;
    stockQty?: number;
    minStockLevel?: number;
    isActive?: boolean;
  } = {}
): Promise<{ id: string; sku: string }> {
  const now = new Date();
  const sku = opts.sku ?? `SKU-${randomUUID().slice(0, 8)}`;
  const product = await prisma.pos_products.create({
    data: {
      id: randomUUID(),
      org_id: orgId,
      name: opts.name ?? "Test Product",
      description: "",
      sku,
      barcode: "",
      category: "General",
      price_minor: BigInt(opts.priceMinor ?? 1000),
      cost_minor: BigInt(opts.costMinor ?? 400),
      tax_rate: (opts.taxRate ?? 20).toString(),
      stock_qty: opts.stockQty ?? 10,
      min_stock_level: opts.minStockLevel ?? 5,
      is_active: opts.isActive ?? true,
      created_at: now,
      updated_at: now,
    },
    select: { id: true, sku: true },
  });
  return product;
}
```

- [ ] **Step 3: Extend `dropTestOrg` to clean POS tables**

In `tests/fixtures.ts`, inside the `dropTestOrg` transaction, add these deletes BEFORE `tx.organization.delete` (order: items → sales → stock logs → products), alongside the existing `banking_*` cleanup:

```ts
    await tx.pos_sale_items.deleteMany({ where: { org_id: orgId } });
    await tx.pos_sales.deleteMany({ where: { org_id: orgId } });
    await tx.pos_stock_logs.deleteMany({ where: { org_id: orgId } });
    await tx.pos_products.deleteMany({ where: { org_id: orgId } });
```

- [ ] **Step 4: Write the smoke test** `tests/pos/dal-scoping.test.ts`

```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, dropTestOrg, createTestPosProduct, type TestOrg } from "../fixtures";

let org: TestOrg;
beforeEach(async () => { org = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(org.orgId); });

it("seeds and tears down a pos product", async () => {
  const { id } = await createTestPosProduct(org.orgId, { sku: "SMOKE-1", stockQty: 7 });
  const found = await prisma.pos_products.findFirst({ where: { id, org_id: org.orgId } });
  expect(found?.stock_qty).toBe(7);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test tests/pos/dal-scoping.test.ts`
Expected: PASS (1 test). If it fails to compile on `pos_*` models, run `pnpm prisma generate` first.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.

```bash
git add lib/pos/types.ts tests/fixtures.ts tests/pos/dal-scoping.test.ts
git commit -m "test: POS fixtures and shared types for security hardening"
```

---

### Task 2: Org-scoped read functions + tenant isolation

**Files:**
- Create: `lib/pos/dal.ts`
- Test: `tests/pos/dal-scoping.test.ts` (extend)

**Interfaces:**
- Consumes: types from `lib/pos/types.ts`.
- Produces: `listPosProducts(client, orgId)`, `listPosSales(client, orgId)`, `listPosRefunds(client, orgId)`, `listPosStockLogs(client, orgId, limit?)`, `lookupReceiptForReturn(client, orgId, receiptNo)`. `client` is `typeof prisma` (top-level client; reads don't run in a transaction). **Return contract:** `listPosProducts` returns fully-mapped plain product objects (its action is a passthrough). The other four return **raw Prisma rows** (with relations + BigInt money fields + `Date`s) because their Task 6 action wrappers (`getPosSales`/`getPosRefunds`/`lookupReceiptForReturn`/`getPosStockLogs`) do the `Number()` mapping and date formatting before returning to the client — so BigInt never reaches `JSON.stringify`. This mirrors the codebase's existing DAL→action layering (e.g. `lib/banking/dal.ts`). Do NOT JSON-serialize these four DAL outputs directly; always go through the action wrapper.

- [ ] **Step 1: Write failing tests** — append to `tests/pos/dal-scoping.test.ts`:

```ts
import { listPosProducts, listPosSales, lookupReceiptForReturn } from "@/lib/pos/dal";

it("listPosProducts only returns the caller's org products", async () => {
  const other = await createTestOrg();
  try {
    await createTestPosProduct(org.orgId, { sku: "MINE" });
    await createTestPosProduct(other.orgId, { sku: "THEIRS" });
    const mine = await listPosProducts(prisma, org.orgId);
    expect(mine.map((p) => p.sku)).toEqual(["MINE"]);
  } finally {
    await dropTestOrg(other.orgId);
  }
});

it("listPosSales does not leak another org's sales", async () => {
  const other = await createTestOrg();
  try {
    await prisma.pos_sales.create({
      data: {
        id: crypto.randomUUID(), org_id: other.orgId, sale_number: "RCP-X",
        customer_name: "Walk-in Customer", subtotal_minor: 1000n, discount_percent: "0",
        discount_minor: 0n, tax_minor: 0n, total_minor: 1000n, payment_method: "cash",
        amount_tendered_minor: 1000n, change_minor: 0n, status: "completed", sold_at: new Date(),
      },
    });
    const mine = await listPosSales(prisma, org.orgId);
    expect(mine).toHaveLength(0);
  } finally {
    await dropTestOrg(other.orgId);
  }
});

it("lookupReceiptForReturn only matches in-org completed sales", async () => {
  const other = await createTestOrg();
  try {
    await prisma.pos_sales.create({
      data: {
        id: crypto.randomUUID(), org_id: other.orgId, sale_number: "RCP-Y",
        customer_name: "Walk-in Customer", subtotal_minor: 1000n, discount_percent: "0",
        discount_minor: 0n, tax_minor: 0n, total_minor: 1000n, payment_method: "cash",
        amount_tendered_minor: 1000n, change_minor: 0n, status: "completed", sold_at: new Date(),
      },
    });
    const hit = await lookupReceiptForReturn(prisma, org.orgId, "RCP-Y");
    expect(hit).toBeNull();
  } finally {
    await dropTestOrg(other.orgId);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/pos/dal-scoping.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pos/dal'`.

- [ ] **Step 3: Create `lib/pos/dal.ts` with the read functions**

```ts
import { prisma } from "@/lib/prisma";

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
    include: { pos_sale_items: { include: { pos_products: true } } },
    orderBy: { sold_at: "desc" },
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/pos/dal-scoping.test.ts`
Expected: PASS (all isolation tests green).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.

```bash
git add lib/pos/dal.ts tests/pos/dal-scoping.test.ts
git commit -m "feat: org-scoped POS read functions in lib/pos/dal"
```

---

### Task 3: `processSale` — stock guard + server-side amount re-derivation

**Files:**
- Modify: `lib/pos/dal.ts` (add `processSale`)
- Test: `tests/pos/sale.test.ts` (create)

**Interfaces:**
- Consumes: `ProcessSaleInput`, `ProcessSaleResult`, `PosStockError`, `PosValidationError`, `PosActor` from `lib/pos/types.ts`.
- Produces: `processSale(client, actor, input) => Promise<ProcessSaleResult>`. `actor` needs `{ organizationId, userId }`. Persists only server-derived money. Throws `PosValidationError` (bad input / unknown / inactive / foreign product / discount out of range / cash short), `PosStockError` (oversell). Runs inside `client.$transaction`.

- [ ] **Step 1: Write failing tests** — `tests/pos/sale.test.ts`:

```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, dropTestOrg, createTestPosProduct, type TestOrg } from "../fixtures";
import { processSale } from "@/lib/pos/dal";
import { PosStockError, PosValidationError, type PosActor } from "@/lib/pos/types";

let org: TestOrg;
let actor: PosActor;
beforeEach(async () => {
  org = await createTestOrg();
  actor = { organizationId: org.orgId, userId: org.userId, role: "owner", actorLabel: "Tester" };
});
afterEach(async () => { await dropTestOrg(org.orgId); });

it("re-derives totals from DB and ignores client-tampered amounts", async () => {
  // price £10.00, 20% tax, no discount, qty 2 => subtotal 2000, tax 400, total 2400
  const { id } = await createTestPosProduct(org.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });
  const res = await processSale(prisma, actor, {
    receiptNo: "RCP-A", paymentMethod: "card", discountPercent: 0,
    lines: [{ productId: id, quantity: 2 }],
  });
  expect(res.subtotalMinor).toBe(2000);
  expect(res.taxMinor).toBe(400);
  expect(res.totalMinor).toBe(2400);
  const sale = await prisma.pos_sales.findFirstOrThrow({ where: { id: res.id } });
  expect(Number(sale.total_minor)).toBe(2400);
  expect(sale.sold_by_user_id).toBe(org.userId);
  const product = await prisma.pos_products.findFirstOrThrow({ where: { id } });
  expect(product.stock_qty).toBe(3); // decremented
});

it("hard-rejects oversell and rolls back the whole sale", async () => {
  const { id } = await createTestPosProduct(org.orgId, { priceMinor: 1000, stockQty: 1 });
  await expect(
    processSale(prisma, actor, {
      receiptNo: "RCP-B", paymentMethod: "card", discountPercent: 0,
      lines: [{ productId: id, quantity: 3 }],
    })
  ).rejects.toBeInstanceOf(PosStockError);
  expect(await prisma.pos_sales.count({ where: { org_id: org.orgId } })).toBe(0);
  const product = await prisma.pos_products.findFirstOrThrow({ where: { id } });
  expect(product.stock_qty).toBe(1); // unchanged
});

it("rejects an unknown / foreign product id", async () => {
  await expect(
    processSale(prisma, actor, {
      receiptNo: "RCP-C", paymentMethod: "card", discountPercent: 0,
      lines: [{ productId: crypto.randomUUID(), quantity: 1 }],
    })
  ).rejects.toBeInstanceOf(PosValidationError);
});

it("rejects discountPercent out of range", async () => {
  const { id } = await createTestPosProduct(org.orgId);
  await expect(
    processSale(prisma, actor, {
      receiptNo: "RCP-D", paymentMethod: "card", discountPercent: 150,
      lines: [{ productId: id, quantity: 1 }],
    })
  ).rejects.toBeInstanceOf(PosValidationError);
});

it("rejects cash tendered below total", async () => {
  const { id } = await createTestPosProduct(org.orgId, { priceMinor: 1000, taxRate: 0, stockQty: 5 });
  await expect(
    processSale(prisma, actor, {
      receiptNo: "RCP-E", paymentMethod: "cash", discountPercent: 0, cashReceived: 500,
      lines: [{ productId: id, quantity: 1 }],
    })
  ).rejects.toBeInstanceOf(PosValidationError);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/pos/sale.test.ts`
Expected: FAIL — `processSale` is not exported.

- [ ] **Step 3: Implement `processSale` in `lib/pos/dal.ts`**

Add the import at the top of the file:

```ts
import { PosValidationError, PosStockError, type PosActor, type ProcessSaleInput, type ProcessSaleResult, type StockShortage } from "@/lib/pos/types";
```

Add the function:

```ts
const VALID_PAYMENT_METHODS = new Set(["cash", "card", "mobile", "split"]);

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

  return client.$transaction(async (tx) => {
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

    const saleId = crypto.randomUUID();
    const soldAt = new Date();
    const sale = await tx.pos_sales.create({
      data: {
        id: saleId,
        org_id: orgId,
        sale_number: input.receiptNo,
        customer_name: input.customerName || "Walk-in Customer",
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

    for (const line of input.lines) {
      const p = byId.get(line.productId)!;
      const lineTotal = Number(p.price_minor) * line.quantity;
      await tx.pos_sale_items.create({
        data: {
          id: crypto.randomUUID(),
          org_id: orgId,
          sale_id: saleId,
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          unit_price_minor: p.price_minor,
          quantity: line.quantity,
          line_total_minor: BigInt(lineTotal),
          tax_rate: p.tax_rate,
          created_at: soldAt,
        },
      });
    }

    for (const [pid, qty] of required) {
      await tx.pos_products.update({
        where: { id: pid },
        data: { stock_qty: { decrement: qty } },
      });
    }

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
  });
}
```

> Note: `tx.pos_products.update({ where: { id } })` is safe here because the products were already confirmed in-org by the scoped `findMany` above; the update only runs on those ids inside the same transaction.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/pos/sale.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.

```bash
git add lib/pos/dal.ts tests/pos/sale.test.ts
git commit -m "feat: POS processSale with stock guard and server-side amounts"
```

---

### Task 4: `deleteSale` (stock restore) + `refundSale`

**Files:**
- Modify: `lib/pos/dal.ts`
- Test: `tests/pos/mutations.test.ts` (create)

**Interfaces:**
- Consumes: `PosActor`, `PosNotFoundError`.
- Produces:
  - `deleteSale(client, orgId, saleId) => Promise<void>` — restores stock for non-refunded sales, then deletes items + sale; scoped + ownership-checked; throws `PosNotFoundError` if not in org.
  - `refundSale(client, actor, saleId) => Promise<void>` — marks sale `refunded` and increments stock; scoped; throws `PosNotFoundError` if not in org or not `completed`.

- [ ] **Step 1: Write failing tests** — `tests/pos/mutations.test.ts`:

```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, dropTestOrg, createTestPosProduct, type TestOrg } from "../fixtures";
import { processSale, deleteSale, refundSale } from "@/lib/pos/dal";
import { PosNotFoundError, type PosActor } from "@/lib/pos/types";

let org: TestOrg;
let actor: PosActor;
beforeEach(async () => {
  org = await createTestOrg();
  actor = { organizationId: org.orgId, userId: org.userId, role: "owner", actorLabel: "Tester" };
});
afterEach(async () => { await dropTestOrg(org.orgId); });

it("deleting a completed sale restores stock", async () => {
  const { id } = await createTestPosProduct(org.orgId, { priceMinor: 1000, stockQty: 5 });
  const sale = await processSale(prisma, actor, {
    receiptNo: "RCP-DEL", paymentMethod: "card", discountPercent: 0,
    lines: [{ productId: id, quantity: 2 }],
  });
  expect((await prisma.pos_products.findFirstOrThrow({ where: { id } })).stock_qty).toBe(3);
  await deleteSale(prisma, org.orgId, sale.id);
  expect((await prisma.pos_products.findFirstOrThrow({ where: { id } })).stock_qty).toBe(5);
  expect(await prisma.pos_sales.count({ where: { id: sale.id } })).toBe(0);
});

it("deleting an already-refunded sale does not double-restore stock", async () => {
  const { id } = await createTestPosProduct(org.orgId, { priceMinor: 1000, stockQty: 5 });
  const sale = await processSale(prisma, actor, {
    receiptNo: "RCP-RD", paymentMethod: "card", discountPercent: 0,
    lines: [{ productId: id, quantity: 2 }],
  });
  await refundSale(prisma, actor, sale.id); // stock back to 5
  expect((await prisma.pos_products.findFirstOrThrow({ where: { id } })).stock_qty).toBe(5);
  await deleteSale(prisma, org.orgId, sale.id); // must NOT restore again
  expect((await prisma.pos_products.findFirstOrThrow({ where: { id } })).stock_qty).toBe(5);
});

it("refundSale increments stock and marks refunded", async () => {
  const { id } = await createTestPosProduct(org.orgId, { priceMinor: 1000, stockQty: 5 });
  const sale = await processSale(prisma, actor, {
    receiptNo: "RCP-RF", paymentMethod: "card", discountPercent: 0,
    lines: [{ productId: id, quantity: 2 }],
  });
  await refundSale(prisma, actor, sale.id);
  expect((await prisma.pos_products.findFirstOrThrow({ where: { id } })).stock_qty).toBe(5);
  expect((await prisma.pos_sales.findFirstOrThrow({ where: { id: sale.id } })).status).toBe("refunded");
});

it("cannot delete another org's sale", async () => {
  const other = await createTestOrg();
  try {
    const otherActor: PosActor = { organizationId: other.orgId, userId: other.userId, role: "owner", actorLabel: "X" };
    const { id } = await createTestPosProduct(other.orgId, { stockQty: 5 });
    const sale = await processSale(prisma, otherActor, {
      receiptNo: "RCP-OTHER", paymentMethod: "card", discountPercent: 0,
      lines: [{ productId: id, quantity: 1 }],
    });
    await expect(deleteSale(prisma, org.orgId, sale.id)).rejects.toBeInstanceOf(PosNotFoundError);
    expect(await prisma.pos_sales.count({ where: { id: sale.id } })).toBe(1);
  } finally {
    await dropTestOrg(other.orgId);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/pos/mutations.test.ts`
Expected: FAIL — `deleteSale` / `refundSale` not exported.

- [ ] **Step 3: Implement in `lib/pos/dal.ts`**

Add `PosNotFoundError` to the types import, then add:

```ts
export async function deleteSale(client: Db, orgId: string, saleId: string): Promise<void> {
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
    }

    await tx.pos_sale_items.deleteMany({ where: { sale_id: saleId, org_id: orgId } });
    await tx.pos_sales.deleteMany({ where: { id: saleId, org_id: orgId } });
  });
}

export async function refundSale(
  client: Db,
  actor: Pick<PosActor, "organizationId">,
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
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/pos/mutations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.

```bash
git add lib/pos/dal.ts tests/pos/mutations.test.ts
git commit -m "feat: POS deleteSale stock-restore and scoped refundSale"
```

---

### Task 5: `upsertProduct` (validated) + `deleteProduct` (scoped) + role helper

**Files:**
- Modify: `lib/pos/dal.ts`
- Test: `tests/pos/mutations.test.ts` (extend)

**Interfaces:**
- Consumes: `UpsertProductInput`, `PosActor`, `PosValidationError`, `PosNotFoundError`, `PosForbiddenError`.
- Produces:
  - `assertCanManagePos(role) => void` — throws `PosForbiddenError` unless `owner`/`accountant`.
  - `upsertProduct(client, actor, input) => Promise<{ id }>` — validates inputs, scopes create/update, writes a `pos_stock_logs` row using `actor.actorLabel` on stock change.
  - `deleteProduct(client, orgId, productId) => Promise<{ archived: boolean }>` — ownership-checked delete; archives (sets `is_active=false`) on FK violation.

- [ ] **Step 1: Write failing tests** — append to `tests/pos/mutations.test.ts`:

```ts
import { upsertProduct, deleteProduct, assertCanManagePos } from "@/lib/pos/dal";
import { PosValidationError, PosForbiddenError } from "@/lib/pos/types";

it("assertCanManagePos blocks employees, allows owner/accountant", () => {
  expect(() => assertCanManagePos("employee")).toThrow(PosForbiddenError);
  expect(() => assertCanManagePos("owner")).not.toThrow();
  expect(() => assertCanManagePos("accountant")).not.toThrow();
});

it("upsertProduct rejects blank name/sku and bad numbers", async () => {
  await expect(
    upsertProduct(prisma, actor, { name: "", sku: "", price: "x", costPrice: "0", stockQuantity: "0" })
  ).rejects.toBeInstanceOf(PosValidationError);
});

it("upsertProduct creates a scoped product and logs initial stock with the real actor", async () => {
  const res = await upsertProduct(prisma, actor, {
    name: "Widget", sku: "W-1", price: "10.00", costPrice: "4.00", stockQuantity: "7", taxRate: "20",
  });
  const product = await prisma.pos_products.findFirstOrThrow({ where: { id: res.id } });
  expect(product.org_id).toBe(org.orgId);
  expect(product.stock_qty).toBe(7);
  const log = await prisma.pos_stock_logs.findFirstOrThrow({ where: { product_id: res.id } });
  expect(log.created_by).toBe("Tester");
  expect(log.action_type).toBe("Initial Stock");
});

it("cannot delete another org's product", async () => {
  const other = await createTestOrg();
  try {
    const { id } = await createTestPosProduct(other.orgId);
    await expect(deleteProduct(prisma, org.orgId, id)).rejects.toBeInstanceOf(PosNotFoundError);
    expect(await prisma.pos_products.count({ where: { id } })).toBe(1);
  } finally {
    await dropTestOrg(other.orgId);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/pos/mutations.test.ts`
Expected: FAIL — `upsertProduct` / `deleteProduct` / `assertCanManagePos` not exported.

- [ ] **Step 3: Implement in `lib/pos/dal.ts`**

Add `PosForbiddenError`, `UpsertProductInput`, `PosRole` to the types import. Then:

```ts
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

function parseCount(label: string, value: string | number, fallback?: number): number {
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

  if (input.id) {
    const existing = await client.pos_products.findFirst({
      where: { id: input.id, org_id: orgId },
      select: { stock_qty: true },
    });
    if (!existing) throw new PosNotFoundError("Product not found.");
    await client.pos_products.updateMany({ where: { id: input.id, org_id: orgId }, data: base });
    const delta = stockQty - existing.stock_qty;
    if (delta !== 0) {
      await client.pos_stock_logs.create({
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
  await client.pos_products.create({ data: { ...base, id, org_id: orgId, created_at: now } });
  if (stockQty > 0) {
    await client.pos_stock_logs.create({
      data: {
        org_id: orgId, product_id: id, product_name: name, action_type: "Initial Stock",
        quantity_delta: stockQty, new_balance: stockQty, created_by: actor.actorLabel,
      },
    });
  }
  return { id };
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/pos/mutations.test.ts`
Expected: PASS (8 tests total in file).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.

```bash
git add lib/pos/dal.ts tests/pos/mutations.test.ts
git commit -m "feat: validated POS upsertProduct and scoped deleteProduct"
```

---

### Task 6: Auth guards + wire all server actions

**Files:**
- Modify: `lib/pos/dal.ts` (add `deriveActorLabel`, `requirePosAccess`, `requirePosManager`)
- Modify: `app/(dashboard)/pos/actions.ts` (rewrite as thin wrappers; delete `TEMP_ORG_ID`)
- Test: `tests/pos/dal-scoping.test.ts` (add `deriveActorLabel` unit test)

**Interfaces:**
- Consumes: `requireAccountingWorkspace`, `requireAccountantRole` from `@/lib/accounting/dal`; `createClient` from `@/lib/supabase/server`; all dal data functions from Tasks 2–5.
- Produces:
  - `deriveActorLabel(user) => string` — `user.user_metadata.full_name ?? user.email ?? user.id`.
  - `requirePosAccess() => Promise<PosActor>` — any authenticated member.
  - `requirePosManager() => Promise<PosActor>` — owner/accountant (`assertCanManagePos`).
  - Rewritten server actions keeping current names/return shapes: `getPosProducts`, `processLiveSale`, `upsertPosProduct`, `deletePosProduct`, `getPosSales`, `deletePosSale`, `getPosRefunds`, `lookupReceiptForReturn`, `executeReceiptRefund`, `getPosStockLogs`.

- [ ] **Step 1: Write the failing unit test** — append to `tests/pos/dal-scoping.test.ts`:

```ts
import { deriveActorLabel } from "@/lib/pos/dal";

it("deriveActorLabel prefers full_name, then email, then id", () => {
  expect(deriveActorLabel({ id: "u1", email: "a@b.com", user_metadata: { full_name: "Ada" } } as any)).toBe("Ada");
  expect(deriveActorLabel({ id: "u1", email: "a@b.com", user_metadata: {} } as any)).toBe("a@b.com");
  expect(deriveActorLabel({ id: "u1", user_metadata: {} } as any)).toBe("u1");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/pos/dal-scoping.test.ts`
Expected: FAIL — `deriveActorLabel` not exported.

- [ ] **Step 3: Add guards to `lib/pos/dal.ts`**

Add imports at the top:

```ts
import type { User } from "@supabase/supabase-js";
import { requireAccountingWorkspace, requireAccountantRole } from "@/lib/accounting/dal";
import { createClient } from "@/lib/supabase/server";
import type { PosActor } from "@/lib/pos/types";
```

Add:

```ts
export function deriveActorLabel(user: Pick<User, "id" | "email" | "user_metadata">): string {
  const meta = user.user_metadata as { full_name?: string } | null | undefined;
  return meta?.full_name || user.email || user.id;
}

async function buildActor(workspace: { userId: string; organizationId: string; role: PosActor["role"] }): Promise<PosActor> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const actorLabel = data.user ? deriveActorLabel(data.user) : workspace.userId;
  return { ...workspace, actorLabel };
}

export async function requirePosAccess(): Promise<PosActor> {
  const workspace = await requireAccountingWorkspace(); // any authenticated member
  return buildActor(workspace);
}

export async function requirePosManager(): Promise<PosActor> {
  const workspace = await requireAccountantRole(); // throws for employee
  return buildActor(workspace);
}
```

- [ ] **Step 4: Run to verify the unit test passes**

Run: `pnpm test tests/pos/dal-scoping.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `app/(dashboard)/pos/actions.ts` as thin wrappers**

Replace the ENTIRE file contents with:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  requirePosAccess, requirePosManager,
  listPosProducts, listPosSales, listPosRefunds, listPosStockLogs,
  lookupReceiptForReturn as lookupReceiptDal,
  processSale, refundSale, deleteSale, upsertProduct, deleteProduct,
} from "@/lib/pos/dal";
import type { SaleLineInput } from "@/lib/pos/types";

function fail(error: unknown, fallback: string) {
  const e = error as { code?: string; message?: string; shortages?: unknown };
  if (e?.code === "INSUFFICIENT_STOCK") {
    return { success: false, error: "Insufficient stock for one or more items.", code: e.code, details: e.shortages };
  }
  if (e?.code === "VALIDATION" || e?.code === "FORBIDDEN" || e?.code === "NOT_FOUND") {
    return { success: false, error: e.message ?? fallback, code: e.code };
  }
  console.error(fallback, error);
  return { success: false, error: fallback };
}

export async function getPosProducts() {
  try {
    const actor = await requirePosAccess();
    return { success: true, data: await listPosProducts(prisma, actor.organizationId) };
  } catch (error) {
    return fail(error, "Failed to fetch products");
  }
}

export async function processLiveSale(saleData: any, cartItems: any[]) {
  try {
    const actor = await requirePosAccess();
    const lines: SaleLineInput[] = (cartItems ?? []).map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    }));
    const result = await processSale(prisma, actor, {
      receiptNo: saleData.receiptNo,
      customerName: saleData.customerName,
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

export async function upsertPosProduct(input: any) {
  try {
    const actor = await requirePosManager();
    const { id } = await upsertProduct(prisma, actor, input);
    const [product] = await prisma.pos_products.findMany({ where: { id, org_id: actor.organizationId }, take: 1 });
    revalidatePath("/pos");
    return {
      success: true,
      data: product && {
        id: product.id, sku: product.sku, barcode: product.barcode ?? "", name: product.name,
        description: product.description ?? "", price: Number(product.price_minor),
        costPrice: Number(product.cost_minor), stockQuantity: product.stock_qty,
        minStockLevel: product.min_stock_level, category: product.category, unit: "pcs",
        taxRate: Number(product.tax_rate), isActive: product.is_active, imageUrl: product.image_url ?? "",
      },
    };
  } catch (error) {
    return fail(error, "Failed to save product changes.");
  }
}

export async function deletePosProduct(id: string) {
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

export async function getPosSales() {
  try {
    const actor = await requirePosAccess();
    const sales = await listPosSales(prisma, actor.organizationId);
    return {
      success: true,
      data: sales.map((sale) => {
        const itemsCount = sale.pos_sale_items.reduce((sum, i) => sum + i.quantity, 0);
        return {
          id: sale.id, receiptNo: sale.sale_number, customer: sale.customer_name || "Walk-in Customer",
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

export async function deletePosSale(saleId: string) {
  try {
    const actor = await requirePosManager();
    await deleteSale(prisma, actor.organizationId, saleId);
    revalidatePath("/pos");
    return { success: true };
  } catch (error) {
    return fail(error, "Failed to delete transaction.");
  }
}

export async function getPosRefunds() {
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

export async function lookupReceiptForReturn(receiptNo: string) {
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

export async function executeReceiptRefund(saleId: string) {
  try {
    const actor = await requirePosAccess();
    await refundSale(prisma, actor, saleId);
    revalidatePath("/pos");
    return { success: true };
  } catch (error) {
    return fail(error, "Failed to reverse transaction.");
  }
}

export async function getPosStockLogs() {
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
```

- [ ] **Step 6: Run the full POS suite + typecheck**

Run: `pnpm test tests/pos/` then `pnpm typecheck`
Expected: all POS tests PASS; typecheck exit 0.

- [ ] **Step 7: Run the FULL suite to confirm no regressions**

Run: `pnpm test`
Expected: previously-green suite still green, plus the new POS tests. (Baseline was 124/124 before this work.)

- [ ] **Step 8: Commit**

```bash
git add lib/pos/dal.ts app/(dashboard)/pos/actions.ts tests/pos/dal-scoping.test.ts
git commit -m "feat: authenticate and org-scope all POS server actions"
```

---

### Task 7: Manual verification + status-doc update

**Files:**
- Modify: `docs/PROJECT-STATUS.md` (mark S1 + the POS data-integrity add-ons done; note A2/A1 still pending)

**Interfaces:** none (documentation + manual QA).

- [ ] **Step 1: Manual smoke test (logged-in)**

Run `pnpm dev`. As an org member, open `/pos/terminal`, ring up a sale; confirm it appears under `/pos/transactions` for your org and decrements stock. Attempt to oversell (cart qty > stock) → expect rejection. Sign in as a different org (or check DB) → confirm you cannot see the first org's sales.

- [ ] **Step 2: Confirm the hardcoded org is gone**

Run: `grep -rn "TEMP_ORG_ID\|af0da820-f9c3-47e9-8118-61d1216c239f" app lib`
Expected: no matches.

- [ ] **Step 3: Update `docs/PROJECT-STATUS.md`**

Move S1 (POS authentication/org-scoping) and the POS data-integrity items (negative-stock guard, stock-restore-on-delete, real audit user, server-side amount validation) into a "completed" note referencing this plan; keep A2 (POS→ledger) and A1 (Payroll→ledger) under PENDING. Add a one-line pointer to `docs/superpowers/specs/2026-06-30-pos-security-hardening-design.md`.

- [ ] **Step 4: Final commit**

```bash
git add docs/PROJECT-STATUS.md
git commit -m "docs: mark POS security hardening (S1) complete"
```

---

## Self-review notes

- **Spec coverage:** §3.1 guards → Task 6; §3.2 mapping → Task 6 wrappers; §3.3 scoping → Tasks 2/4/5; §4 stock guard → Task 3; §5 amount validation → Task 3; §6 add-ons → Tasks 3 (validation), 4 (stock restore), 5/6 (real actor label); §7 error handling → `fail()` mapper + typed errors; §9 tests → Tasks 1–6. Non-goals (ledger, feature-flag, Approach C) intentionally untouched.
- **Type consistency:** `PosActor`, `ProcessSaleInput/Result`, `UpsertProductInput`, and all error `code` strings are defined once in `lib/pos/types.ts` (Task 1) and reused verbatim. Dal signatures `(client, orgId)` for reads and `(client, actor, …)` for writes are consistent across tasks and the action wrappers.
- **Known limitation (documented, not a gap):** the Supabase auth path in the guards is exercised by typecheck + manual QA (Task 7), not unit tests; the *role decision* is unit-tested via `assertCanManagePos`, and all data-layer scoping is unit-tested directly.
