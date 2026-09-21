"use client";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileUp, FileText, X, ChevronDown, Loader2, CheckCircle2, AlertCircle, Minus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  useBankAccounts,
  importStatement,
  confirmStatementImport,
  checkStatementDuplicates,
  bankingKeys,
  type StatementImportPhase,
  type StatementImportPreview,
  type FeedTransaction,
} from "@/lib/banking/api";
import { INLINE_UPLOAD_LIMIT_BYTES } from "@/lib/banking/statement-storage";
import {
  applyMappingDetailed, parseAmount,
  type ColumnMapping, type ColumnRole,
} from "@/lib/banking/column-mapping";
import { StatementParseProgress } from "./statement-parse-progress";
import { useCurrency } from "@/components/currency-provider";
import { formatMoney } from "@/lib/currency";
import { StatementReconciliationReviewDialog } from "./statement-reconciliation-review-dialog";
import { MinimizedTaskIndicator, type MinimizedTaskStatus } from "@/components/ui/minimized-task-indicator";

/** "2026-04-08" → "8 Apr 2026". Parsed as parts, not via Date, to dodge timezone shifts. */
function formatStatementDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: "ignore", label: "Ignore" },
  { value: "date", label: "Date" },
  { value: "description", label: "Description" },
  { value: "debit", label: "Money out" },
  { value: "credit", label: "Money in" },
  { value: "amount", label: "Amount (+/−)" },
];

const SKIP_REASON_LABELS: Record<string, string> = {
  unparseable_date: "unreadable date",
  blank_continuation: "blank continuation",
  zero_movement: "no transaction amount",
};

