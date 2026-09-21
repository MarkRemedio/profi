import type { ChartAccountOption } from "@/lib/accounting/documents";

/**
 * What a workspace's purchase settings are before anybody saves them.
 *
 * These were written out three separate times — in the settings form's initial
 * state, in the read action's fallback, and again in the save action — while
 * the code that actually numbers documents knew about none of them.
 *
 * That is how a workspace could show "Next Bill Sequence No. 1001" on a page
 * where nothing had ever been saved, and then number its first bill BILL-1: the
 * page was displaying its own defaults, and the numbering, finding no row,
 * assumed there was no configured start at all.
 *
 * One definition, imported by all four.
 */
export const PURCHASE_SETTINGS_DEFAULTS = {
  billPrefix: "BILL-",
  nextBillNumber: "1001",
  claimPrefix: "EXP-",
  nextClaimNumber: "5001",
  defaultTerms: "30",
  defaultAmountType: "exclusive",
  requireApproval: false,
  lockClosedPeriods: false,
} as const;

export const PREFERRED_PURCHASE_ACCOUNT_CATEGORIES = [
  "cost_of_sales",
  "expense",
  "depreciation",
  "current_asset",
  "fixed_asset",
  "non_current_asset",
] as const;

function normalizeReportCategory(value: string | null | undefined) {
  return value?.toLowerCase() === "bank" ? "current_asset" : value?.toLowerCase() ?? "";
}

export function defaultPurchaseAccountId(
  accounts: Array<{ id: string; reportCategory?: string | null }>
) {
  for (const category of PREFERRED_PURCHASE_ACCOUNT_CATEGORIES) {
    const match = accounts.find((account) => normalizeReportCategory(account.reportCategory) === category);
    if (match) return match.id;
  }
  return accounts[0]?.id ?? "";
}

export function purchaseAccountLabel(
  accounts: Array<Pick<ChartAccountOption, "id" | "code" | "name">>,
  accountId: string
) {
  const account = accounts.find((item) => item.id === accountId);
  return account ? `${account.code} ${account.name}` : "";
}

/**
 * The starting number for a series, as a positive integer.
 *
 * Returns null for anything that is not usable — a blank field, a stray
 * "1,001", a negative. The caller then continues from whatever is already
 * saved rather than numbering a document from a value nobody meant.
 */
export function startingSequenceNumber(value: string | null | undefined): number | null {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}
