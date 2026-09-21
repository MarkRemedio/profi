# Banking Django Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement the Django banking backend 1:1 in Next.js + Prisma, then delete Django so the app runs on a single backend.

**Architecture:** Mirror the accounting module. Pure logic (matching, statement parsing) and a Prisma DAL live under `lib/banking/`; functions take `(db, orgId, userId, input)` so they're integration-testable directly (the pattern used by `lib/accounting/*` and exercised in `tests/period-close.test.ts`). Thin `"use server"` wrappers in `app/banking/actions.ts` add auth (`requireAccountingWorkspace`/`requireAccountantRole`) and `revalidatePath`. The React Query hooks keep identical signatures; only their `queryFn`/`mutationFn` swap from `djangoFetch` to server actions.

**Tech Stack:** Next.js 16, React 19, Prisma 7 (`@prisma/adapter-pg`), `@tanstack/react-query` 5, Vitest 4, `unpdf` (new, for PDF text extraction).

## Global Constraints

- **Parity is the contract.** Output JSON shapes and hook signatures must match the current Django responses exactly (see `lib/django/banking.ts` types). No UX or data-shape changes.
- **Money is in minor units (pennies), stored as Postgres `BigInt`.** Prisma returns `bigint`; convert to `number` at the boundary with `Number(...)`. Pounds strings use 2 decimals (`(minor/100).toFixed(2)`).
- **Journal posting MUST follow draft → insert lines → post.** Two DB triggers enforce it: `ensure_journal_balanced_on_post` (posted journals must balance) and `prevent_posted_journal_line_changes` (no line edits on posted journals). Never INSERT a posted journal with lines directly.
- **Banking Prisma models are snake_case accessors:** `prisma.banking_bank_accounts`, `prisma.banking_feed_transactions`, `prisma.banking_bank_conversions`. Accounting models are PascalCase: `prisma.journal`, `prisma.journalLine`, `prisma.chartAccount`, `prisma.contact`, `prisma.organization`, `prisma.userRole`.
- **Org membership selection:** use the existing `requireAccountingWorkspace` (oldest membership). Documented difference from Django (newest); accepted.
- **Tests** run against the dev DB via `pnpm test` (Vitest). Each test creates a throwaway org with `createTestOrg()` and tears down with `dropTestOrg()`. New banking tables must be added to teardown.
- **Source of truth for all ported logic:** `backend/banking/` (`views.py`, `posting.py`, `matching.py`, `balances.py`, `ocr.py`, `serializers.py`).

---

## File Structure

**Create:**
- `lib/banking/types.ts` — shared TS types (the response shapes; re-exported by the frontend api).
- `lib/banking/matching.ts` — pure scoring engine (port of `matching.py`).
- `lib/banking/statement-parser.ts` — CSV + PDF parsing (port of `ocr.py`).
- `lib/banking/posting.ts` — `postBalancedJournal`, `findAccountByCode` (port of `posting.py`).
- `lib/banking/dal.ts` — `server-only` Prisma reads/writes for all endpoints.
- `app/banking/actions.ts` — `"use server"` wrappers (auth + revalidate).
- `lib/banking/api.ts` — client hooks/types (replaces `lib/django/banking.ts`).
- `tests/banking-matching.test.ts`, `tests/banking-statement-parser.test.ts`, `tests/banking-posting.test.ts`, `tests/banking-dal.test.ts` — tests.
- `tests/fixtures/statements/` — sample CSV/PDF fixtures.

**Modify:**
- `tests/fixtures.ts` — add `createTestBankAccount()` helper; extend `dropTestOrg()` to delete banking rows.
- `components/banking/*.tsx` — change imports from `@/lib/django/*` to `@/lib/banking/api`.

**Delete (final task):**
- `lib/django/` (both files), `backend/`, the `NEXT_PUBLIC_DJANGO_API_URL` references.

---

## Task 1: Test fixtures for banking

**Files:**
- Modify: `tests/fixtures.ts`
- Test: `tests/banking-fixtures.test.ts` (temporary sanity test, deleted at end of task)

**Interfaces:**
- Consumes: `createTestOrg()`, `dropTestOrg()` (existing).
- Produces: `createTestBankAccount(orgId, opts?) → Promise<{ bankAccountId: string; chartAccountId: string }>`; extended `dropTestOrg` that also clears `banking_*` tables.

- [ ] **Step 1: Extend `dropTestOrg` to clear banking tables**

In `tests/fixtures.ts`, inside the `dropTestOrg` transaction, add these deletes BEFORE the `journalLine.deleteMany` line (feed/conversions reference bank accounts; bank accounts reference chart accounts):

```typescript
    await tx.banking_feed_transactions.deleteMany({ where: { org_id: orgId } });
    await tx.banking_bank_conversions.deleteMany({ where: { org_id: orgId } });
    await tx.banking_bank_accounts.deleteMany({ where: { org_id: orgId } });
```

- [ ] **Step 2: Add `createTestBankAccount` helper**

Append to `tests/fixtures.ts`:

```typescript
import { randomUUID as _randomUUID } from "node:crypto";

export async function createTestBankAccount(
  orgId: string,
  opts: { displayName?: string; bankName?: string; code?: string } = {}
): Promise<{ bankAccountId: string; chartAccountId: string }> {
  const code = opts.code ?? "1000";
  const now = new Date();
  const chartAccount = await prisma.chartAccount.create({
    data: {
      organizationId: orgId,
      code,
      name: opts.displayName ?? "Test Bank",
      accountType: "ASSET",
      reportCategory: "BANK",
      taxCode: "no_vat",
      taxRate: "0",
      isSystem: false,
      isActive: true,
    },
    select: { id: true },
  });

  const bankAccount = await prisma.banking_bank_accounts.create({
    data: {
      id: _randomUUID(),
      org_id: orgId,
      chart_account_id: chartAccount.id,
      display_name: opts.displayName ?? "Test Bank",
      bank_name: opts.bankName ?? "Test Bank PLC",
      sort_code: "00-00-00",
      account_number_last4: "0000",
      currency: "GBP",
      connection_type: "manual_import",
      status: "active",
      color_tone: "blue",
      notes: "",
      conversion_balance_minor: 0,
      created_at: now,
      updated_at: now,
    },
    select: { id: true },
  });

  return { bankAccountId: bankAccount.id, chartAccountId: chartAccount.id };
}
```

- [ ] **Step 3: Write a sanity test**

Create `tests/banking-fixtures.test.ts`:

```typescript
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, dropTestOrg, createTestBankAccount, type TestOrg } from "./fixtures";

let org: TestOrg;
beforeEach(async () => { org = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(org.orgId); });

it("creates and tears down a bank account", async () => {
  const { bankAccountId } = await createTestBankAccount(org.orgId);
  const found = await prisma.banking_bank_accounts.findUnique({ where: { id: bankAccountId } });
  expect(found).not.toBeNull();
});
```

- [ ] **Step 4: Run it**