export function ImportStatementModal({ onClose }: { onClose: () => void }) {
  // A statement is imported into a bank account, which has its own currency, but
  // the account is not chosen until later in this flow. The workspace currency
  // is the right label for the form itself and is correct whenever the account
  // agrees with it — which a hardcoded pound sign was not.
  const { symbol, currency: workspaceCurrency } = useCurrency();
  const { data: accounts } = useBankAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StatementImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [openingRaw, setOpeningRaw] = useState("");
  const [closingRaw, setClosingRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [phase, setPhase] = useState<StatementImportPhase>("parsing");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<NonNullable<StatementImportPreview["error"]> | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [reconciliationReview, setReconciliationReview] = useState<FeedTransaction[] | null>(null);
  const [autoReconciled, setAutoReconciled] = useState(0);
  const isPdf = (file?.name ?? "").toLowerCase().endsWith(".pdf");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_FILE_SIZE_BYTES) {
      setError("File exceeds the 10 MB size limit. Please choose a smaller file.");
      setFile(null);
      setPreview(null);
      setMapping(null);
      setParseError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(f);
    setPreview(null);
    setMapping(null);
    setError(null);
    setParseError(null);
  };

  const handleParse = async (allowUnverified = false) => {
    if (!file) { setError("Please select a file."); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File exceeds the 10 MB size limit. Please choose a smaller file.");
      return;
    }
    if (!selectedAccountId) { setError("Please select a bank account."); return; }
    setLoading(true);
    setPhase(file.size >= INLINE_UPLOAD_LIMIT_BYTES ? "uploading" : "parsing");
    setError(null);
    setParseError(null);
    try {
      const result = await importStatement(file, selectedAccountId, allowUnverified, setPhase);
      if (result.error) {
        // An unverifiable statement has already been safely extracted. Keep its
        // preview in memory so accepting the manual check does not parse again.
        setParseError(result.error);
        setPreview(result.transactions ? result : null);
        setMapping(result.suggested_mapping ?? null);
        return;
      }
      setPreview(result);
      setMapping(result.suggested_mapping ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse failed.";
      if (/body exceeded|bodysizelimit/i.test(msg)) {
        setError("File payload is too large for the server (max 10 MB).");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const rawCsv = preview?.raw_csv;
  const previewTransactions = preview?.transactions;
  const diagnosticSkippedRows = preview?.diagnostics?.skippedRows;

  // For CSVs the preview is re-derived client-side from the raw table +
  // current mapping; PDFs use the server-parsed rows as-is.
  const mappedCsv = useMemo(() => {
    if (!rawCsv || !mapping) return null;
    return applyMappingDetailed(rawCsv, mapping);
  }, [rawCsv, mapping]);

  const transactions = useMemo(
    () => mappedCsv?.transactions ?? previewTransactions ?? [],
    [mappedCsv?.transactions, previewTransactions]
  );

  const existingSet = useMemo(() => {
    return new Set(preview?.existing_row_keys ?? []);
  }, [preview?.existing_row_keys]);

  const duplicateCountInView = useMemo(() => {
    if (!preview || transactions.length === 0) return 0;
    return transactions.filter((t) => {
      const desc = (t.description ?? "").trim().slice(0, 500) || "—";
      const key = `${t.date}|${t.debit || 0}|${t.credit || 0}|${desc}`;
      return existingSet.has(key);
    }).length;
  }, [preview, transactions, existingSet]);

  const skippedRows = useMemo(() => {
    if (rawCsv && mappedCsv) {
      return mappedCsv.skippedRows.map((row) => ({
        reason: row.reason,
        tableIndex: 0,
        rowIndex: rawCsv.rows.indexOf(row.rawCells),
        rawDate: row.rawDate,
        rawCells: row.rawCells,
      }));
    }
    return diagnosticSkippedRows ?? [];
  }, [diagnosticSkippedRows, mappedCsv, rawCsv]);

  const skippedReasonSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of skippedRows) {
      counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([reason, count]) => ({
      reason,
      count,
      label: SKIP_REASON_LABELS[reason] ?? reason.replaceAll("_", " "),
    }));
  }, [skippedRows]);

  // Re-check duplicates when user changes selected bank account while preview is open
  const previewOpen = preview !== null;
  useEffect(() => {
    if (!previewOpen || !selectedAccountId || transactions.length === 0) return;
    let active = true;
    checkStatementDuplicates(selectedAccountId, transactions).then((res) => {
      if (!active) return;
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              bank_account_id: selectedAccountId,
              duplicate_count: res.duplicate_count,
              existing_row_keys: res.existing_row_keys,
            }
          : prev
      );
    });
    return () => {
      active = false;
    };
  }, [previewOpen, selectedAccountId, transactions]);

  const setColumnRole = (colIdx: number, role: ColumnRole) => {
    setMapping((prev) => {
      if (!prev) return prev;
      return prev.map((r, i) => {
        if (i === colIdx) return role;
        // A non-ignore role can only live on one column at a time.
        if (role !== "ignore" && r === role) return "ignore";
        return r;
      });
    });
  };

  const mappingWarning = useMemo(() => {
    if (!preview?.raw_csv || !mapping) return null;
    if (!mapping.includes("date")) return "No column is mapped as Date — no rows can be imported.";
    if (!mapping.includes("debit") && !mapping.includes("credit") && !mapping.includes("amount")) {
      return `No amount column is mapped — every row will import as ${symbol}0.00.`;
    }
    return null;
  }, [preview, mapping, symbol]);

  // Optional statement tie-out: opening + money in − money out = closing.
  const tieOut = useMemo(() => {
    if (openingRaw.trim() === "" || closingRaw.trim() === "" || transactions.length === 0) return null;
    const opening = parseAmount(openingRaw);
    const closing = parseAmount(closingRaw);
    const net = transactions.reduce((s, t) => s + t.credit - t.debit, 0);
    const diff = closing - (opening + net);
    return { diff };
  }, [openingRaw, closingRaw, transactions]);

  const handleConfirm = async () => {
    if (!preview || !selectedAccountId || transactions.length === 0) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmStatementImport(selectedAccountId, transactions);
      const dupNote = result.skipped_duplicates > 0
        ? ` Skipped ${result.skipped_duplicates} duplicate row(s) already in the feed.`
        : "";
      const matchNote = result.auto_reconciled
        ? ` Reconciled ${result.auto_reconciled} high-confidence match${result.auto_reconciled === 1 ? "" : "es"}.`
        : "";
      setSuccessMsg(`✓ Saved ${result.created} transaction(s) to the feed.${matchNote}${dupNote}`);
      setAutoReconciled(result.auto_reconciled ?? 0);
      if ((result.review?.length ?? 0) > 0) setReconciliationReview(result.review ?? []);
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
      if ((result.review?.length ?? 0) === 0) {
        setTimeout(() => onClose(), result.skipped_duplicates > 0 ? 2500 : 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setConfirming(false);
    }
  };

  const formatMinorLocal = (n: number) => formatMoney(n, workspaceCurrency);

  if (isMinimized) {
    const hasProblem = Boolean(error || parseError);
    const isWorking = loading || confirming;
    const compactStatus: MinimizedTaskStatus = isWorking
      ? "working"
      : hasProblem
        ? "error"
        : successMsg
          ? "success"
          : "ready";
    const compactLabel = confirming
      ? "Saving imported transactions"
      : loading
        ? phase === "uploading"
          ? "Uploading bank statement"
          : "Scanning bank statement"
        : hasProblem
          ? "Bank statement import needs attention"
          : successMsg
            ? "Bank statement import complete"
            : preview
              ? "Bank statement ready to review"
              : "Open bank statement import";

    return (
      <MinimizedTaskIndicator
        status={compactStatus}
        label={compactLabel}
        icon={isWorking
          ? <FileText className="size-5" />
          : hasProblem
            ? <AlertCircle className="size-5" />
            : <CheckCircle2 className="size-5" />}
        onOpen={() => setIsMinimized(false)}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-statement-title"
        className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileUp className="size-5 text-blue-600" />
            <h2 id="import-statement-title" className="text-base font-extrabold text-slate-950">Upload Bank Statement</h2>
          </div>
          <div className="flex items-center gap-1">
            {(loading || confirming) && (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                aria-label="Minimize statement upload"
                title="Minimize and keep working"
                className="flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Minus className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close statement upload"
              className="flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Select account */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">1. Select Bank Account</label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— choose account —</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} ({a.bank_name})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Upload file */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">2. Upload File (PDF or CSV, max 10 MB)</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-8 transition-colors hover:border-blue-400 hover:bg-blue-50"
            >
              <FileText className="size-8 text-slate-300" />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-600">Click to select file</p>
                  <p className="text-xs text-slate-400">PDF or CSV</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600">{error}</p>
          )}
          {successMsg && (
            <p className="rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{successMsg}</p>
          )}

          {/* Parse failure — nothing was imported. */}
          {parseError && !loading && (
            <div className={`flex flex-col gap-3 rounded-xl border p-4 ${
              parseError.code === "Unverifiable"
                ? "border-amber-200 bg-amber-50"
                : "border-red-200 bg-red-50"
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`mt-0.5 size-4 shrink-0 ${
                  parseError.code === "Unverifiable" ? "text-amber-600" : "text-red-600"
                }`} />
                <div className="flex flex-col gap-1">
                  <p className={`text-sm font-semibold ${
                    parseError.code === "Unverifiable" ? "text-amber-900" : "text-red-800"
                  }`}>
                    {parseError.code === "NotAStatement" ? "Not a bank statement"
                      : parseError.code === "ReconciliationFailed" ? "Figures don't add up"
                      : parseError.code === "Unverifiable" ? "Couldn't verify these figures"
                      : parseError.code === "OcrUnavailable" ? "Scanning unavailable"
                      : "Nothing found to import"}
                  </p>
                  <p className={`text-sm ${
                    parseError.code === "Unverifiable" ? "text-amber-800" : "text-red-700"
                  }`}>{parseError.message}</p>
                </div>
              </div>

              {/* Only an unverifiable statement can be overridden. A statement that
                  actively fails to reconcile is never importable. */}
              {parseError.code === "Unverifiable" && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-amber-600"
                    onChange={(e) => {
                      if (!e.target.checked) return;
                      setPreview((current) => current
                        ? { ...current, error: undefined, verification: "override" }
                        : current
                      );
                      setParseError(null);
                    }}
                  />
                  <span className="text-xs text-slate-700">
                    <span className="font-semibold">I&apos;ve checked these figures myself.</span>{" "}
                    Import anyway — the transactions won&apos;t be verified against a statement balance.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Upload / parse in progress */}
          {loading && (
            <StatementParseProgress
              isPdf={isPdf}
              phase={phase}
              uploadLabel={
                file && file.size >= INLINE_UPLOAD_LIMIT_BYTES
                  ? `Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : undefined
              }
            />
          )}

          {/* Column mapping (CSV only) */}
          {preview?.raw_csv && mapping && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-600">
                3. Map Columns — tell us what each column in your file contains
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {preview.raw_csv.headers.map((header, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <span className="truncate text-[11px] font-bold text-slate-700" title={header}>
                      {header || `Column ${i + 1}`}
                    </span>
                    <select
                      value={mapping[i] ?? "ignore"}
                      onChange={(e) => setColumnRole(i, e.target.value as ColumnRole)}
                      className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] outline-none focus:border-blue-500"
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {mappingWarning && (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  <AlertCircle className="size-3.5 shrink-0" /> {mappingWarning}
                </p>
              )}
            </div>
          )}

          {/* Statement balance tie-out — manual only where the server couldn't
              check for us (CSV imports, and PDFs the user chose to override). */}
          {preview && !["totals", "runningBalance", "movementTotals"].includes(preview.verification ?? "") && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-600">
                {preview.raw_csv ? "4" : "3"}. Check Statement Balances <span className="font-normal text-slate-400">(optional — from the paper statement)</span>
              </p>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-500">Opening balance ({symbol})</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={openingRaw}
                    onChange={(e) => setOpeningRaw(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-500">Closing balance ({symbol})</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={closingRaw}
                    onChange={(e) => setClosingRaw(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              {tieOut && (tieOut.diff === 0 ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                  <CheckCircle2 className="size-3.5 shrink-0" /> Statement ties out: opening + money in − money out = closing.
                </p>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  <AlertCircle className="size-3.5 shrink-0" />
                  Statement does not tie out — off by {formatMinorLocal(Math.abs(tieOut.diff))}.
                  Some rows may be missing or misparsed; check the mapping and preview before saving.
                </p>
              ))}
            </div>
          )}

          {/* Preview table */}
          {preview && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-xs font-semibold text-slate-600">
                  {preview.raw_csv ? "5" : "4"}. Preview — {transactions.length} transaction
                  {transactions.length !== 1 ? "s" : ""} found in{" "}
                  <span className="break-all text-slate-900">{preview.filename}</span>
                  {(preview.statement_date || preview.statement_period) && (
                    <span className="ml-1.5 font-normal text-slate-500">
                      ({[
                        preview.statement_date && `dated ${formatStatementDate(preview.statement_date)}`,
                        preview.statement_period &&
                          `covering ${formatStatementDate(preview.statement_period.start)} – ${formatStatementDate(preview.statement_period.end)}`,
                      ].filter(Boolean).join(", ")})
                    </span>
                  )}
                </p>
                {["totals", "runningBalance", "movementTotals"].includes(preview.verification ?? "") ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700 sm:self-auto"
                    title={preview.verification === "totals"
                      ? "Opening + money in − money out matches the statement's closing balance."
                      : preview.verification === "runningBalance"
                        ? "Every row agrees with the statement's running balance column."
                        : "Extracted money in and money out match totals printed on the statement."}
                  >
                    <CheckCircle2 className="size-3 shrink-0" /> Balances verified
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 self-start whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 sm:self-auto">
                    Unverified
                  </span>
                )}
              </div>

              {duplicateCountInView > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="flex flex-col gap-0.5">
                    <p className="font-semibold text-amber-950">
                      {duplicateCountInView === transactions.length
                        ? `All ${transactions.length} transactions already exist in your bank feed`
                        : `${duplicateCountInView} of ${transactions.length} transactions already exist in your bank feed`}
                    </p>
                    <p className="text-slate-600">
                      Rows marked as <span className="font-medium text-amber-700">Existing</span> will be automatically skipped on save to avoid duplicate entries.
                    </p>
                  </div>
                </div>
              )}

              {preview.diagnostics && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">
                    {preview.raw_csv
                      ? "CSV parser"
                      : `Scanner read ${preview.diagnostics.pagesScanned} page${preview.diagnostics.pagesScanned === 1 ? "" : "s"}`}{" "}
                    found{" "}
                    {preview.diagnostics.tablesFound} table
                    {preview.diagnostics.tablesFound === 1 ? "" : "s"} and checked{" "}
                    {preview.diagnostics.attemptedRows} possible row
                    {preview.diagnostics.attemptedRows === 1 ? "" : "s"}.
                  </p>
                  {skippedRows.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <p className="font-medium text-amber-700">
                        Skipped {skippedRows.length} row{skippedRows.length === 1 ? "" : "s"}:{" "}
                        {skippedReasonSummary.map((item) => `${item.count} ${item.label}`).join(", ")}.
                      </p>
                      <ul className="space-y-1 text-slate-500">
                        {skippedRows.slice(0, 3).map((row, i) => (
                          <li key={`${row.tableIndex}-${row.rowIndex}-${i}`} className="truncate">
                            Table {row.tableIndex + 1}, row {row.rowIndex + 1}:{" "}
                            {SKIP_REASON_LABELS[row.reason] ?? row.reason.replaceAll("_", " ")} —{" "}
                            {row.rawCells.join(" | ")}
                          </li>
                        ))}
                      </ul>
                      {skippedRows.length > 3 && (
                        <p className="text-slate-400">And {skippedRows.length - 3} more skipped row(s).</p>
                      )}
                      <p className="text-slate-500">
                        If the preview is missing transactions, check these rows in the statement. They usually need a readable date and a money-in or money-out amount.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">No skipped rows were reported by the parser.</p>
                  )}
                  {preview.verification === "override" && (
                    <p className="mt-2 text-amber-700">
                      This import was accepted manually. The parser could read the rows, but could not verify them against balances or printed totals.
                    </p>
                  )}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-right">Spent</th>
                      <th className="px-4 py-2 text-right">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.slice(0, 20).map((tx, i) => {
                      const desc = (tx.description ?? "").trim().slice(0, 500) || "—";
                      const key = `${tx.date}|${tx.debit || 0}|${tx.credit || 0}|${desc}`;
                      const isDuplicate = existingSet.has(key);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-2 text-slate-500">{tx.date}</td>
                          <td className="max-w-[180px] truncate px-4 py-2 font-medium text-slate-900">{tx.description}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">
                            {isDuplicate ? (
                              <span
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                                title="Already in bank feed — will be skipped on save"
                              >
                                Existing
                              </span>
                            ) : (
                              <span
                                className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700"
                                title="New transaction — will be saved to bank feed"
                              >
                                New
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-900">
                            {tx.debit > 0 ? formatMinorLocal(tx.debit) : "—"}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-green-600">
                            {tx.credit > 0 ? formatMinorLocal(tx.credit) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {transactions.length > 20 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-center text-xs text-slate-400">
                          … and {transactions.length - 20} more rows
                        </td>
                      </tr>
                    )}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                          No rows produced by the current mapping.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {!preview ? (
            <button
              onClick={() => handleParse(false)}
              disabled={loading || !file || !selectedAccountId}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {!loading ? "Upload Statement" : phase === "uploading" ? "Uploading..." : "Scanning..."}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirming || !!successMsg || transactions.length === 0}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {confirming && <Loader2 className="size-4 animate-spin" />}
              {confirming ? "Saving..." : successMsg ? "Saved" : `Confirm & Save ${transactions.length} Transactions`}
            </button>
          )}
        </div>
        {reconciliationReview ? (
          <StatementReconciliationReviewDialog
            key={`${reconciliationReview[0]?.id ?? "empty"}:${reconciliationReview.length}`}
            transactions={reconciliationReview}
            autoReconciled={autoReconciled}
            onClose={onClose}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
