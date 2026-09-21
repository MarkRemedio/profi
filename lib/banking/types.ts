export type { ParsedTransaction } from "./statement-parser";

export type BankAccount = {
  id: string;
  org_id: string;
  chart_account_id: string;
  chart_account_code: string | null;
  chart_account_name: string | null;
  display_name: string;
  bank_name: string;
  sort_code: string;
  account_number_last4: string;
  currency: string;
  connection_type: "manual_import" | "live_feed" | "plaid" | "truelayer";
  status: "active" | "inactive" | "disconnected";
  color_tone: string;
  notes: string;
  balance: string;
  balance_minor: number;
  created_at: string;
  updated_at: string;
};

export type CreateBankAccountInput = {
  display_name: string;
  bank_name: string;
  sort_code?: string;
  account_number_last4?: string;
  currency?: string;
  connection_type?: BankAccount["connection_type"];
  color_tone?: string;
  notes?: string;
  chart_account_id?: string | null;
};

export type UpdateBankAccountInput = Partial<Omit<CreateBankAccountInput, "chart_account_id">> & {
  status?: BankAccount["status"];
};

export type DashboardSummary = {
  cash_validation: {
    balance: string;
    balance_minor: number;
  };
  balance_summary: {
    initial_conversion: string;
    initial_conversion_minor: number;
    opening: string;
    opening_minor: number;
    closing: string;
    closing_minor: number;
    net_movement: string;
    net_movement_minor: number;
    period_start: string | null;
  };
  statement_balance: string;
  matched_balance: string;
  unreconciled_count: number;
  cash_flow: {
    period_start: string;
    period_end: string;
    money_in_minor: number;
    money_out_minor: number;
    net_minor: number;
    money_in: string;
    money_out: string;
    net: string;
  };
};

export type StatementImportError = {
  code: import("./statement-parser").StatementFailureCode;
  message: string;
  /** Reconciliation gap in pennies, when the failure is a mismatch. */
  diff?: number;
  extracted?: number;
};

export type StatementImportDiagnostics = import("./statement-parser").StatementDiagnostics;

export type StatementImportPreview = {
  bank_account_id: string;
  bank_account_name: string;
  filename: string;
  /**
   * Present when parsing failed. For an unverifiable statement, the safely
   * extracted preview is retained so a manual confirmation does not re-read
   * the uploaded file.
   */
  error?: StatementImportError;
  transaction_count?: number;
  transactions?: import("./statement-parser").ParsedTransaction[];
  currency?: string;
  /** How the figures were verified. "override" means the user vouched for them. */
  verification?: "totals" | "runningBalance" | "movementTotals" | "override";
  extraction_path?: "plan" | "direct" | "csv";
  /** Date printed on the statement (YYYY-MM-DD), when it prints one. */
  statement_date?: string | null;
  statement_period?: { start: string; end: string } | null;
  diagnostics?: StatementImportDiagnostics;
  /** CSV imports only: raw table + auto-detected mapping so the user can remap columns client-side. */
  raw_csv?: import("./column-mapping").RawCsvTable;
  suggested_mapping?: import("./column-mapping").ColumnMapping;
  /** Number of parsed transactions that already exist in the bank feed. */
  duplicate_count?: number;
  /** Set of keys (date|debit|credit|desc) of rows that already exist in the feed. */
  existing_row_keys?: string[];
};

export type FeedTransaction = {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  /** The owning bank account's currency — feed amounts are denominated in it. */
  currency?: string;
  transaction_date: string;
  description: string;
  debit_minor: number;
  credit_minor: number;
  reconcile_status: "unmatched" | "ai_suggested" | "reconciled" | "ignored";
  ai_match_label: string;
  ai_match_confidence: number | null;
  ai_document_kind: AiDocumentKind | null;
  ai_document_confidence: number | null;
  ai_review_status: "proposed" | "needs_review" | "reviewed" | null;
  matched_journal_id: string | null;
  matched_journal_line_id: string | null;
  transaction_kind: TransactionKind;
  /** Personal items stay visible but are separate from company income/expense. */
  transaction_scope: "company" | "personal";
  category_status: CategoryStatus;
  category_allocations: CategoryAllocation[];
  source: string;
  created_at: string;
};

