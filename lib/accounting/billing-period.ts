import { addDays, addMonths, differenceInCalendarDays } from "date-fns";

/**
 * Deterministic date engine for invoice service/billing periods.
 *
 * Everything here is pure calendar arithmetic on ISO `yyyy-mm-dd` strings —
 * no clocks, no timezones, no Date.now. Callers pass every date in, so the
 * same inputs always produce the same findings regardless of where or when
 * they run.
 */

export type BillingPeriodUnit = "week" | "month" | "day";

export type BillingPeriodPreset = {
  id: string;
  label: string;
  unit: BillingPeriodUnit;
  count: number;
};

/**
 * The supported period presets. Weeks are exactly 7×n days; a calendar month
 * follows month arithmetic (31 Jan + 1 month clamps to end of February).
 * Custom N-day periods use unit "day" with the count typed by the user.
 */
export const BILLING_PERIOD_PRESETS: readonly BillingPeriodPreset[] = [
  { id: "1w", label: "1 week", unit: "week", count: 1 },
  { id: "2w", label: "2 weeks", unit: "week", count: 2 },
  { id: "4w", label: "4 weeks", unit: "week", count: 4 },
  { id: "5w", label: "5 weeks", unit: "week", count: 5 },
  { id: "6w", label: "6 weeks", unit: "week", count: 6 },
  { id: "1m", label: "1 calendar month", unit: "month", count: 1 },
];

export function isBillingPeriodUnit(value: unknown): value is BillingPeriodUnit {
  return value === "week" || value === "month" || value === "day";
}

/** "4 weeks", "1 calendar month", "12 days" — for warnings and labels. */
export function billingPeriodLabel(unit: BillingPeriodUnit, count: number): string {
  if (unit === "month") return count === 1 ? "1 calendar month" : `${count} calendar months`;
  const noun = unit === "week" ? "week" : "day";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Parsed at local midnight from parts (never via the Date-string parser, whose
// ISO handling is UTC and shifts the calendar day west of Greenwich). Only
// calendar arithmetic happens on the result, so the clock time is irrelevant.
function parseIso(value: string): Date {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** ISO date + n calendar days, as ISO. */
export function addIsoDays(date: string, days: number): string {
  return toIso(addDays(parseIso(date), days));
}

/**
 * The inclusive end date of a period starting at `start`:
 * - weeks:  start + 7n − 1 days (a 1-week period starting Monday ends Sunday)
 * - months: addMonths(start, n) − 1 day (calendar month, clamped at month end)
 * - days:   start + n − 1 days
 */
export function calculatePeriodEnd(
  start: string,
  unit: BillingPeriodUnit,
  count: number
): string {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Period count must be a positive integer, got ${count}.`);
  }
  const startDate = parseIso(start);
  if (unit === "week") return toIso(addDays(startDate, count * 7 - 1));
  if (unit === "month") return toIso(addDays(addMonths(startDate, count), -1));
  return toIso(addDays(startDate, count - 1));
}

/** The end date the selected rule implies for `start`. */
export function expectedEndFor(
  start: string,
  unit: BillingPeriodUnit,
  count: number
): string {
  return calculatePeriodEnd(start, unit, count);
}

export type BillingPeriodFinding =
  | {
      /** The entered end date does not match what the selected rule implies. */
      type: "mismatch";
      severity: "error";
      expectedEnd: string;
    }
  | {
      /** This period starts on or before the previous period's end. */
      type: "overlap";
      severity: "error";
      previousEnd: string;
      overlapDays: number;
    }
  | {
      /** Uncovered days between the previous period's end and this start. */
      type: "gap";
      severity: "warning";
      previousEnd: string;
      gapDays: number;
    };

export type ValidatePeriodInput = {
  start: string;
  end: string;
  unit: BillingPeriodUnit;
  count: number;
  /** The customer's previous invoice period end, when one exists. */
  previousEnd?: string | null;
};

/**
 * Non-blocking findings for a chosen period. Deterministic: the same inputs
 * always yield the same findings, in a stable order (mismatch, then
 * overlap/gap). Continuity (start = previousEnd + 1 day) yields nothing.
 */
export function validatePeriod(input: ValidatePeriodInput): BillingPeriodFinding[] {
  const findings: BillingPeriodFinding[] = [];

  const expectedEnd = expectedEndFor(input.start, input.unit, input.count);
  if (input.end !== expectedEnd) {
    findings.push({ type: "mismatch", severity: "error", expectedEnd });
  }

  if (input.previousEnd) {
    const startDate = parseIso(input.start);
    const previousEndDate = parseIso(input.previousEnd);
    const daysAfterPreviousEnd = differenceInCalendarDays(startDate, previousEndDate);
    if (daysAfterPreviousEnd <= 0) {
      findings.push({
        type: "overlap",
        severity: "error",
        previousEnd: input.previousEnd,
        overlapDays: 1 - daysAfterPreviousEnd,
      });
    } else if (daysAfterPreviousEnd > 1) {
      findings.push({
        type: "gap",
        severity: "warning",
        previousEnd: input.previousEnd,
        gapDays: daysAfterPreviousEnd - 1,
      });
    }
  }

  return findings;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "12 Sep 2026" — the format warnings and documents quote dates in. */
export function formatPeriodDate(iso: string): string {
  const date = parseIso(iso);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * "15 Aug – 11 Sep 2026" (year shown once when both dates share it,
 * "28 Dec 2026 – 3 Jan 2027" otherwise).
 */
export function formatPeriodRange(startIso: string, endIso: string): string {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  const startLabel =
    start.getFullYear() === end.getFullYear()
      ? `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}`
      : formatPeriodDate(startIso);
  return `${startLabel} – ${formatPeriodDate(endIso)}`;
}
