import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  isVatFrequency,
  vatAnchorMonth,
  vatPeriods,
  type VatFrequency,
  type VatPeriod,
} from "@/lib/accounting/vat-periods";

/**
 * The VAT return, built from the ledger.
 *
 * Every figure here comes from posted journal lines, which are always in the
 * workspace's base currency — the only basis a return can be filed on, since
 * HMRC wants sterling regardless of what a customer was invoiced in. Reading
 * document totals instead would sum euros and pounds into one number.
 *
 * Boxes 2, 8 and 9 cover goods moving to and from Northern Ireland and the EU.
 * Nothing in the product records that a line is such a movement, so they are
 * reported as unavailable rather than as zero — a zero is a claim that there
 * were none, which we are not in a position to make.
 */

/**
 * Journals that represent a sale for VAT purposes.
 *
 * Boxes 1 and 4 key on the VAT control accounts, so anything touching them is
 * counted whatever raised it. Boxes 6 and 7 key on this list instead — which
 * means a journal that moves revenue under a source type nobody added here is
 * silently left out of the sales total while its VAT is still counted.
 *
 * That is what had happened. Reverting an invoice, refunding at the till and
 * voiding a till sale all credit revenue back, and none of them were listed:
 * box 1 fell by the VAT while box 6 kept the whole sale. Credit notes were
 * about to join them, having only just started posting a journal at all.
 */
const SALES_SOURCES = [
  "invoice",
  "invoice_void",
  "invoice_revert",
  "credit_note",
  "credit_note_void",
  "sales_receipt",
  "sales_receipt_void",
  "refund_receipt",
  "refund_receipt_void",
  "pos_sale",
  "pos_sale_void",
  "pos_refund",
];

/** Journals that represent a purchase. */
const PURCHASE_SOURCES = ["bill", "bill_void", "bill_revert", "expense_paid"];

/**
 * Journals that move revenue or expense but are not a sale or a purchase.
 *
 * Listed rather than merely left out, so the two lists above can be checked for
 * completeness: every source type that moves a revenue or expense account has
 * to appear in exactly one of the three, and a test fails when a new one
 * appears in none. Omission is how the reversals went missing, and on a tax
 * return an omission that nothing complains about is the dangerous kind.
 *
 *   - the cost-of-sales side of a till sale: the purchase was already counted
 *     when the stock was bought, and counting it again on the way out would
 *     put it in box 7 twice;
 *   - a till variance: a discrepancy in the drawer, not something bought;
 *   - payroll: wages are outside the scope of VAT and explicitly excluded
 *     from box 7.
 */
const NON_TRADING_SOURCES = [
  "pos_cogs",
  "pos_refund_cogs",
  "pos_sale_void_cogs",
  "pos_day_close_variance",
  "payroll_run",
  "payroll_run_void",
];

export const VAT_SOURCE_CLASSIFICATION = {
  sales: SALES_SOURCES,
  purchases: PURCHASE_SOURCES,
  excluded: NON_TRADING_SOURCES,
} as const;

/** Input VAT (recoverable) and output VAT (owed) control accounts. */
const INPUT_VAT_CODE = "1200";
const OUTPUT_VAT_CODE = "2100";

export type VatBoxes = {
  /** VAT due on sales and other outputs. */
  box1: number;
  /** VAT due on acquisitions of goods from NI and the EU. Not derivable. */
  box2: number | null;
  /** Total VAT due — box 1 plus box 2. */
  box3: number;
  /** VAT reclaimed on purchases and other inputs. */
  box4: number;
  /** Net VAT: positive is payable to HMRC, negative is reclaimable. */
  box5: number;
  /** Total value of sales, excluding VAT. */
  box6: number;
  /** Total value of purchases, excluding VAT. */
  box7: number;
  /** Value of goods dispatched to NI and the EU. Not derivable. */
  box8: number | null;
  /** Value of goods acquired from NI and the EU. Not derivable. */
  box9: number | null;
};

export type VatSourceRow = {
  /** "Invoices", "Bills", "Manual journals" — how the VAT got there. */
  label: string;
  outputVatMinor: number;
  inputVatMinor: number;
};

export type VatAdjustmentRow = {
  id: string;
  journalId: string;
  journalDate: string;
  box: "Box 1" | "Box 4";
  memo: string;
  /** Signed: positive increases what is owed, negative reduces it. */
  amountMinor: number;
};

