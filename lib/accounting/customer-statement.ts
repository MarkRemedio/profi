/**
 * Customer statement calculation — PURE, no DB / no `server-only` import so it
 * can be unit-tested directly. The server loader (customer-statement-loader.ts)
 * gathers the rows from Prisma and hands them here.
 *
 * Money is in minor units (integer pence). All correctness rules that the
 * accountant review flagged live here — this is why the compute is isolated and
 * tested rather than inlined into the page.
 */

export type StatementParams = {
  /** yyyy-mm-dd. null = from the beginning of time (opening balance is 0). */
  fromDate: string | null;
  /** yyyy-mm-dd. null = no upper bound. */
  toDate: string | null;
  /** yyyy-mm-dd. Drives overdue/aging. Defaults to today, injected by the caller
   *  — never hardcoded here, so a statement can be re-generated "as at" any date. */
  asOfDate: string;
  /** The workspace's base currency. Documents in any other currency are excluded
   *  from the totals, since minor units of different currencies cannot be summed.
   *  Defaults to GBP so existing callers keep their previous behaviour. */
  currency?: string;
};

export type StatementLine = {
  description: string;
  quantity: string;
  unitPriceMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxCode: string;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
};

export type StatementPayment = {
  amountMinor: number;
  paidAt: string; // yyyy-mm-dd
  accountName: string;
};

export type StatementInvoice = {
  id: string;
  invoiceNo: string;
  /** Optional customer purchase-order number (metadata only). */
  poNumber?: string | null;
  /** Optional free-text reference (metadata only). */
  reference?: string | null;
  issueDate: string; // yyyy-mm-dd
  dueDate: string | null; // yyyy-mm-dd
  status: "draft" | "approved" | "sent" | "void";
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountsAre: string;
  payments: StatementPayment[];
  lines: StatementLine[];
};

/** Cash sales, refunds, and (for now) credit notes: shown for history but they
 *  do NOT move the receivable balance. */
export type StatementDocKind = "sales_receipt" | "refund_receipt" | "credit_note";

export type StatementDoc = {
  id: string;
  kind: StatementDocKind;
  docNo: string;
  date: string; // yyyy-mm-dd
  totalMinor: number;
  currency: string;
};

export type StatementInput = {
  invoices: StatementInvoice[];
  documents: StatementDoc[];
  params: StatementParams;
};

/** Per-customer raw data, loaded once on the server and handed to the client so
 *  the statement can be recomputed instantly as the date range / view changes.
 *  Pure data only — safe to serialise across the server/client boundary. */
export type StatementCustomer = {
  id: string;
  name: string;
  email: string | null;
  billingAddress: string | null;
};

export type CustomerStatementBundle = {
  customer: StatementCustomer;
  invoices: StatementInvoice[];
  documents: StatementDoc[];
};

export type StatementRowKind = "invoice" | "payment" | StatementDocKind;

export type StatementRow = {
  kind: StatementRowKind;
  date: string; // yyyy-mm-dd
  ref: string;
  description: string;
  /** Increases the balance (invoices). */
  debitMinor: number;
  /** Decreases the balance (payments). */
  creditMinor: number;
  /** Running receivable balance after this row. Unchanged for informational rows. */
  runningBalanceMinor: number;
  /** true → shown for history only, does not affect the balance. */
  informational: boolean;
  /** Face value of the document, for display. Set on informational rows (cash
   *  sales, refunds, credit notes) whose amount lives on neither debit nor credit. */
  amountMinor?: number;

  // Payment rows only (per-payment, because one invoice can be part-early/part-late):
  daysLate?: number;
  daysEarly?: number;

  // Invoice rows only (for the expandable drill-down + overdue badge):
  invoiceId?: string;
  poNumber?: string | null;
  reference?: string | null;
  dueDate?: string | null;
  daysOverdue?: number;
  subtotalMinor?: number;
  taxMinor?: number;
  discountMinor?: number;
  amountsAre?: string;
  lines?: StatementLine[];
};

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export type OpenItem = {
  invoiceId: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string | null;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  daysOverdue: number; // asOfDate − dueDate, clamped at 0; 0 when not due / no due date
  bucket: AgingBucket;
};

