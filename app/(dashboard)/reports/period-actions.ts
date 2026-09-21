"use server";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getCoreReports } from "@/lib/accounting/reports";

/**
 * Recompute the reports for a chosen period.
 *
 * The date range used to be applied in the browser, and only to the general
 * ledger. The profit and loss and the balance sheet were handed down already
 * computed for a fixed window, so changing the dates relabelled them —
 * "For the period 01/01/2026 to 01/02/2026" over figures covering the whole
 * year. A heading that asserts a period the numbers do not cover is worse than
 * no heading, because it is believed.
 *
 * Neither report can be narrowed client-side in any case. A profit and loss is
 * a sum over its period, and a balance sheet is every movement up to its date
 * including retained earnings from before the period began — none of which can
 * be recovered by filtering rows the server already aggregated.
 */
export async function getReportsForPeriod(startDate: string, endDate: string) {
  const { organizationId } = await requireAccountingWorkspace();

  /* Dates come from two date inputs, so they arrive as text. Anything that is
     not a plain yyyy-mm-dd is refused rather than interpolated into SQL that
     casts it to a date. */
  const isIsoDate = (value: unknown): value is string =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Choose a start and end date.");
  }

  if (startDate > endDate) {
    throw new Error("The start date has to come before the end date.");
  }

  const reports = await getCoreReports(organizationId, { startDate, endDate });

  /* Only what the period changes. The account list and the workspace name do
     not move with the dates, and re-sending them would be a larger payload for
     no reason. */
  return {
    period: reports.period,
    trialBalance: reports.trialBalance,
    profitAndLoss: reports.profitAndLoss,
    balanceSheet: reports.balanceSheet,
    retainedEarningsMinor: reports.retainedEarningsMinor,
    generalLedger: reports.generalLedger,
  };
}
