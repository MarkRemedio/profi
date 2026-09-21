import "server-only";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { getVatReturn } from "@/lib/accounting/vat-return";
import {
  corporationTaxDates,
  currentFinancialYear,
  currentTaxYear,
  lastCompletedFinancialYear,
  nextCisReturnDue,
  normaliseBusinessStructure,
  paysCorporationTax,
  paysSelfAssessment,
  selfAssessmentDates,
  type BusinessStructure,
} from "@/lib/accounting/financial-year";
import { estimateCorporationTax, estimateSelfAssessment } from "@/lib/tax/uk-rates";

/**
 * What this business owes and when, worked out from its own books and its own
 * setup.
 *
 * The old dashboard showed the same five deadlines and the same three
 * liabilities to everybody — a sole trader was told about corporation tax, a
 * business with no subcontractors about CIS300, and everyone owed £45,000.
 * Here a deadline only appears if it applies, and a figure only appears if it
 * can be worked out.
 *
 * Every estimate is from the books as they stand. Disallowable expenses,
 * capital allowances, reliefs and losses brought forward are none of them
 * recorded, so these are a starting point for a conversation with an
 * accountant, not a return.
 */

export type DeadlineUrgency = "overdue" | "urgent" | "upcoming";

export type TaxDeadline = {
  key: string;
  title: string;
  detail: string;
  dueDate: string;
  /** Negative once the date has passed. */
  daysLeft: number;
  urgency: DeadlineUrgency;
  href: string;
};

export type TaxLiability = {
  key: string;
  title: string;
  /** Null when it cannot be worked out from what the product records. */
  amountMinor: number | null;
  detail: string;
  /** Why there is no figure. Present only when amountMinor is null. */
  unavailableReason?: string;
  href: string;
};

export type TaxOverviewData = {
  today: string;
  baseCurrency: string;
  profile: {
    structure: BusinessStructure | null;
    structureLabel: string;
    vatRegistered: boolean;
    isCisContractor: boolean;
    financialYear: { startDate: string; endDate: string } | null;
    taxYearLabel: string;
    /** Things the page had to guess, so it can say so rather than imply fact. */
    assumptions: string[];
  };
  /** Profit for the year to date, from the ledger. */
  performance: {
    fromDate: string;
    toDate: string;
    revenueMinor: number;
    expensesMinor: number;
    profitMinor: number;
  };
  vat: {
    periodLabel: string;
    netVatMinor: number;
    dueDate: string;
    endDate: string;
  } | null;
  deadlines: TaxDeadline[];
  liabilities: TaxLiability[];
};

const STRUCTURE_LABELS: Record<BusinessStructure, string> = {
  limited_company: "Private limited company",
  plc: "Public limited company",
  cic: "Community interest company",
  sole_trader: "Sole trader",
  partnership: "Partnership",
  charity: "Charity",
  other: "Other",
};

/**
 * UK tax thresholds are in pounds, so an estimate against a workspace keeping
 * books in another currency would compare pesos to the £50,000 small profits
 * limit and produce a number that means nothing.
 */
const UK_CURRENCY = "GBP"; // currency:allow UK tax bands are denominated in sterling

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round(
    (new Date(`${toIso}T00:00:00.000Z`).getTime() -
      new Date(`${fromIso}T00:00:00.000Z`).getTime()) /
      86_400_000
  );

function urgencyFor(daysLeft: number): DeadlineUrgency {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 14) return "urgent";
  return "upcoming";
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

