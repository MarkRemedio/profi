import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  corporationTaxDates,
  currentFinancialYear,
  normaliseBusinessStructure,
  paysCorporationTax,
  type BusinessStructure,
} from "@/lib/accounting/financial-year";
import { estimateCorporationTax, type CorporationTaxEstimate } from "@/lib/tax/uk-rates";

/**
 * The corporation tax computation, as far as the books can take it.
 *
 * Accounting profit is exact — it is the same revenue and expense movement the
 * profit and loss report reads. What follows it is not: a real computation adds
 * back disallowable spending and deducts capital allowances, and only one of
 * those can be derived from what the product records.
 *
 * Depreciation can, because accounts carry a report category and depreciation
 * has its own. Client entertainment, penalties and capital allowances cannot —
 * nothing distinguishes an entertainment expense from any other, and there is
 * no fixed asset register to run allowances from. Those are listed as missing
 * rather than assumed to be nil, because adding depreciation back without
 * claiming allowances against it overstates the bill, sometimes badly.
 */

export type CtAdjustment = {
  key: string;
  label: string;
  detail: string;
  /** Positive increases taxable profit, negative reduces it. */
  amountMinor: number;
};

export type CtMissingAdjustment = {
  key: string;
  label: string;
  reason: string;
  /** Which way it would move the bill, so nobody reads the estimate as final. */
  direction: "increases" | "reduces";
};

export type CtYear = {
  /** The period end, which identifies the year. */
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  /** True for the year currently running — its profit is still moving. */
  inProgress: boolean;
  revenueMinor: number;
  expensesMinor: number;
  accountingProfitMinor: number;
  addBacks: CtAdjustment[];
  taxableProfitMinor: number;
  estimate: CorporationTaxEstimate;
  paymentDue: string;
  returnDue: string;
};

export type CorporationTaxData = {
  today: string;
  baseCurrency: string;
  /** UK rate bands are sterling, so an estimate in another currency is void. */
  estimatesApply: boolean;
  structure: BusinessStructure | null;
  /** False for a sole trader or partnership, which files a self assessment. */
  paysCorporationTax: boolean;
  /**
   * The references HMRC asks for on a CT600. Recorded at signup, so the page
   * can show what is missing before somebody sits down to file.
   */
  references: { companyNumber: string | null; taxReference: string | null };
  /** Null when no financial year end has been recorded. */
  years: CtYear[];
  selected: CtYear | null;
  missingAdjustments: CtMissingAdjustment[];
  /** Whether a corporation tax account exists to post a provision to. */
  provisionAccounts: { code: string; name: string }[];
};

/** How many completed years to offer alongside the one running. */
const HISTORY_YEARS = 3;

const UK_CURRENCY = "GBP"; // currency:allow UK tax bands are denominated in sterling

const yearLabel = (startDate: string, endDate: string) =>
  `${startDate.slice(0, 4)}/${endDate.slice(2, 4)}`;

type PeriodRow = {
  period_end: string;
  category: string;
  net_minor: bigint;
};

export async function getCorporationTax(
  organizationId: string,
  input?: { yearKey?: string | null }
): Promise<CorporationTaxData> {
  const today = accountingToday();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      baseCurrency: true,
      businessStructure: true,
      accountingPeriodEnd: true,
      companyNumber: true,
      taxReference: true,
    },
  });

  const structure = normaliseBusinessStructure(org?.businessStructure);
  const baseCurrency = org?.baseCurrency ?? UK_CURRENCY;
  const estimatesApply = baseCurrency === UK_CURRENCY;

  const current = currentFinancialYear(org?.accountingPeriodEnd ?? null, today);

  const provisionAccounts = await prisma.chartAccount.findMany({
    where: {
      organizationId,
      isActive: true,
      name: { contains: "corporation tax", mode: "insensitive" },
    },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });

  const base = {
    today,
    baseCurrency,
    estimatesApply,
    structure,
    paysCorporationTax: paysCorporationTax(structure),
    references: {
      companyNumber: org?.companyNumber ?? null,
      taxReference: org?.taxReference ?? null,
    },
    missingAdjustments: MISSING_ADJUSTMENTS,
    provisionAccounts,
  };

  if (!current) {
    return { ...base, years: [], selected: null };
  }

  // Build the year the business is in plus the completed ones behind it, then
  // fetch every figure in one pass rather than a query per year.
  const spans: Array<{ startDate: string; endDate: string }> = [current];
  for (let back = 1; back <= HISTORY_YEARS; back += 1) {
    const previous = spans[spans.length - 1];
    spans.push({
      startDate: shiftYears(previous.startDate, -1),
      endDate: shiftYears(previous.endDate, -1),
    });
  }

  const rows = await fetchPeriodTotals(organizationId, spans);

  const years: CtYear[] = spans.map((span) => {
    const revenueMinor = totalFor(rows, span.endDate, "revenue");
    const depreciationMinor = totalFor(rows, span.endDate, "depreciation");
    // Depreciation is bucketed separately so it can be added back, but it is
    // still an expense — the accounting profit has to be after it, or the
    // add-back below would be charging tax on a cost that was never deducted.
    const expensesMinor = totalFor(rows, span.endDate, "expense") + depreciationMinor;
    const accountingProfitMinor = revenueMinor - expensesMinor;

    const addBacks: CtAdjustment[] = [];
    if (depreciationMinor !== 0) {
      addBacks.push({
        key: "depreciation",
        label: "Depreciation",
        detail:
          "Not an allowable deduction. Capital allowances are claimed against the same assets instead.",
        amountMinor: depreciationMinor,
      });
    }

    const taxableProfitMinor =
      accountingProfitMinor + addBacks.reduce((total, item) => total + item.amountMinor, 0);
    const dates = corporationTaxDates(span.endDate);

    return {
      key: span.endDate,
      label: yearLabel(span.startDate, span.endDate),
      startDate: span.startDate,
      endDate: span.endDate,
      inProgress: today <= span.endDate,
      revenueMinor,
      expensesMinor,
      accountingProfitMinor,
      addBacks,
      taxableProfitMinor,
      estimate: estimateCorporationTax(taxableProfitMinor),
      paymentDue: dates.paymentDue,
      returnDue: dates.returnDue,
    };
  });

  const selected = years.find((year) => year.key === input?.yearKey) ?? years[0];

  return { ...base, years, selected };
}

