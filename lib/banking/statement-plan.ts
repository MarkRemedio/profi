/**
 * Execute a StatementPlan over OCR'd tables. Pure — no I/O, no model calls.
 *
 * Every amount here comes verbatim from an OCR'd cell; the plan only says which
 * cell to read. Output amounts are in MINOR units (pennies).
 */
import {
  applyMappingDetailed,
  parseAmount,
  type ColumnMapping,
  type ColumnRole,
  type DateContext,
  type ParsedTransaction,
  type RawCsvTable,
  type SkippedStatementRow,
} from "@/lib/banking/column-mapping";
import type { StatementPlan } from "@/lib/banking/statement-analysis";

export type PlanSkippedRow = SkippedStatementRow & {
  tableIndex: number;
  rowIndex: number;
};

export type ApplyPlanResult = {
  transactions: ParsedTransaction[];
  skippedRows: PlanSkippedRow[];
  attemptedRows: number;
};

/** Build a per-column role array from the plan's column indexes. */
export function mappingFromPlan(plan: StatementPlan, columnCount: number): ColumnMapping {
  const roles: ColumnMapping = Array.from({ length: columnCount }, () => "ignore" as ColumnRole);
  const assign = (index: number | null, role: ColumnRole) => {
    if (index !== null && index >= 0 && index < columnCount) roles[index] = role;
  };

  assign(plan.columns.date, "date");
  assign(plan.columns.description, "description");

  if (plan.signConvention === "separateColumns" && (plan.columns.debit !== null || plan.columns.credit !== null)) {
    assign(plan.columns.debit, "debit");
    assign(plan.columns.credit, "credit");
  } else {
    // One signed column. applyMapping's "amount" role already splits it:
    // negative becomes money out, positive money in.
    assign(plan.columns.amount ?? plan.columns.debit ?? plan.columns.credit, "amount");
  }

  return roles;
}

/**
 * Apply the plan to every ledger table the analysis identified.
 *
 * Rows carrying a date but no movement are dropped: OCR'd ledgers include
 * opening, closing and brought-forward marker lines that look like transactions
 * but represent no money moving.
 */
export function applyPlan(tables: RawCsvTable[], plan: StatementPlan): ParsedTransaction[] {
  return applyPlanDetailed(tables, plan).transactions;
}

export function applyPlanDetailed(tables: RawCsvTable[], plan: StatementPlan): ApplyPlanResult {
  const dateContext: DateContext | undefined = plan.statementPeriod
    ? { periodStart: plan.statementPeriod.start, periodEnd: plan.statementPeriod.end }
    : undefined;

  const out: ParsedTransaction[] = [];
  const skippedRows: PlanSkippedRow[] = [];
  let attemptedRows = 0;
  for (const index of plan.ledgerTableIndexes) {
    const table = tables[index];
    if (!table) continue;

    const mapping = mappingFromPlan(plan, table.headers.length);
    if (!mapping.includes("date")) continue;
    if (!mapping.includes("debit") && !mapping.includes("credit") && !mapping.includes("amount")) continue;

    attemptedRows += table.rows.length;
    const applied = applyMappingDetailed(table, mapping, {
      dateContext,
      fillDown: plan.dateFillDown || hasBlankDateMovementRows(table, mapping),
      balanceColumn: plan.columns.balance ?? undefined,
      skipZeroMovement: true,
    });
    out.push(...applied.transactions);
    skippedRows.push(
      ...applied.skippedRows.map((row) => ({
        ...row,
        tableIndex: index,
        rowIndex: table.rows.indexOf(row.rawCells),
      }))
    );
  }
  return { transactions: out, skippedRows, attemptedRows };
}

function hasBlankDateMovementRows(table: RawCsvTable, mapping: ColumnMapping): boolean {
  const dateCol = mapping.findIndex((role) => role === "date");
  const debitCol = mapping.findIndex((role) => role === "debit");
  const creditCol = mapping.findIndex((role) => role === "credit");
  const amountCol = mapping.findIndex((role) => role === "amount");

  return table.rows.some((cells) => {
    const rawDate = dateCol >= 0 ? (cells[dateCol] ?? "").trim() : "";
    if (rawDate !== "") return false;
    return (
      parseAmount(debitCol >= 0 ? cells[debitCol] ?? "" : "") !== 0 ||
      parseAmount(creditCol >= 0 ? cells[creditCol] ?? "" : "") !== 0 ||
      parseAmount(amountCol >= 0 ? cells[amountCol] ?? "" : "") !== 0
    );
  });
}