export async function getTaxOverview(organizationId: string): Promise<TaxOverviewData> {
  const today = accountingToday();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      baseCurrency: true,
      businessStructure: true,
      cisStatus: true,
      vatRegistered: true,
      accountingPeriodEnd: true,
    },
  });

  const structure = normaliseBusinessStructure(org?.businessStructure);
  const baseCurrency = org?.baseCurrency ?? UK_CURRENCY;
  const isCisContractor = org?.cisStatus === "contractor";
  const vatRegistered = org?.vatRegistered ?? false;

  const assumptions: string[] = [];
  if (!structure) {
    assumptions.push(
      "No business structure recorded, so corporation tax and self assessment deadlines are both hidden."
    );
  }
  if (!org?.accountingPeriodEnd) {
    assumptions.push(
      "No financial year end recorded, so year-end deadlines cannot be worked out. Set it in workspace settings."
    );
  }

  const financialYear = currentFinancialYear(org?.accountingPeriodEnd ?? null, today);
  const taxYear = currentTaxYear(today);

  // Profit for the year the business is actually in. Without a recorded year
  // end, fall back to the calendar year rather than showing nothing.
  //
  // The whole year, not year-to-today: a journal dated next week is already
  // posted and already in the trial balance, and cutting it off here produced a
  // dashboard claiming a loss while the VAT page — which reads whole periods —
  // showed the sales that caused it. Corporation tax is charged on the period's
  // profit anyway, so the period is the right window for estimating it.
  const fromDate = financialYear?.startDate ?? `${today.slice(0, 4)}-01-01`;
  const toDate = financialYear?.endDate ?? `${today.slice(0, 4)}-12-31`;
  const performance = await getPerformance(organizationId, fromDate, toDate);

  const vatReturn = vatRegistered ? await getVatReturn(organizationId) : null;
  const vat = vatReturn
    ? {
        periodLabel: vatReturn.selected.label,
        netVatMinor: vatReturn.boxes.box5,
        dueDate: vatReturn.selected.dueDate,
        endDate: vatReturn.selected.endDate,
      }
    : null;

  return {
    today,
    baseCurrency,
    profile: {
      structure,
      structureLabel: structure ? STRUCTURE_LABELS[structure] : "Not recorded",
      vatRegistered,
      isCisContractor,
      financialYear,
      taxYearLabel: taxYear.label,
      assumptions,
    },
    performance,
    vat,
    deadlines: buildDeadlines({
      today,
      structure,
      isCisContractor,
      vatReturn,
      storedYearEnd: org?.accountingPeriodEnd ?? null,
    }),
    liabilities: buildLiabilities({
      structure,
      baseCurrency,
      profitMinor: performance.profitMinor,
      vat,
      isCisContractor,
    }),
  };
}

/** Revenue, expenses and profit for a date range, from posted journals. */
async function getPerformance(organizationId: string, fromDate: string, toDate: string) {
  // tenancy:safe: SQL filters by org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{ side: string; net_minor: bigint }>
  >`
    select
      case
        when account_type = 'revenue'::account_type then 'revenue'
        else 'expense'
      end as side,
      case
        when account_type = 'revenue'::account_type
          then coalesce(sum(credit_minor - debit_minor), 0)
        else coalesce(sum(debit_minor - credit_minor), 0)
      end::bigint as net_minor
    from general_ledger_entries
    where org_id = ${organizationId}::uuid
      and journal_date >= ${fromDate}::date
      and journal_date <= ${toDate}::date
      and account_type in ('revenue'::account_type, 'expense'::account_type)
    group by account_type
  `;

  const revenueMinor = rows
    .filter((row) => row.side === "revenue")
    .reduce((total, row) => total + Number(row.net_minor), 0);
  const expensesMinor = rows
    .filter((row) => row.side === "expense")
    .reduce((total, row) => total + Number(row.net_minor), 0);

  return {
    fromDate,
    toDate,
    revenueMinor,
    expensesMinor,
    profitMinor: revenueMinor - expensesMinor,
  };
}

