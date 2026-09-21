import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  currentTaxYear,
  itsaQuarters,
  normaliseBusinessStructure,
  paysSelfAssessment,
  selfAssessmentDates,
  type BusinessStructure,
} from "@/lib/accounting/financial-year";
import { estimateSelfAssessment, type SelfAssessmentEstimate } from "@/lib/tax/uk-rates";

/**
 * Self assessment and Making Tax Digital for Income Tax, from the ledger.
 *
 * Profit is taken on the tax year basis — 6 April to 5 April — which is what
 * every sole trader and partnership uses from 2024/25 onward. Reading the
 * ledger by date gives that directly, with no basis-period apportionment to get
 * wrong.
 *
 * What the books cannot see is everything outside the business: a salary,
 * rental income, dividends, a partner's share. The estimate is therefore a
 * floor, and the page says so rather than presenting it as the bill.
 */

export type ItsaQuarterStatus = "future" | "open" | "due" | "overdue";

export type ItsaQuarterRow = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  status: ItsaQuarterStatus;
  daysToDue: number;
  incomeMinor: number;
  expensesMinor: number;
  profitMinor: number;
};

export type ExpenseCategoryRow = {
  code: string;
  name: string;
  amountMinor: number;
};

export type SelfEmployedData = {
  today: string;
  baseCurrency: string;
  /** UK bands are sterling, so an estimate in another currency is meaningless. */
  estimatesApply: boolean;
  structure: BusinessStructure | null;
  filesSelfAssessment: boolean;
  /** True for a partnership, where the profit is split between partners. */
  isPartnership: boolean;
  /** The UTR a self assessment is filed under. Null when not recorded. */
  taxReference: string | null;
  taxYear: { startDate: string; endDate: string; label: string };
  /** The tax years available to look at, newest first. */
  taxYears: Array<{ startDate: string; endDate: string; label: string }>;
  quarters: ItsaQuarterRow[];
  yearToDate: { incomeMinor: number; expensesMinor: number; profitMinor: number };
  estimate: SelfAssessmentEstimate | null;
  expenseCategories: ExpenseCategoryRow[];
  deadlines: {
    finalDeclarationDue: string;
    balancingPaymentDue: string;
    secondPaymentOnAccountDue: string;
  };
};

const UK_CURRENCY = "GBP"; // currency:allow UK tax bands are denominated in sterling

/** How many earlier tax years to offer. */
const HISTORY_YEARS = 2;

function taxYearFor(startYear: number) {
  return {
    startDate: `${startYear}-04-06`,
    endDate: `${startYear + 1}-04-05`,
    label: `${startYear}/${String(startYear + 1).slice(2)}`,
  };
}