export type AgingSummary = {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
};

export type CustomerStatement = {
  params: StatementParams;
  currency: string;
  openingBalanceMinor: number;
  rows: StatementRow[];
  closingBalanceMinor: number;
  totalDebitsMinor: number; // invoices raised in the period
  totalCreditsMinor: number; // payments received in the period
  aging: AgingSummary;
  outstandingItems: OpenItem[];
  /**
    * Currencies whose documents were skipped. A statement is a demand for
    * payment sent to the customer, so it is stated in one currency; totalling
    * pesos and pounds into a single closing balance would be meaningless. The
    * caller shows this so an empty statement is explained rather than mysterious.
    */
  excludedCurrencies: string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (both yyyy-mm-dd). Positive when `to` is later. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((b - a) / MS_PER_DAY);
}

/** A posted invoice is one the customer has actually been issued: approved or
 *  sent. Drafts owe nothing yet; voids are cancelled. Neither affects a statement. */
function isPostedInvoice(inv: StatementInvoice): boolean {
  return inv.status === "approved" || inv.status === "sent";
}

function bucketFor(daysOverdue: number, hasDueDate: boolean): AgingBucket {
  // Mirrors components/reports/ar-aging-view.tsx thresholds exactly.
  if (!hasDueDate || daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90plus";
}

/** Ordering for the running-balance ledger: by date, then invoices before
 *  payments before informational docs on the same day (so a same-day payment
 *  lands after the invoice it settles), then by ref for determinism. */
const KIND_ORDER: Record<StatementRowKind, number> = {
  invoice: 0,
  payment: 1,
  credit_note: 2,
  sales_receipt: 3,
  refund_receipt: 4,
};

function inRange(date: string, from: string | null, to: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function computeCustomerStatement(input: StatementInput): CustomerStatement {
  const { params } = input;
  const excludedCurrencies = new Set<string>();
  const baseCurrency = params.currency ?? "GBP"; // currency:allow callers pass the workspace currency

  // Single-currency guard: never sum mixed minor units. Documents in any other
  // currency are dropped and surfaced so the caller can warn rather than
  // silently producing a wrong total. Was pinned to GBP, which excluded every
  // document belonging to a workspace that keeps its books in anything else.
  const invoices = input.invoices.filter((inv) => {
    if (inv.currency !== baseCurrency) {
      excludedCurrencies.add(inv.currency);
      return false;
    }
    return true;
  });
  const documents = input.documents.filter((doc) => {
    if (doc.currency !== baseCurrency) {
      excludedCurrencies.add(doc.currency);
      return false;
    }
    return true;
  });

  const postedInvoices = invoices.filter(isPostedInvoice);

  // --- Opening balance: net AR of everything dated before the period start. ---
  // Invoices are filtered by issue date; payments by their OWN paidAt (a payment
  // can post after the period start against an invoice issued before it). Getting
  // this right is what makes period N's closing tie to period N+1's opening.
  let openingBalanceMinor = 0;
  if (params.fromDate) {
    for (const inv of postedInvoices) {
      if (inv.issueDate < params.fromDate) openingBalanceMinor += inv.totalMinor;
      for (const pay of inv.payments) {
        if (pay.paidAt < params.fromDate) openingBalanceMinor -= pay.amountMinor;
      }
    }
  }

  // --- Build the in-period, balance-affecting + informational rows. ---
  type PendingRow = Omit<StatementRow, "runningBalanceMinor">;
  const pending: PendingRow[] = [];

  for (const inv of postedInvoices) {
    if (inRange(inv.issueDate, params.fromDate, params.toDate)) {
      const daysOverdue = inv.dueDate
        ? Math.max(0, daysBetween(inv.dueDate, params.asOfDate))
        : 0;
      pending.push({
        kind: "invoice",
        date: inv.issueDate,
        ref: inv.invoiceNo,
        description: `Invoice ${inv.invoiceNo}`,
        debitMinor: inv.totalMinor,
        creditMinor: 0,
        informational: false,
        invoiceId: inv.id,
        poNumber: inv.poNumber ?? null,
        reference: inv.reference ?? null,
        dueDate: inv.dueDate,
        daysOverdue,
        subtotalMinor: inv.subtotalMinor,
        taxMinor: inv.taxMinor,
        discountMinor: inv.discountMinor,
        amountsAre: inv.amountsAre,
        lines: inv.lines,
      });
    }

    for (const pay of inv.payments) {
      if (!inRange(pay.paidAt, params.fromDate, params.toDate)) continue;
      // Days late/early are properties of this payment event, not the invoice.
      const delta = inv.dueDate ? daysBetween(inv.dueDate, pay.paidAt) : null;
      pending.push({
        kind: "payment",
        date: pay.paidAt,
        ref: inv.invoiceNo,
        description: `Payment received — ${inv.invoiceNo}`,
        debitMinor: 0,
        creditMinor: pay.amountMinor,
        informational: false,
        daysLate: delta !== null && delta > 0 ? delta : undefined,
        daysEarly: delta !== null && delta < 0 ? -delta : undefined,
      });
    }
  }

  for (const doc of documents) {
    if (!inRange(doc.date, params.fromDate, params.toDate)) continue;
    const label =
      doc.kind === "sales_receipt"
        ? `Sales receipt ${doc.docNo}`
        : doc.kind === "refund_receipt"
          ? `Refund receipt ${doc.docNo}`
          : `Credit note ${doc.docNo}`;
    pending.push({
      kind: doc.kind,
      date: doc.date,
      ref: doc.docNo,
      description: label,
      debitMinor: 0,
      creditMinor: 0,
      informational: true,
      amountMinor: doc.totalMinor,
    });
  }

  pending.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) {
      return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    }
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  });

  let running = openingBalanceMinor;
  let totalDebitsMinor = 0;
  let totalCreditsMinor = 0;
  const rows: StatementRow[] = pending.map((row) => {
    running += row.debitMinor - row.creditMinor;
    totalDebitsMinor += row.debitMinor;
    totalCreditsMinor += row.creditMinor;
    return { ...row, runningBalanceMinor: running };
  });

  const closingBalanceMinor = running;

  // --- Outstanding items + aging, as at asOfDate (independent of the period). ---
  const outstandingItems: OpenItem[] = [];
  const aging: AgingSummary = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90plus: 0,
    total: 0,
  };

  for (const inv of postedInvoices) {
    // Only payments settled on or before the as-at date reduce the balance then.
    const paidMinor = inv.payments
      .filter((p) => p.paidAt <= params.asOfDate)
      .reduce((sum, p) => sum + p.amountMinor, 0);
    const outstandingMinor = inv.totalMinor - paidMinor;
    if (outstandingMinor <= 0) continue;

    const hasDueDate = Boolean(inv.dueDate);
    const daysOverdue = hasDueDate
      ? Math.max(0, daysBetween(inv.dueDate as string, params.asOfDate))
      : 0;
    const bucket = bucketFor(daysOverdue, hasDueDate);

    outstandingItems.push({
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalMinor: inv.totalMinor,
      paidMinor,
      outstandingMinor,
      daysOverdue,
      bucket,
    });

    aging[bucket] += outstandingMinor;
    aging.total += outstandingMinor;
  }

  outstandingItems.sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : 0));

  return {
    params,
    currency: baseCurrency,
    openingBalanceMinor,
    rows,
    closingBalanceMinor,
    totalDebitsMinor,
    totalCreditsMinor,
    aging,
    outstandingItems,
    excludedCurrencies: [...excludedCurrencies],
  };
}
