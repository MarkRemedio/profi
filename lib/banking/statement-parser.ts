/**
 * Bank statement parsing. Output amounts are in MINOR units (pennies).
 *
 * CSV keeps the header-keyword mapping — the import modal lets the user remap
 * columns by hand, so heuristics are a starting point rather than a verdict.
 *
 * PDF goes through OCR → layout analysis → deterministic extraction → balance
 * gate. Nothing reaches the caller unless it reconciles against the statement's
 * own figures, or the caller explicitly overrides an unverifiable statement.
 */

import {
  applyMapping, applyMappingDetailed, parseCsvTable, suggestMapping,
  type ParsedTransaction,
} from "@/lib/banking/column-mapping";
import type { StatementPlan } from "@/lib/banking/statement-analysis";
import type { PlanSkippedRow } from "@/lib/banking/statement-plan";
import { formatMinor, type ReconcileResult } from "@/lib/banking/statement-reconcile";
import { DEFAULT_CURRENCY } from "@/lib/currency";

export type { ParsedTransaction };

export type StatementFailureCode =
  | "NotAStatement"
  | "NoLedgerFound"
  | "ReconciliationFailed"
  | "Unverifiable"
  | "OcrUnavailable";

/** A parse failure the user can act on. Message is safe to display verbatim. */
export class StatementParseError extends Error {
  constructor(
    readonly code: StatementFailureCode,
    message: string,
    readonly details?: {
      diff?: number;
      extracted?: number;
      /**
       * Rows that were extracted safely but could not be verified against a
       * balance. The import UI can show these rows and accept a deliberate
       * manual override without sending the file through OCR again.
       */
      unverifiedResult?: Omit<StatementResult, "verification">;
    }
  ) {
    super(message);
    this.name = "StatementParseError";
  }
}

export type StatementResult = {
  transactions: ParsedTransaction[];
  currency: string;
  /** How the figures were verified. "override" means the user vouched for them. */
  verification: "totals" | "runningBalance" | "movementTotals" | "override";
  /** Which extraction path produced these rows. */
  path: "plan" | "direct" | "csv";
  /** Date printed on the statement, when it prints one. */
  statementDate: string | null;
  statementPeriod: { start: string; end: string } | null;
  diagnostics: StatementDiagnostics;
};

export type StatementDiagnostics = {
  pagesScanned: number;
  tablesFound: number;
  rowsFound: number;
  ledgerTableIndexes: number[];
  attemptedRows: number;
  importedRows: number;
  skippedRows: StatementSkippedRow[];
};

export type StatementSkippedRow = {
  reason: PlanSkippedRow["reason"];
  tableIndex: number;
  rowIndex: number;
  rawDate: string;
  rawCells: string[];
};

export function parseCsv(bytes: Buffer | Uint8Array): ParsedTransaction[] {
  const table = parseCsvTable(bytes);
  return applyMapping(table, suggestMapping(table.headers));
}

export type ParseStatementOptions = {
  /**
   * Import a statement whose figures could not be checked automatically. Only
   * bypasses the "Unverifiable" outcome — a statement that actively fails to
   * reconcile is never importable.
   */
  allowUnverified?: boolean;
  /**
   * Currency to assume when the statement itself does not state one — a CSV
   * carries no such metadata. Callers pass the currency of the bank account the
   * statement is being imported into; sterling was only ever right for a UK
   * workspace banking in sterling.
   */
  defaultCurrency?: string;
};

export async function parseStatement(
  filename: string,
  bytes: Buffer | Uint8Array,
  options: ParseStatementOptions = {}
): Promise<StatementResult> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return parsePdfStatement(filename, bytes, options);
  if (ext === "csv" || ext === "txt") {
    const table = parseCsvTable(bytes);
    const mapped = applyMappingDetailed(table, suggestMapping(table.headers));
    return {
      transactions: mapped.transactions,
      currency: options.defaultCurrency ?? DEFAULT_CURRENCY,
      verification: "override",
      path: "csv",
      statementDate: null,
      statementPeriod: null,
      diagnostics: {
        pagesScanned: 0,
        tablesFound: 1,
        rowsFound: table.rows.length,
        ledgerTableIndexes: [0],
        attemptedRows: table.rows.length,
        importedRows: mapped.transactions.length,
        skippedRows: mapped.skippedRows.map((row) => ({
          reason: row.reason,
          tableIndex: 0,
          rowIndex: table.rows.indexOf(row.rawCells),
          rawDate: row.rawDate,
          rawCells: row.rawCells,
        })),
      },
    };
  }
  throw new Error(`Unsupported file type: .${ext}. Upload a PDF or CSV.`);
}