function quarterStatus(
  quarter: { startDate: string; endDate: string; dueDate: string },
  today: string
): ItsaQuarterStatus {
  if (today < quarter.startDate) return "future";
  if (today <= quarter.endDate) return "open";
  if (today <= quarter.dueDate) return "due";
  return "overdue";
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round(
    (new Date(`${toIso}T00:00:00.000Z`).getTime() -
      new Date(`${fromIso}T00:00:00.000Z`).getTime()) /
      86_400_000
  );

export async function getSelfEmployed(
  organizationId: string,
  input?: { taxYear?: string | null }
): Promise<SelfEmployedData> {
  const today = accountingToday();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, businessStructure: true, taxReference: true },
  });

  const structure = normaliseBusinessStructure(org?.businessStructure);
  const baseCurrency = org?.baseCurrency ?? UK_CURRENCY;
  const estimatesApply = baseCurrency === UK_CURRENCY;

  const running = currentTaxYear(today);
  const currentStartYear = Number(running.startDate.slice(0, 4));
  const taxYears = Array.from({ length: HISTORY_YEARS + 1 }, (_, back) =>
    taxYearFor(currentStartYear - back)
  );
  const taxYear = taxYears.find((year) => year.label === input?.taxYear) ?? taxYears[0];

  const quarterDates = itsaQuarters(taxYear.startDate);

  const [totals, expenseCategories] = await Promise.all([
    fetchQuarterTotals(organizationId, quarterDates),
    fetchExpenseCategories(organizationId, taxYear.startDate, taxYear.endDate),
  ]);

  const quarters: ItsaQuarterRow[] = quarterDates.map((quarter) => {
    const incomeMinor = totals.get(`${quarter.endDate}:revenue`) ?? 0;
    const expensesMinor = totals.get(`${quarter.endDate}:expense`) ?? 0;

    return {
      key: String(quarter.index),
      label: `Quarter ${quarter.index}`,
      startDate: quarter.startDate,
      endDate: quarter.endDate,
      dueDate: quarter.dueDate,
      status: quarterStatus(quarter, today),
      daysToDue: daysBetween(today, quarter.dueDate),
      incomeMinor,
      expensesMinor,
      profitMinor: incomeMinor - expensesMinor,
    };
  });

  const incomeMinor = quarters.reduce((total, quarter) => total + quarter.incomeMinor, 0);
  const expensesMinor = quarters.reduce((total, quarter) => total + quarter.expensesMinor, 0);
  const profitMinor = incomeMinor - expensesMinor;

  const dates = selfAssessmentDates(taxYear.endDate);

  return {
    today,
    baseCurrency,
    estimatesApply,
    structure,
    filesSelfAssessment: paysSelfAssessment(structure),
    isPartnership: structure === "partnership",
    taxReference: org?.taxReference ?? null,
    taxYear,
    taxYears,
    quarters,
    yearToDate: { incomeMinor, expensesMinor, profitMinor },
    estimate: estimatesApply ? estimateSelfAssessment(profitMinor) : null,
    expenseCategories,
    deadlines: {
      finalDeclarationDue: dates.returnDue,
      balancingPaymentDue: dates.balancingPaymentDue,
      secondPaymentOnAccountDue: dates.secondPaymentOnAccountDue,
    },
  };
}

/**
 * Income and expenses for all four quarters in one query.
 *
 * The quarters are joined in as a VALUES list so each line is matched to the
 * period it actually falls in — MTD quarters start on the 6th, so bucketing by
 * month would put the first five days of every quarter in the wrong one.
 */
async function fetchQuarterTotals(
  organizationId: string,
  quarters: Array<{ startDate: string; endDate: string }>
): Promise<Map<string, number>> {
  const values = Prisma.join(
    quarters.map(
      (quarter) => Prisma.sql`(${quarter.startDate}::date, ${quarter.endDate}::date)`
    )
  );

  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{ period_end: string; category: string; net_minor: bigint }>
  >`
    with periods (start_date, end_date) as (values ${values})
    select
      to_char(p.end_date, 'YYYY-MM-DD') as period_end,
      case
        when gle.account_type = 'revenue'::account_type then 'revenue'
        else 'expense'
      end as category,
      coalesce(sum(
        case
          when gle.account_type = 'revenue'::account_type
            then gle.credit_minor - gle.debit_minor
          else gle.debit_minor - gle.credit_minor
        end
      ), 0)::bigint as net_minor
    from periods p
    join general_ledger_entries gle
      on gle.journal_date >= p.start_date
      and gle.journal_date <= p.end_date
    where gle.org_id = ${organizationId}::uuid
      and gle.account_type in ('revenue'::account_type, 'expense'::account_type)
    group by 1, 2
  `;

  return new Map(
    rows.map((row) => [`${row.period_end}:${row.category}`, Number(row.net_minor)])
  );
}

/** Expenses for the tax year, broken down by the account they were posted to. */
async function fetchExpenseCategories(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<ExpenseCategoryRow[]> {
  // tenancy:safe: SQL filters by org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{ code: string; name: string; amount_minor: bigint }>
  >`
    select
      account_code as code,
      account_name as name,
      coalesce(sum(debit_minor - credit_minor), 0)::bigint as amount_minor
    from general_ledger_entries
    where org_id = ${organizationId}::uuid
      and journal_date >= ${startDate}::date
      and journal_date <= ${endDate}::date
      and account_type = 'expense'::account_type
    group by account_code, account_name
    having coalesce(sum(debit_minor - credit_minor), 0) <> 0
    order by 3 desc
  `;

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    amountMinor: Number(row.amount_minor),
  }));
}
