"use client";

import { useMemo, useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  reportCategoryLabels,
  reportCategoryOptions,
  taxOptions,
} from "./constants";
import type { ImportedAccountInput } from "./use-chart-of-accounts";
import type {
  AccountReportCategory,
  AccountType,
  ChartAccount,
  TaxCode,
} from "./types";

type ImportAccountsDialogProps = {
  open: boolean;
  accounts: ChartAccount[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: ImportedAccountInput[]) => Promise<boolean>;
};

type CsvRecord = Record<string, string>;

type PreviewRow = {
  rowNumber: number;
  status: "new" | "update" | "invalid";
  errors: string[];
  input: ImportedAccountInput | null;
  raw: CsvRecord;
};

const requiredHeaders = ["code", "name", "account_type", "report_category"];
const acceptedHeaders = [
  ...requiredHeaders,
  "description",
  "tax_code",
  "tax_rate",
  "is_active",
];

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string): CsvRecord[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<CsvRecord>((record, header, index) => {
      record[header] = cells[index]?.trim() ?? "";
      return record;
    }, {});
  });
}

function toBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return !["false", "no", "0", "inactive"].includes(normalized);
}

function isAccountType(value: string): value is AccountType {
  return ["asset", "liability", "equity", "revenue", "expense"].includes(value);
}

function isTaxCode(value: string): value is TaxCode {
  return taxOptions.some((tax) => tax.code === value);
}

function isReportCategoryForType(
  accountType: AccountType,
  value: string
): value is AccountReportCategory {
  return reportCategoryOptions[accountType].some(
    (category) => category.value === value
  );
}

function validateRows(rows: CsvRecord[], accounts: ChartAccount[]): PreviewRow[] {
  const existingCodes = new Set(
    accounts.map((account) => account.code.trim().toLowerCase())
  );
  const seenCodes = new Set<string>();

  return rows.map((raw, index) => {
    const errors: string[] = [];
    const code = raw.code?.trim() ?? "";
    const normalizedCode = code.toLowerCase();
    const name = raw.name?.trim() ?? "";
    const accountType = raw.account_type?.trim().toLowerCase() ?? "";
    const reportCategory = raw.report_category?.trim().toLowerCase() ?? "";
    const taxCode = (raw.tax_code?.trim().toLowerCase() || "no_vat") as TaxCode;

    if (!code) errors.push("Code is required.");
    if (code && !/^\d+$/.test(code)) errors.push("Code must be numeric.");
    if (normalizedCode && seenCodes.has(normalizedCode)) {
      errors.push("Duplicate code in file.");
    }
    if (!name) errors.push("Name is required.");
    if (!isAccountType(accountType)) errors.push("Invalid account type.");
    if (isAccountType(accountType)) {
      if (!isReportCategoryForType(accountType, reportCategory)) {
        errors.push("Report category does not match account type.");
      }
    }
    if (!isTaxCode(taxCode)) errors.push("Invalid tax code.");

    if (normalizedCode) seenCodes.add(normalizedCode);

    const tax = taxOptions.find((option) => option.code === taxCode);
    const rawTaxRate = raw.tax_rate?.trim() ?? "";
    const parsedTaxRate = Number(rawTaxRate);
    const input =
      errors.length === 0 && isAccountType(accountType) && isTaxCode(taxCode)
        ? {
            code,
            name,
            description: raw.description?.trim() || null,
            account_type: accountType,
            report_category: reportCategory as AccountReportCategory,
            tax_code: taxCode,
            tax_rate: rawTaxRate
              ? Number.isFinite(parsedTaxRate)
                ? parsedTaxRate
                : tax?.rate ?? 0
              : tax?.rate ?? 0,
            is_active: toBoolean(raw.is_active ?? ""),
          }
        : null;

    return {
      rowNumber: index + 2,
      status:
        errors.length > 0
          ? "invalid"
          : existingCodes.has(normalizedCode)
            ? "update"
            : "new",
      errors,
      input,
      raw,
    };
  });
}

function statusLabel(status: PreviewRow["status"]) {
  if (status === "new") return "New";
  if (status === "update") return "Will update";
  return "Invalid";
}

export function ImportAccountsDialog({
  open,
  accounts,
  saving,
  onOpenChange,
  onImport,
}: ImportAccountsDialogProps) {
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState<CsvRecord[]>([]);
  const [summary, setSummary] = useState("");

  const previewRows = useMemo(
    () => validateRows(rows, accounts),
    [accounts, rows]
  );
  const validRows = previewRows
    .map((row) => row.input)
    .filter((row): row is ImportedAccountInput => Boolean(row));
  const invalidCount = previewRows.filter((row) => row.status === "invalid").length;
  const updateCount = previewRows.filter((row) => row.status === "update").length;
  const newCount = previewRows.filter((row) => row.status === "new").length;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSummary("");
    setParseError("");
    setRows([]);

    if (!file) return;

    setFileName(file.name);
    const content = await file.text();
    const parsedRows = parseCsv(content);
    const headers = content
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)[0]
      ?.split(",")
      .map((header) => header.trim().toLowerCase());

    const missingHeaders = requiredHeaders.filter(
      (header) => !headers?.includes(header)
    );
    const unknownHeaders =
      headers?.filter((header) => header && !acceptedHeaders.includes(header)) ?? [];

    if (missingHeaders.length > 0) {
      setParseError(`Missing required headers: ${missingHeaders.join(", ")}.`);
      return;
    }

    if (unknownHeaders.length > 0) {
      setParseError(`Unknown headers: ${unknownHeaders.join(", ")}.`);
      return;
    }

    if (parsedRows.length === 0) {
      setParseError("The CSV does not contain any account rows.");
      return;
    }

    setRows(parsedRows);
  }

  async function handleImport() {
    const imported = await onImport(validRows);
    if (!imported) return;

    setSummary(
      `Imported ${validRows.length} accounts: ${newCount} new, ${updateCount} updated.`
    );
    setRows([]);
    setFileName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import chart of accounts</DialogTitle>
          <DialogDescription>
            Upload a CSV with code, name, account type, and report category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-300 hover:bg-blue-50">
            <FileUp className="size-6 text-blue-600" />
            <span className="text-sm font-semibold text-slate-800">
              {fileName || "Choose CSV file"}
            </span>
            <span className="text-xs text-slate-500">
              Headers: {acceptedHeaders.join(", ")}
            </span>
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </label>

          {parseError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {parseError}
            </div>
          ) : null}

          {summary ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {summary}
            </div>
          ) : null}

          {previewRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-800">
                  Preview {previewRows.length} rows
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {newCount} new, {updateCount} updates, {invalidCount} invalid
                </span>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Report</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {row.rowNumber}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-semibold",
                              row.status === "invalid"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : row.status === "update"
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-green-200 bg-green-50 text-green-700"
                            )}
                          >
                            {statusLabel(row.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                          {row.raw.code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {row.raw.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.raw.account_type}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.input
                            ? reportCategoryLabels[row.input.report_category]
                            : row.raw.report_category}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-500">
                          {row.errors.join(" ") || "Ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={saving || validRows.length === 0}
            onClick={handleImport}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload />}
            Import valid rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
