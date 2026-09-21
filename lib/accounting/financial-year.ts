/**
 * The accounting year, and the tax deadlines that hang off it.
 *
 * Pure date arithmetic with no database, so the rules can be tested against
 * what HMRC and Companies House actually publish rather than against whatever
 * the code happens to do.
 *
 * A stored year end is one specific date — the end of whichever year was
 * running when it was recorded — so everything here rolls it forward rather
 * than assuming it is still current.
 */

export type FinancialYear = {
  startDate: string;
  endDate: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

const iso = (date: Date) => date.toISOString().slice(0, 10);

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addYears(isoDate: string, years: number): string {
  const year = Number(isoDate.slice(0, 4)) + years;
  const month = Number(isoDate.slice(5, 7));
  const day = Math.min(Number(isoDate.slice(8, 10)), lastDayOfMonth(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

/**
 * Add whole calendar months, clamping to the end of the target month, so
 * 31 May plus nine months is 28 February rather than spilling into March.
 */
function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  date.setUTCDate(Math.min(day, last));
  return iso(date);
}

/**
 * The year end the onboarding wizard's answer means, for the year running now.
 *
 * Returns null for "custom", which means the user said they would set it later
 * — recording a guess would leave them with corporation tax deadlines against a
 * date they never chose.
 */
export function financialYearEndFromChoice(choice: string | null | undefined, today: string) {
  if (choice === "april_5") return rollForwardTo(today, 4, 5);
  if (choice === "dec_31") return rollForwardTo(today, 12, 31);
  /*
   * An exact date, which is what a Companies House lookup produces.
   *
   * Most companies end their year on neither 5 April nor 31 December — the
   * register gives the real date, and the two named choices cannot express it.
   * Without this the answer would collapse to "custom", which stores nothing,
   * and a date that had just been read off the public register would be
   * discarded on the way to the database.
   */
  if (typeof choice === "string" && /^\d{4}-\d{2}-\d{2}$/.test(choice)) {
    const parsed = new Date(`${choice}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && iso(parsed) === choice) return choice;
  }
  return null;
}

/**
 * The organisation columns for a wizard "Financial Year End" answer.
 *
 * Returns an empty object for "custom", so spreading it into a create leaves
 * both columns unset rather than writing a date the user never chose.
 */
export function financialYearColumnsFromChoice(
  choice: string | null | undefined,
  today: string
): { accountingPeriodStart?: Date; accountingPeriodEnd?: Date } {
  const endDate = financialYearEndFromChoice(choice, today);
  if (!endDate) return {};

  return financialYearColumns(endDate);
}

/**
 * The organisation columns for an explicit year end date.
 *
 * The start is the day after the previous year ended, so the two columns always
 * describe one whole year with no gap.
 */
export function financialYearColumns(
  endDateIso: string
): { accountingPeriodStart?: Date; accountingPeriodEnd?: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateIso)) return {};

  const end = new Date(`${endDateIso}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) return {};

  const startDate = addDays(addYears(endDateIso, -1), 1);
  return {
    accountingPeriodStart: new Date(`${startDate}T00:00:00.000Z`),
    accountingPeriodEnd: end,
  };
}

/** The next occurrence of a month/day on or after `today`. */
function rollForwardTo(today: string, month: number, day: number): string {
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  return candidate >= today ? candidate : `${year + 1}-${pad(month)}-${pad(day)}`;
}

/**
 * The accounting year running on `today`, rolled forward from a stored year end.
 *
 * A workspace set up in 2026 stores a 2026 year end; two years later that same
 * row must still describe the year the business is actually in.
 */
export function currentFinancialYear(
  storedYearEnd: Date | string | null | undefined,
  today: string
): FinancialYear | null {
  if (!storedYearEnd) return null;

  let endDate =
    typeof storedYearEnd === "string" ? storedYearEnd.slice(0, 10) : iso(storedYearEnd);

  while (endDate < today) endDate = addYears(endDate, 1);
  // More than a year ahead means the stored date was itself in the future; wind
  // back so the period contains today rather than starting after it.
  while (addYears(endDate, -1) >= today) endDate = addYears(endDate, -1);

  return { startDate: addDays(addYears(endDate, -1), 1), endDate };
}

/** The most recently completed accounting year — the one that gets filed. */
export function lastCompletedFinancialYear(
  storedYearEnd: Date | string | null | undefined,
  today: string
): FinancialYear | null {
  const current = currentFinancialYear(storedYearEnd, today);
  if (!current) return null;

  const endDate = addYears(current.endDate, -1);
  return { startDate: addDays(addYears(endDate, -1), 1), endDate };
}

/**
 * Corporation tax deadlines for an accounting period.
 *
 * Payment falls due nine months and one day after the period ends; the CT600
 * return is not due for a further three months. That order surprises people —
 * the money is owed long before the paperwork — which is exactly why it is
 * worth showing both.
 *
 * Companies with profits over £1.5m pay in quarterly instalments instead. That
 * is far beyond the businesses this product serves, and is not modelled.
 */
export function corporationTaxDates(periodEnd: string) {
  return {
    paymentDue: addDays(addMonths(periodEnd, 9), 1),
    returnDue: addMonths(periodEnd, 12),
  };
}

/**
 * The UK personal tax year containing `today`: 6 April to 5 April.
 */
export function currentTaxYear(today: string): FinancialYear & { label: string } {
  const year = Number(today.slice(0, 4));
  // On or before 5 April the tax year started the previous 6 April.
  const startYear = today <= `${year}-04-05` ? year - 1 : year;

  return {
    startDate: `${startYear}-04-06`,
    endDate: `${startYear + 1}-04-05`,
    label: `${startYear}/${String(startYear + 1).slice(2)}`,
  };
}

/**
 * Self assessment deadlines for the tax year ending on `taxYearEnd`.
 *
 * The online return and the balancing payment share 31 January. The second
 * payment on account lands the following 31 July.
 */
export function selfAssessmentDates(taxYearEnd: string) {
  const year = Number(taxYearEnd.slice(0, 4));
  return {
    returnDue: `${year + 1}-01-31`,
    balancingPaymentDue: `${year + 1}-01-31`,
    secondPaymentOnAccountDue: `${year + 1}-07-31`,
  };
}

export type ItsaQuarter = {
  /** 1 to 4. */
  index: number;
  startDate: string;
  endDate: string;
  dueDate: string;
};

/**
 * The four Making Tax Digital quarters of a tax year.
 *
 * They follow the tax year rather than the calendar: 6 April to 5 July, and so
 * on. Each update is due by the 7th of the month after the quarter ends, which
 * puts the deadlines on 7 August, 7 November, 7 February and 7 May — the dates
 * HMRC publishes.
 */
export function itsaQuarters(taxYearStart: string): ItsaQuarter[] {
  const startYear = Number(taxYearStart.slice(0, 4));

  return [0, 1, 2, 3].map((offset) => {
    const startIndex = startYear * 12 + 3 + offset * 3; // April is index 3.
    const endIndex = startIndex + 3;
    const dueIndex = endIndex + 1;

    const at = (index: number, day: number) =>
      `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-${pad(day)}`;

    return {
      index: offset + 1,
      startDate: at(startIndex, 6),
      endDate: at(endIndex, 5),
      dueDate: at(dueIndex, 7),
    };
  });
}

/**
 * The CIS return deadline that comes next.
 *
 * CIS runs on tax months ending the 5th, and the CIS300 for each is due by the
 * 19th of that month.
 */
export function nextCisReturnDue(today: string): { periodEnd: string; dueDate: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  // Before the 19th the current month's return is still open; after it, the
  // next one is.
  const shift = today <= `${year}-${pad(month)}-19` ? 0 : 1;
  const index = (year * 12 + (month - 1)) + shift;
  const dueYear = Math.floor(index / 12);
  const dueMonth = (index % 12) + 1;

  return {
    periodEnd: `${dueYear}-${pad(dueMonth)}-05`,
    dueDate: `${dueYear}-${pad(dueMonth)}-19`,
  };
}

/**
 * Business structures, normalised.
 *
 * The onboarding wizard writes "ltd", "sole" and "llp"; the admin client-invite
 * flow writes "limited_company", "sole_trader", "partnership" and "charity".
 * Both go into the same column, so anything reading it has to accept both.
 */
export type BusinessStructure =
  | "limited_company"
  | "plc"
  | "cic"
  | "sole_trader"
  | "partnership"
  | "charity"
  | "other";

export function normaliseBusinessStructure(
  value: string | null | undefined
): BusinessStructure | null {
  switch (value) {
    case "ltd":
    case "limited_company":
      return "limited_company";
    case "plc":
    case "public_limited_company":
      return "plc";
    case "cic":
    case "community_interest_company":
      return "cic";
    case "sole":
    case "sole_trader":
      return "sole_trader";
    case "llp":
    case "partnership":
      return "partnership";
    case "charity":
      return "charity";
    case "other":
      return "other";
    default:
      return null;
  }
}

/**
 * Companies pay corporation tax; the self-employed pay income tax.
 *
 * A PLC and a community interest company are both companies registered at
 * Companies House and both within the charge to corporation tax — a CIC has no
 * charitable exemption, which is the usual thing people expect it to have.
 *
 * A charity is deliberately neither: charitable income is largely exempt, and
 * whether any corporation tax is due turns on non-charitable trading that
 * nothing here can infer. Answering "no" is the safe half of that, since
 * inventing a corporation tax liability for a charity would be worse than
 * leaving it to be recorded deliberately.
 *
 * "Other" is likewise neither, because it says nothing about what the business
 * is.
 */
export function paysCorporationTax(structure: BusinessStructure | null): boolean {
  return structure === "limited_company" || structure === "plc" || structure === "cic";
}

export function paysSelfAssessment(structure: BusinessStructure | null): boolean {
  return structure === "sole_trader" || structure === "partnership";
}
