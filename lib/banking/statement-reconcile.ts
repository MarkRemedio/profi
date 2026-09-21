/**
 * Balance gate. Pure integer arithmetic on minor units.
 *
 * An extraction that cannot be proved against the statement's own figures does
 * not enter the ledger. This is what makes fully-automatic extraction safe: a
 * dropped row or a misread column changes the total, and the total is checked.
 */
import { parseAmount, type ParsedTransaction } from "@/lib/banking/column-mapping";
import type { StatementPlan } from "@/lib/banking/statement-analysis";
import { formatMoney } from "@/lib/currency";

export type ReconcileResult =
  /** Checked against the statement's own figures and correct. */
  | { status: "balanced"; method: "totals" | "runningBalance" | "movementTotals" }
  /** Checked and wrong. `diff` is (expected closing − derived closing), in pennies. */
  | { status: "mismatch"; method: "totals" | "runningBalance" | "movementTotals"; diff: number }
  /** No figures available to check against; needs an explicit user override. */
  | { status: "unverifiable"; reason: string };

export function netMovementMinor(transactions: ParsedTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.credit - t.debit, 0);
}

/**
 * Resolution order:
 *   1. opening + credits − debits === closing
 *   2. each row's running balance follows from the row above
 *   3. printed movement totals match extracted credits/debits
 *   4. neither available → unverifiable
 */
export function reconcile(
  plan: StatementPlan,
  transactions: ParsedTransaction[]
): ReconcileResult {
  const hasOpening = plan.openingBalance !== null && plan.openingBalance.trim() !== "";
  const hasClosing = plan.closingBalance !== null && plan.closingBalance.trim() !== "";

  if (hasOpening && hasClosing) {
    const opening = parseAmount(plan.openingBalance as string);
    const closing = parseAmount(plan.closingBalance as string);
    const derived = opening + netMovementMinor(transactions);
    const diff = closing - derived;
    return diff === 0
      ? { status: "balanced", method: "totals" }
      : { status: "mismatch", method: "totals", diff };
  }

  // Fallback: the running balance column must be self-consistent. Statements
  // may print transactions oldest-first (Barclays) or newest-first (Monzo), so
  // try the displayed order first, then the reverse order before rejecting.
  const running = checkRunningBalances(transactions) ?? checkRunningBalances([...transactions].reverse());
  if (running) return running;

  const hasMoneyIn = plan.totalMoneyIn !== null && plan.totalMoneyIn.trim() !== "";
  const hasMoneyOut = plan.totalMoneyOut !== null && plan.totalMoneyOut.trim() !== "";
  if (hasMoneyIn || hasMoneyOut) {
    const expectedIn = hasMoneyIn ? Math.abs(parseAmount(plan.totalMoneyIn as string)) : 0;
    const expectedOut = hasMoneyOut ? Math.abs(parseAmount(plan.totalMoneyOut as string)) : 0;
    const actualIn = transactions.reduce((sum, t) => sum + t.credit, 0);
    const actualOut = transactions.reduce((sum, t) => sum + t.debit, 0);
    const diff = (expectedIn - actualIn) + (expectedOut - actualOut);
    return diff === 0
      ? { status: "balanced", method: "movementTotals" }
      : { status: "mismatch", method: "movementTotals", diff };
  }

  return {
    status: "unverifiable",
    reason: "This statement has no opening/closing balance, usable running balance column, or printed movement totals we can verify against.",
  };
}

function checkRunningBalances(transactions: ParsedTransaction[]): ReconcileResult | null {
  const balances = transactions.map((t) => t.balance ?? null);
  const checkedLinks = balances.filter((b, i) => i > 0 && b !== null && balances[i - 1] !== null).length;
  if (checkedLinks < 2) return null;

  for (let i = 1; i < transactions.length; i++) {
    const prev = balances[i - 1];
    const curr = balances[i];
    if (prev === null || curr === null) continue;
    const movement = transactions[i].credit - transactions[i].debit;
    const diff = curr - (prev + movement);
    if (diff !== 0) return null;
  }
  return { status: "balanced", method: "runningBalance" };
}

/**
 * Human-readable amount for error messages, e.g. "£1,147.80".
 *
 * Delegates to the shared registry rather than carrying its own symbol table,
 * which knew only three currencies and rendered a peso or shilling amount as a
 * bare number with no symbol at all.
 */
export function formatMinor(minor: number, currency?: string | null): string {
  return formatMoney(Math.abs(minor), currency);
}
