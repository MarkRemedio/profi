/**
 * Per-document statement analysis (server-only).
 *
 * The model is asked for a *layout plan* — which table holds the ledger, which
 * column is which, what period the statement covers — never for the amounts
 * themselves. Deterministic code then executes that plan over the OCR'd cells
 * (see ./statement-plan), so no figure that reaches the ledger is ever retyped
 * by a language model.
 *
 * `extractTransactionsDirectly` is the fallback for documents whose layout the
 * plan can't express. It DOES have the model produce amounts, which is why its
 * output is subject to the same reconciliation gate as everything else.
 */
import "server-only";

import type { ParsedTransaction, RawCsvTable } from "@/lib/banking/column-mapping";
import { DEFAULT_CURRENCY } from "@/lib/currency";

const ANALYSIS_MODEL = process.env.MISTRAL_ANALYSIS_MODEL ?? "mistral-small-latest";
const EXTRACTION_MODEL = process.env.MISTRAL_EXTRACTION_MODEL ?? "mistral-small-latest";

export type StatementColumns = {
  date: number;
  description: number;
  debit: number | null;
  credit: number | null;
  /** Single signed column, used when debit/credit are absent. */
  amount: number | null;
  balance: number | null;
};

export type StatementPlan = {
  isBankStatement: boolean;
  rejectReason: string | null;
  currency: string;
  /** The date printed on the statement itself ("Statement date 08 Apr 2026"). */
  statementDate: string | null;
  statementPeriod: { start: string; end: string } | null;
  openingBalance: string | null;
  closingBalance: string | null;
  totalMoneyIn: string | null;
  totalMoneyOut: string | null;
  ledgerTableIndexes: number[];
  columns: StatementColumns;
  dateHasYear: boolean;
  dateFillDown: boolean;
  signConvention: "separateColumns" | "signedAmount" | "negativeIsDebit";
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isBankStatement", "rejectReason", "currency", "statementDate", "statementPeriod",
    "openingBalance", "closingBalance", "totalMoneyIn", "totalMoneyOut", "ledgerTableIndexes", "columns",
    "dateHasYear", "dateFillDown", "signConvention",
  ],
  properties: {
    isBankStatement: {
      type: "boolean",
      description: "True only for a bank or credit-card statement containing a transaction ledger. False for invoices, utility bills, receipts, payslips.",
    },
    rejectReason: {
      type: ["string", "null"],
      description: "When isBankStatement is false, a short user-facing reason, e.g. 'This is a utility bill, not a bank statement.'",
    },
    currency: { type: "string", description: "ISO 4217 code, e.g. GBP, USD, ZAR." },
    statementDate: {
      type: ["string", "null"],
      description: "The date printed on the statement itself as YYYY-MM-DD, e.g. from 'Statement date 08 Apr 2026'. This is the issue date, NOT the period start or end. Null if the statement does not print one.",
    },
    statementPeriod: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["start", "end"],
      properties: {
        start: { type: "string", description: "YYYY-MM-DD" },
        end: { type: "string", description: "YYYY-MM-DD" },
      },
    },
    openingBalance: {
      type: ["string", "null"],
      description: "Opening/start/brought-forward balance exactly as printed, e.g. '533.77' or '-12.40'. Null if absent.",
    },
    closingBalance: {
      type: ["string", "null"],
      description: "Closing/end/carried-forward balance exactly as printed. Null if absent.",
    },
    totalMoneyIn: {
      type: ["string", "null"],
      description: "Total deposits/money in/credits over the statement period exactly as printed. Null if absent.",
    },
    totalMoneyOut: {
      type: ["string", "null"],
      description: "Total withdrawals/outgoings/money out/debits over the statement period exactly as printed. Null if absent.",
    },
    ledgerTableIndexes: {
      type: "array",
      items: { type: "integer" },
      description: "Indexes of the tables that hold transaction rows, in document order. Exclude summary and usage tables.",
    },
    columns: {
      type: "object",
      additionalProperties: false,
      required: ["date", "description", "debit", "credit", "amount", "balance"],
      properties: {
        date: { type: "integer" },
        description: { type: "integer" },
        debit: { type: ["integer", "null"], description: "Money out. Null if the statement uses one signed amount column." },
        credit: { type: ["integer", "null"], description: "Money in. Null if the statement uses one signed amount column." },
        amount: { type: ["integer", "null"], description: "Single signed amount column. Null when debit and credit are separate." },
        balance: { type: ["integer", "null"], description: "Running balance column, if present." },
      },
    },
    dateHasYear: { type: "boolean", description: "True if date cells include a year ('07 Mar 2026'), false if not ('07 Mar')." },
    dateFillDown: { type: "boolean", description: "True if some transaction rows leave the date cell blank, continuing the date above." },
    signConvention: {
      type: "string",
      enum: ["separateColumns", "signedAmount", "negativeIsDebit"],
      description: "separateColumns: distinct money-out/money-in columns. signedAmount: one column, negative = money out. negativeIsDebit: one column where negatives are debits and the sign is printed after the number.",
    },
  },
} as const;

const TRANSACTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["transactions"],
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "debit", "credit"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          description: { type: "string" },
          debit: { type: "string", description: "Money out as printed, '0' if none." },
          credit: { type: "string", description: "Money in as printed, '0' if none." },
        },
      },
    },
  },
} as const;

/** Compact digest of the extracted tables — headers plus two sample rows each. */
export function describeTables(tables: RawCsvTable[]): string {
  return tables
    .map((t, i) => {
      const sample = t.rows.slice(0, 2).map((r) => `    ${JSON.stringify(r)}`).join("\n");
      return `  [${i}] headers=${JSON.stringify(t.headers)} rows=${t.rows.length}\n${sample}`;
    })
    .join("\n");
}

async function chatJson(
  model: string,
  system: string,
  user: string,
  schemaName: string,
  schema: unknown
): Promise<any> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set.");

  const { Mistral } = await import("@mistralai/mistralai");
  const client = new Mistral({ apiKey });

  const res = await client.chat.complete({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    responseFormat: {
      type: "json_schema",
      jsonSchema: {
        name: schemaName,
        schemaDefinition: schema as { [k: string]: any },
        strict: true,
      },
    },
  });

  const content = res.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : (content ?? []).map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("");
  if (!text.trim()) throw new Error("Statement analysis returned an empty response.");
  return JSON.parse(text);
}

const ANALYSIS_SYSTEM = `You analyse OCR'd financial documents and describe their LAYOUT.

You never report transaction amounts. You only identify structure: which table
holds the transaction ledger, which column index holds what, what period the
statement covers, when it was issued, and how dates are written.

Keep the issue date and the period distinct. "Statement date 08 Apr 2026" is the
issue date; "07 Mar - 08 Apr 2026" is the period. They often share an end date,
but a statement with a period and no printed issue date must report
statementDate as null rather than repeating the period end.

Column indexes are 0-based positions in that table's header array.

Be strict about isBankStatement. A bank or credit-card statement lists
individual money movements with a running balance. A utility bill, invoice,
receipt or payslip does NOT qualify, even when it contains dated tables of
charges — set isBankStatement false and explain why in rejectReason.`;

const EXTRACTION_SYSTEM = `You extract transactions from an OCR'd bank statement.

Copy every amount EXACTLY as printed — never round, recompute or infer a figure.
Where a row continues the date of the row above, repeat that date. Omit opening,
closing, brought-forward and carried-forward balance marker rows: they are not
transactions. Dates must be YYYY-MM-DD; use the statement period to resolve any
date printed without a year.`;

/** Ask the model for a layout plan. Throws if the API key is missing or the call fails. */
export async function analyzeStatement(
  markdown: string,
  tables: RawCsvTable[],
  /** Assumed when the statement does not name a currency of its own. */
  defaultCurrency?: string
): Promise<StatementPlan> {
  const user = `Document (OCR'd to markdown):

${markdown}

Tables extracted from the document:

${describeTables(tables)}

Describe this document's layout.`;

  const plan = await chatJson(ANALYSIS_MODEL, ANALYSIS_SYSTEM, user, "statement_plan", PLAN_SCHEMA);
  return normalisePlan(plan, tables.length, defaultCurrency);
}

/**
 * Fallback path: the model produces the transactions itself. Only reached when
 * the plan path yields nothing usable or fails reconciliation — and its output
 * still has to reconcile before it can be imported.
 */
