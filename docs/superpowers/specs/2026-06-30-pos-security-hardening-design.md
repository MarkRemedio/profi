# POS Security Hardening — Design

> **Status:** Approved for planning
> **Date:** 2026-06-30
> **Sub-project:** 1 of 3 in Priority 3 ("Connect POS & Payroll to the ledger + authenticate POS" — A1/A2/S1).
> This spec covers **S1 + POS data-integrity** only. POS→ledger (A2) and Payroll→ledger (A1) are separate specs.
> Related: [`../../PROJECT-STATUS.md`](../../PROJECT-STATUS.md) · [`../../AUDIT-REPORT-SCOPED.md`](../../AUDIT-REPORT-SCOPED.md)

---

## 1. Problem

The POS module (`app/(dashboard)/pos/actions.ts`) is unauthenticated and multi-tenant-unsafe:

- **No authentication.** No POS server action calls any auth guard. The only "security" is a client-side feature-flag check in `components/accounting/workspace-shell.tsx` (a `"use client"` component) — cosmetic, trivially bypassed by calling the server action directly.
- **Hardcoded org.** `const TEMP_ORG_ID = "af0da820-f9c3-47e9-8118-61d1216c239f"` (line 7) is used for every write.
- **Cross-tenant reads.** `getPosProducts`, `getPosSales`, `getPosRefunds` query with **no `org_id` filter** → any caller reads every tenant's data.
- **IDOR on writes.** `deletePosProduct`, `deletePosSale`, `executeReceiptRefund`, `upsertPosProduct` act on a client-supplied id with no ownership check → cross-tenant edit/delete/refund.
- **No server-side stock guard.** `processLiveSale` decrements stock with no check; overselling drives `stock_qty` negative. Client-side checks in `terminal.tsx` are bypassable.
- **Client-trusted money.** `processLiveSale` persists `BigInt(saleData.total)`, `subtotal`, `tax`, unit prices etc. straight from the client payload — prices/totals can be tampered.
- **Untruthful audit fields.** `pos_stock_logs.created_by` and the displayed cashier are hardcoded `"Admin User"`.
- **Silent inventory corruption.** `deletePosSale` hard-deletes a completed sale without returning items to stock.

`pos_*` tables use the Prisma field `org_id` (snake_case) and are intentionally **excluded** from the tenancy auto-guard (`lib/tenancy/scoped-models.ts` `KNOWN_EXCLUDED`). The fail-closed extension that protects `Invoice`/`Journal`/etc. does **not** cover POS — so every POS query must be scoped **manually**.

## 2. Goals / Non-goals

**Goals**
- Authenticate every POS server action and scope it to the caller's real workspace org.
- Tiered roles: members sell/refund; managers (owner/accountant) manage products and hard-delete sales.
- Hard-reject overselling server-side.
- Re-derive sale money server-side from DB product records; stop trusting client amounts.
- Fix three data-integrity bugs: restore stock on sale delete, record the real user in audit fields, validate `upsertPosProduct` inputs.
- Make the security guarantees unit-testable and add tests.

**Non-goals (deferred — see §10)**
- POS → ledger posting (`posted_journal_id`). — Sub-project 2.
- Payroll → ledger. — Sub-project 3.
- Converting `pos_*` to the auto-tenancy guard (schema change). — deferred to schema-touching ledger work.
- Aligning POS tax rounding with the accounting half-up helper. — revisit during ledger reconciliation.
- Server-side enforcement of the org `pos` feature flag. — optional; fold in only if trivial.

## 3. Architecture (Approach B — POS DAL)

```
app/(dashboard)/pos/actions.ts   "use server": auth guard → call dal → revalidatePath → {success,...}
lib/pos/dal.ts                    guards + pure data functions; every query scoped on org_id; throws typed errors
lib/pos/types.ts                  input/return types replacing `any` at the action boundary
tests/pos/*.test.ts               isolation, role-gating, stock, amount-validation, stock-restore
```