async function parsePdfStatement(
  filename: string,
  bytes: Buffer | Uint8Array,
  options: ParseStatementOptions
): Promise<StatementResult> {
  const { ocrPdf } = await import("@/lib/banking/mistral-ocr");
  const { analyzeStatement, extractTransactionsDirectly } = await import("@/lib/banking/statement-analysis");
  const { applyPlanDetailed } = await import("@/lib/banking/statement-plan");
  const { reconcile } = await import("@/lib/banking/statement-reconcile");

  let ocr: Awaited<ReturnType<typeof ocrPdf>>;
  let plan: StatementPlan;
  try {
    ocr = await ocrPdf(bytes, filename);
    plan = await analyzeStatement(ocr.markdown, ocr.tables, options.defaultCurrency);
  } catch (err) {
    console.error("[banking] statement OCR/analysis failed:", err);
    throw new StatementParseError(
      "OcrUnavailable",
      "Statement scanning is unavailable right now. Please try again, or import a CSV instead."
    );
  }

  if (!plan.isBankStatement) {
    throw new StatementParseError(
      "NotAStatement",
      plan.rejectReason?.trim() ||
        "This document doesn't look like a bank statement — no transaction ledger was found."
    );
  }

  type Candidate = {
    path: "plan" | "direct";
    transactions: ParsedTransaction[];
    result: ReconcileResult;
    diagnostics: StatementDiagnostics;
  };

  // Path A: the model described the layout, we do the arithmetic.
  const planned = applyPlanDetailed(ocr.tables, plan);
  const candidates: Candidate[] = [
    {
      path: "plan",
      transactions: planned.transactions,
      result: reconcile(plan, planned.transactions),
      diagnostics: diagnosticsFromPlan(ocr, plan, planned),
    },
  ];

  // Path B: only when A produced nothing usable or failed to balance.
  if (planned.transactions.length === 0 || candidates[0].result.status === "mismatch") {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Direct extraction timed out after 40s")), 40000)
      );
      const direct = await Promise.race([
        extractTransactionsDirectly(ocr.markdown, plan, ocr.pageMarkdowns),
        timeoutPromise,
      ]);
      if (direct.length > 0) {
        candidates.push({
          path: "direct",
          transactions: direct,
          result: reconcile(plan, direct),
          diagnostics: {
            ...diagnosticsFromPlan(ocr, plan, planned),
            attemptedRows: 0,
            importedRows: direct.length,
            skippedRows: [],
          },
        });
      }
    } catch (err) {
      console.warn("[banking] direct extraction fallback bypassed:", err instanceof Error ? err.message : err);
    }
  }

  const best = pickCandidate(candidates);
  if (!best) {
    throw new StatementParseError(
      "NoLedgerFound",
      "Couldn't find any transactions in this document."
    );
  }

  const extractedResult = {
    transactions: best.transactions,
    currency: plan.currency,
    path: best.path,
    statementDate: plan.statementDate,
    statementPeriod: plan.statementPeriod,
    diagnostics: { ...best.diagnostics, importedRows: best.transactions.length },
  };

  try {
    return {
      ...extractedResult,
      verification: verificationOf(best.result, best.transactions.length, plan, options),
    };
  } catch (err) {
    // An unverifiable statement still has a usable, safely extracted preview.
    // Preserve it so accepting the user's manual check does not repeat OCR.
    if (err instanceof StatementParseError && err.code === "Unverifiable") {
      throw new StatementParseError(err.code, err.message, {
        ...err.details,
        unverifiedResult: extractedResult,
      });
    }
    throw err;
  }
}

function diagnosticsFromPlan(
  ocr: { pageCount: number; tables: { rows: string[][] }[] },
  plan: StatementPlan,
  planned: { transactions: ParsedTransaction[]; skippedRows: PlanSkippedRow[]; attemptedRows: number }
): StatementDiagnostics {
  return {
    pagesScanned: ocr.pageCount,
    tablesFound: ocr.tables.length,
    rowsFound: ocr.tables.reduce((sum, table) => sum + table.rows.length, 0),
    ledgerTableIndexes: plan.ledgerTableIndexes,
    attemptedRows: planned.attemptedRows,
    importedRows: planned.transactions.length,
    skippedRows: planned.skippedRows.map((row) => ({
      reason: row.reason,
      tableIndex: row.tableIndex,
      rowIndex: row.rowIndex,
      rawDate: row.rawDate,
      rawCells: row.rawCells,
    })),
  };
}

/**
 * Prefer an extraction that balances; failing that, one that at least produced
 * rows — a mismatch we can quantify is far more useful to the user than
 * "found nothing", and it still blocks the import.
 */
function pickCandidate<T extends { transactions: unknown[]; result: ReconcileResult }>(
  candidates: T[]
): T | null {
  const withRows = candidates.filter((c) => c.transactions.length > 0);
  return (
    withRows.find((c) => c.result.status === "balanced") ??
    withRows.find((c) => c.result.status === "unverifiable") ??
    withRows[0] ??
    null
  );
}

/** Turn a reconcile outcome into a verification label, or throw. */
function verificationOf(
  result: ReconcileResult,
  extracted: number,
  plan: StatementPlan,
  options: ParseStatementOptions
): StatementResult["verification"] {
  if (result.status === "balanced") return result.method;

  if (result.status === "mismatch") {
    const direction = result.diff > 0 ? "short of" : "over";
    const target = result.method === "movementTotals"
      ? "the statement's printed movement totals"
      : "the statement's closing balance";
    throw new StatementParseError(
      "ReconciliationFailed",
      `Extracted ${extracted} transaction${extracted === 1 ? "" : "s"}, but they're ` +
        `${formatMinor(result.diff, plan.currency)} ${direction} ${target}. ` +
        `Nothing was imported.`,
      { diff: result.diff, extracted }
    );
  }

  if (options.allowUnverified) return "override";
  throw new StatementParseError("Unverifiable", result.reason, { extracted });
}