export type VatLateEntryRow = {
  id: string;
  journalId: string;
  /** The date the transaction is dated — the period it belongs to. */
  journalDate: string;
  /** When it was actually posted, which is why it lands in this return. */
  postedAt: string;
  label: string;
  amountMinor: number;
};

export type VatReturnData = {
  registration: {
    vatRegistered: boolean;
    vatNumber: string | null;
    /** "standard" | "cash" | "flat_rate" | "annual", or null if never set. */
    scheme: string | null;
    frequency: VatFrequency;
    /** False when the frequency is our assumption rather than the user's answer. */
    frequencyRecorded: boolean;
    /** Month a period ends on, derived from the financial year end. */
    anchorMonth: number;
    baseCurrency: string;
  };
  today: string;
  periods: VatPeriod[];
  /**
   * When this workspace's books start. Set only when earlier periods were left
   * out because of it, so the page can explain a short list rather than leave
   * it looking truncated.
   */
  booksStartDate: string | null;
  selected: VatPeriod;
  boxes: VatBoxes;
  /** Net VAT per period key, so the obligations table can show real figures. */
  netVatByPeriod: Record<string, number>;
  sources: VatSourceRow[];
  adjustments: VatAdjustmentRow[];
  lateEntries: VatLateEntryRow[];
};

type BucketRow = {
  month: string;
  bucket: string;
  source_type: string | null;
  debit_minor: bigint;
  credit_minor: bigint;
};

const SOURCE_LABELS: Record<string, string> = {
  invoice: "Invoices",
  invoice_void: "Voided invoices",
  sales_receipt: "Sales receipts",
  sales_receipt_void: "Voided sales receipts",
  refund_receipt: "Refund receipts",
  refund_receipt_void: "Voided refund receipts",
  pos_sale: "Point of sale",
  pos_sale_void: "Voided till sales",
  pos_refund: "Till refunds",
  // Reversals and credits move VAT as surely as the documents they undo, so
  // they belong in this table by name rather than as a raw identifier.
  invoice_revert: "Reverted invoices",
  credit_note: "Credit notes",
  credit_note_void: "Voided credit notes",
  bill: "Bills",
  bill_void: "Voided bills",
  bill_revert: "Reverted bills",
  expense_paid: "Expense claims",
  manual: "Manual journals",
  manual_reversal: "Reversed journals",
  opening_balance: "Opening balances",
};

const sourceLabel = (source: string | null) =>
  (source && SOURCE_LABELS[source]) ?? source ?? "Journal";

/** The earlier of two dates as yyyy-mm-dd, ignoring nulls. */
function earliestOf(a: Date | null, b: Date | null): string | null {
  const dates = [a, b].filter((value): value is Date => value !== null);
  if (dates.length === 0) return null;
  return dates
    .map((date) => date.toISOString().slice(0, 10))
    .reduce((earliest, candidate) => (candidate < earliest ? candidate : earliest));
}

/** Whether a yyyy-mm month falls inside a period. */
const monthInPeriod = (month: string, period: VatPeriod) =>
  month >= period.startDate.slice(0, 7) && month <= period.endDate.slice(0, 7);

