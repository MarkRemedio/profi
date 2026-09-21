import type { StatementRow, TrialBalanceRow } from "@/lib/accounting/reports";

export type ReportValidation = {
  trialBalanceBalanced: boolean;
  trialBalanceDebitTotal: number;
  trialBalanceCreditTotal: number;
  balanceSheetBalanced: boolean;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netProfitTiesToBalanceSheet: boolean;
  netProfit: number;
  currentYearEarnings: number;
  /** Profit from before this period. Part of equity, though no account holds it. */
  retainedEarnings: number;
};

/**
 * @param retainedEarningsMinor  Profit earned before this period. Equity is
 *   short by exactly this without it, because the ledger keeps profit in
 *   revenue and expense accounts until a year-end close moves it — and nothing
 *   in the product runs one.
 */
export function validateReports(
  trialBalance: TrialBalanceRow[],
  profitAndLoss: StatementRow[],
  balanceSheet: StatementRow[],
  netProfitMinor: number,
  retainedEarningsMinor = 0
): ReportValidation {
  const trialDebit = trialBalance.reduce((s, r) => s + r.debitMinor, 0);
  const trialCredit = trialBalance.reduce((s, r) => s + r.creditMinor, 0);

  const assets = balanceSheet
    .filter((r) => r.accountType === "asset")
    .reduce((s, r) => s + r.balanceMinor, 0);
  const liabilities = balanceSheet
    .filter((r) => r.accountType === "liability")
    .reduce((s, r) => s + r.balanceMinor, 0);
  const equity = balanceSheet
    .filter((r) => r.accountType === "equity")
    .reduce((s, r) => s + r.balanceMinor, 0);

  const netProfit = profitAndLoss.reduce((s, r) => {
    if (
      r.reportCategory === "cost_of_sales" ||
      r.reportCategory === "expense" ||
      r.reportCategory === "depreciation"
    ) {
      return s - r.balanceMinor;
    }
    return s + r.balanceMinor;
  }, 0);

  return {
    trialBalanceBalanced: trialDebit === trialCredit,
    trialBalanceDebitTotal: trialDebit,
    trialBalanceCreditTotal: trialCredit,
    balanceSheetBalanced:
      assets === liabilities + equity + retainedEarningsMinor + netProfitMinor,
    totalAssets: assets,
    totalLiabilities: liabilities,
    totalEquity: equity + retainedEarningsMinor + netProfitMinor,
    netProfitTiesToBalanceSheet: Math.abs(netProfit - netProfitMinor) < 1,
    netProfit,
    currentYearEarnings: netProfitMinor,
    retainedEarnings: retainedEarningsMinor,
  };
}