export type TransactionKind =
  | "uncategorized"
  | "income"
  | "expense"
  | "payment"
  | "transfer"
  | "refund"
  | "loan"
  | "equity"
  | "tax"
  | "payroll"
  | "asset";

export type CategoryStatus = "uncategorized" | "suggested" | "confirmed" | "derived";

export type CategoryAllocation = {
  id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  report_category: string;
  amount_minor: number;
  source: "manual" | "rule" | "history" | "ai" | "journal";
  confidence: number | null;
  is_confirmed: boolean;
};

export type CategoryAccount = {
  id: string;
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  report_category: string;
};

/**
 * A server-paginated slice of the bank feed. Counts are calculated separately
 * from the visible page so large statement imports never make the UI report a
 * smaller total than is actually stored.
 */
export type FeedTransactionPage = {
  transactions: FeedTransaction[];
  total: number;
  reconciled: number;
  unmatched: number;
  ai_suggested: number;
  ignored: number;
  page: number;
  page_size: number;
};

/** A previously imported statement, reconstructed from its existing feed rows. */
export type ImportedStatement = {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  currency: string;
  imported_at: string;
  period_start: string;
  period_end: string;
  transaction_count: number;
  reconciled_count: number;
};

export type ImportedStatementPage = {
  transactions: FeedTransaction[];
  total: number;
  page: number;
  page_size: number;
};

export type ImportedStatementRowUpdate = {
  id: string;
  transaction_date: string;
  description: string;
  debit_minor: number;
  credit_minor: number;
  category_account_id?: string | null;
};

export type ConfirmStatementResponse = {
  created: number;
  skipped_duplicates: number;
  bank_account_id: string;
  imported_statement_id: string;
  auto_reconciled?: number;
  review?: FeedTransaction[];
};

export type AiMatchResult = {
  matched: number;
  skipped: number;
  total_feed_rows: number;
  total_journal_candidates: number;
  /** Suggestions learned from a user's prior confirmed categories. */
  categories_suggested: number;
  /** Rows whose AI categorization requests failed and still need review. */
  categories_failed: number;
  message?: string;
};

export type BulkAcceptMatchesResult = {
  accepted: number;
  skipped: number;
  errors: Array<{ tx_id: string; message: string }>;
};

export type AiDocumentKind = "sales_receipt" | "invoice" | "expense" | "supplier_bill";

export type AiDocumentProposal = {
  transaction_id: string;
  kind: AiDocumentKind | null;
  confidence: number;
  contact_id: string | null;
  contact_name: string | null;
  account_id: string | null;
  account_label: string | null;
  reason: string;
  requires_manual_intervention: boolean;
  requires_post_review?: boolean;
};

export type JournalCandidate = {
  journal_id: string;
  journal_line_id: string;
  journal_date: string;
  memo: string | null;
  debit_minor: number;
  credit_minor: number;
  bank_account_name: string;
};

export type ReconciliationAnalysis = {
  transaction_id: string;
  confidence: number;
  summary: string;
  ai_created: boolean;
  ai_review_status: "needs_review" | "reviewed" | null;
  matched_record: {
    journal_id: string;
    date: string;
    memo: string;
    source_type: string;
    source_id: string | null;
    contact_name: string | null;
    record_type: string;
    record_href: string | null;
    chart_accounts: Array<{
      code: string;
      name: string;
      report_category: string;
      amount_minor: number;
    }>;
  };
  breakdown: Array<{
    key: "amount" | "direction" | "bank_account" | "date" | "description";
    label: string;
    score: number;
    detail: string;
  }>;
};

export type AccountBalance = {
  account_id: string;
  display_name: string;
  bank_name: string;
  currency: string;
  opening_balance_minor: number;
  closing_balance_minor: number;
  opening_balance: string;
  closing_balance: string;
};

export type ExpenseAccount = {
  id: string;
  code: string;
  name: string;
  report_category: string;
};

export type Contact = {
  id: string;
  name: string;
  contact_type: "customer" | "supplier" | "both";
  email: string | null;
};