export async function getVatReturn(
  organizationId: string,
  input?: { periodKey?: string | null }
): Promise<VatReturnData> {
  const today = accountingToday();

  const [org, firstEntry] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        baseCurrency: true,
        createdAt: true,
        vatRegistered: true,
        vatRegistrationNo: true,
        vatScheme: true,
        vatReturnFrequency: true,
        accountingPeriodEnd: true,
      },
    }),
    // The oldest thing in the books. A workspace that migrated its history in
    // has journals older than itself, and those periods are real.
    prisma.journal.findFirst({
      where: { organizationId },
      orderBy: { journalDate: "asc" },
      select: { journalDate: true },
    }),
  ]);

  const frequencyRecorded = isVatFrequency(org?.vatReturnFrequency);
  // Quarterly is what the large majority of UK businesses file, and it is what
  // HMRC allocates unless a business asks otherwise. Flagged as an assumption
  // so the page can offer to correct it rather than state it as fact.
  const frequency: VatFrequency = frequencyRecorded
    ? (org!.vatReturnFrequency as VatFrequency)
    : "quarterly";
  const anchorMonth = vatAnchorMonth(org?.accountingPeriodEnd ?? null);

  // Periods that ended before this workspace kept any books are not returns
  // anybody missed — showing them as overdue tells a business it is in trouble
  // with HMRC over a quarter it did not trade in. The running period always
  // survives, so a brand new workspace still has something to look at.
  const booksStart = earliestOf(
    org?.createdAt ?? null,
    firstEntry?.journalDate ?? null
  );
  const allPeriods = vatPeriods({ frequency, anchorMonth, today });
  const periods = allPeriods.filter(
    (period, index) => index === 0 || !booksStart || period.endDate >= booksStart
  );

  const selected = periods.find((period) => period.key === input?.periodKey) ?? periods[0];

  // One query covers every period on screen: the boxes for the selected one and
  // the net VAT shown against each row of the obligations table. Month buckets
  // are safe to re-aggregate because VAT periods are always whole months.
  const spanStart = periods[periods.length - 1].startDate;
  const spanEnd = periods[0].endDate;

  const salesSources = Prisma.join(SALES_SOURCES);
  const purchaseSources = Prisma.join(PURCHASE_SOURCES);

  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const bucketRows = await prisma.$queryRaw<BucketRow[]>`
    select
      to_char(date_trunc('month', gle.journal_date), 'YYYY-MM') as month,
      case
        when gle.account_code = ${OUTPUT_VAT_CODE} then 'output_vat'
        when gle.account_code = ${INPUT_VAT_CODE} then 'input_vat'
        when gle.account_type = 'revenue'::account_type then 'sales'
        else 'purchases'
      end as bucket,
      gle.source_type,
      coalesce(sum(gle.debit_minor), 0)::bigint as debit_minor,
      coalesce(sum(gle.credit_minor), 0)::bigint as credit_minor
    from general_ledger_entries gle
    where gle.org_id = ${organizationId}::uuid
      and gle.journal_date >= ${spanStart}::date
      and gle.journal_date <= ${spanEnd}::date
      and (
        gle.account_code in (${INPUT_VAT_CODE}, ${OUTPUT_VAT_CODE})
        or (
          gle.account_type = 'revenue'::account_type
          and gle.source_type in (${salesSources})
        )
        or (
          gle.account_type = 'expense'::account_type
          and gle.source_type in (${purchaseSources})
          -- Depreciation is an accounting entry, not something anyone bought.
          and gle.report_category is distinct from 'depreciation'::account_report_category
        )
      )
    group by 1, 2, 3
  `;

  const boxes = boxesFor(bucketRows, selected);

  const netVatByPeriod: Record<string, number> = {};
  for (const period of periods) {
    const periodBoxes = boxesFor(bucketRows, period);
    netVatByPeriod[period.key] = periodBoxes.box5;
  }

  const [adjustments, lateEntries] = await Promise.all([
    getAdjustments(organizationId, selected),
    getLateEntries(organizationId, selected),
  ]);

  return {
    registration: {
      vatRegistered: org?.vatRegistered ?? false,
      vatNumber: org?.vatRegistrationNo ?? null,
      scheme: org?.vatScheme ?? null,
      frequency,
      frequencyRecorded,
      anchorMonth,
      baseCurrency: org?.baseCurrency ?? "GBP", // currency:allow falls back to the column default
    },
    today,
    periods,
    booksStartDate: periods.length < allPeriods.length ? booksStart : null,
    selected,
    boxes,
    netVatByPeriod,
    sources: sourcesFor(bucketRows, selected),
    adjustments,
    lateEntries,
  };
}

/**
 * Roll the month buckets up into the nine boxes for one period.
 *
 * Signs follow the account: output VAT is a liability so a credit increases it,
 * input VAT is an asset so a debit does. Netting each way round means a credit
 * note reduces the box it belongs to instead of appearing as a second sale.
 */
function boxesFor(rows: BucketRow[], period: VatPeriod): VatBoxes {
  let box1 = 0;
  let box4 = 0;
  let box6 = 0;
  let box7 = 0;

  for (const row of rows) {
    if (!monthInPeriod(row.month, period)) continue;

    const debit = Number(row.debit_minor);
    const credit = Number(row.credit_minor);

    switch (row.bucket) {
      case "output_vat":
        box1 += credit - debit;
        break;
      case "input_vat":
        box4 += debit - credit;
        break;
      case "sales":
        box6 += credit - debit;
        break;
      case "purchases":
        box7 += debit - credit;
        break;
    }
  }

  return {
    box1,
    box2: null,
    // Box 3 is box 1 plus box 2. With box 2 unrecorded this is box 1 alone,
    // which is correct for any business not moving goods to or from NI/EU.
    box3: box1,
    box4,
    box5: box1 - box4,
    box6,
    box7,
    box8: null,
    box9: null,
  };
}

