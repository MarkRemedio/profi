/**
 * UK VAT return periods.
 *
 * Pure date arithmetic with no database, so the period a figure belongs to can
 * be tested without a workspace and the same rule is applied on every screen
 * rather than re-derived each time.
 *
 * Once a workspace is authorised for Making Tax Digital these come from HMRC,
 * which is the only authority on which periods a business actually owes. Until
 * then they are derived from the workspace's own filing frequency and year end
 * — which is what HMRC allocates a stagger from in the first place, so the
 * derived dates usually match. The UI says they are derived; it must not
 * present them as an obligation HMRC has confirmed.
 */

export type VatFrequency = "monthly" | "quarterly" | "annual";

export type VatPeriodStatus =
  /** Has not started yet. */
  | "future"
  /** Running now — the figures are still moving. */
  | "open"
  /** Ended; the return is not yet due. */
  | "due"
  /** Past its due date. */
  | "overdue";

export type VatPeriod = {
  /**
   * The period end date. HMRC identifies an obligation by its period, and the
   * end is the part that stays unique across frequencies and staggers.
   */
  key: string;
  /** "Jan–Mar 2026" — for display only, never parsed back. */
  label: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  status: VatPeriodStatus;
  /** Days until the return is due. Negative once the date has passed. */
  daysToDue: number;
};

const MONTHS_IN: Record<VatFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

export const VAT_FREQUENCIES: VatFrequency[] = ["monthly", "quarterly", "annual"];