/**
 * What a real computation would include and this one cannot.
 *
 * Listed explicitly, with which way each moves the bill, so the estimate is
 * read as the starting point it is.
 */
const MISSING_ADJUSTMENTS: CtMissingAdjustment[] = [
  {
    key: "capital_allowances",
    label: "Capital allowances",
    reason:
      "There is no fixed asset register, so allowances on equipment and vehicles cannot be calculated. This matters most where depreciation has been added back above.",
    direction: "reduces",
  },
  {
    key: "entertainment",
    label: "Client entertainment",
    reason:
      "Disallowable in full, but nothing marks an expense as entertainment — it sits in general expenses with everything else.",
    direction: "increases",
  },
  {
    key: "penalties",
    label: "Penalties and fines",
    reason: "Disallowable, and not separately recorded.",
    direction: "increases",
  },
  {
    key: "losses",
    label: "Losses brought forward",
    reason:
      "A loss from an earlier year can be set against this year's profit. Nothing tracks which losses have already been used.",
    direction: "reduces",
  },
  {
    key: "reliefs",
    label: "R&D and other reliefs",
    reason: "Claimed on the return itself, not derivable from the books.",
    direction: "reduces",
  },
];

/**
 * Revenue, expenses and depreciation for several accounting years, in one query.
 *
 * The years are joined in as a VALUES list so each ledger line is matched
 * against the exact period it falls in. Bucketing by month and reassembling
 * would be wrong for any year end that is not a month end — a 7 August year end
 * splits August between two years, and the month would be counted in both.
 */
async function fetchPeriodTotals(
  organizationId: string,
  spans: Array<{ startDate: string; endDate: string }>
): Promise<PeriodRow[]> {
  const spanValues = Prisma.join(
    spans.map(
      (span) => Prisma.sql`(${span.startDate}::date, ${span.endDate}::date)`
    )
  );

  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  return prisma.$queryRaw<PeriodRow[]>`
    with spans (start_date, end_date) as (values ${spanValues})
    select
      to_char(s.end_date, 'YYYY-MM-DD') as period_end,
      case
        when gle.account_type = 'revenue'::account_type then 'revenue'
        when gle.report_category = 'depreciation'::account_report_category then 'depreciation'
        else 'expense'
      end as category,
      coalesce(sum(
        case
          when gle.account_type = 'revenue'::account_type
            then gle.credit_minor - gle.debit_minor
          else gle.debit_minor - gle.credit_minor
        end
      ), 0)::bigint as net_minor
    from spans s
    join general_ledger_entries gle
      on gle.journal_date >= s.start_date
      and gle.journal_date <= s.end_date
    where gle.org_id = ${organizationId}::uuid
      and gle.account_type in ('revenue'::account_type, 'expense'::account_type)
    group by 1, 2
  `;
}

function totalFor(rows: PeriodRow[], periodEnd: string, category: string): number {
  return rows
    .filter((row) => row.period_end === periodEnd && row.category === category)
    .reduce((total, row) => total + Number(row.net_minor), 0);
}

/** Shift an ISO date by whole years, clamping 29 February to the 28th. */
function shiftYears(iso: string, years: number): string {
  const year = Number(iso.slice(0, 4)) + years;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