/** Where the VAT in this period came from — for checking the return adds up. */
function sourcesFor(rows: BucketRow[], period: VatPeriod): VatSourceRow[] {
  const totals = new Map<string, VatSourceRow>();

  for (const row of rows) {
    if (!monthInPeriod(row.month, period)) continue;
    if (row.bucket !== "output_vat" && row.bucket !== "input_vat") continue;

    const label = sourceLabel(row.source_type);
    const entry = totals.get(label) ?? { label, outputVatMinor: 0, inputVatMinor: 0 };
    const debit = Number(row.debit_minor);
    const credit = Number(row.credit_minor);

    if (row.bucket === "output_vat") entry.outputVatMinor += credit - debit;
    else entry.inputVatMinor += debit - credit;

    totals.set(label, entry);
  }

  return [...totals.values()]
    .filter((row) => row.outputVatMinor !== 0 || row.inputVatMinor !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.outputVatMinor) + Math.abs(b.inputVatMinor) -
        (Math.abs(a.outputVatMinor) + Math.abs(a.inputVatMinor))
    );
}

/**
 * Manual journals touching a VAT account in this period.
 *
 * These are the real VAT adjustments: a bad debt relief claim or an error
 * correction is posted as a journal, not recorded in a separate adjustments
 * table. Listing them lets someone see exactly what has been moved by hand
 * before they file.
 */
async function getAdjustments(
  organizationId: string,
  period: VatPeriod
): Promise<VatAdjustmentRow[]> {
  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      journal_id: string;
      journal_date: Date;
      account_code: string;
      journal_memo: string | null;
      line_memo: string | null;
      debit_minor: bigint;
      credit_minor: bigint;
    }>
  >`
    select
      gle.id, gle.journal_id, gle.journal_date, gle.account_code,
      gle.journal_memo, gle.line_memo, gle.debit_minor, gle.credit_minor
    from general_ledger_entries gle
    where gle.org_id = ${organizationId}::uuid
      and gle.account_code in (${INPUT_VAT_CODE}, ${OUTPUT_VAT_CODE})
      and gle.source_type in ('manual', 'manual_reversal')
      and gle.journal_date >= ${period.startDate}::date
      and gle.journal_date <= ${period.endDate}::date
    order by gle.journal_date desc, gle.id desc
  `;

  return rows.map((row) => {
    const debit = Number(row.debit_minor);
    const credit = Number(row.credit_minor);
    const isOutput = row.account_code === OUTPUT_VAT_CODE;

    return {
      id: row.id,
      journalId: row.journal_id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      box: isOutput ? ("Box 1" as const) : ("Box 4" as const),
      memo: row.line_memo ?? row.journal_memo ?? "Manual journal",
      amountMinor: isOutput ? credit - debit : debit - credit,
    };
  });
}

/**
 * VAT dated before this period but only posted once it had started.
 *
 * These belong to a return that has already been filed, so they will be picked
 * up late — which is allowed within limits, but the business needs to know it
 * is happening rather than discover it in an enquiry.
 */
async function getLateEntries(
  organizationId: string,
  period: VatPeriod
): Promise<VatLateEntryRow[]> {
  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      journal_id: string;
      journal_date: Date;
      posted_at: Date | null;
      account_code: string;
      source_type: string | null;
      journal_memo: string | null;
      line_memo: string | null;
      debit_minor: bigint;
      credit_minor: bigint;
    }>
  >`
    select
      gle.id, gle.journal_id, gle.journal_date, gle.posted_at, gle.account_code,
      gle.source_type, gle.journal_memo, gle.line_memo,
      gle.debit_minor, gle.credit_minor
    from general_ledger_entries gle
    where gle.org_id = ${organizationId}::uuid
      and gle.account_code in (${INPUT_VAT_CODE}, ${OUTPUT_VAT_CODE})
      and gle.journal_date < ${period.startDate}::date
      and gle.posted_at >= ${period.startDate}::date
    order by gle.journal_date desc
    limit 25
  `;

  return rows.map((row) => {
    const debit = Number(row.debit_minor);
    const credit = Number(row.credit_minor);
    const isOutput = row.account_code === OUTPUT_VAT_CODE;

    return {
      id: row.id,
      journalId: row.journal_id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      postedAt: (row.posted_at ?? row.journal_date).toISOString().slice(0, 10),
      label: row.line_memo ?? row.journal_memo ?? sourceLabel(row.source_type),
      amountMinor: isOutput ? credit - debit : debit - credit,
    };
  });
}
