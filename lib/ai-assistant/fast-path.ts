import "server-only";

import type { AccountingWorkspace } from "@/lib/accounting/dal";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { formatMoney, toCurrencyCode } from "@/lib/currency";

import { executeAiTool } from "./tools";
import type { AiCitation } from "./types";
import type { AiDataArea } from "./permissions";

type FastAnswer = { content: string; citations: AiCitation[]; route: string };

/**
 * The shared formatter, so an assistant answer reads the way the rest of the
 * product does. Formatting every currency through the en-GB locale printed a
 * yen figure with sterling grouping and two decimals it does not have.
 */
function money(minor: number, currency: string) {
  return formatMoney(minor, toCurrencyCode(currency));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function tryFastWorkspaceAnswer(input: {
  workspace: AccountingWorkspace;
  allowedAreas: readonly AiDataArea[];
  baseCurrency: string;
  question: string;
}): Promise<FastAnswer | null> {
  const normalized = input.question.toLowerCase().replace(/[^a-z0-9£$€]+/g, " ").trim(); // currency:allow a character class, not an amount — keeps currency signs out of the stripped text

  if (/\boverdue invoices?\b|\binvoices?\b.*\boverdue\b/.test(normalized)) {
    const result = await executeAiTool({ organizationId: input.workspace.organizationId, allowedAreas: input.allowedAreas, name: "list_invoices", argumentsJson: JSON.stringify({ search: null, status: null, overdue_only: true, limit: 10 }) });
    if (!Array.isArray(result.data)) return null;
    const rows = result.data.map(record);
    if (!rows.length) return { content: "You have **no overdue customer invoices** right now.", citations: [], route: "overdue_invoices" };
    const lines = rows.map((row) => `- **${String(row.invoiceNo)}** — ${String(row.customer)}: ${money(Number(row.baseTotalMinor), input.baseCurrency)} (due ${String(row.dueDate ?? "date unavailable")})`);
    return { content: `You have **${rows.length}${rows.length === 10 ? "+" : ""} overdue customer invoice${rows.length === 1 ? "" : "s"}**:\n\n${lines.join("\n")}\n\nOpen a source below to review or follow up.`, citations: result.citations, route: "overdue_invoices" };
  }

  if (/\bwho owes me (the )?most\b|\btop (customer|debtor)s?\b/.test(normalized)) {
    const result = await executeAiTool({ organizationId: input.workspace.organizationId, allowedAreas: input.allowedAreas, name: "list_contact_balances", argumentsJson: JSON.stringify({ kind: "customer", limit: 5 }) });
    if (!Array.isArray(result.data)) return null;
    const rows = result.data.map(record);
    if (!rows.length) return { content: "There are **no outstanding approved or sent customer invoices** right now.", citations: [], route: "customer_balances" };
    const lines = rows.map((row, index) => `${index + 1}. **${String(row.name)}** — ${money(Number(row.outstandingBaseMinor), input.baseCurrency)}`);
    return { content: `Customers with the largest outstanding balances:\n\n${lines.join("\n")}\n\nThese totals use unpaid approved or sent invoices in ${input.baseCurrency}.`, citations: result.citations, route: "customer_balances" };
  }

  if (/\bwhy is my profit negative( this month)?\b|\bnegative profit this month\b/.test(normalized)) {
    const today = accountingToday();
    const start = `${today.slice(0, 7)}-01`;
    const result = await executeAiTool({ organizationId: input.workspace.organizationId, allowedAreas: input.allowedAreas, name: "get_financial_summary", argumentsJson: JSON.stringify({ start_date: start, end_date: today }) });
    const summary = record(result.data);
    if (typeof summary.profitMinor !== "number") return null;
    const profit = Number(summary.profitMinor);
    const drivers = Array.isArray(summary.largestRevenueAndExpenseAccounts) ? summary.largestRevenueAndExpenseAccounts.map(record) : [];
    const expenses = drivers.filter((row) => row.accountType === "expense").slice(0, 3);
    const driverText = expenses.length ? `\n\nLargest expense accounts:\n${expenses.map((row) => `- **${String(row.accountName)}** — ${money(Number(row.balanceMinor), input.baseCurrency)}`).join("\n")}` : "";
    const conclusion = profit < 0 ? `Your expenses are higher than your revenue by **${money(Math.abs(profit), input.baseCurrency)}**` : `Your profit is **${money(profit, input.baseCurrency)}**, so it is not negative`;
    return { content: `${conclusion} for ${start} to ${today}.\n\n- Revenue: **${money(Number(summary.revenueMinor), input.baseCurrency)}**\n- Expenses: **${money(Number(summary.expenseMinor), input.baseCurrency)}**${driverText}\n\nUse the linked report and accounts to verify the entries behind these totals.`, citations: result.citations, route: "monthly_profit" };
  }

  if (/\bwhat makes up my (current )?vat (figure|return)\b|\bcurrent vat figure\b/.test(normalized)) {
    const result = await executeAiTool({ organizationId: input.workspace.organizationId, allowedAreas: input.allowedAreas, name: "get_vat_return", argumentsJson: JSON.stringify({ period_key: null }) });
    const vat = record(result.data);
    const boxes = record(vat.boxes);
    if (typeof boxes.box5 !== "number") return null;
    const sources = Array.isArray(vat.sources) ? vat.sources.map(record) : [];
    const sourceText = sources.length ? `\n\nMain sources:\n${sources.slice(0, 5).map((row) => `- **${String(row.label)}** — output VAT ${money(Number(row.outputVatMinor), input.baseCurrency)}, input VAT ${money(Number(row.inputVatMinor), input.baseCurrency)}`).join("\n")}` : "";
    return { content: `Your current VAT figure is built from:\n\n- VAT due on sales (Box 1): **${money(Number(boxes.box1), input.baseCurrency)}**\n- VAT reclaimed on purchases (Box 4): **${money(Number(boxes.box4), input.baseCurrency)}**\n- Net VAT (Box 5): **${money(Number(boxes.box5), input.baseCurrency)}**${sourceText}\n\nReview the linked VAT return before filing. This is general guidance, not tax advice.`, citations: result.citations, route: "current_vat" };
  }

  if (/\bhow (do|can) i reconcile\b|\breconcile (a )?(bank )?transaction\b/.test(normalized)) {
    const result = await executeAiTool({ organizationId: input.workspace.organizationId, allowedAreas: input.allowedAreas, name: "get_task_guide", argumentsJson: JSON.stringify({ task: "reconcile_transaction" }) });
    const guide = record(result.data);
    if (!Array.isArray(guide.steps)) return null;
    return { content: `### ${String(guide.title)}\n\n${guide.steps.map((step, index) => `${index + 1}. ${String(step)}`).join("\n")}\n\nReview the amount, direction, date and counterparty before accepting a match.`, citations: result.citations, route: "reconcile_guide" };
  }

  return null;
}