export async function extractTransactionsDirectly(
  markdown: string,
  plan: StatementPlan,
  pageMarkdowns?: string[]
): Promise<ParsedTransaction[]> {
  const period = plan.statementPeriod
    ? `Statement period: ${plan.statementPeriod.start} to ${plan.statementPeriod.end}.`
    : "Statement period: not stated.";

  const { parseAmount, parseDate } = await import("@/lib/banking/column-mapping");
  const ctx = plan.statementPeriod
    ? { periodStart: plan.statementPeriod.start, periodEnd: plan.statementPeriod.end }
    : undefined;

  const extractChunk = async (chunkMarkdown: string): Promise<ParsedTransaction[]> => {
    if (!chunkMarkdown.trim()) return [];
    try {
      const result = await chatJson(
        EXTRACTION_MODEL,
        EXTRACTION_SYSTEM,
        `${period}\n\nStatement (OCR'd to markdown):\n\n${chunkMarkdown}\n\nExtract every transaction.`,
        "statement_transactions",
        TRANSACTIONS_SCHEMA
      );

      const rows: ParsedTransaction[] = [];
      for (const t of result?.transactions ?? []) {
        const date = parseDate(String(t?.date ?? ""), ctx);
        if (!date) continue;
        const debit = parseAmount(String(t?.debit ?? "0"));
        const credit = parseAmount(String(t?.credit ?? "0"));
        if (debit === 0 && credit === 0) continue;
        rows.push({
          date,
          description: String(t?.description ?? "").trim() || "Unknown",
          debit: Math.abs(debit),
          credit: Math.abs(credit),
        });
      }
      return rows;
    } catch (err) {
      console.warn("[banking] chunk extraction failed:", err);
      return [];
    }
  };

  // If document has more than 3 pages, process in parallel chunks of 4 pages
  if (pageMarkdowns && pageMarkdowns.length > 3) {
    const CHUNK_SIZE = 4;
    const chunks: string[] = [];
    for (let i = 0; i < pageMarkdowns.length; i += CHUNK_SIZE) {
      chunks.push(pageMarkdowns.slice(i, i + CHUNK_SIZE).join("\n\n"));
    }

    const chunkResults = await Promise.all(chunks.map((c) => extractChunk(c)));
    const allRows = chunkResults.flat();

    const seen = new Set<string>();
    return allRows.filter((r) => {
      const key = `${r.date}|${r.debit}|${r.credit}|${r.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return extractChunk(markdown);
}

/**
 * Clamp model output to something the rest of the pipeline can trust. This is
 * the trust boundary for everything the model says, so it is exported and
 * tested directly rather than only through a live call.
 */
export function normalisePlan(raw: any, tableCount: number, defaultCurrency?: string): StatementPlan {
  const idx = (v: unknown): number | null =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;

  const columns = raw?.columns ?? {};
  return {
    isBankStatement: raw?.isBankStatement === true,
    rejectReason: typeof raw?.rejectReason === "string" ? raw.rejectReason : null,
    // The statement's own currency when the model found one, else the account's.
    currency:
      typeof raw?.currency === "string" && raw.currency
        ? raw.currency
        : (defaultCurrency ?? DEFAULT_CURRENCY),
    // Only accept a well-formed ISO date; a half-parsed one is worse than none.
    statementDate:
      typeof raw?.statementDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.statementDate)
        ? raw.statementDate
        : null,
    statementPeriod:
      raw?.statementPeriod?.start && raw?.statementPeriod?.end
        ? { start: String(raw.statementPeriod.start), end: String(raw.statementPeriod.end) }
        : null,
    openingBalance: raw?.openingBalance == null ? null : String(raw.openingBalance),
    closingBalance: raw?.closingBalance == null ? null : String(raw.closingBalance),
    totalMoneyIn: raw?.totalMoneyIn == null ? null : String(raw.totalMoneyIn),
    totalMoneyOut: raw?.totalMoneyOut == null ? null : String(raw.totalMoneyOut),
    ledgerTableIndexes: Array.isArray(raw?.ledgerTableIndexes)
      ? raw.ledgerTableIndexes.filter(
          (i: unknown) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < tableCount
        )
      : [],
    columns: {
      date: idx(columns.date) ?? 0,
      description: idx(columns.description) ?? -1,
      debit: idx(columns.debit),
      credit: idx(columns.credit),
      amount: idx(columns.amount),
      balance: idx(columns.balance),
    },
    dateHasYear: raw?.dateHasYear !== false,
    dateFillDown: raw?.dateFillDown === true,
    signConvention:
      raw?.signConvention === "signedAmount" || raw?.signConvention === "negativeIsDebit"
        ? raw.signConvention
        : "separateColumns",
  };
}