`TEMP_ORG_ID` is deleted. Dal data functions take an explicit `orgId` (+ `actor` where needed) and read no ambient state, so tests drive them directly against a seeded org with no Supabase mock. Server actions stay thin and keep the existing `{ success, error, ... }` return shape, so the client UI is unchanged.

### 3.1 Auth guards

Built on existing `lib/accounting/dal.ts`:

- **`requirePosAccess()`** — any authenticated org member (owner/accountant/employee). Wraps `requireAccountingWorkspace()`; returns `{ organizationId, userId, role, actorLabel }`. `requireAccountingWorkspace` exposes only `{ userId, organizationId, role }`, so `actorLabel` is derived inside this guard from the Supabase user (`auth.getUser()` — `user_metadata.full_name` if present, else `email`, else `userId`). It is a human-readable string for the `pos_stock_logs.created_by` VARCHAR; `userId` remains the machine key for any id-typed field.
- **`requirePosManager()`** — owner/accountant only; delegates to `requireAccountantRole()`.

### 3.2 Per-action guard mapping

| Action | Guard |
|---|---|
| `getPosProducts`, `getPosSales`, `getPosRefunds`, `getPosStockLogs`, `lookupReceiptForReturn` | `requirePosAccess` |
| `processLiveSale`, `executeReceiptRefund` | `requirePosAccess` |
| `upsertPosProduct`, `deletePosProduct`, `deletePosSale` | `requirePosManager` |

### 3.3 Org-scoping rules (enforced in `lib/pos/dal.ts`)

- **Reads** (`findMany`): add `where: { org_id: orgId }`.
- **Writes by id** (`update`/`delete`): never trust the id alone. Use `updateMany`/`deleteMany` filtered by `{ id, org_id: orgId }` and assert `count === 1`, or pre-fetch `findFirst({ id, org_id })` and throw `PosNotFoundError` if absent.
- **Creates**: `org_id: orgId` from the workspace.
- **`getPosStockLogs`**: replace the `org_id: TEMP_ORG_ID` filter with `orgId`.

## 4. Stock guard — hard-reject oversell

In `processLiveSale`, inside the existing `$transaction`, **before** any decrement:

1. Aggregate required quantity **per product id** across cart lines (same product may appear twice).
2. Re-read each product (`findMany where { id in ids, org_id }`) for authoritative `stock_qty`, `price_minor`, `tax_rate`, `is_active`, `name`, `sku`.
3. Reject if any id is unknown / foreign-org / inactive (`PosValidationError`).
4. If any `stock_qty < required`, throw `PosStockError` → whole transaction rolls back.
5. Otherwise create the sale + items and decrement (scoped) as today.

Action returns on failure: `{ success: false, error, code: "INSUFFICIENT_STOCK", details: [{ sku, requested, available }] }`.

## 5. Server-side amount validation

`processLiveSale` accepts from the client only: `cart` (product ids + integer quantities), `discountPercent`, `paymentMethod`, `cashReceived`, `customerName`, `receiptNo`. All money is recomputed server-side from the DB products loaded in §4, mirroring the current client formula so receipts still match:

- `subtotal = Σ (price_minor · qty)`
- `discount = round(subtotal · discountPercent / 100)`
- per line: `lineDiscount = round(lineTotal · pct/100)`, `lineTax = round((lineTotal − lineDiscount) · taxRate/100)`
- `total = subtotal − discount + Σ lineTax`

Validation: `discountPercent ∈ [0,100]`; each `quantity` a positive integer; `paymentMethod ∈ {cash,card,mobile,split}`. For `cash`: require `cashReceived ≥ total`; derive `change = cashReceived − total` server-side (client `change` ignored). Persist only server-derived figures; client `subtotal`/`tax`/`total`/unit prices are discarded.

Rounding uses `Math.round` to match the current POS/client convention (not the accounting half-up `calculateTax`) — keeps POS internally consistent; ledger sub-project may revisit.