Run: `pnpm test banking-fixtures`
Expected: PASS. (If the teardown order is wrong you'll see an FK violation — the deletes in Step 1 must precede chart-account deletion.)

- [ ] **Step 5: Delete the sanity test and commit**

```bash
rm tests/banking-fixtures.test.ts
git add tests/fixtures.ts
git commit -m "test: add banking fixtures and teardown"
```

---

## Task 2: Matching engine (`lib/banking/matching.ts`)

Pure port of `backend/banking/matching.py`. No DB, no I/O.

**Files:**
- Create: `lib/banking/matching.ts`
- Test: `tests/banking-matching.test.ts`

**Interfaces:**
- Produces:
  - `scoreAmount(feedMinor: number, journalMinor: number): number`
  - `scoreDate(feedDate: Date, journalDate: Date): number`
  - `scoreDescription(feedDesc: string, journalMemo: string | null): number`
  - `matchScore(args: { feedAmountMinor: number; feedDate: Date; feedDescription: string; journalAmountMinor: number; journalDate: Date; journalMemo: string | null }): number`

- [ ] **Step 1: Write failing tests**

Create `tests/banking-matching.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { scoreAmount, scoreDate, scoreDescription, matchScore } from "@/lib/banking/matching";

describe("scoreAmount", () => {
  it("exact match = 50", () => expect(scoreAmount(125000, 125000)).toBe(50));
  it("within 5% = 30", () => expect(scoreAmount(100000, 103000)).toBe(30));
  it("within 10% = 15", () => expect(scoreAmount(100000, 108000)).toBe(15));
  it("within 20% = 5", () => expect(scoreAmount(100000, 115000)).toBe(5));
  it("beyond 20% = 0", () => expect(scoreAmount(100000, 200000)).toBe(0));
  it("both zero = 0", () => expect(scoreAmount(0, 0)).toBe(0));
});

describe("scoreDate", () => {
  const d = (s: string) => new Date(s + "T00:00:00Z");
  it("same day = 30", () => expect(scoreDate(d("2026-05-10"), d("2026-05-10"))).toBe(30));
  it("1 day = 20", () => expect(scoreDate(d("2026-05-10"), d("2026-05-11"))).toBe(20));
  it("3 days = 10", () => expect(scoreDate(d("2026-05-10"), d("2026-05-13"))).toBe(10));
  it("7 days = 5", () => expect(scoreDate(d("2026-05-10"), d("2026-05-17"))).toBe(5));
  it("8 days = 0", () => expect(scoreDate(d("2026-05-10"), d("2026-05-18"))).toBe(0));
});

describe("scoreDescription", () => {
  it("null memo = 0", () => expect(scoreDescription("STRIPE", null)).toBe(0));
  it("identical meaningful token = 20", () => expect(scoreDescription("STRIPE", "STRIPE")).toBe(20));
  it("ignores noise words", () => expect(scoreDescription("PAYMENT FOR", "PAYMENT FOR")).toBe(0));
});

describe("matchScore", () => {
  it("sums all three", () => {
    expect(matchScore({
      feedAmountMinor: 125000,
      feedDate: new Date("2026-05-10T00:00:00Z"),
      feedDescription: "STRIPE",
      journalAmountMinor: 125000,
      journalDate: new Date("2026-05-10T00:00:00Z"),
      journalMemo: "STRIPE",
    })).toBe(100);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test banking-matching`
Expected: FAIL — cannot find module `@/lib/banking/matching`.

- [ ] **Step 3: Implement**

Create `lib/banking/matching.ts`:

```typescript
/**
 * Rule-based feed↔journal matching. Pure port of backend/banking/matching.py.
 * Score out of 100: amount (0-50) + date (0-30) + description (0-20).
 */

const NOISE = new Set([
  "THE", "LTD", "LIMITED", "PLC", "AND", "FOR", "REF",
  "PAY", "PAYMENT", "TRF", "TRANSFER",
]);

function tokenize(text: string): Set<string> {
  const words = (text.toUpperCase().match(/[A-Z]{3,}/g) ?? []);
  return new Set(words.filter((w) => !NOISE.has(w)));
}

export function scoreAmount(feedMinor: number, journalMinor: number): number {
  if (feedMinor === 0 && journalMinor === 0) return 0;
  if (feedMinor === journalMinor) return 50;
  const larger = Math.max(Math.abs(feedMinor), Math.abs(journalMinor));
  if (larger === 0) return 0;
  const diffPct = Math.abs(feedMinor - journalMinor) / larger;
  if (diffPct <= 0.05) return 30;
  if (diffPct <= 0.1) return 15;
  if (diffPct <= 0.2) return 5;
  return 0;
}

export function scoreDate(feedDate: Date, journalDate: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.abs(Math.round((feedDate.getTime() - journalDate.getTime()) / dayMs));
  if (diff === 0) return 30;
  if (diff <= 1) return 20;
  if (diff <= 3) return 10;
  if (diff <= 7) return 5;
  return 0;
}

export function scoreDescription(feedDesc: string, journalMemo: string | null): number {
  if (!journalMemo) return 0;
  const feed = tokenize(feedDesc);
  const memo = tokenize(journalMemo);
  if (feed.size === 0 || memo.size === 0) return 0;
  const overlap = [...feed].filter((t) => memo.has(t)).length;
  const union = new Set([...feed, ...memo]).size;
  return Math.round((overlap / union) * 20);
}

export function matchScore(args: {
  feedAmountMinor: number;
  feedDate: Date;
  feedDescription: string;
  journalAmountMinor: number;
  journalDate: Date;
  journalMemo: string | null;
}): number {
  return (
    scoreAmount(args.feedAmountMinor, args.journalAmountMinor) +
    scoreDate(args.feedDate, args.journalDate) +
    scoreDescription(args.feedDescription, args.journalMemo)
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test banking-matching`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/banking/matching.ts tests/banking-matching.test.ts
git commit -m "feat(banking): port rule-based matching engine"
```

---

## Task 3: CSV statement parser

Port the CSV half of `backend/banking/ocr.py`. Pure, no I/O.

**Files:**
- Create: `lib/banking/statement-parser.ts`
- Create: `tests/fixtures/statements/simple.csv`, `tests/fixtures/statements/debit-credit.csv`
- Test: `tests/banking-statement-parser.test.ts`

**Interfaces:**
- Produces:
  - `type ParsedTransaction = { date: string; description: string; debit: number; credit: number }`
  - `parseCsv(bytes: Buffer | Uint8Array): ParsedTransaction[]`
  - `parseStatement(filename: string, bytes: Buffer | Uint8Array): Promise<ParsedTransaction[]>` (async because PDF, added in Task 4)

- [ ] **Step 1: Create CSV fixtures**

`tests/fixtures/statements/simple.csv` (single amount column; negative = debit):

```csv
Date,Description,Amount
11/05/2026,STRIPE PAYMENTS,1250.00
12/05/2026,AWS HOSTING,-145.20
```

`tests/fixtures/statements/debit-credit.csv` (separate columns):

```csv
Date,Narrative,Debit,Credit
11/05/2026,STRIPE PAYMENTS,,1250.00
12/05/2026,AWS HOSTING,145.20,
```

- [ ] **Step 2: Write failing tests**

Create `tests/banking-statement-parser.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/banking/statement-parser";

function fixture(name: string): Buffer {
  return readFileSync(path.resolve(__dirname, "fixtures/statements", name));
}

describe("parseCsv", () => {
  it("parses a single amount column (negative = debit)", () => {
    const rows = parseCsv(fixture("simple.csv"));
    expect(rows).toEqual([
      { date: "2026-05-11", description: "STRIPE PAYMENTS", debit: 0, credit: 125000 },
      { date: "2026-05-12", description: "AWS HOSTING", debit: 14520, credit: 0 },
    ]);
  });

  it("parses separate debit/credit columns", () => {
    const rows = parseCsv(fixture("debit-credit.csv"));
    expect(rows).toEqual([
      { date: "2026-05-11", description: "STRIPE PAYMENTS", debit: 0, credit: 125000 },
      { date: "2026-05-12", description: "AWS HOSTING", debit: 14520, credit: 0 },
    ]);
  });

  it("skips rows with unparseable dates", () => {
    const rows = parseCsv(Buffer.from("Date,Description,Amount\nnotadate,X,10.00\n"));
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement CSV parsing**

Create `lib/banking/statement-parser.ts`:

```typescript
/**
 * Bank statement parsing. Port of backend/banking/ocr.py.
 * Output amounts are in MINOR units (pennies).
 */

export type ParsedTransaction = {
  date: string; // YYYY-MM-DD
  description: string;
  debit: number; // pennies (money OUT)
  credit: number; // pennies (money IN)
};

function parseAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace(/[£$€,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  // Try ISO first.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // d/m/Y, d-m-Y, d/m/y (UK day-first).
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${y}-${month}-${day}`;
    }
  }

  // "11 May 2026" / "11 January 2026".
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const text = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (text) {
    const mm = months[text[2].slice(0, 3).toLowerCase()];
    if (mm) return `${text[3]}-${mm}-${text[1].padStart(2, "0")}`;
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function findColumn(headers: string[], keywords: string[]): number {
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.includes(kw));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseCsv(bytes: Buffer | Uint8Array): ParsedTransaction[] {
  let text = Buffer.from(bytes).toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const dateCol = findColumn(headers, ["date"]);
  const descCol = findColumn(headers, ["description", "narrative", "memo", "details", "particulars"]);
  const debitCol = findColumn(headers, ["debit", "withdrawals", "out", "payment out", "spent"]);
  const creditCol = findColumn(headers, ["credit", "deposits", "in", "payment in", "received"]);
  const amountCol = debitCol < 0 && creditCol < 0 ? findColumn(headers, ["amount"]) : -1;

  const rows: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rawDate = dateCol >= 0 ? (cells[dateCol] ?? "").trim() : "";
    const date = rawDate ? parseDate(rawDate) : null;
    if (!date) continue;

    const description = descCol >= 0 ? (cells[descCol] ?? "").trim() : "Unknown";

    let debit = 0;
    let credit = 0;
    if (amountCol >= 0) {
      const amount = parseAmount(cells[amountCol] ?? "0");
      debit = amount < 0 ? Math.abs(amount) : 0;
      credit = amount > 0 ? amount : 0;
    } else {
      debit = parseAmount(debitCol >= 0 ? cells[debitCol] ?? "0" : "0");
      credit = parseAmount(creditCol >= 0 ? cells[creditCol] ?? "0" : "0");
    }

    rows.push({ date, description: description || "Unknown", debit, credit });
  }
  return rows;
}

export async function parseStatement(
  filename: string,
  bytes: Buffer | Uint8Array
): Promise<ParsedTransaction[]> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt") return parseCsv(bytes);
  throw new Error(`Unsupported file type: .${ext}. Upload a PDF or CSV.`);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test banking-statement-parser`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/banking/statement-parser.ts tests/banking-statement-parser.test.ts tests/fixtures/statements/
git commit -m "feat(banking): port CSV statement parser"
```

---

## Task 4: PDF statement parser

Add `unpdf` (pure-JS PDF text extraction, serverless-safe) and port the PDF branch of `ocr.py`.

**Files:**
- Modify: `lib/banking/statement-parser.ts`
- Modify: `package.json` (dependency)
- Add fixture: `tests/fixtures/statements/sample.pdf` (a small real/exported bank statement PDF — see Step 1)
- Test: `tests/banking-statement-parser.test.ts` (extend)

**Interfaces:**
- Produces: `parsePdf(bytes: Buffer | Uint8Array): Promise<ParsedTransaction[]>`; `parseStatement` now routes `pdf` → `parsePdf`.

- [ ] **Step 1: Obtain a sample PDF fixture**

Place a small digital (text-based, not scanned) bank-statement PDF at `tests/fixtures/statements/sample.pdf` whose lines contain rows like `11/05/2026  STRIPE PAYMENTS  1,250.00`. If none is available, export one from a CSV via a spreadsheet to PDF. Note the exact expected rows for Step 3's assertion. **Do not commit real customer data — use a synthetic statement.**

- [ ] **Step 2: Add the dependency**

Run: `pnpm add unpdf`
Expected: `unpdf` appears under `dependencies` in `package.json`.

- [ ] **Step 3: Write the failing test**

Append to `tests/banking-statement-parser.test.ts`:

```typescript
import { parsePdf, parseStatement } from "@/lib/banking/statement-parser";

describe("parsePdf", () => {
  it("extracts transaction rows from a digital PDF", async () => {
    const rows = await parsePdf(fixture("sample.pdf"));
    // Adjust expected values to match the synthetic fixture from Step 1.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(typeof rows[0].debit).toBe("number");
    expect(typeof rows[0].credit).toBe("number");
  });

  it("routes .pdf through parsePdf", async () => {
    const rows = await parseStatement("statement.pdf", fixture("sample.pdf"));
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm test banking-statement-parser`
Expected: FAIL — `parsePdf` is not exported.

- [ ] **Step 5: Implement `parsePdf` and route it**

In `lib/banking/statement-parser.ts`, add the PDF line regex near the top (after `ParsedTransaction`):

```typescript
const PDF_ROW_RE =
  /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?/;
```

Add the parser:

```typescript
export async function parsePdf(bytes: Buffer | Uint8Array): Promise<ParsedTransaction[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const lines = (Array.isArray(text) ? text.join("\n") : text).split(/\r?\n/);

  const rows: ParsedTransaction[] = [];
  for (const line of lines) {
    const m = PDF_ROW_RE.exec(line);
    if (!m) continue;
    const date = parseDate(m[1]);
    if (!date) continue;
    const description = m[2].trim();
    const amt1 = parseAmount(m[3]);
    const amt2 = m[4] ? parseAmount(m[4]) : 0;

    let debit: number;
    let credit: number;
    if (amt2) {
      debit = amt1;
      credit = amt2;
    } else if (/\bDR\b/i.test(line)) {
      debit = amt1;
      credit = 0;
    } else {
      debit = 0;
      credit = amt1;
    }
    rows.push({ date, description, debit, credit });
  }
  return rows;
}
```

Update `parseStatement` to route PDFs — replace its body:

```typescript
export async function parseStatement(
  filename: string,
  bytes: Buffer | Uint8Array
): Promise<ParsedTransaction[]> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return parsePdf(bytes);
  if (ext === "csv" || ext === "txt") return parseCsv(bytes);
  throw new Error(`Unsupported file type: .${ext}. Upload a PDF or CSV.`);
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm test banking-statement-parser`
Expected: PASS. If the regex misses the fixture's layout, compare `unpdf` line output to `pdfplumber`'s and adjust whitespace handling in `PDF_ROW_RE` (the accepted parity risk noted in the spec).

- [ ] **Step 7: Commit**

```bash
git add lib/banking/statement-parser.ts tests/banking-statement-parser.test.ts tests/fixtures/statements/sample.pdf package.json pnpm-lock.yaml
git commit -m "feat(banking): port PDF statement parser via unpdf"
```

---

## Task 5: Journal posting (`lib/banking/posting.ts`)

Money-critical core. Port of `backend/banking/posting.py`. Uses `$executeRaw` to preserve the draft→post trigger dance.

**Files:**
- Create: `lib/banking/posting.ts`
- Test: `tests/banking-posting.test.ts`

**Interfaces:**
- Consumes: `prisma` (or a `Prisma.TransactionClient`).
- Produces:
  - `type Db = typeof prisma | Prisma.TransactionClient`
  - `type JournalLineInput = { accountId: string; debitMinor: number; creditMinor: number; memo: string; contactId: string | null }`
  - `postBalancedJournal(db, args: { orgId: string; journalDate: Date; memo: string; sourceType: string; sourceId: string | null; createdByUserId: string | null; lines: JournalLineInput[] }): Promise<string>`
  - `findAccountByCode(db, orgId: string, code: string): Promise<string | null>`

- [ ] **Step 1: Write failing tests**

Create `tests/banking-posting.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { postBalancedJournal, findAccountByCode } from "@/lib/banking/posting";
import { createTestOrg, dropTestOrg, createTestBankAccount, type TestOrg } from "./fixtures";

let org: TestOrg;
beforeEach(async () => { org = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(org.orgId); });

describe("postBalancedJournal", () => {
  it("posts a balanced two-line journal", async () => {
    const a = await createTestBankAccount(org.orgId, { code: "1000" });
    const b = await createTestBankAccount(org.orgId, { code: "1001" });
    const journalId = await postBalancedJournal(prisma, {
      orgId: org.orgId,
      journalDate: new Date("2026-05-12T00:00:00Z"),
      memo: "Transfer",
      sourceType: "bank_transfer",
      sourceId: null,
      createdByUserId: org.userId,
      lines: [
        { accountId: b.chartAccountId, debitMinor: 50000, creditMinor: 0, memo: "in", contactId: null },
        { accountId: a.chartAccountId, debitMinor: 0, creditMinor: 50000, memo: "out", contactId: null },
      ],
    });
    const journal = await prisma.journal.findUniqueOrThrow({
      where: { id: journalId },
      include: { lines: true },
    });
    expect(journal.status).toBe("POSTED");
    expect(journal.lines).toHaveLength(2);
  });

  it("rejects an unbalanced journal", async () => {
    const a = await createTestBankAccount(org.orgId, { code: "1000" });
    await expect(
      postBalancedJournal(prisma, {
        orgId: org.orgId,
        journalDate: new Date("2026-05-12T00:00:00Z"),
        memo: "Bad",
        sourceType: "bank_transfer",
        sourceId: null,
        createdByUserId: org.userId,
        lines: [
          { accountId: a.chartAccountId, debitMinor: 50000, creditMinor: 0, memo: "x", contactId: null },
        ],
      })
    ).rejects.toThrow(/balance/i);
  });

  it("finds an account by code", async () => {
    await createTestBankAccount(org.orgId, { code: "1100" });
    const id = await findAccountByCode(prisma, org.orgId, "1100");
    expect(id).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test banking-posting`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/banking/posting.ts`:

```typescript
import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type Db = typeof prisma | Prisma.TransactionClient;

export type JournalLineInput = {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  memo: string;
  contactId: string | null;
};

/**
 * Create + post a balanced journal. Mirrors backend/banking/posting.py:
 *   create journal as DRAFT → insert lines → flip to POSTED.
 * The flip is validated by the DB triggers (must balance, non-zero).
 */
export async function postBalancedJournal(
  db: Db,
  args: {
    orgId: string;
    journalDate: Date;
    memo: string;
    sourceType: string;
    sourceId: string | null;
    createdByUserId: string | null;
    lines: JournalLineInput[];
  }
): Promise<string> {
  const lines = args.lines;
  if (lines.length === 0) throw new Error("Journal must have at least one line.");

  const totalDebits = lines.reduce((s, l) => s + (l.debitMinor || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.creditMinor || 0), 0);
  if (totalDebits !== totalCredits) {
    throw new Error(`Journal must balance: debits ${totalDebits}, credits ${totalCredits}`);
  }
  if (totalDebits === 0) throw new Error("Journal cannot be zero-value.");

  const run = async (tx: Db) => {
    const journalId = randomUUID();
    const now = new Date();

    await tx.$executeRaw`
      INSERT INTO journals (
        id, org_id, status, journal_date, memo,
        source_type, source_id, created_by_user_id, created_at, updated_at
      ) VALUES (
        ${journalId}::uuid, ${args.orgId}::uuid, 'draft', ${args.journalDate}::date, ${args.memo},
        ${args.sourceType}, ${args.sourceId}::uuid, ${args.createdByUserId}::uuid, ${now}, ${now}
      )`;

    for (const line of lines) {
      await tx.$executeRaw`
        INSERT INTO journal_lines (
          id, org_id, journal_id, account_id, contact_id,
          debit_minor, credit_minor, memo, created_at
        ) VALUES (
          ${randomUUID()}::uuid, ${args.orgId}::uuid, ${journalId}::uuid, ${line.accountId}::uuid,
          ${line.contactId}::uuid, ${line.debitMinor}, ${line.creditMinor}, ${line.memo}, ${now}
        )`;
    }

    await tx.$executeRaw`
      UPDATE journals
      SET status = 'posted', posted_at = ${now}, posted_by_user_id = ${args.createdByUserId}::uuid, updated_at = ${now}
      WHERE id = ${journalId}::uuid`;

    return journalId;
  };

  // If we were handed a transaction client, reuse it; otherwise open one.
  if ("$transaction" in db) {
    return (db as typeof prisma).$transaction((tx) => run(tx));
  }
  return run(db);
}

export async function findAccountByCode(
  db: Db,
  orgId: string,
  code: string
): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM chart_of_accounts WHERE org_id = ${orgId}::uuid AND code = ${code} LIMIT 1`;
  return rows[0]?.id ?? null;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test banking-posting`
Expected: PASS. The unbalanced case must reject with a message containing "balance" (thrown by our guard before the DB; the trigger is the backstop).

- [ ] **Step 5: Commit**

```bash
git add lib/banking/posting.ts tests/banking-posting.test.ts
git commit -m "feat(banking): port balanced journal posting"
```

---

## Task 6: Shared types + bank account DAL & balances

**Files:**
- Create: `lib/banking/types.ts`
- Create: `lib/banking/dal.ts`
- Test: `tests/banking-dal.test.ts`

**Interfaces:**
- Produces (types in `types.ts`, copied verbatim from `lib/django/banking.ts`): `BankAccount`, `CreateBankAccountInput`, `UpdateBankAccountInput`, `DashboardSummary`, `ParsedTransaction` (re-export from statement-parser), `FeedTransaction`, `AccountBalance`, `ExpenseAccount`, `Contact`, `JournalCandidate`.
- Produces (in `dal.ts`):
  - `getAccountBalance(db, chartAccountId): Promise<{ balance_minor: number; balance: string }>`
  - `getOrgCashPosition(db, orgId): Promise<{ balance_minor: number; balance: string }>`
  - `listBankAccounts(db, orgId): Promise<BankAccount[]>`
  - `createBankAccount(db, orgId, userId, input: CreateBankAccountInput): Promise<BankAccount>`
  - `updateBankAccount(db, orgId, accountId, input: UpdateBankAccountInput): Promise<BankAccount>`
  - `deleteBankAccount(db, orgId, accountId): Promise<void>`
  - `nextBankAccountCode(db, orgId): Promise<string>`

- [ ] **Step 1: Create `lib/banking/types.ts`**

Copy the type definitions verbatim from `lib/django/banking.ts` (the `BankAccount`, `CreateBankAccountInput`, `UpdateBankAccountInput`, `DashboardSummary`, `FeedTransaction`, `AccountBalance`, `ExpenseAccount`, `Contact`, `JournalCandidate`, `ParsedTransaction`, `StatementImportPreview`, `ConfirmStatementResponse`, `AiMatchResult` types). Re-export `ParsedTransaction` from the parser to avoid duplication:

```typescript
export type { ParsedTransaction } from "./statement-parser";
// ...then paste the remaining type aliases from lib/django/banking.ts unchanged.
```

- [ ] **Step 2: Write failing tests**

Create `tests/banking-dal.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listBankAccounts, createBankAccount, updateBankAccount,
  deleteBankAccount, getOrgCashPosition,
} from "@/lib/banking/dal";
import { createTestOrg, dropTestOrg, createTestBankAccount, type TestOrg } from "./fixtures";

let org: TestOrg;
beforeEach(async () => { org = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(org.orgId); });

describe("bank account DAL", () => {
  it("creates a bank account and auto-creates a chart account", async () => {
    const acc = await createBankAccount(prisma, org.orgId, org.userId, {
      display_name: "Monzo", bank_name: "Monzo",
    });
    expect(acc.display_name).toBe("Monzo");
    expect(acc.chart_account_code).toMatch(/^10\d\d$/);
  });

  it("lists accounts ordered by display_name", async () => {
    await createBankAccount(prisma, org.orgId, org.userId, { display_name: "Zeta", bank_name: "Z" });
    await createBankAccount(prisma, org.orgId, org.userId, { display_name: "Alpha", bank_name: "A" });
    const list = await listBankAccounts(prisma, org.orgId);
    expect(list.map((a) => a.display_name)).toEqual(["Alpha", "Zeta"]);
  });

  it("soft-deletes a bank account", async () => {
    const { bankAccountId } = await createTestBankAccount(org.orgId);
    await deleteBankAccount(prisma, org.orgId, bankAccountId);
    const list = await listBankAccounts(prisma, org.orgId);
    expect(list.find((a) => a.id === bankAccountId)).toBeUndefined();
  });

  it("reports zero cash for an org with no postings", async () => {
    await createTestBankAccount(org.orgId);
    const cash = await getOrgCashPosition(prisma, org.orgId);
    expect(cash.balance_minor).toBe(0);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm test banking-dal`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement balances + account CRUD in `lib/banking/dal.ts`**

Create `lib/banking/dal.ts` with this content (subsequent tasks append more functions):

```typescript
import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { Db } from "@/lib/banking/posting";
import type {
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput,
} from "@/lib/banking/types";

function toPounds(minor: number): string {
  return (minor / 100).toFixed(2);
}

export async function getAccountBalance(
  db: Db,
  chartAccountId: string
): Promise<{ balance_minor: number; balance: string }> {
  const rows = await db.$queryRaw<Array<{ debits: bigint; credits: bigint }>>`
    SELECT COALESCE(SUM(jl.debit_minor), 0) AS debits,
           COALESCE(SUM(jl.credit_minor), 0) AS credits
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    WHERE jl.account_id = ${chartAccountId}::uuid AND j.status = 'posted'`;
  const debits = Number(rows[0]?.debits ?? 0);
  const credits = Number(rows[0]?.credits ?? 0);
  const balance = debits - credits;
  return { balance_minor: balance, balance: toPounds(balance) };
}

export async function getOrgCashPosition(
  db: Db,
  orgId: string
): Promise<{ balance_minor: number; balance: string }> {
  const rows = await db.$queryRaw<Array<{ debits: bigint; credits: bigint }>>`
    SELECT COALESCE(SUM(jl.debit_minor), 0) AS debits,
           COALESCE(SUM(jl.credit_minor), 0) AS credits
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE ba.org_id = ${orgId}::uuid AND ba.deleted_at IS NULL AND j.status = 'posted'`;
  const debits = Number(rows[0]?.debits ?? 0);
  const credits = Number(rows[0]?.credits ?? 0);
  const balance = debits - credits;
  return { balance_minor: balance, balance: toPounds(balance) };
}

async function serializeBankAccount(
  db: Db,
  row: {
    id: string; org_id: string; chart_account_id: string; display_name: string;
    bank_name: string; sort_code: string; account_number_last4: string; currency: string;
    connection_type: string; status: string; color_tone: string; notes: string;
    created_at: Date; updated_at: Date;
  }
): Promise<BankAccount> {
  const coa = await prisma.chartAccount.findUnique({
    where: { id: row.chart_account_id },
    select: { code: true, name: true },
  });
  const { balance, balance_minor } = await getAccountBalance(db, row.chart_account_id);
  return {
    id: row.id,
    org_id: row.org_id,
    chart_account_id: row.chart_account_id,
    chart_account_code: coa?.code ?? null,
    chart_account_name: coa?.name ?? null,
    display_name: row.display_name,
    bank_name: row.bank_name,
    sort_code: row.sort_code,
    account_number_last4: row.account_number_last4,
    currency: row.currency,
    connection_type: row.connection_type as BankAccount["connection_type"],
    status: row.status as BankAccount["status"],
    color_tone: row.color_tone,
    notes: row.notes,
    balance,
    balance_minor,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function listBankAccounts(db: Db, orgId: string): Promise<BankAccount[]> {
  const rows = await prisma.banking_bank_accounts.findMany({
    where: { org_id: orgId, deleted_at: null },
    orderBy: { display_name: "asc" },
  });
  return Promise.all(rows.map((r) => serializeBankAccount(db, r)));
}

export async function nextBankAccountCode(db: Db, orgId: string): Promise<string> {
  const rows = await db.$queryRaw<Array<{ code: string }>>`
    SELECT code FROM chart_of_accounts
    WHERE org_id = ${orgId}::uuid AND code ~ '^10[0-9][0-9]$'
    ORDER BY code DESC LIMIT 1`;
  if (rows.length === 0) return "1000";
  const next = Number(rows[0].code) + 1;
  return Number.isNaN(next) ? "1099" : String(next);
}

export async function createBankAccount(
  db: Db,
  orgId: string,
  userId: string,
  input: CreateBankAccountInput
): Promise<BankAccount> {
  return prisma.$transaction(async (tx) => {
    let chartAccountId = input.chart_account_id ?? null;

    if (chartAccountId) {
      const coa = await tx.chartAccount.findFirst({
        where: { id: chartAccountId, organizationId: orgId },
        select: { id: true },
      });
      if (!coa) throw new Error("Chart of accounts row not found in your organization.");
    } else {
      const code = await nextBankAccountCode(tx, orgId);
      const created = await tx.chartAccount.create({
        data: {
          organizationId: orgId,
          code,
          name: input.display_name,
          accountType: "ASSET",
          isSystem: false,
          isActive: true,
          description: `Bank account: ${input.bank_name}`,
          taxCode: "no_vat",
          taxRate: "0",
          reportCategory: "BANK",
        },
        select: { id: true },
      });
      chartAccountId = created.id;
    }

    const now = new Date();
    const bank = await tx.banking_bank_accounts.create({
      data: {
        id: randomUUID(),
        org_id: orgId,
        chart_account_id: chartAccountId,
        display_name: input.display_name,
        bank_name: input.bank_name,
        sort_code: input.sort_code ?? "",
        account_number_last4: input.account_number_last4 ?? "",
        currency: input.currency ?? "GBP",
        connection_type: input.connection_type ?? "manual_import",
        status: "active",
        color_tone: input.color_tone ?? "blue",
        notes: input.notes ?? "",
        created_by_user_id: userId,
        conversion_balance_minor: 0,
        created_at: now,
        updated_at: now,
      },
    });
    return serializeBankAccount(tx, bank);
  });
}

export async function updateBankAccount(
  db: Db,
  orgId: string,
  accountId: string,
  input: UpdateBankAccountInput
): Promise<BankAccount> {
  const existing = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Bank account not found.");

  const data: Record<string, unknown> = { updated_at: new Date() };
  for (const key of [
    "display_name", "bank_name", "sort_code", "account_number_last4",
    "currency", "connection_type", "status", "color_tone", "notes",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }

  const updated = await prisma.banking_bank_accounts.update({
    where: { id: accountId },
    data,
  });
  return serializeBankAccount(db, updated);
}

export async function deleteBankAccount(
  db: Db,
  orgId: string,
  accountId: string
): Promise<void> {
  const existing = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Bank account not found.");
  await prisma.banking_bank_accounts.update({
    where: { id: accountId },
    data: { deleted_at: new Date(), status: "inactive", updated_at: new Date() },
  });
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm test banking-dal`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/banking/types.ts lib/banking/dal.ts tests/banking-dal.test.ts
git commit -m "feat(banking): bank account DAL, balances, types"
```

---

## Task 7: Dashboard summary + opening/closing balances

**Files:**
- Modify: `lib/banking/dal.ts`
- Test: `tests/banking-dal.test.ts` (extend)

**Interfaces:**
- Produces:
  - `getBalanceSummary(db, orgId): Promise<DashboardSummary["balance_summary"]>`
  - `getDashboardSummary(db, orgId): Promise<DashboardSummary>`
  - `getOpeningClosingBalances(db, orgId): Promise<AccountBalance[]>`
  - `setOpeningBalance(db, orgId, accountId, openingBalanceMinor): Promise<{ account_id: string; opening_balance_minor: number; opening_balance: string }>`

- [ ] **Step 1: Write failing tests**

Append to `tests/banking-dal.test.ts`:

```typescript
import {
  getDashboardSummary, getOpeningClosingBalances, setOpeningBalance,
} from "@/lib/banking/dal";

describe("balances & dashboard", () => {
  it("sets an opening balance and reflects it in closing", async () => {
    const { bankAccountId, chartAccountId } = await createTestBankAccount(org.orgId);
    await setOpeningBalance(prisma, org.orgId, bankAccountId, 150000);
    const balances = await getOpeningClosingBalances(prisma, org.orgId);
    const row = balances.find((b) => b.account_id === bankAccountId)!;
    expect(row.opening_balance_minor).toBe(150000);
    expect(row.closing_balance_minor).toBe(150000);
  });

  it("dashboard summary reflects opening balance as cash", async () => {
    const { bankAccountId } = await createTestBankAccount(org.orgId);
    await setOpeningBalance(prisma, org.orgId, bankAccountId, 150000);
    const summary = await getDashboardSummary(prisma, org.orgId);
    expect(summary.cash_validation.balance_minor).toBe(150000);
    expect(summary.unreconciled_count).toBe(0);
  });

  it("replacing an opening balance overwrites, not stacks", async () => {
    const { bankAccountId } = await createTestBankAccount(org.orgId);
    await setOpeningBalance(prisma, org.orgId, bankAccountId, 150000);
    await setOpeningBalance(prisma, org.orgId, bankAccountId, 200000);
    const balances = await getOpeningClosingBalances(prisma, org.orgId);
    const row = balances.find((b) => b.account_id === bankAccountId)!;
    expect(row.opening_balance_minor).toBe(200000);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test banking-dal`
Expected: FAIL — `setOpeningBalance` not exported.

- [ ] **Step 3: Implement**

Append to `lib/banking/dal.ts`:

```typescript
import type { DashboardSummary, AccountBalance } from "@/lib/banking/types";

export async function getBalanceSummary(
  db: Db,
  orgId: string
): Promise<DashboardSummary["balance_summary"]> {
  const orgRows = await db.$queryRaw<Array<{ accounting_period_start: Date | null }>>`
    SELECT accounting_period_start FROM organizations WHERE id = ${orgId}::uuid`;
  const periodStart = orgRows[0]?.accounting_period_start ?? null;

  const obRows = await db.$queryRaw<Array<{ amount: bigint }>>`
    SELECT COALESCE(SUM(jl.debit_minor) - SUM(jl.credit_minor), 0) AS amount
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE ba.org_id = ${orgId}::uuid AND ba.deleted_at IS NULL
      AND j.status = 'posted' AND j.source_type = 'opening_balance'`;
  const opening = Number(obRows[0]?.amount ?? 0);
  const initialConversion = opening;

  const closing = (await getOrgCashPosition(db, orgId)).balance_minor;
  const netMovement = closing - opening;

  return {
    initial_conversion_minor: initialConversion,
    initial_conversion: toPounds(initialConversion),
    opening_minor: opening,
    opening: toPounds(opening),
    closing_minor: closing,
    closing: toPounds(closing),
    net_movement_minor: netMovement,
    net_movement: toPounds(netMovement),
    period_start: periodStart ? periodStart.toISOString().slice(0, 10) : null,
  };
}

export async function getDashboardSummary(db: Db, orgId: string): Promise<DashboardSummary> {
  const cash = await getOrgCashPosition(db, orgId);
  const summary = await getBalanceSummary(db, orgId);
  const unreconciled = await prisma.banking_feed_transactions.count({
    where: { org_id: orgId, deleted_at: null, reconcile_status: { in: ["unmatched", "ai_suggested"] } },
  });
  return {
    cash_validation: cash,
    balance_summary: summary,
    statement_balance: "0.00",
    matched_balance: cash.balance,
    unreconciled_count: unreconciled,
  };
}

export async function getOpeningClosingBalances(
  db: Db,
  orgId: string
): Promise<AccountBalance[]> {
  const accounts = await prisma.banking_bank_accounts.findMany({
    where: { org_id: orgId, deleted_at: null },
    orderBy: { display_name: "asc" },
  });

  const result: AccountBalance[] = [];
  for (const account of accounts) {
    const closing = (await getAccountBalance(db, account.chart_account_id)).balance_minor;
    const obRows = await db.$queryRaw<Array<{ amount: bigint }>>`
      SELECT COALESCE(SUM(jl.debit_minor) - SUM(jl.credit_minor), 0) AS amount
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id
      WHERE jl.account_id = ${account.chart_account_id}::uuid
        AND j.status = 'posted' AND j.source_type = 'opening_balance'`;
    const opening = Number(obRows[0]?.amount ?? 0);
    result.push({
      account_id: account.id,
      display_name: account.display_name,
      bank_name: account.bank_name,
      currency: account.currency,
      opening_balance_minor: opening,
      closing_balance_minor: closing,
      opening_balance: toPounds(opening),
      closing_balance: toPounds(closing),
    });
  }
  return result;
}

export async function setOpeningBalance(
  db: Db,
  orgId: string,
  accountId: string,
  openingBalanceMinor: number
): Promise<{ account_id: string; opening_balance_minor: number; opening_balance: string }> {
  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true, chart_account_id: true, display_name: true },
  });
  if (!account) throw new Error("Bank account not found.");

  const opening = Math.trunc(openingBalanceMinor);
  const now = new Date();
  const label = `Opening balance — ${account.display_name}`;

  await prisma.$transaction(async (tx) => {
    // Remove any existing opening-balance journal for this account.
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT j.id FROM journals j
      JOIN journal_lines jl ON jl.journal_id = j.id
      WHERE j.org_id = ${orgId}::uuid AND j.source_type = 'opening_balance'
        AND jl.account_id = ${account.chart_account_id}::uuid
      LIMIT 1`;
    if (existing[0]) {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
      await tx.$executeRaw`DELETE FROM journal_lines WHERE journal_id = ${existing[0].id}::uuid`;
      await tx.$executeRaw`DELETE FROM journals WHERE id = ${existing[0].id}::uuid`;
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'origin'");
    }

    // Ensure an OB001 equity account exists.
    let obRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM chart_of_accounts WHERE org_id = ${orgId}::uuid AND code = 'OB001' LIMIT 1`;
    let obAccountId = obRows[0]?.id ?? null;
    if (!obAccountId) {
      const created = await tx.chartAccount.create({
        data: {
          organizationId: orgId, code: "OB001", name: "Opening Balances",
          accountType: "EQUITY", isSystem: true, isActive: true,
          description: "Opening balances equity account", taxCode: "no_vat",
          taxRate: "0", reportCategory: "EQUITY",
        },
        select: { id: true },
      });
      obAccountId = created.id;
    }

    // Draft → lines → post (bank vs OB001).
    const journalId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO journals (id, org_id, journal_date, memo, status, source_type, created_at, updated_at)
      VALUES (${journalId}::uuid, ${orgId}::uuid, ${now}::date, ${label}, 'draft', 'opening_balance', ${now}, ${now})`;
    await tx.$executeRaw`
      INSERT INTO journal_lines (id, org_id, journal_id, account_id, debit_minor, credit_minor, memo, created_at)
      VALUES (${randomUUID()}::uuid, ${orgId}::uuid, ${journalId}::uuid, ${account.chart_account_id}::uuid,
              ${opening >= 0 ? opening : 0}, ${opening < 0 ? Math.abs(opening) : 0}, ${label}, ${now})`;
    await tx.$executeRaw`
      INSERT INTO journal_lines (id, org_id, journal_id, account_id, debit_minor, credit_minor, memo, created_at)
      VALUES (${randomUUID()}::uuid, ${orgId}::uuid, ${journalId}::uuid, ${obAccountId}::uuid,
              ${opening < 0 ? Math.abs(opening) : 0}, ${opening >= 0 ? opening : 0}, ${label}, ${now})`;
    await tx.$executeRaw`UPDATE journals SET status = 'posted', posted_at = ${now}, updated_at = ${now} WHERE id = ${journalId}::uuid`;
  });

  return {
    account_id: account.id,
    opening_balance_minor: opening,
    opening_balance: toPounds(opening),
  };
}
```

> Note: the Django original sets `session_replication_role` at session scope. We use `SET LOCAL` inside the transaction (matching `tests/fixtures.ts` teardown), which is safer and auto-resets on commit. **Risk flagged in spec §11:** verify this works over the pooled connection; if it errors, the opening-balance replace must run on `DIRECT_URL`.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test banking-dal`
Expected: PASS (including the replace-not-stack case).

- [ ] **Step 5: Commit**

```bash
git add lib/banking/dal.ts tests/banking-dal.test.ts
git commit -m "feat(banking): dashboard summary and opening/closing balances"
```

---

## Task 8: Feed DAL (list, delete, reconcile, confirm import)

**Files:**
- Modify: `lib/banking/dal.ts`
- Test: `tests/banking-dal.test.ts` (extend)

**Interfaces:**
- Produces:
  - `listFeedTransactions(db, orgId, opts?: { bankAccountId?: string; search?: string }): Promise<FeedTransaction[]>`
  - `deleteFeedTransaction(db, orgId, txId): Promise<void>`
  - `bulkDeleteFeed(db, orgId, ids: string[]): Promise<{ deleted: number }>`
  - `reconcileFeed(db, orgId, userId, txId, journalId): Promise<{ status: string; id: string }>`
  - `confirmStatementImport(db, orgId, bankAccountId, transactions: ParsedTransaction[]): Promise<{ created: number; bank_account_id: string }>`

- [ ] **Step 1: Write failing tests**

Append to `tests/banking-dal.test.ts`:

```typescript
import {
  listFeedTransactions, confirmStatementImport, bulkDeleteFeed, reconcileFeed,
} from "@/lib/banking/dal";

describe("feed DAL", () => {
  it("confirms imported transactions into the feed", async () => {
    const { bankAccountId } = await createTestBankAccount(org.orgId);
    const res = await confirmStatementImport(prisma, org.orgId, bankAccountId, [
      { date: "2026-05-11", description: "STRIPE", debit: 0, credit: 125000 },
      { date: "2026-05-12", description: "AWS", debit: 14520, credit: 0 },
    ]);
    expect(res.created).toBe(2);
    const feed = await listFeedTransactions(prisma, org.orgId);
    expect(feed).toHaveLength(2);
    expect(feed[0].reconcile_status).toBe("unmatched");
  });

  it("filters feed by search term", async () => {
    const { bankAccountId } = await createTestBankAccount(org.orgId);
    await confirmStatementImport(prisma, org.orgId, bankAccountId, [
      { date: "2026-05-11", description: "STRIPE", debit: 0, credit: 100 },
      { date: "2026-05-12", description: "AWS", debit: 100, credit: 0 },
    ]);
    const feed = await listFeedTransactions(prisma, org.orgId, { search: "stripe" });
    expect(feed).toHaveLength(1);
  });

  it("bulk-deletes feed rows", async () => {
    const { bankAccountId } = await createTestBankAccount(org.orgId);
    await confirmStatementImport(prisma, org.orgId, bankAccountId, [
      { date: "2026-05-11", description: "A", debit: 0, credit: 100 },
    ]);
    const feed = await listFeedTransactions(prisma, org.orgId);
    const res = await bulkDeleteFeed(prisma, org.orgId, [feed[0].id]);
    expect(res.deleted).toBe(1);
    expect(await listFeedTransactions(prisma, org.orgId)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test banking-dal`
Expected: FAIL — `confirmStatementImport` not exported.

- [ ] **Step 3: Implement**

Append to `lib/banking/dal.ts`:

```typescript
import type { FeedTransaction, ParsedTransaction } from "@/lib/banking/types";

export async function listFeedTransactions(
  db: Db,
  orgId: string,
  opts: { bankAccountId?: string; search?: string } = {}
): Promise<FeedTransaction[]> {
  const rows = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      ...(opts.bankAccountId ? { bank_account_id: opts.bankAccountId } : {}),
      ...(opts.search ? { description: { contains: opts.search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ transaction_date: "desc" }, { created_at: "desc" }],
    take: 200,
    include: { banking_bank_accounts: { select: { display_name: true } } },
  });

  return rows.map((tx) => ({
    id: tx.id,
    bank_account_id: tx.bank_account_id,
    bank_account_name: tx.banking_bank_accounts.display_name,
    transaction_date: tx.transaction_date.toISOString().slice(0, 10),
    description: tx.description,
    debit_minor: Number(tx.debit_minor),
    credit_minor: Number(tx.credit_minor),
    reconcile_status: tx.reconcile_status as FeedTransaction["reconcile_status"],
    ai_match_label: tx.ai_match_label,
    ai_match_confidence: tx.ai_match_confidence,
    matched_journal_id: tx.matched_journal_id,
    source: tx.source,
    created_at: tx.created_at.toISOString(),
  }));
}

export async function deleteFeedTransaction(db: Db, orgId: string, txId: string): Promise<void> {
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null }, select: { id: true },
  });
  if (!tx) throw new Error("Transaction not found.");
  await prisma.banking_feed_transactions.update({
    where: { id: txId }, data: { deleted_at: new Date(), updated_at: new Date() },
  });
}

export async function bulkDeleteFeed(
  db: Db, orgId: string, ids: string[]
): Promise<{ deleted: number }> {
  if (ids.length === 0) throw new Error("No IDs provided.");
  const res = await prisma.banking_feed_transactions.updateMany({
    where: { id: { in: ids }, org_id: orgId, deleted_at: null },
    data: { deleted_at: new Date(), updated_at: new Date() },
  });
  return { deleted: res.count };
}

export async function reconcileFeed(
  db: Db, orgId: string, userId: string, txId: string, journalId: string
): Promise<{ status: string; id: string }> {
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null }, select: { id: true },
  });
  if (!tx) throw new Error("Transaction not found.");
  if (!journalId) throw new Error("journal_id required.");
  await prisma.banking_feed_transactions.update({
    where: { id: txId },
    data: {
      reconcile_status: "reconciled",
      matched_journal_id: journalId,
      matched_at: new Date(),
      matched_by_user_id: userId,
      updated_at: new Date(),
    },
  });
  return { status: "reconciled", id: txId };
}

export async function confirmStatementImport(
  db: Db, orgId: string, bankAccountId: string, transactions: ParsedTransaction[]
): Promise<{ created: number; bank_account_id: string }> {
  if (!bankAccountId) throw new Error("bank_account_id is required.");
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error("transactions list is required.");
  }
  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: bankAccountId, org_id: orgId, deleted_at: null }, select: { id: true },
  });
  if (!account) throw new Error("Bank account not found.");

  const now = new Date();
  const data = transactions.map((t) => {
    const date = new Date(`${t.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid date in transaction: ${t.date}`);
    return {
      id: randomUUID(),
      org_id: orgId,
      bank_account_id: bankAccountId,
      transaction_date: date,
      description: (t.description ?? "").trim().slice(0, 500) || "—",
      debit_minor: BigInt(Math.trunc(t.debit || 0)),
      credit_minor: BigInt(Math.trunc(t.credit || 0)),
      raw_description: t.description ?? "",
      reference: "",
      reconcile_status: "unmatched",
      source: "import",
      created_at: now,
      updated_at: now,
    };
  });

  await prisma.banking_feed_transactions.createMany({ data });
  return { created: data.length, bank_account_id: bankAccountId };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test banking-dal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/banking/dal.ts tests/banking-dal.test.ts
git commit -m "feat(banking): feed list, delete, reconcile, import confirm"
```

---

## Task 9: AI match + candidates

**Files:**
- Modify: `lib/banking/dal.ts`
- Test: `tests/banking-dal.test.ts` (extend)

**Interfaces:**
- Produces:
  - `runAiMatch(db, orgId): Promise<{ matched: number; skipped: number; total_feed_rows: number; total_journal_candidates: number; message?: string }>`
  - `getFeedCandidates(db, orgId, txId): Promise<JournalCandidate[]>`
- Consumes: `matchScore` from `lib/banking/matching`.

- [ ] **Step 1: Write failing test**

Append to `tests/banking-dal.test.ts`:

```typescript
import { runAiMatch } from "@/lib/banking/dal";
import { createReceivedPayment } from "@/lib/banking/dal"; // defined in Task 10

describe("ai match", () => {
  it("returns zero when there are no feed rows", async () => {
    await createTestBankAccount(org.orgId);
    const res = await runAiMatch(prisma, org.orgId);
    expect(res.matched).toBe(0);
  });
});
```

> Note: a full positive-match test depends on `createReceivedPayment` (Task 10). The richer assertion is added there. This task establishes the no-op path.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test banking-dal -t "ai match"`
Expected: FAIL — `runAiMatch` not exported (ignore the unused Task-10 import error by removing that import line until Task 10; re-add it in Task 10).

Temporary: delete the `createReceivedPayment` import line for now.

- [ ] **Step 3: Implement**

Append to `lib/banking/dal.ts`:

```typescript
import { matchScore } from "@/lib/banking/matching";
import type { JournalCandidate } from "@/lib/banking/types";

type CandidateRow = {
  journal_id: string;
  journal_date: Date;
  memo: string | null;
  debit_minor: bigint;
  credit_minor: bigint;
};

async function loadJournalCandidates(db: Db, orgId: string, limit: number): Promise<CandidateRow[]> {
  return db.$queryRaw<CandidateRow[]>`
    SELECT j.id AS journal_id, j.journal_date, j.memo, jl.debit_minor, jl.credit_minor
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE j.org_id = ${orgId}::uuid AND j.status = 'posted'
      AND ba.deleted_at IS NULL AND ba.org_id = ${orgId}::uuid
      AND j.id NOT IN (
        SELECT matched_journal_id FROM banking_feed_transactions
        WHERE org_id = ${orgId}::uuid AND reconcile_status = 'reconciled'
          AND matched_journal_id IS NOT NULL
      )
    ORDER BY j.journal_date DESC
    LIMIT ${limit}`;
}

export async function runAiMatch(
  db: Db,
  orgId: string
): Promise<{ matched: number; skipped: number; total_feed_rows: number; total_journal_candidates: number; message?: string }> {
  const feed = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: orgId, deleted_at: null,
      reconcile_status: { in: ["unmatched", "ai_suggested"] },
    },
  });
  if (feed.length === 0) {
    return { matched: 0, skipped: 0, total_feed_rows: 0, total_journal_candidates: 0, message: "No unmatched feed rows." };
  }

  const candidates = await loadJournalCandidates(db, orgId, 500);
  if (candidates.length === 0) {
    return { matched: 0, skipped: feed.length, total_feed_rows: feed.length, total_journal_candidates: 0, message: "No candidate journals found." };
  }

  let matched = 0;
  for (const tx of feed) {
    const feedAmount = Number(tx.credit_minor) > 0 ? Number(tx.credit_minor) : Number(tx.debit_minor);
    let bestScore = 0;
    let best: CandidateRow | null = null;
    for (const c of candidates) {
      const journalAmount = Number(c.debit_minor) > 0 ? Number(c.debit_minor) : Number(c.credit_minor);
      const score = matchScore({
        feedAmountMinor: feedAmount,
        feedDate: tx.transaction_date,
        feedDescription: tx.description,
        journalAmountMinor: journalAmount,
        journalDate: c.journal_date,
        journalMemo: c.memo,
      });
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (bestScore >= 75 && best) {
      const amountLabel = `£${(Math.max(Number(best.debit_minor), Number(best.credit_minor)) / 100).toFixed(2)}`;
      const label = `${(best.memo ?? "Journal").slice(0, 30)} (${amountLabel})`;
      await prisma.banking_feed_transactions.update({
        where: { id: tx.id },
        data: {
          reconcile_status: "ai_suggested",
          ai_match_label: label,
          ai_match_confidence: bestScore,
          matched_journal_id: best.journal_id,
          updated_at: new Date(),
        },
      });
      matched++;
    }
  }

  return {
    matched,
    skipped: feed.length - matched,
    total_feed_rows: feed.length,
    total_journal_candidates: candidates.length,
  };
}

export async function getFeedCandidates(
  db: Db,
  orgId: string,
  txId: string
): Promise<JournalCandidate[]> {
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null },
    select: { transaction_date: true, description: true, debit_minor: true, credit_minor: true },
  });
  if (!tx) throw new Error("Transaction not found.");

  const rows = await db.$queryRaw<Array<CandidateRow & { bank_account_name: string }>>`
    SELECT j.id AS journal_id, j.journal_date, j.memo, jl.debit_minor, jl.credit_minor,
           ba.display_name AS bank_account_name
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE j.org_id = ${orgId}::uuid AND j.status = 'posted' AND ba.deleted_at IS NULL
      AND j.id NOT IN (
        SELECT matched_journal_id FROM banking_feed_transactions
        WHERE org_id = ${orgId}::uuid AND reconcile_status = 'reconciled' AND matched_journal_id IS NOT NULL
      )
    ORDER BY j.journal_date DESC LIMIT 100`;

  const feedAmount = Number(tx.credit_minor) > 0 ? Number(tx.credit_minor) : Number(tx.debit_minor);
  const scored = rows.map((row) => {
    const journalAmount = Number(row.debit_minor) > 0 ? Number(row.debit_minor) : Number(row.credit_minor);
    const score = matchScore({
      feedAmountMinor: feedAmount,
      feedDate: tx.transaction_date,
      feedDescription: tx.description,
      journalAmountMinor: journalAmount,
      journalDate: row.journal_date,
      journalMemo: row.memo,
    });
    return {
      journal_id: row.journal_id,
      journal_date: row.journal_date.toISOString().slice(0, 10),
      memo: row.memo,
      debit_minor: Number(row.debit_minor),
      credit_minor: Number(row.credit_minor),
      bank_account_name: row.bank_account_name,
      score,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map(({ score, ...rest }) => rest);
}
```

> Note: Django's `feed/candidates/` returns a `score` field; the frontend `JournalCandidate` type omits it. We sort by score then strip it to match the typed shape. If the UI actually reads `score`, add it to the `JournalCandidate` type in `types.ts` and keep it.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test banking-dal -t "ai match"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/banking/dal.ts tests/banking-dal.test.ts
git commit -m "feat(banking): AI match scoring and candidate lookup"
```

---

## Task 10: Money flows (transfer / received / paid) + lookups

**Files:**
- Modify: `lib/banking/dal.ts`
- Test: `tests/banking-dal.test.ts` (extend)

**Interfaces:**
- Produces:
  - `createTransfer(db, orgId, userId, input): Promise<{ journal_id: string; amount_minor: number }>`
  - `createReceivedPayment(db, orgId, userId, input): Promise<{ journal_id: string; amount_minor: number }>`
  - `createPaidExpense(db, orgId, userId, input): Promise<{ journal_id: string; amount_minor: number }>`
  - `listExpenseAccounts(db, orgId): Promise<ExpenseAccount[]>`
  - `listContacts(db, orgId, type): Promise<Contact[]>`
  - `getAccountTransactions(db, orgId, chartAccountId): Promise<Array<{...}>>`
  - helpers `toMinor`, `parseInputDate`
- Consumes: `postBalancedJournal`, `findAccountByCode` from `lib/banking/posting`.

- [ ] **Step 1: Write failing tests**

Append to `tests/banking-dal.test.ts`:

```typescript
import {
  createTransfer, createReceivedPayment, createPaidExpense,
  listExpenseAccounts, listContacts,
} from "@/lib/banking/dal";

describe("money flows", () => {
  it("transfer moves cash between two bank accounts (net zero org cash)", async () => {
    const a = await createTestBankAccount(org.orgId, { code: "1000" });
    const b = await createTestBankAccount(org.orgId, { code: "1001" });
    await setOpeningBalance(prisma, org.orgId, a.bankAccountId, 100000);
    const res = await createTransfer(prisma, org.orgId, org.userId, {
      from_account_id: a.bankAccountId, to_account_id: b.bankAccountId, amount: "500.00",
    });
    expect(res.amount_minor).toBe(50000);
    const cash = await getOrgCashPosition(prisma, org.orgId);
    expect(cash.balance_minor).toBe(100000); // unchanged: internal transfer
  });

  it("received payment increases bank cash", async () => {
    const a = await createTestBankAccount(org.orgId, { code: "1000" });
    const res = await createReceivedPayment(prisma, org.orgId, org.userId, {
      bank_account_id: a.bankAccountId, amount: "1250.00",
    });
    expect(res.amount_minor).toBe(125000);
    const bal = await getAccountBalance(prisma, a.chartAccountId);
    expect(bal.balance_minor).toBe(125000);
  });

  it("paid expense decreases bank cash", async () => {
    const a = await createTestBankAccount(org.orgId, { code: "1000" });
    const expense = await prisma.chartAccount.findFirstOrThrow({
      where: { organizationId: org.orgId, reportCategory: "EXPENSE" }, select: { id: true },
    });
    const res = await createPaidExpense(prisma, org.orgId, org.userId, {
      bank_account_id: a.bankAccountId, expense_account_id: expense.id, amount: "145.20",
    });
    expect(res.amount_minor).toBe(14520);
    const bal = await getAccountBalance(prisma, a.chartAccountId);
    expect(bal.balance_minor).toBe(-14520);
  });

  it("rejects a transfer to the same account", async () => {
    const a = await createTestBankAccount(org.orgId, { code: "1000" });
    await expect(createTransfer(prisma, org.orgId, org.userId, {
      from_account_id: a.bankAccountId, to_account_id: a.bankAccountId, amount: "10.00",
    })).rejects.toThrow(/different/i);
  });

  it("lists expense accounts", async () => {
    const list = await listExpenseAccounts(prisma, org.orgId);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => ["expense", "cost_of_sales", "depreciation"].includes(a.report_category))).toBe(true);
  });

  it("lists customer contacts", async () => {
    const list = await listContacts(prisma, org.orgId, "customer");
    expect(list.some((c) => c.id === org.customerId)).toBe(true);
  });
});
```

> The received-payment test requires a `1100` (Accounts Receivable) account in the starter chart. Confirm `createStarterAccountsForOrganization` seeds code `1100`; if not, create it in the test via `createTestBankAccount(org.orgId, { code: "1100" })` or a direct `chartAccount.create` before calling `createReceivedPayment`.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test banking-dal -t "money flows"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement**

Append to `lib/banking/dal.ts`:

```typescript
import { postBalancedJournal, findAccountByCode } from "@/lib/banking/posting";
import type { ExpenseAccount, Contact } from "@/lib/banking/types";

