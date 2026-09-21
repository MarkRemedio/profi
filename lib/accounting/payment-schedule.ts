export type PaymentSchedule =
  | { type: "day_of_month"; day: number }
  | { type: "end_of_month"; day?: null }
  | { type: null; day?: null };

export type ReminderKind = "pre_due" | "due" | "overdue";

export function isOneTimeReminderKind(kind: ReminderKind): boolean {
  return kind === "pre_due" || kind === "due";
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Date must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date is not a valid calendar date.");
  }
  return { year, month, day };
}

function isoDate(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number): string {
  const parsed = parseIsoDate(value);
  return isoDate(parsed.year, parsed.month - 1, parsed.day + days);
}

/**
 * Next agreed payment date on or after the invoice issue date.
 *
 * Days are capped at 28 by validation, so "day N" exists in every month. End
 * of month is calculated from the calendar rather than as a fixed day count.
 */
export function nextScheduledDueDate(issueDate: string, schedule: PaymentSchedule): string | null {
  if (!schedule.type) return null;
  const { year, month, day: issueDay } = parseIsoDate(issueDate);

  if (schedule.type === "end_of_month") {
    return isoDate(year, month, 0);
  }

  if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 28) {
    throw new Error("Payment day must be between 1 and 28.");
  }
  const monthIndex = issueDay <= schedule.day ? month - 1 : month;
  return isoDate(year, monthIndex, schedule.day);
}

/** Select the automatic message due today; null means no scheduled action. */
export function reminderKindForDate(today: string, dueDate: string): ReminderKind | null {
  parseIsoDate(today);
  parseIsoDate(dueDate);
  if (today === addUtcDays(dueDate, -3)) return "pre_due";
  if (today === dueDate) return "due";
  if (today > dueDate) return "overdue";
  return null;
}

export function paymentScheduleLabel(schedule: PaymentSchedule): string {
  if (schedule.type === "end_of_month") return "End of month";
  if (schedule.type === "day_of_month") return `Day ${schedule.day} of each month`;
  return "No agreed payment day";
}