function buildDeadlines(input: {
  today: string;
  structure: BusinessStructure | null;
  isCisContractor: boolean;
  vatReturn: Awaited<ReturnType<typeof getVatReturn>> | null;
  storedYearEnd: Date | null;
}): TaxDeadline[] {
  const { today, structure, isCisContractor, vatReturn, storedYearEnd } = input;
  const deadlines: TaxDeadline[] = [];

  const add = (deadline: Omit<TaxDeadline, "daysLeft" | "urgency">) => {
    const daysLeft = daysBetween(today, deadline.dueDate);
    deadlines.push({ ...deadline, daysLeft, urgency: urgencyFor(daysLeft) });
  };

  if (vatReturn) {
    // The return that needs filing next: the oldest period that has ended and
    // is still outstanding, or failing that the one currently running.
    const outstanding = [...vatReturn.periods]
      .reverse()
      .find((period) => period.status === "overdue" || period.status === "due");
    const period = outstanding ?? vatReturn.periods[0];

    add({
      key: `vat:${period.key}`,
      title: `VAT return — ${period.label}`,
      detail:
        period.status === "open"
          ? `Period ends ${formatDate(period.endDate)}.`
          : `Period ended ${formatDate(period.endDate)}.`,
      dueDate: period.dueDate,
      href: `/taxes/vat?period=${period.key}`,
    });
  }

  const lastYear = lastCompletedFinancialYear(storedYearEnd, today);

  if (paysCorporationTax(structure) && lastYear) {
    const dates = corporationTaxDates(lastYear.endDate);
    add({
      key: "ct:payment",
      title: "Corporation tax payment",
      detail: `For the year ended ${formatDate(lastYear.endDate)}. Due before the return.`,
      dueDate: dates.paymentDue,
      href: "/taxes/corporation",
    });
    add({
      key: "ct:return",
      title: "Company tax return (CT600)",
      detail: `For the year ended ${formatDate(lastYear.endDate)}.`,
      dueDate: dates.returnDue,
      href: "/taxes/corporation",
    });
  }

  if (paysSelfAssessment(structure)) {
    // Self assessment runs on the tax year, not the accounting year, so this is
    // the last 5 April that has passed regardless of the year end.
    const taxYear = currentTaxYear(today);
    const filedYearEnd = `${Number(taxYear.startDate.slice(0, 4))}-04-05`;
    const dates = selfAssessmentDates(filedYearEnd);

    add({
      key: "sa:return",
      title: "Self assessment return",
      detail: `For the tax year ended ${formatDate(filedYearEnd)}, with any balancing payment.`,
      dueDate: dates.returnDue,
      href: "/taxes/self-employed",
    });
    add({
      key: "sa:poa2",
      title: "Second payment on account",
      detail: "Half of last year's bill, paid towards this year's.",
      dueDate: dates.secondPaymentOnAccountDue,
      href: "/taxes/self-employed",
    });
  }

  if (isCisContractor) {
    const cis = nextCisReturnDue(today);
    add({
      key: `cis:${cis.periodEnd}`,
      title: "CIS300 monthly return",
      detail: `For the tax month ended ${formatDate(cis.periodEnd)}.`,
      dueDate: cis.dueDate,
      href: "/taxes/cis",
    });
  }

  // Overdue first, then soonest. Anything more than a year out is noise on a
  // dashboard — it will appear as the date approaches.
  return deadlines
    .filter((deadline) => deadline.daysLeft <= 366)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function buildLiabilities(input: {
  structure: BusinessStructure | null;
  baseCurrency: string;
  profitMinor: number;
  vat: TaxOverviewData["vat"];
  isCisContractor: boolean;
}): TaxLiability[] {
  const { structure, baseCurrency, profitMinor, vat, isCisContractor } = input;
  const liabilities: TaxLiability[] = [];
  const sterling = baseCurrency === UK_CURRENCY;

  if (vat) {
    liabilities.push({
      key: "vat",
      title: vat.netVatMinor >= 0 ? "VAT payable" : "VAT reclaimable",
      amountMinor: Math.abs(vat.netVatMinor),
      detail: `${vat.periodLabel} · due ${formatDate(vat.dueDate)}`,
      href: "/taxes/vat",
    });
  }

  if (paysCorporationTax(structure)) {
    const estimate = sterling ? estimateCorporationTax(profitMinor) : null;
    liabilities.push({
      key: "corporation_tax",
      title: "Corporation tax",
      amountMinor: estimate?.taxMinor ?? null,
      detail: estimate
        ? `${estimate.basis}, on profit so far this year`
        : "Estimate unavailable",
      unavailableReason: sterling
        ? undefined
        : `The UK rate bands are in sterling, and this workspace keeps its books in ${baseCurrency}.`,
      href: "/taxes/corporation",
    });
  }

  if (paysSelfAssessment(structure)) {
    const estimate = sterling ? estimateSelfAssessment(profitMinor) : null;
    liabilities.push({
      key: "self_assessment",
      title: "Income tax & Class 4 NI",
      amountMinor: estimate?.totalMinor ?? null,
      detail: estimate
        ? "On profit so far this year, treated as your only income"
        : "Estimate unavailable",
      unavailableReason: sterling
        ? undefined
        : `The UK rate bands are in sterling, and this workspace keeps its books in ${baseCurrency}.`,
      href: "/taxes/self-employed",
    });
  }

  if (isCisContractor) {
    liabilities.push({
      key: "cis",
      title: "CIS deductions",
      amountMinor: null,
      detail: "Owed to HMRC on subcontractor payments",
      unavailableReason:
        "Nothing yet records a payment as being under CIS, so deductions cannot be totalled.",
      href: "/taxes/cis",
    });
  }

  return liabilities;
}