function toMinor(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
}

function parseInputDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date format (expected YYYY-MM-DD): ${value}`);
  return d;
}

async function getBankAccountOr404(orgId: string, accountId: string) {
  const acc = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true, chart_account_id: true, display_name: true },
  });
  if (!acc) throw new Error("Bank account not found.");
  return acc;
}

export async function createTransfer(
  db: Db, orgId: string, userId: string,
  input: { from_account_id: string; to_account_id: string; amount?: string; amount_minor?: number; date?: string; memo?: string }
): Promise<{ journal_id: string; amount_minor: number }> {
  const amount = input.amount_minor || toMinor(input.amount);
  const memo = (input.memo || "Transfer between bank accounts").trim();
  const txDate = parseInputDate(input.date);

  if (!input.from_account_id || !input.to_account_id) throw new Error("from_account_id and to_account_id are required.");
  if (input.from_account_id === input.to_account_id) throw new Error("From and To must be different bank accounts.");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than zero.");

  const src = await getBankAccountOr404(orgId, input.from_account_id);
  const dst = await getBankAccountOr404(orgId, input.to_account_id);

  const journalId = await postBalancedJournal(db, {
    orgId, journalDate: txDate, memo: `${memo}: ${src.display_name} → ${dst.display_name}`,
    sourceType: "bank_transfer", sourceId: null, createdByUserId: userId,
    lines: [
      { accountId: dst.chart_account_id, debitMinor: amount, creditMinor: 0, memo: `Transfer from ${src.display_name}`, contactId: null },
      { accountId: src.chart_account_id, debitMinor: 0, creditMinor: amount, memo: `Transfer to ${dst.display_name}`, contactId: null },
    ],
  });
  return { journal_id: journalId, amount_minor: amount };
}

export async function createReceivedPayment(
  db: Db, orgId: string, userId: string,
  input: { bank_account_id: string; contact_id?: string | null; amount?: string; amount_minor?: number; date?: string; memo?: string; source_account_code?: string }
): Promise<{ journal_id: string; amount_minor: number }> {
  const amount = input.amount_minor || toMinor(input.amount);
  const memo = (input.memo || "Customer payment received").trim();
  const srcCode = input.source_account_code || "1100";
  const txDate = parseInputDate(input.date);

  if (!input.bank_account_id) throw new Error("bank_account_id is required.");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than zero.");

  const bank = await getBankAccountOr404(orgId, input.bank_account_id);
  const arId = await findAccountByCode(db, orgId, srcCode);
  if (!arId) throw new Error(`Source account code '${srcCode}' not found in your chart of accounts.`);

  const journalId = await postBalancedJournal(db, {
    orgId, journalDate: txDate, memo, sourceType: "payment_received", sourceId: null, createdByUserId: userId,
    lines: [
      { accountId: bank.chart_account_id, debitMinor: amount, creditMinor: 0, memo: `Received into ${bank.display_name}`, contactId: input.contact_id ?? null },
      { accountId: arId, debitMinor: 0, creditMinor: amount, memo, contactId: input.contact_id ?? null },
    ],
  });
  return { journal_id: journalId, amount_minor: amount };
}

export async function createPaidExpense(
  db: Db, orgId: string, userId: string,
  input: { bank_account_id: string; expense_account_id: string; contact_id?: string | null; amount?: string; amount_minor?: number; date?: string; memo?: string }
): Promise<{ journal_id: string; amount_minor: number }> {
  const amount = input.amount_minor || toMinor(input.amount);
  const memo = (input.memo || "Expense paid").trim();
  const txDate = parseInputDate(input.date);

  if (!input.bank_account_id || !input.expense_account_id) throw new Error("bank_account_id and expense_account_id are required.");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than zero.");

  const bank = await getBankAccountOr404(orgId, input.bank_account_id);
  const expense = await prisma.chartAccount.findFirst({
    where: { id: input.expense_account_id, organizationId: orgId }, select: { id: true },
  });
  if (!expense) throw new Error("Expense account not found in your organization.");

  const journalId = await postBalancedJournal(db, {
    orgId, journalDate: txDate, memo, sourceType: "expense_paid", sourceId: null, createdByUserId: userId,
    lines: [
      { accountId: expense.id, debitMinor: amount, creditMinor: 0, memo, contactId: input.contact_id ?? null },
      { accountId: bank.chart_account_id, debitMinor: 0, creditMinor: amount, memo: `Paid from ${bank.display_name}`, contactId: input.contact_id ?? null },
    ],
  });
  return { journal_id: journalId, amount_minor: amount };
}

export async function listExpenseAccounts(db: Db, orgId: string): Promise<ExpenseAccount[]> {
  const rows = await prisma.chartAccount.findMany({
    where: { organizationId: orgId, isActive: true, reportCategory: { in: ["EXPENSE", "COST_OF_SALES", "DEPRECIATION"] } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, reportCategory: true },
  });
  return rows.map((a) => ({
    id: a.id, code: a.code, name: a.name, report_category: a.reportCategory.toLowerCase(),
  }));
}

export async function listContacts(
  db: Db, orgId: string, type: "customer" | "supplier" | "both"
): Promise<Contact[]> {
  const typeFilter =
    type === "customer" ? { in: ["CUSTOMER", "BOTH"] } :
    type === "supplier" ? { in: ["SUPPLIER", "BOTH"] } : undefined;
  const rows = await prisma.contact.findMany({
    where: { organizationId: orgId, isActive: true, ...(typeFilter ? { contactType: typeFilter } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, contactType: true, email: true },
  });
  return rows.map((c) => ({
    id: c.id, name: c.name, contact_type: c.contactType.toLowerCase() as Contact["contact_type"], email: c.email,
  }));
}

export async function getAccountTransactions(
  db: Db, orgId: string, chartAccountId: string
): Promise<Array<{ id: string; journal_id: string; journal_date: string; memo: string | null; debit_minor: number; credit_minor: number; source_type: string | null }>> {
  const account = await prisma.banking_bank_accounts.findFirst({
    where: { chart_account_id: chartAccountId, org_id: orgId, deleted_at: null }, select: { id: true },
  });
  if (!account) throw new Error("Bank account not found.");
  const rows = await db.$queryRaw<Array<{ id: string; journal_id: string; journal_date: Date; memo: string | null; debit_minor: bigint; credit_minor: bigint; source_type: string | null }>>`
    SELECT jl.id, jl.journal_id, j.journal_date, COALESCE(jl.memo, j.memo) AS memo,
           jl.debit_minor, jl.credit_minor, j.source_type
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    WHERE jl.account_id = ${chartAccountId}::uuid AND j.status = 'posted'
    ORDER BY j.journal_date DESC, jl.id DESC`;
  return rows.map((r) => ({
    id: r.id, journal_id: r.journal_id, journal_date: r.journal_date.toISOString().slice(0, 10),
    memo: r.memo, debit_minor: Number(r.debit_minor), credit_minor: Number(r.credit_minor), source_type: r.source_type,
  }));
}
```