export function isVatFrequency(value: unknown): value is VatFrequency {
  return typeof value === "string" && VAT_FREQUENCIES.includes(value as VatFrequency);
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                               */
/*                                                                            */
/* Everything is done in UTC on yyyy-mm-dd strings. VAT periods are whole      */
/* months, so month-index arithmetic avoids the end-of-month traps that come   */
/* from adding days to a Date.                                                */
/* -------------------------------------------------------------------------- */

const pad = (value: number) => String(value).padStart(2, "0");

const monthIndex = (year: number, month: number) => year * 12 + (month - 1);
const yearOf = (index: number) => Math.floor(index / 12);
const monthOf = (index: number) => (index % 12) + 1;

function firstDayOfMonth(index: number): string {
  return `${yearOf(index)}-${pad(monthOf(index))}-01`;
}

function lastDayOfMonth(index: number): string {
  const year = yearOf(index);
  const month = monthOf(index);
  // Day 0 of the next month is the last day of this one, leap years included.
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Add whole calendar months, clamping to the end of the target month.
 *
 * 31 January plus one month is 28 February, not 3 March — which is what
 * `setUTCMonth` alone would give and would move a due date into the wrong week.
 */
function addCalendarMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

const monthName = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00.000Z`)
  );

const yearName = (iso: string) => iso.slice(0, 4);

/**
 * The return deadline for a period ending on `endDate`.
 *
 * Standard and cash accounting: one calendar month and seven days after the
 * period ends. Because a VAT period always ends on the last day of a month,
 * that always lands on the 7th of the month after next — 30 September is due
 * 7 November, matching HMRC's published quarterly dates.
 *
 * Adding a month to the date itself would clamp 30 September to 30 October and
 * make the deadline 6 November: a day early on every quarter that ends in a
 * 30-day month, which is half of them.
 *
 * The annual accounting scheme gets two months instead, taken literally from
 * the period end date.
 */
export function vatDueDate(endDate: string, frequency: VatFrequency): string {
  if (frequency === "annual") return addCalendarMonths(endDate, 2);

  const index =
    monthIndex(Number(endDate.slice(0, 4)), Number(endDate.slice(5, 7))) + 2;
  return `${yearOf(index)}-${pad(monthOf(index))}-07`;
}

/**
 * Which month a VAT period ends on, taken from the workspace's financial year
 * end.
 *
 * HMRC normally aligns the stagger with the accounting year end, so a business
 * with a 31 March year end files quarters ending March, June, September and
 * December. With no year end recorded, December anchors the calendar quarters —
 * the commonest allocation, and the one HMRC gives by default.
 */
export function vatAnchorMonth(financialYearEnd: Date | string | null | undefined): number {
  if (!financialYearEnd) return 12;

  const iso =
    typeof financialYearEnd === "string"
      ? financialYearEnd
      : financialYearEnd.toISOString().slice(0, 10);

  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!Number.isInteger(month) || month < 1 || month > 12) return 12;

  // VAT periods always end on a month end, so a year end in the first days of a
  // month belongs to the month before. The 5 April tax year end — much the
  // commonest for sole traders — is stagger 1 (Mar/Jun/Sep/Dec), not April.
  if (day <= 5) return month === 1 ? 12 : month - 1;

  return month;
}

function statusFor(
  period: { startDate: string; endDate: string; dueDate: string },
  today: string
): VatPeriodStatus {
  if (today < period.startDate) return "future";
  if (today <= period.endDate) return "open";
  if (today <= period.dueDate) return "due";
  return "overdue";
}

function labelFor(startDate: string, endDate: string, frequency: VatFrequency): string {
  if (frequency === "monthly") return `${monthName(startDate)} ${yearName(startDate)}`;

  const sameYear = yearName(startDate) === yearName(endDate);
  if (sameYear) {
    return `${monthName(startDate)}–${monthName(endDate)} ${yearName(endDate)}`;
  }
  return `${monthName(startDate)} ${yearName(startDate)} – ${monthName(endDate)} ${yearName(endDate)}`;
}

function periodEndingAt(
  endIndex: number,
  frequency: VatFrequency,
  today: string
): VatPeriod {
  const step = MONTHS_IN[frequency];
  const startDate = firstDayOfMonth(endIndex - step + 1);
  const endDate = lastDayOfMonth(endIndex);
  const dueDate = vatDueDate(endDate, frequency);

  return {
    key: endDate,
    label: labelFor(startDate, endDate, frequency),
    startDate,
    endDate,
    dueDate,
    status: statusFor({ startDate, endDate, dueDate }, today),
    daysToDue: daysBetween(today, dueDate),
  };
}

/**
 * The period running today plus the ones before it, newest first.
 *
 * The running period is included because its figures are what a business checks
 * most often — the return it is about to owe — even though it cannot be filed
 * yet.
 */
export function vatPeriods(options: {
  frequency: VatFrequency;
  /** Month a period ends on, 1–12. See {@link vatAnchorMonth}. */
  anchorMonth: number;
  /** yyyy-mm-dd, in the accounting timezone. */
  today: string;
  /** How many completed periods to include behind the running one. */
  history?: number;
}): VatPeriod[] {
  const { frequency, anchorMonth, today, history = 5 } = options;
  const step = MONTHS_IN[frequency];

  let endIndex = monthIndex(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  // Walk forward to the first month that is a period boundary for this
  // frequency and stagger. Modulo in JS can be negative, hence the double mod.
  while ((((monthOf(endIndex) - anchorMonth) % step) + step) % step !== 0) {
    endIndex += 1;
  }

  const periods: VatPeriod[] = [];
  for (let back = 0; back <= history; back += 1) {
    periods.push(periodEndingAt(endIndex - back * step, frequency, today));
  }

  return periods;
}

/** The period a given date falls in, for the same frequency and stagger. */
export function vatPeriodContaining(options: {
  frequency: VatFrequency;
  anchorMonth: number;
  date: string;
  today: string;
}): VatPeriod {
  const { frequency, anchorMonth, date, today } = options;
  const step = MONTHS_IN[frequency];

  let endIndex = monthIndex(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  while ((((monthOf(endIndex) - anchorMonth) % step) + step) % step !== 0) {
    endIndex += 1;
  }

  return periodEndingAt(endIndex, frequency, today);
}