`receiptNo` / `sale_number` collisions are already constrained unique per `[org_id, sale_number]`; on a unique violation the action returns a friendly error (retry is a client concern, consistent with current behavior).

## 6. Add-on data-integrity fixes

- **Restore stock on sale delete.** `deletePosSale` (manager) → transaction: re-read the sale (scoped) and its items; if `status !== "refunded"`, `increment` each product's `stock_qty` by the sold quantity; then delete items + sale. A `refunded` sale already returned its stock, so skip the increment to avoid double-restore.
- **Real user in audit fields.** `pos_stock_logs.created_by` uses `actorLabel` from the guard; any sold-by/cashier id field uses `userId` — both from the authenticated workspace, not `"Admin User"`.
- **`upsertPosProduct` input validation.** Require non-empty `name` and `sku`; parse `price`/`cost`/`stock`/`minStockLevel` strictly and reject NaN/negative instead of silently coercing to 0; scope create with `org_id: orgId` and update via ownership-checked `updateMany`.

## 7. Error handling

`lib/pos/dal.ts` throws typed errors: `PosStockError`, `PosNotFoundError`, `PosValidationError`. Auth guards redirect/throw as today (`requireAccountingWorkspace` → `redirect("/login")`; `requireAccountantRole` → throws). Each server action try/catches and maps to the existing `{ success, error, code?, details? }` shape. No raw Prisma error text reaches the client.

## 8. Data model

No schema changes. Existing fields used: `pos_sales(org_id, sale_number, status, …)`, `pos_sale_items(org_id, sale_id, product_id, quantity, …)`, `pos_products(org_id, stock_qty, price_minor, cost_minor, tax_rate, is_active, …)`, `pos_stock_logs(org_id, product_id, created_by, …)`. The `@@unique([org_id, sale_number])` and `@@unique([org_id, sku])` constraints are relied upon, not changed.

## 9. Testing (definition-of-done)

Extend the test fixture (`tests/.../fixtures.ts`) with a helper to seed `pos_products` (and optionally a sale) for an org. New `tests/pos/`:

1. **Tenant isolation** — org B cannot read via `getPosSales`/`getPosProducts`/`getPosRefunds`, nor mutate via `deletePosSale`/`deletePosProduct`/`executeReceiptRefund`/`upsertPosProduct`, any of org A's rows (expect not-found / zero-affected, never cross-org effect).
2. **Role gating** — `employee` may `processLiveSale` + `executeReceiptRefund`; is rejected from `upsertPosProduct`/`deletePosProduct`/`deletePosSale`.
3. **Stock guard** — oversell rolls back the entire sale; no sale row created; stock unchanged.
4. **Amount validation** — tampered client `total`/unit price ignored, server figures persisted; unknown/foreign product id rejected; `discountPercent` out of `[0,100]` rejected; cash `< total` rejected.
5. **Stock restore** — deleting a `completed` sale returns stock; deleting a `refunded` sale does not double-restore.

Where a test must exercise the action's auth path, prefer testing the dal function directly with a seeded org; reserve any Supabase-dependent path for the thin wrapper.

Done = code changed · `pnpm typecheck` exit 0 · `pnpm test` green with the new tests · behavior changes noted.

## 10. Deferred / follow-on

- **A2 — POS → ledger:** populate `posted_journal_id`; post revenue, output VAT, cash/card clearing, and the COGS/inventory decision. Needs new chart accounts (till/cash clearing, inventory asset). Separate spec.
- **A1 — Payroll → ledger:** separate spec; also surfaces the PAYE/NI accuracy question (wizard currently uses `gross*0.15` / `gross*0.08` estimates).
- **Approach C** (auto-tenancy guard for `pos_*` via `organizationId` alias + registry) — revisit when ledger work touches the schema.
- **`pos` feature-flag** server-side enforcement.