> **Verify enum values:** `reportCategory` filter uses `EXPENSE`, `COST_OF_SALES`, `DEPRECIATION` and `contactType` uses `CUSTOMER`/`SUPPLIER`/`BOTH`. Confirm against the Prisma enums `AccountReportCategory` and `ContactType` in `schema.prisma`; adjust casing if the generated enum differs.

- [ ] **Step 4: Restore the AI-match positive test**

Now that `createReceivedPayment` exists, append a positive AI-match case to `tests/banking-dal.test.ts`:

```typescript
it("ai-match suggests a journal for a matching feed row", async () => {
  const a = await createTestBankAccount(org.orgId, { code: "1000" });
  await prisma.chartAccount.create({ data: {
    organizationId: org.orgId, code: "1100", name: "Accounts Receivable",
    accountType: "ASSET", reportCategory: "CURRENT_ASSET", taxCode: "no_vat", taxRate: "0",
  }});
  await createReceivedPayment(prisma, org.orgId, org.userId, {
    bank_account_id: a.bankAccountId, amount: "1250.00", date: "2026-05-10", memo: "STRIPE",
  });
  await confirmStatementImport(prisma, org.orgId, a.bankAccountId, [
    { date: "2026-05-10", description: "STRIPE", debit: 0, credit: 125000 },
  ]);
  const res = await runAiMatch(prisma, org.orgId);
  expect(res.matched).toBe(1);
  const feed = await listFeedTransactions(prisma, org.orgId);
  expect(feed[0].reconcile_status).toBe("ai_suggested");
});
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm test banking-dal`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Commit**

```bash
git add lib/banking/dal.ts tests/banking-dal.test.ts
git commit -m "feat(banking): money flows, lookups, account transactions"
```

---

## Task 11: Server actions (`app/banking/actions.ts`)

Thin `"use server"` wrappers: auth + DAL + `revalidatePath`. No business logic here.

**Files:**
- Create: `app/banking/actions.ts`

**Interfaces:**
- Consumes: every `lib/banking/dal` function; `requireAccountingWorkspace`, `requireAccountantRole` from `lib/accounting/dal`; `parseStatement` from `lib/banking/statement-parser`.
- Produces: server actions mirroring the hook surface (names below).

- [ ] **Step 1: Implement the actions file**

Create `app/banking/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requireAccountingWorkspace, requireAccountantRole } from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";
import { parseStatement } from "@/lib/banking/statement-parser";
import * as dal from "@/lib/banking/dal";
import type {
  CreateBankAccountInput, UpdateBankAccountInput, ParsedTransaction,
} from "@/lib/banking/types";

function revalidateBanking() {
  revalidatePath("/banking");
  revalidatePath("/banking/transactions");
  revalidatePath("/banking/statements");
}

// --- reads ---
export async function listBankAccounts() {
  const ws = await requireAccountingWorkspace();
  return dal.listBankAccounts(prisma, ws.organizationId);
}
export async function getDashboardSummary() {
  const ws = await requireAccountingWorkspace();
  return dal.getDashboardSummary(prisma, ws.organizationId);
}
export async function listFeedTransactions(opts: { bankAccountId?: string; search?: string } = {}) {
  const ws = await requireAccountingWorkspace();
  return dal.listFeedTransactions(prisma, ws.organizationId, opts);
}
export async function getOpeningClosingBalances() {
  const ws = await requireAccountingWorkspace();
  return dal.getOpeningClosingBalances(prisma, ws.organizationId);
}
export async function getFeedCandidates(txId: string) {
  const ws = await requireAccountingWorkspace();
  return dal.getFeedCandidates(prisma, ws.organizationId, txId);
}
export async function listExpenseAccounts() {
  const ws = await requireAccountingWorkspace();
  return dal.listExpenseAccounts(prisma, ws.organizationId);
}
export async function listContacts(type: "customer" | "supplier" | "both" = "both") {
  const ws = await requireAccountingWorkspace();
  return dal.listContacts(prisma, ws.organizationId, type);
}

// --- mutations ---
export async function createBankAccount(input: CreateBankAccountInput) {
  const ws = await requireAccountantRole();
  const res = await dal.createBankAccount(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function updateBankAccount(id: string, input: UpdateBankAccountInput) {
  const ws = await requireAccountantRole();
  const res = await dal.updateBankAccount(prisma, ws.organizationId, id, input);
  revalidateBanking();
  return res;
}
export async function deleteBankAccount(id: string) {
  const ws = await requireAccountantRole();
  await dal.deleteBankAccount(prisma, ws.organizationId, id);
  revalidateBanking();
}
export async function confirmStatementImport(bankAccountId: string, transactions: ParsedTransaction[]) {
  const ws = await requireAccountantRole();
  const res = await dal.confirmStatementImport(prisma, ws.organizationId, bankAccountId, transactions);
  revalidateBanking();
  return res;
}
export async function bulkDeleteFeed(ids: string[]) {
  const ws = await requireAccountantRole();
  const res = await dal.bulkDeleteFeed(prisma, ws.organizationId, ids);
  revalidateBanking();
  return res;
}
export async function reconcileFeed(txId: string, journalId: string) {
  const ws = await requireAccountantRole();
  const res = await dal.reconcileFeed(prisma, ws.organizationId, ws.userId, txId, journalId);
  revalidateBanking();
  return res;
}
export async function runAiMatch() {
  const ws = await requireAccountingWorkspace();
  const res = await dal.runAiMatch(prisma, ws.organizationId);
  revalidateBanking();
  return res;
}
export async function setOpeningBalance(accountId: string, openingBalanceMinor: number) {
  const ws = await requireAccountantRole();
  const res = await dal.setOpeningBalance(prisma, ws.organizationId, accountId, openingBalanceMinor);
  revalidateBanking();
  return res;
}
export async function createTransfer(input: Parameters<typeof dal.createTransfer>[3]) {
  const ws = await requireAccountantRole();
  const res = await dal.createTransfer(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function createReceivedPayment(input: Parameters<typeof dal.createReceivedPayment>[3]) {
  const ws = await requireAccountantRole();
  const res = await dal.createReceivedPayment(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}
export async function createPaidExpense(input: Parameters<typeof dal.createPaidExpense>[3]) {
  const ws = await requireAccountantRole();
  const res = await dal.createPaidExpense(prisma, ws.organizationId, ws.userId, input);
  revalidateBanking();
  return res;
}

// --- statement import (file upload) ---
export async function importStatement(formData: FormData) {
  const ws = await requireAccountingWorkspace();
  const file = formData.get("file") as File | null;
  const bankAccountId = formData.get("bank_account_id") as string | null;
  if (!file) throw new Error("No file provided.");
  if (!bankAccountId) throw new Error("bank_account_id is required.");

  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: bankAccountId, org_id: ws.organizationId, deleted_at: null },
    select: { id: true, display_name: true },
  });
  if (!account) throw new Error("Bank account not found.");
  if (file.size > 10 * 1024 * 1024) throw new Error("File too large. Max 10 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const transactions = await parseStatement(file.name, bytes);

  return {
    bank_account_id: account.id,
    bank_account_name: account.display_name,
    filename: file.name,
    transaction_count: transactions.length,
    transactions,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in `app/banking/actions.ts` or `lib/banking/*`. Fix any enum-casing or type mismatches surfaced here.

- [ ] **Step 3: Commit**

```bash
git add app/banking/actions.ts
git commit -m "feat(banking): server action wrappers with auth"
```

---

## Task 12: Client API (`lib/banking/api.ts`) replacing the Django hooks

Re-create every hook/function in `lib/django/banking.ts` with identical names, signatures, and return types — but calling server actions instead of `djangoFetch`.

**Files:**
- Create: `lib/banking/api.ts`

**Interfaces:**
- Produces: identical exports to `lib/django/banking.ts` — `useBankAccounts`, `useCreateBankAccount`, `useUpdateBankAccount`, `useDeleteBankAccount`, `useDashboardSummary`, `useFeedTransactions`, `useBulkDeleteFeed`, `useReconcileFeed`, `useExpenseAccounts`, `useContacts`, `useCreateTransfer`, `useCreateReceivedPayment`, `useCreatePaidExpense`, `bankingKeys`, `feedKeys`, `importStatement`, `confirmStatementImport`, `runAiMatch`, `findJournalCandidates`, `getOpeningClosingBalances`, `setOpeningBalance`, and all the exported types.

- [ ] **Step 1: Implement `lib/banking/api.ts`**

Create `lib/banking/api.ts`. Re-export the types from `lib/banking/types`, keep `bankingKeys`/`feedKeys` byte-identical to the originals, and back each hook with the matching server action. Representative excerpt (apply the same transform to every hook in `lib/django/banking.ts`):

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as actions from "@/app/banking/actions";

export type {
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput, DashboardSummary,
  ParsedTransaction, StatementImportPreview, FeedTransaction, ConfirmStatementResponse,
  AiMatchResult, JournalCandidate, AccountBalance, ExpenseAccount, Contact,
} from "@/lib/banking/types";

export const bankingKeys = {
  all: ["banking"] as const,
  accounts: () => [...bankingKeys.all, "accounts"] as const,
  dashboardSummary: () => [...bankingKeys.all, "dashboard-summary"] as const,
};

export const feedKeys = {
  all: (orgFilter?: string) => [...bankingKeys.all, "feed", orgFilter] as const,
};

export function useBankAccounts() {
  return useQuery({ queryKey: bankingKeys.accounts(), queryFn: () => actions.listBankAccounts() });
}

export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof actions.createBankAccount>[0]) => actions.createBankAccount(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bankingKeys.accounts() });
      qc.invalidateQueries({ queryKey: bankingKeys.dashboardSummary() });
    },
  });
}

export function useFeedTransactions(bankAccountId?: string, search?: string) {
  return useQuery({
    queryKey: [...feedKeys.all(), bankAccountId, search],
    queryFn: () => actions.listFeedTransactions({ bankAccountId, search }),
  });
}

export async function importStatement(file: File, bankAccountId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bank_account_id", bankAccountId);
  return actions.importStatement(fd);
}

export async function confirmStatementImport(bankAccountId: string, transactions: import("@/lib/banking/types").ParsedTransaction[]) {
  return actions.confirmStatementImport(bankAccountId, transactions);
}

export async function runAiMatch() { return actions.runAiMatch(); }
export async function findJournalCandidates(txId: string) { return actions.getFeedCandidates(txId); }
export async function getOpeningClosingBalances() { return actions.getOpeningClosingBalances(); }
export async function setOpeningBalance(accountId: string, openingBalanceMinor: number) {
  return actions.setOpeningBalance(accountId, openingBalanceMinor);
}
```

Complete the file by porting EVERY remaining hook from `lib/django/banking.ts` (`useUpdateBankAccount`, `useDeleteBankAccount`, `useDashboardSummary`, `useBulkDeleteFeed`, `useReconcileFeed`, `useExpenseAccounts`, `useContacts`, `useCreateTransfer`, `useCreateReceivedPayment`, `useCreatePaidExpense`) using the same pattern: same name, same query keys, same invalidations, `queryFn`/`mutationFn` calling the corresponding `actions.*`.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. The hook return types must match the old ones (they will, because the actions return the DAL types which equal `lib/banking/types`).

- [ ] **Step 3: Commit**

```bash
git add lib/banking/api.ts
git commit -m "feat(banking): client hooks backed by server actions"
```

---

## Task 13: Switch components over and delete Django

**Files:**
- Modify: `components/banking/banking-dashboard.tsx`, `components/banking/money-modals.tsx`, `components/banking/statements-view.tsx`, `components/banking/transactions-view.tsx`
- Delete: `lib/django/banking.ts`, `lib/django/client.ts`

**Interfaces:**
- Consumes: `lib/banking/api` (replaces `lib/django/banking` and `lib/django/client`).

- [ ] **Step 1: Repoint imports**

In each banking component, replace:
- `from "@/lib/django/banking"` → `from "@/lib/banking/api"`
- Remove `import { djangoFetch } from "@/lib/django/client";` and replace any direct `djangoFetch(...)` calls with the equivalent server action (e.g. a raw `djangoFetch("/banking/feed/...")` in `transactions-view.tsx` / `banking-dashboard.tsx` becomes the matching `actions.*` call exposed through `lib/banking/api.ts`). Grep first:

Run: `grep -rn "lib/django\|djangoFetch" components/banking app/banking`
Expected after edits: no matches.

- [ ] **Step 2: Delete the Django client layer**

```bash
git rm lib/django/banking.ts lib/django/client.ts
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck`
Expected: no errors, no references to `@/lib/django/*`.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (dev)**

Run: `pnpm dev`, sign in, open `/banking`. Verify: accounts list, dashboard cards, create account, transfer, received/paid, import a CSV → preview → confirm, run AI match, set opening balance. Each should work with no network calls to `localhost:8000` (check the browser network tab).

- [ ] **Step 5: Commit**

```bash
git add components/banking app/banking
git commit -m "refactor(banking): use Next server actions, remove Django client"
```

---

## Task 14: Decommission Django + docs

**Files:**
- Delete: `backend/`
- Modify: `.env.example`, `docs/deployment/vercel.md`

**Interfaces:** none.

- [ ] **Step 1: Remove the Django service and env var**

Decision needed (see spec §10 / open question): delete vs archive `backend/`. To delete:

```bash
git rm -r backend
```

(If archiving instead, move it out of the repo rather than committing it — `backend/` is currently untracked, so deletion is just removing the directory.)

Remove the `NEXT_PUBLIC_DJANGO_API_URL` block from `.env.example` and the row + "known follow-ups" mention from `docs/deployment/vercel.md`.

- [ ] **Step 2: Final grep — no Django remnants**

Run: `grep -rn "django\|DJANGO\|localhost:8000" lib app components .env.example docs/deployment`
Expected: no matches (docs/superpowers spec/plan may still reference it historically — that's fine).

- [ ] **Step 3: Full test + typecheck + build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 4: Accounting audit**

Dispatch the `accountant-auditor` agent over `lib/banking/posting.ts`, `lib/banking/dal.ts` (money flows + opening balance + dashboard math) to confirm double-entry integrity and org isolation before merge.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(banking): decommission Django backend, single backend"
```

---

## Self-Review

**Spec coverage:**
- §2 architecture (DAL + actions + hooks) → Tasks 6–12. ✅
- §3 frontend contract preservation → Tasks 12–13. ✅
- §4 endpoint map (all 21 routes) → accounts CRUD (T6), dashboard/balances (T7), feed/import/reconcile (T8), ai-match/candidates (T9), money flows + lookups + account transactions (T10), statement import upload (T11). ✅
- §5 journal posting + triggers → Task 5 + opening balance T7. ✅
- §6 AI matching → Tasks 2, 9. ✅
- §7 statement parsing (CSV + PDF) → Tasks 3, 4. ✅
- §8 decommission Django → Tasks 13, 14. ✅
- §9 verification (unit + integration + invariants + accountant-auditor) → tests throughout + T14 audit. ✅
- §3/§11 auth nuance & risks → encoded in Global Constraints + T7 note. ✅

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". Two explicit verification notes (enum casing in T10, `session_replication_role` over pooler in T7, `JournalCandidate.score` in T9, sample PDF in T4) are deliberate runtime checks, each with a concrete action — not deferred work.

**Type consistency:** `Db` defined in `posting.ts`, imported by `dal.ts`. DAL functions consistently `(db, orgId, [userId], input)`. Response shapes come from `lib/banking/types.ts` (copied from `lib/django/banking.ts`), consumed unchanged by actions (T11) and hooks (T12). `postBalancedJournal` signature stable from T5 through T10. `matchScore` arg object identical in T2, T9.

**Known coverage gaps (intentional):** `health/` endpoint not ported (Django-only). `accounts/<coa_id>/transactions/` has two Django variants (`bank_account_transactions` and `account_transactions`); we port the `account_transactions` (posted-only) shape via `getAccountTransactions` — confirm which the UI calls during T13 smoke and adjust if needed.
