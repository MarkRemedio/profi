"use client";

import { toast } from "sonner";

import { useCurrency } from "@/components/currency-provider";
import { getReportsForPeriod } from "@/app/(dashboard)/reports/period-actions";
import React, { type ReactNode, Fragment, useMemo, useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { X, Download, FileText, FileSpreadsheet, ChevronDown, Clock, Building2, ArrowLeft } from "lucide-react"; // 🚀 Added ArrowLeft
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";


import type {
  GeneralLedgerRow,
  StatementRow,
  TrialBalanceRow,
} from "@/lib/accounting/reports";
import {
  validateReports,
  type ReportValidation,
} from "@/lib/accounting/report-validation";
import type { AccountOption } from "@/lib/accounting/dal";
import { cn } from "@/lib/utils";
import { reportCategoryLabels, typeMeta } from "@/components/chart-of-accounts/constants";
import {
  buildReportHtml,
  printReportDocument,
  type PrintReport,
  type PrintRow,
} from "@/lib/reports/print-document";
import { PrintFormatSettings, usePrintFormat } from "@/components/reports/print-format-settings";

type ReportsWorkspaceProps = {
  period: {
    yearStart: string;
    asOfDate: string;
  };
  organizationName: string; 
  dateFormat: string; // 🚀 ADDED THIS LINE!
  accounts: AccountOption[];
  trialBalance: TrialBalanceRow[];
  profitAndLoss: StatementRow[];
  balanceSheet: StatementRow[];
  /** Profit from before the period, which no equity account holds. */
  retainedEarningsMinor?: number;
  generalLedger: GeneralLedgerRow[];
};

type Tab = "trial" | "pnl" | "balance" | "ledger";
type DrilldownKind = "trial" | "pnl" | "balance";

type DrilldownSelection = {
  kind: DrilldownKind;
  accountId: string;
  accountCode: string;
  accountName: string;
  reportCategory: string;
  contextLabel: string;
  periodLabel: string;
  displayedBalanceMinor: number;
};

const pnlSections = [
  { title: "Turnover", categories: ["sales"] },
  { title: "Cost of Sales", categories: ["cost_of_sales"], subtract: true },
  { title: "Other Income", categories: ["other_income"] },
  { title: "Operating Expenses", categories: ["expense", "depreciation"], subtract: true },
];

const balanceAssetSections = [
  // Bank accounts report under Current Assets (the internal "bank" category
  // only exists for payment/deposit routing)
  { title: "Current Assets", categories: ["bank", "current_asset"] },
  { title: "Fixed Assets", categories: ["fixed_asset"] },
  { title: "Non-Current Assets", categories: ["non_current_asset"] },
];

const balanceLiabilitySections = [
  { title: "Current Liabilities", categories: ["current_liability"] },
  { title: "Non-Current Liabilities", categories: ["non_current_liability"] },
];

const trialBalanceSections = [
  { title: "Assets", types: ["asset"] },
  { title: "Liabilities", types: ["liability"] },
  { title: "Equity", types: ["equity"] },
  { title: "Revenue", types: ["revenue"] },
  { title: "Expense", types: ["expense"] },
];

/**
 * The four statements, so you can move between them without going back out to
 * the report centre and in again.
 */
const reportTabs: Array<{ key: Tab; label: string; shortLabel: string; view: string }> = [
  { key: "trial", label: "Trial Balance", shortLabel: "Trial", view: "trial-balance" },
  { key: "pnl", label: "Profit & Loss", shortLabel: "P&L", view: "profit-and-loss" },
  { key: "balance", label: "Balance Sheet", shortLabel: "Balance", view: "balance-sheet" },
  { key: "ledger", label: "General Ledger", shortLabel: "Ledger", view: "general-ledger" },
];

/**
 * Colour by account type. A trial balance is a long undifferentiated list of
 * codes; colour is the cheapest way to let the eye find the liabilities.
 *
 * Read straight from the chart of accounts rather than restated here, so an
 * asset is the same blue in both places. A second copy of these five colours
 * drifted apart the moment one of them was edited.
 */
const chipForType = (type: string) =>
  typeMeta[type.toLowerCase() as keyof typeof typeMeta]?.badgeClass ??
  "bg-slate-100 text-slate-700 ring-slate-200";

function rowsForCategories(rows: StatementRow[], categories: string[]) {
  return rows.filter((row) => categories.includes(row.reportCategory));
}

function totalRows(rows: StatementRow[]) {
  return rows.reduce((total, row) => total + row.balanceMinor, 0);
}

function rowsForTypes(rows: TrialBalanceRow[], types: string[]) {
  return rows.filter((row) => types.includes(row.accountType));
}

function totalDebit(rows: TrialBalanceRow[]) {
  return rows.reduce((total, row) => total + row.debitMinor, 0);
}

function totalCredit(rows: TrialBalanceRow[]) {
  return rows.reduce((total, row) => total + row.creditMinor, 0);
}

export function ReportsWorkspace({
  period,
  organizationName,
  dateFormat, // 🚀 ADDED
  accounts,
  trialBalance: initialTrialBalance,
  profitAndLoss: initialProfitAndLoss,
  balanceSheet: initialBalanceSheet,
  retainedEarningsMinor: initialRetainedEarningsMinor = 0,
  generalLedger: initialGeneralLedger,
}: ReportsWorkspaceProps) {
  /*
   * The figures for whichever period is on screen.
   *
   * Seeded from the server's first render and replaced when the dates change.
   * They cannot be narrowed here: a profit and loss is a sum over its period
   * and a balance sheet is every movement up to its date plus the earnings
   * from before it — none of which survives filtering rows that were already
   * aggregated. So Update asks the server again.
   */
  const [reports, setReports] = useState({
    trialBalance: initialTrialBalance,
    profitAndLoss: initialProfitAndLoss,
    balanceSheet: initialBalanceSheet,
    retainedEarningsMinor: initialRetainedEarningsMinor,
    generalLedger: initialGeneralLedger,
  });
  const [updating, startUpdating] = useTransition();

  const { trialBalance, profitAndLoss, balanceSheet, retainedEarningsMinor, generalLedger } =
    reports;
  const { format: formatMinor } = useCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const viewParam = searchParams.get("view");

  let activeTab: Tab = "trial";
  if (viewParam === "profit-and-loss") activeTab = "pnl";
  else if (viewParam === "balance-sheet") activeTab = "balance";
  else if (viewParam === "general-ledger") activeTab = "ledger";

  const [accountFilter, setAccountFilter] = useState("all");

  /**
   * How the printed statements are set. Presentation only — the format is
   * handed to the renderer and never reaches buildPrintReport, so it cannot
   * change a figure on any report.
   */
  const printFormat = usePrintFormat();
  const [drilldown, setDrilldown] = useState<DrilldownSelection | null>(null);

  const [inputStartDate, setInputStartDate] = useState(period.yearStart);
  const [inputEndDate, setInputEndDate] = useState(period.asOfDate);
  const [appliedStartDate, setAppliedStartDate] = useState(period.yearStart);
  const [appliedEndDate, setAppliedEndDate] = useState(period.asOfDate);

  // 🚀 ADDED: Helper to format dates based on user preference!
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;

    if (dateFormat === "DD/MM/YYYY") return `${day}/${month}/${year}`;
    if (dateFormat === "MM/DD/YYYY") return `${month}/${day}/${year}`;
    return dateStr; // Default YYYY-MM-DD
  };

  // --- REAL EXCEL / CSV EXPORT LOGIC ---
  const handleExportCSV = () => {
    let csvData = "";
    
    // Helper to make numbers Excel-friendly (e.g. 1000.50 instead of £1,000.50)
    const toExcelNumber = (minor: number) => (minor / 100).toFixed(2);

    if (activeTab === "trial") {
      const header = ["Account", "Type", "Debit", "Credit"];
      const csvRows = trialBalance.map(r => `"${r.code} - ${r.name}","${r.accountType}","${toExcelNumber(r.debitMinor)}","${toExcelNumber(r.creditMinor)}"`);
      csvData = [header.join(","), ...csvRows].join("\n");
    } else if (activeTab === "ledger") {
      const header = ["Date", "Account", "Memo", "Source", "Debit", "Credit"];
      const csvRows = filteredLedger.map(r => `"${r.journalDate}","${r.accountCode} - ${r.accountName}","${r.memo || ""}","${r.sourceLabel}","${toExcelNumber(r.debitMinor)}","${toExcelNumber(r.creditMinor)}"`);
      csvData = [header.join(","), ...csvRows].join("\n");
    } else if (activeTab === "pnl") {
      const header = ["Category", "Account Code", "Account Name", "Balance"];
      const csvRows = profitAndLoss.map(r => `"${r.reportCategory}","${r.code}","${r.name}","${toExcelNumber(r.balanceMinor)}"`);
      csvData = [header.join(","), ...csvRows].join("\n");
    } else if (activeTab === "balance") {
      const header = ["Category", "Account Code", "Account Name", "Balance"];
      const csvRows = balanceSheet.map(r => `"${r.reportCategory}","${r.code}","${r.name}","${toExcelNumber(r.balanceMinor)}"`);
      csvData = [header.join(","), ...csvRows].join("\n");
    }

    // Trigger the file download in the browser
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `WAW_Export_${activeTab}_${appliedEndDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Builds the printable model for whichever report is on screen.
   *
   * Built from the report data, not from the rendered table: the on-screen
   * `ReportCard` shows 20 rows at a time, so a printed General Ledger used to
   * contain only the page you were looking at, and the card's `overflow-hidden`
   * clipped the Credit column off the right edge of the paper.
   */
  const buildPrintReport = (): PrintReport | null => {
    const generatedAt = new Date().toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const base = { orgName: organizationName, generatedAt };

    if (activeTab === "trial") {
      return {
        ...base,
        title: "Trial Balance",
        note: `Through ${formatDate(appliedEndDate)}`,
        columns: [
          { label: "Account", width: "46%" },
          { label: "Type", width: "16%" },
          { label: "Debit", align: "right", width: "19%" },
          { label: "Credit", align: "right", width: "19%" },
        ],
        // The whole trial balance, never the section the screen happens to be
        // filtered to. A document headed "Trial Balance" whose totals do not
        // balance because it holds assets only is worse than no document.
        rows: trialBalance.map((row) => ({
          cells: [
            `${row.code} - ${row.name}`,
            row.accountType.charAt(0).toUpperCase() + row.accountType.slice(1),
            formatMinor(row.debitMinor),
            formatMinor(row.creditMinor),
          ],
        })),
        footer: {
          cells: [
            "Totals",
            "",
            formatMinor(totalDebit(trialBalance)),
            formatMinor(totalCredit(trialBalance)),
          ],
          variant: "total",
        },
      };
    }

    if (activeTab === "ledger") {
      const accountName =
        accountFilter === "all"
          ? null
          : accounts.find((account) => account.id === accountFilter);
      return {
        ...base,
        title: "General Ledger",
        note: `${formatDate(appliedStartDate)} to ${formatDate(appliedEndDate)}`,
        parameters: accountName
          ? [`Account: ${accountName.code} - ${accountName.name}`]
          : ["All accounts"],
        columns: [
          { label: "Date", width: "12%" },
          { label: "Account", width: "26%" },
          { label: "Memo", width: "24%" },
          { label: "Source", width: "14%" },
          { label: "Debit", align: "right", width: "12%" },
          { label: "Credit", align: "right", width: "12%" },
        ],
        rows: filteredLedger.map((row) => ({
          cells: [
            formatDate(row.journalDate),
            `${row.accountCode} - ${row.accountName}`,
            row.memo || "",
            row.sourceLabel,
            formatMinor(row.debitMinor),
            formatMinor(row.creditMinor),
          ],
        })),
        footer: {
          cells: [
            `Totals — ${filteredLedger.length} entr${filteredLedger.length === 1 ? "y" : "ies"}`,
            "",
            "",
            "",
            formatMinor(filteredLedger.reduce((sum, row) => sum + row.debitMinor, 0)),
            formatMinor(filteredLedger.reduce((sum, row) => sum + row.creditMinor, 0)),
          ],
          variant: "total",
        },
      };
    }

    // P&L and Balance Sheet share a shape: headed sections of accounts, each
    // with a subtotal, then the summary lines.
    const statementRows = (
      sections: Array<{ title: string; categories: string[]; subtract?: boolean }>,
      source: StatementRow[]
    ): PrintRow[] => {
      const built: PrintRow[] = [];
      for (const section of sections) {
        const sectionRows = rowsForCategories(source, section.categories);
        if (sectionRows.length === 0) continue;

        built.push({ cells: [section.title, ""], variant: "section" });
        for (const row of sectionRows) {
          // `|| 0` collapses -0, matching the screen: negating an empty account
          // otherwise prints "-0.00" on every unused line.
          const displayed = (section.subtract ? -row.balanceMinor : row.balanceMinor) || 0;
          built.push({ cells: [row.name, formatMinor(displayed)], indent: true });
        }
        const sectionTotal = totalRows(sectionRows);
        built.push({
          cells: [
            `Total ${section.title}`,
            formatMinor(section.subtract ? -sectionTotal : sectionTotal),
          ],
          variant: "subtotal",
          indent: true,
        });
      }
      return built;
    };

    const statementColumns = [
      { label: "Account", width: "68%" },
      { label: "Amount", align: "right" as const, width: "32%" },
    ];

    const netProfitMinor = profitAndLoss.reduce((total, row) => {
      if (
        row.reportCategory === "cost_of_sales" ||
        row.reportCategory === "expense" ||
        row.reportCategory === "depreciation"
      ) {
        return total - row.balanceMinor;
      }
      return total + row.balanceMinor;
    }, 0);

    if (activeTab === "pnl") {
      const grossProfit =
        totalRows(rowsForCategories(profitAndLoss, ["sales"])) -
        totalRows(rowsForCategories(profitAndLoss, ["cost_of_sales"]));

      return {
        ...base,
        title: "Profit and Loss",
        note: `For the period ${formatDate(appliedStartDate)} to ${formatDate(appliedEndDate)}`,
        columns: statementColumns,
        rows: [
          ...statementRows(pnlSections, profitAndLoss),
          { cells: ["", ""], variant: "spacer" },
          { cells: ["Gross Profit", formatMinor(grossProfit)], variant: "subtotal" },
          { cells: ["Net Profit", formatMinor(netProfitMinor)], variant: "total" },
        ],
      };
    }

    // Balance sheet
    const assetSections = balanceAssetSections;
    const liabilitySections = balanceLiabilitySections;
    const totalAssets = assetSections.reduce(
      (total, section) => total + totalRows(rowsForCategories(balanceSheet, section.categories)),
      0
    );
    const totalLiabilities = liabilitySections.reduce(
      (total, section) => total + totalRows(rowsForCategories(balanceSheet, section.categories)),
      0
    );
    const totalEquity =
      totalRows(rowsForCategories(balanceSheet, ["equity"])) + netProfitMinor;

    return {
      ...base,
      title: "Balance Sheet",
      note: `As of ${formatDate(appliedEndDate)}`,
      columns: statementColumns,
      rows: [
        ...statementRows(
          [
            ...assetSections,
            ...liabilitySections,
            { title: "Equity", categories: ["equity"] },
          ],
          balanceSheet
        ),
        { cells: ["", ""], variant: "spacer" },
        { cells: ["Total Assets", formatMinor(totalAssets)], variant: "subtotal" },
        {
          cells: ["Net Assets", formatMinor(totalAssets - totalLiabilities)],
          variant: "subtotal",
        },
        { cells: ["Total Equity", formatMinor(totalEquity)], variant: "total" },
      ],
    };
  };

  const handleExportPDF = () => {
    const report = buildPrintReport();
    if (!report) return;
    printReportDocument(buildReportHtml(report, printFormat));
  };

  const handleUpdateReport = () => {
    startUpdating(async () => {
      try {
        const next = await getReportsForPeriod(inputStartDate, inputEndDate);
        setReports({
          trialBalance: next.trialBalance,
          profitAndLoss: next.profitAndLoss,
          balanceSheet: next.balanceSheet,
          retainedEarningsMinor: next.retainedEarningsMinor,
          generalLedger: next.generalLedger,
        });
        /* Applied only once the figures are in. Moving the labels first would
           put the new period over the old numbers for as long as the request
           takes — briefly showing exactly the mismatch this replaced. */
        setAppliedStartDate(inputStartDate);
        setAppliedEndDate(inputEndDate);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Those dates could not be applied."
        );
      }
    });
  };

  // A new array on every render, which is fine now: ReportCard clamps its page
  // during render instead of resetting it from an effect that depended on this
  // array by reference. That effect fired every render and snapped the General
  // Ledger back to page 1 the moment you pressed Next.
  const filteredLedger = generalLedger.filter((row) => {
    if (accountFilter !== "all" && row.accountId !== accountFilter) {
      return false;
    }

    return row.journalDate >= appliedStartDate && row.journalDate <= appliedEndDate;
  });

  const drilldownRows = useMemo(() => {
    if (!drilldown) return [];
    return generalLedger.filter((row) => {
      if (row.accountId !== drilldown.accountId) return false;
      if (drilldown.kind !== "pnl") return true;
      return row.journalDate >= appliedStartDate && row.journalDate <= appliedEndDate;
    });
  }, [drilldown, generalLedger, appliedStartDate, appliedEndDate]);

  function openTrialDrilldown(row: TrialBalanceRow) {
    const displayedBalanceMinor = row.debitMinor - row.creditMinor;
    setDrilldown({
      kind: "trial",
      accountId: row.accountId,
      accountCode: row.code,
      accountName: row.name,
      reportCategory: row.reportCategory,
      contextLabel: "Trial Balance",
      periodLabel: `Through ${formatDate(appliedEndDate)}`, // 🚀 UPDATED
      displayedBalanceMinor,
    });
  }

  function openStatementDrilldown(row: StatementRow, contextLabel: "Profit and Loss" | "Balance Sheet", displayedBalanceMinor: number) {
    setDrilldown({
      kind: contextLabel === "Profit and Loss" ? "pnl" : "balance",
      accountId: row.accountId,
      accountCode: row.code,
      accountName: row.name,
      reportCategory: row.reportCategory,
      contextLabel,
      periodLabel: contextLabel === "Profit and Loss" ? `${formatDate(appliedStartDate)} to ${formatDate(appliedEndDate)}` : `Through ${formatDate(appliedEndDate)}`, // 🚀 UPDATED
      displayedBalanceMinor,
    });
  }

  function openSelectedAccountInLedger() {
    if (!drilldown) return;
    setAccountFilter(drilldown.accountId);
    router.push(`${pathname}?view=general-ledger`);
  }

  return (
    /*
     * items-start keeps the coordinate baseline steady for the GSAP scroll sync.
     *
     * The drilldown column is always present at xl and animates between 0 and
     * 380px, rather than being added and removed. `grid-template-columns` only
     * interpolates when the number of tracks matches on both sides, so a column
     * that appears from nothing would snap instead of easing — the statements
     * would jump to their narrower width in a single frame.
     *
     * The panel keeps a fixed 380px width while the track grows underneath it,
     * so it slides in from the right instead of having its contents reflow
     * every frame. `body { overflow-x: clip }` in globals.css keeps that
     * overhang from producing a horizontal scrollbar.
     */
    <div
      className={cn(
        "relative grid grid-cols-1 gap-6 xl:items-start",
        "xl:grid-cols-[minmax(0,1fr)_0px] xl:gap-x-0",
        "xl:transition-[grid-template-columns,column-gap] xl:duration-300 xl:ease-out",
        "motion-reduce:transition-none",
        drilldown && "xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-x-6"
      )}
    >
      {/* The id was the old ScrollTrigger's trigger element; nothing reads it
          now that the drawer sticks by itself, but it is a harmless anchor. */}
      <div id="report-main-content" className="min-w-0">
        
        {/* The print format sits up here rather than inside Export because it
            is a setting, not an action: it persists and applies to every export
            that follows, where the rest of that menu happens once and is done. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to Report Center
          </Link>

          <PrintFormatSettings getPreviewReport={buildPrintReport} />
        </div>

        {/* Move between the four statements without going back out to the
            report centre. Scrolls sideways on a phone rather than wrapping into
            a second row that pushes the report below the fold. */}
        <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex w-full min-w-max gap-1 rounded-xl bg-slate-100 p-1">
            {reportTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => router.push(`${pathname}?view=${tab.view}`)}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 sm:text-sm",
                  activeTab === tab.key
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Controls. Every field is fluid — the old fixed 140px dates and 310px
            account select overflowed the card on a phone. */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Date range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Start date"
                    value={inputStartDate}
                    onChange={(e) => setInputStartDate(e.target.value)}
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-2.5 text-sm outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-[150px] sm:px-3"
                  />
                  <span className="shrink-0 text-sm font-medium text-slate-400">to</span>
                  <input
                    type="date"
                    aria-label="End date"
                    value={inputEndDate}
                    onChange={(e) => setInputEndDate(e.target.value)}
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-2.5 text-sm outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-[150px] sm:px-3"
                  />
                </div>
              </div>

              {activeTab === "ledger" && (
                <div className="min-w-0 sm:w-[280px]">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Account
                  </label>
                  <select
                    value={accountFilter}
                    onChange={(event) => setAccountFilter(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All accounts</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Every report is recomputed for the chosen period, so this is a
                  request rather than a filter — and it says so while it runs.
                  Disabled meanwhile: a second press would race the first, and
                  whichever answered last would win regardless of which dates
                  were asked for. */}
              <button
                onClick={handleUpdateReport}
                disabled={updating}
                className="h-10 flex-1 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 xl:flex-none"
              >
                {updating ? "Updating…" : "Update"}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 xl:flex-none">
                    <Download className="size-4 text-slate-500" />
                    Export
                    <ChevronDown className="size-3 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem className="cursor-pointer font-medium" onClick={handleExportCSV}>
                    <FileSpreadsheet className="size-4 mr-2 text-green-600" />
                    Export as CSV (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer font-medium" onClick={handleExportPDF}>
                    <FileText className="size-4 mr-2 text-red-500" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <ReportValidationCard
            validation={useMemo(() => {
              const netProfitMinor = profitAndLoss.reduce((total, row) => {
                if (
                  row.reportCategory === "cost_of_sales" ||
                  row.reportCategory === "expense" ||
                  row.reportCategory === "depreciation"
                ) {
                  return total - row.balanceMinor;
                }
                return total + row.balanceMinor;
              }, 0);
              return validateReports(
                trialBalance,
                profitAndLoss,
                balanceSheet,
                netProfitMinor,
                retainedEarningsMinor
              );
            }, [trialBalance, profitAndLoss, balanceSheet, retainedEarningsMinor])}
          />
        </div>

        {/* Screen only. The PDF is built from the report data in
            buildPrintReport(), not cloned from this markup. */}
        <div id="report-print-area">
          {activeTab === "trial" ? (
            <TrialBalanceSectionsCard
              title="Trial Balance"
              orgName={organizationName}
              note={`Through ${formatDate(appliedEndDate)}`} // 🚀 WRAPPED IN FORMATTER!
              rows={trialBalance}
              onAccountDrilldown={openTrialDrilldown}
            />
          ) : null}

        {activeTab === "pnl" ? (
          <ProfitAndLossCard
            title="Profit and Loss"
            orgName={organizationName}
            note={`For the period ${formatDate(appliedStartDate)} to ${formatDate(appliedEndDate)}`} // 🚀 WRAPPED IN FORMATTER!
            rows={profitAndLoss}
            onAccountDrilldown={(row, displayedBalanceMinor) =>
              openStatementDrilldown(row, "Profit and Loss", displayedBalanceMinor)
            }
          />
        ) : null}

        {activeTab === "balance" ? (
          <BalanceSheetCard
            title="Balance Sheet"
            orgName={organizationName}
            note={`As of ${formatDate(appliedEndDate)}`} // 🚀 WRAPPED IN FORMATTER!
            rows={balanceSheet}
            retainedEarningsMinor={retainedEarningsMinor}
            netProfitMinor={profitAndLoss.reduce((total, row) => {
              if (row.reportCategory === "cost_of_sales" || row.reportCategory === "expense" || row.reportCategory === "depreciation") {
                return total - row.balanceMinor;
              }
              return total + row.balanceMinor;
            }, 0)}
            onAccountDrilldown={(row, displayedBalanceMinor) =>
              openStatementDrilldown(row, "Balance Sheet", displayedBalanceMinor)
            }
          />
        ) : null}

        {activeTab === "ledger" ? (
          <ReportCard
            title="General Ledger"
            orgName={organizationName}
            // The ledger filters on a range, so it says so — "Through <date>"
            // hid the start date the rows were actually filtered by.
            note={`${formatDate(appliedStartDate)} to ${formatDate(appliedEndDate)}`}
            rows={filteredLedger}
            columns={["Date", "Account", "Memo", "Source", "Debit", "Credit"]}
            getRowKey={(row) => row.id}
            renderRow={(row) => [
              formatDate(row.journalDate), // 🚀 UPDATED THE TABLE ROW DATES!
              `${row.accountCode} - ${row.accountName}`,
              row.memo || "",
              row.sourceLabel,
              formatMinor(row.debitMinor),
              formatMinor(row.creditMinor),
            ]}
            // Totals over the whole filtered set, not the page on screen — the
            // exported PDF has carried them since the print rebuild and the
            // screen should not disagree with it.
            footer={[
              `Totals — ${filteredLedger.length} entr${filteredLedger.length === 1 ? "y" : "ies"}`,
              "",
              "",
              "",
              formatMinor(filteredLedger.reduce((sum, row) => sum + row.debitMinor, 0)),
              formatMinor(filteredLedger.reduce((sum, row) => sum + row.creditMinor, 0)),
            ]}
          />
        ) : null}
        </div>
      </div>

      {drilldown ? (
        <ReportDrilldownDrawer
          selection={drilldown}
          rows={drilldownRows}
          onClose={() => setDrilldown(null)}
          onOpenLedger={openSelectedAccountInLedger}
        />
      ) : null}
    </div>
  );
}

// ─── SHARED PRESENTATION ─────────────────────────────────────────────────────

/**
 * The card every statement sits in.
 *
 * Padding steps down on small screens — a flat `p-8` spent 64px of a 375px
 * phone on whitespace. The letterhead reads organisation → statement → period,
 * the order somebody checking a report scans it in.
 */
function ReportShell({
  title,
  orgName,
  note,
  children,
  footer,
}: {
  title: string;
  orgName: string;
  note: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {orgName}
        </p>
        <h2 className="m-0 mt-1.5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl lg:text-[26px]">
          {title}
        </h2>
        <p className="m-0 mt-1 text-xs font-medium text-slate-500 sm:text-sm">{note}</p>
      </header>
      {children}
      {footer}
    </section>
  );
}

/** Figures only line up in a column if every digit is the same width. */
function Money({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums whitespace-nowrap", className)}>{children}</span>
  );
}

function ReportEmptyState({
  message = "No posted journal data for this report.",
}: {
  message?: string;
}) {
  return (
    <div className="px-4 py-16 text-center sm:px-8">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-slate-50 text-slate-300 ring-1 ring-slate-100">
        <FileText className="size-5" />
      </div>
      <p className="m-0 text-sm font-bold text-slate-600">Nothing to report yet</p>
      <p className="m-0 mx-auto mt-1 max-w-xs text-xs font-medium text-slate-400">{message}</p>
    </div>
  );
}

/** Shared pager, sized for a thumb on mobile and tidy on desktop. */
function ReportPager({
  page,
  totalPages,
  totalRows,
  perPage,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  perPage: number;
  onPageChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <p className="m-0 text-xs font-semibold text-slate-500">
        Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, totalRows)} of {totalRows}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40 sm:flex-none"
        >
          Prev
        </button>
        <span className="px-1 text-xs font-bold text-slate-500 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40 sm:flex-none"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── STRICTLY TYPED COMPONENTS BELOW ──────────────────────────────────────────────

function ReportValidationCard({ validation }: { validation: ReportValidation }) {
  const { format: formatMinor } = useCurrency();
  const checks = [
    {
      label: "Trial Balance",
      pass: validation.trialBalanceBalanced,
      detail: `Dr ${formatMinor(validation.trialBalanceDebitTotal)} = Cr ${formatMinor(validation.trialBalanceCreditTotal)}`,
    },
    {
      label: "Balance Sheet",
      pass: validation.balanceSheetBalanced,
      detail: `Assets ${formatMinor(validation.totalAssets)} = Liabilities ${formatMinor(validation.totalLiabilities)} + Equity ${formatMinor(validation.totalEquity)}`,
    },
    {
      label: "P&L → B/S Tie",
      pass: validation.netProfitTiesToBalanceSheet,
      detail: `Net Profit ${formatMinor(validation.netProfit)} = Earnings ${formatMinor(validation.currentYearEarnings)}`,
    },
  ];

  const allPass = checks.every((check) => check.pass);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white",
            allPass ? "bg-emerald-500" : "bg-red-500"
          )}
        >
          {allPass ? "✓" : "!"}
        </span>
        <p className="m-0 text-xs font-bold text-slate-700">
          {allPass ? "Your books balance" : "These books do not balance"}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.label}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              check.pass
                ? "border-emerald-100 bg-emerald-50/60"
                : "border-red-200 bg-red-50"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-xs font-black",
                  check.pass ? "text-emerald-600" : "text-red-500"
                )}
              >
                {check.pass ? "✓" : "✗"}
              </span>
              <span
                className={cn(
                  "text-[11px] font-bold uppercase tracking-wider",
                  check.pass ? "text-emerald-700" : "text-red-700"
                )}
              >
                {check.label}
              </span>
            </div>
            {/* Breaks anywhere rather than forcing the card wider than a phone. */}
            <p className="m-0 mt-1 text-[11px] font-medium leading-relaxed text-slate-500 [overflow-wrap:anywhere]">
              {check.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfitAndLossCard({
  title,
  orgName, // 🚀 ADDED
  note,
  rows,
  onAccountDrilldown,
}: {
  title: string;
  orgName: string; // 🚀 ADDED
  note: string;
  rows: StatementRow[];
  onAccountDrilldown: (row: StatementRow, displayedBalanceMinor: number) => void;
}) {
  const grossProfit =
    totalRows(rowsForCategories(rows, ["sales"])) -
    totalRows(rowsForCategories(rows, ["cost_of_sales"]));
  const netProfit = pnlSections.reduce((total, section) => {
    const sectionTotal = totalRows(rowsForCategories(rows, section.categories));
    return section.subtract ? total - sectionTotal : total + sectionTotal;
  }, 0);

  return (
    <StatementSectionsCard
      title={title}
      orgName={orgName} // 🚀 ADDED
      note={note}
      sections={pnlSections.map((section) => ({
        ...section,
        rows: rowsForCategories(rows, section.categories),
      }))}
      onAccountDrilldown={onAccountDrilldown}
      summary={[
        { label: "Gross Profit", value: grossProfit },
        { label: "Net Profit", value: netProfit, isFinal: true },
      ]}
    />
  );
}

function BalanceSheetCard({
  title,
  orgName, // 🚀 ADDED
  note,
  rows,
  netProfitMinor,
  retainedEarningsMinor,
  onAccountDrilldown,
}: {
  title: string;
  orgName: string; // 🚀 ADDED
  note: string;
  rows: StatementRow[];
  netProfitMinor: number;
  /** Profit from before this period. No account holds it until a close runs. */
  retainedEarningsMinor: number;
  onAccountDrilldown: (row: StatementRow, displayedBalanceMinor: number) => void;
}) {
  const assetSections = balanceAssetSections.map((section) => ({
    ...section,
    rows: rowsForCategories(rows, section.categories),
  }));
  const liabilitySections = balanceLiabilitySections.map((section) => ({
    ...section,
    rows: rowsForCategories(rows, section.categories),
    // Not negated. A balance sheet states what the business owes as a positive
    // amount on the other side of the equation — Accounts Payable read
    // "-3,024,301.50" while the balance check beside it read "Liabilities
    // 3,024,301.50" from the same number. Only the display was negated: the
    // totals and Net Assets = Assets - Liabilities always used the raw figure,
    // so nothing here changes what the report adds up to.
  }));
  const equityRows = rowsForCategories(rows, ["equity"]);
  const totalAssets = assetSections.reduce((total, section) => total + totalRows(section.rows), 0);
  const totalLiabilities = liabilitySections.reduce((total, section) => total + totalRows(section.rows), 0);
  const totalEquity = totalRows(equityRows) + retainedEarningsMinor + netProfitMinor;

  /*
   * Two lines the chart of accounts cannot supply.
   *
   * 3100 Retained Earnings and 3200 Current Year Earnings exist in every
   * workspace and are always empty, because only a year-end close posts to them
   * and nothing runs one. So the equity section listed them at zero while the
   * profit they represent sat in revenue and expense accounts, and the sheet
   * did not balance by that amount.
   *
   * Shown as their own rows rather than folded into the total, so the reader
   * can see where equity comes from instead of being asked to trust a figure
   * that appears from nowhere. Zero rows are dropped: a business in its first
   * period has no prior earnings, and a line saying so is noise.
   */
  const earningsRows: StatementRow[] = [
    retainedEarningsMinor !== 0 && {
      accountId: "computed-retained-earnings",
      code: "",
      name: "Retained earnings (prior periods)",
      accountType: "equity",
      reportCategory: "equity",
      balanceMinor: retainedEarningsMinor,
    },
    netProfitMinor !== 0 && {
      accountId: "computed-current-earnings",
      code: "",
      name: "Earnings this period",
      accountType: "equity",
      reportCategory: "equity",
      balanceMinor: netProfitMinor,
    },
  ].filter(Boolean) as StatementRow[];

  return (
    <StatementSectionsCard
      title={title}
      orgName={orgName} // 🚀 ADDED
      note={note}
      sections={[
        ...assetSections,
        ...liabilitySections,
        { title: "Equity", categories: ["equity"], rows: [...equityRows, ...earningsRows] },
      ]}
      extraRows={[]}
      onAccountDrilldown={onAccountDrilldown}
      summary={[
        { label: "Total Assets", value: totalAssets },
        { label: "Net Assets", value: totalAssets - totalLiabilities },
        { label: "Total Equity", value: totalEquity, isFinal: true },
      ]}
    />
  );
}

function TrialBalanceSectionsCard({
  title,
  orgName, // 🚀 ADDED
  note,
  rows,
  onAccountDrilldown,
}: {
  title: string;
  orgName: string; // 🚀 ADDED
  note: string;
  rows: TrialBalanceRow[];
  onAccountDrilldown: (row: TrialBalanceRow) => void;
}) {
  const { format: formatMinor } = useCurrency();
  const [activeSection, setActiveSection] = useState("all");

  const hasRows = trialBalanceSections.some((section) => rowsForTypes(rows, section.types).length > 0);

  const sectionTabs = [{ title: "All", types: ["asset", "liability", "equity", "revenue", "expense"] }, ...trialBalanceSections];

  const filteredRows = activeSection === "all"
    ? rows
    : rows.filter((row) => {
        const section = trialBalanceSections.find((s) => s.title.toLowerCase() === activeSection);
        return section ? section.types.includes(row.accountType) : true;
      });

  const sectionDebit = totalDebit(filteredRows);
  const sectionCredit = totalCredit(filteredRows);

  const balanced = sectionDebit === sectionCredit;

  return (
    <ReportShell title={title} orgName={orgName} note={note}>
      {!hasRows ? (
        <ReportEmptyState />
      ) : (
        <>
          {/* Section filter. Scrolls sideways on a phone instead of wrapping
              onto three rows. */}
          <div className="-mb-px border-b border-slate-100 px-4 py-3 sm:px-6 lg:px-8">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-1.5">
                {sectionTabs.map((section) => {
                  const sectionRows = rowsForTypes(rows, section.types);
                  if (section.title !== "All" && sectionRows.length === 0) return null;
                  const isActive =
                    (activeSection === "all" && section.title === "All") ||
                    activeSection === section.title.toLowerCase();
                  return (
                    <button
                      key={section.title}
                      type="button"
                      onClick={() =>
                        setActiveSection(
                          section.title === "All" ? "all" : section.title.toLowerCase()
                        )
                      }
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm",
                        isActive
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {section.title}
                      <span
                        className={cn(
                          "rounded px-1 text-[10px] font-black tabular-nums",
                          isActive ? "bg-white/20 text-white" : "bg-white text-slate-400"
                        )}
                      >
                        {sectionRows.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Phones: one card per account. Four columns of figures on a 375px
              screen meant scrolling a 720px table sideways to read the Credit. */}
          <ul className="m-0 divide-y divide-slate-100 p-0 sm:hidden">
            {filteredRows.map((row) => (
              <li key={row.accountId}>
                <button
                  type="button"
                  onClick={() => onAccountDrilldown(row)}
                  className="w-full px-4 py-3.5 text-left transition active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="m-0 min-w-0 text-sm font-bold text-slate-800">
                      <span className="font-mono text-slate-400">{row.code}</span> {row.name}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                        chipForType(row.accountType)
                      )}
                    >
                      {row.accountType}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Debit
                      </p>
                      <Money
                        className={cn(
                          "mt-0.5 block text-sm font-bold",
                          row.debitMinor === 0 ? "text-slate-300" : "text-slate-900"
                        )}
                      >
                        {formatMinor(row.debitMinor)}
                      </Money>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Credit
                      </p>
                      <Money
                        className={cn(
                          "mt-0.5 block text-sm font-bold",
                          row.creditMinor === 0 ? "text-slate-300" : "text-slate-900"
                        )}
                      >
                        {formatMinor(row.creditMinor)}
                      </Money>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Tablet and up: the real table. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-6 py-3 text-left lg:px-8">Account</th>
                  <th className="px-3 py-3 text-left">Type</th>
                  <th className="px-3 py-3 text-right">Debit</th>
                  <th className="px-6 py-3 text-right lg:px-8">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.accountId}
                    className="group cursor-pointer transition-colors hover:bg-blue-50/40 active:bg-blue-100/50"
                    onClick={() => onAccountDrilldown(row)}
                  >
                    <td className="px-6 py-3 font-medium text-slate-700 transition-colors group-hover:text-blue-600 lg:px-8">
                      <span className="font-mono text-slate-400">{row.code}</span> {row.name}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                          chipForType(row.accountType)
                        )}
                      >
                        {row.accountType}
                      </span>
                    </td>
                    {/* Empty sides greyed: a column of identical black zeroes
                        buries the figures that actually carry a balance. */}
                    <td className="px-3 py-3 text-right">
                      <Money
                        className={cn(
                          "font-medium",
                          row.debitMinor === 0 ? "text-slate-300" : "text-slate-800"
                        )}
                      >
                        {formatMinor(row.debitMinor)}
                      </Money>
                    </td>
                    <td className="px-6 py-3 text-right lg:px-8">
                      <Money
                        className={cn(
                          "font-medium",
                          row.creditMinor === 0 ? "text-slate-300" : "text-slate-800"
                        )}
                      >
                        {formatMinor(row.creditMinor)}
                      </Money>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals as a footer band rather than a table row, so they stay put
              and read the same on both layouts. */}
          <div className="border-t-2 border-slate-900 bg-slate-50/80 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <p className="m-0 text-sm font-black text-slate-900">Totals</p>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                    balanced
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-red-50 text-red-700 ring-red-200"
                  )}
                >
                  {balanced ? "Balanced" : "Out of balance"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-8">
                <div className="sm:text-right">
                  <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Debit
                  </p>
                  <Money className="mt-0.5 block text-base font-black text-slate-900">
                    {formatMinor(sectionDebit)}
                  </Money>
                </div>
                <div className="sm:text-right">
                  <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Credit
                  </p>
                  <Money className="mt-0.5 block text-base font-black text-slate-900">
                    {formatMinor(sectionCredit)}
                  </Money>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}

// USED FOR P&L AND BALANCE SHEET
function StatementSectionsCard({
  title,
  orgName, // 🚀 ADDED
  note,
  sections,
  extraRows = [],
  summary,
  onAccountDrilldown,
}: {
  title: string;
  orgName: string; // 🚀 ADDED
  note: string;
  sections: Array<{
    title: string;
    categories: string[];
    rows: StatementRow[];
    subtract?: boolean;
  }>;
  extraRows?: Array<{ label: string; value: number }>;
  summary: Array<{ label: string; value: number; isFinal?: boolean }>;
  onAccountDrilldown: (row: StatementRow, displayedBalanceMinor: number) => void;
}) {
  const { format: formatMinor } = useCurrency();
  const hasRows = sections.some((section) => section.rows.length > 0) || extraRows.length > 0;

  return (
    <ReportShell title={title} orgName={orgName} note={note}>
      {!hasRows ? (
        <ReportEmptyState />
      ) : (
        // No min-width: this statement is two columns and fits any phone. It
        // used to be forced to 600px, so it scrolled sideways for no reason.
        <div className="px-4 py-2 sm:px-6 lg:px-8">
          <table className="w-full text-sm">
            <tbody>
              {/* Empty sections are dropped here rather than inside the row
                  component, so "is this the first heading" is answerable — it
                  drives the top spacing. */}
              {sections
                .filter((section) => section.rows.length > 0)
                .map((section, index) => (
                  <StatementSectionRows
                    key={section.title}
                    section={section}
                    isFirst={index === 0}
                    onAccountDrilldown={onAccountDrilldown}
                  />
                ))}

              {extraRows.map((row) => (
                <tr key={row.label}>
                  <td className="py-3 pl-3 font-medium text-slate-700 sm:pl-5">{row.label}</td>
                  <td className="py-3 text-right">
                    <Money className="text-slate-900">{formatMinor(row.value)}</Money>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasRows && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6 lg:px-8">
          <table className="w-full text-sm">
            <tbody>
              {summary.map((row) => (
                <tr key={row.label}>
                  <td
                    className={cn(
                      "py-2 font-bold text-slate-900",
                      row.isFinal && "text-base font-black"
                    )}
                  >
                    {row.label}
                  </td>
                  <td className="py-2 text-right">
                    <Money
                      className={cn(
                        "inline-block min-w-[110px] border-t border-slate-300 pt-1.5 text-right font-bold text-slate-900",
                        row.isFinal &&
                          "border-b-4 border-double border-slate-400 pb-1 text-base font-black"
                      )}
                    >
                      {formatMinor(row.value)}
                    </Money>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  );
}

function StatementSectionRows({
  section,
  isFirst = false,
  onAccountDrilldown,
}: {
  section: {
    title: string;
    rows: StatementRow[];
    subtract?: boolean;
  };
  isFirst?: boolean;
  onAccountDrilldown: (row: StatementRow, displayedBalanceMinor: number) => void;
}) {
  const { format: formatMinor } = useCurrency();
  if (section.rows.length === 0) return null;

  const sectionTotal = totalRows(section.rows);
  const displayedTotal = section.subtract ? -sectionTotal : sectionTotal;

  return (
    <>
      <tr>
        <td
          colSpan={2}
          className={cn(
            "pb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500",
            isFirst ? "pt-2" : "pt-6"
          )}
        >
          {section.title}
        </td>
      </tr>

      {section.rows.map((row) => {
        // `|| 0` collapses -0: negating an empty account produced "-0.00" on
        // every unused liability line, which reads like a real credit balance.
        const displayedBalanceMinor = (section.subtract ? -row.balanceMinor : row.balanceMinor) || 0;
        return (
          <tr
            key={row.accountId}
            className="group cursor-pointer transition-colors hover:bg-blue-50/40 active:bg-blue-100/50"
            onClick={() => onAccountDrilldown(row, displayedBalanceMinor)}
          >
            {/* Indent is small on a phone — 32px of it was a meaningful slice
                of the width available for the account name. */}
            <td className="py-2.5 pl-3 pr-2 font-medium text-slate-600 transition-colors group-hover:text-blue-600 sm:pl-5">
              {row.name}
            </td>
            <td className="py-2.5 text-right">
              <Money
                className={cn(
                  "transition-colors group-hover:text-blue-600",
                  displayedBalanceMinor === 0 ? "text-slate-300" : "text-slate-700"
                )}
              >
                {formatMinor(displayedBalanceMinor)}
              </Money>
            </td>
          </tr>
        );
      })}

      <tr>
        <td className="py-3 pl-3 text-sm font-bold text-slate-900 sm:pl-5">
          Total {section.title}
        </td>
        <td className="py-3 text-right">
          <Money className="inline-block min-w-[100px] border-t border-slate-200 pt-1.5 text-right font-bold text-slate-900">
            {formatMinor(displayedTotal)}
          </Money>
        </td>
      </tr>
    </>
  );
}

// USED FOR GENERAL LEDGER AND TRIAL BALANCE
function ReportCard<T>({
  title,
  orgName, // 🚀 ADDED
  note,
  rows,
  columns,
  renderRow,
  footer,
  getRowKey,
  onRowClick,
}: {
  title: string;
  orgName: string; // 🚀 ADDED
  note: string;
  rows: T[];
  columns: string[];
  renderRow: (row: T) => ReactNode[];
  footer?: string[];
  getRowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const totalPages = Math.ceil(rows.length / itemsPerPage) || 1;

  // Clamped during render rather than reset from an effect. The effect this
  // replaces depended on the rows array by reference and so fired on every
  // render, snapping the page back to 1 the moment you pressed Next. Clamping
  // keeps you on a valid page when the filter shrinks the set, without ever
  // fighting a click.
  const page = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    return rows.slice(startIndex, startIndex + itemsPerPage);
  }, [rows, page]);

  // The two trailing columns are always the money pair; the leading ones are
  // the description of the entry.
  const moneyFrom = columns.length - 2;

  return (
    <ReportShell
      title={title}
      orgName={orgName}
      note={note}
      footer={
        <ReportPager
          page={page}
          totalPages={totalPages}
          totalRows={rows.length}
          perPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      }
    >
      {rows.length === 0 ? (
        <ReportEmptyState />
      ) : (
        <>
          {/* Phones: one card per entry. Six columns cannot be read on a 375px
              screen, and the old 720px table meant scrolling sideways for the
              Debit and Credit — the two figures you opened the ledger for. */}
          <ul className="m-0 divide-y divide-slate-100 p-0 sm:hidden">
            {paginatedRows.map((row, index) => {
              const cells = renderRow(row);
              return (
                <li key={getRowKey?.(row, index) ?? index}>
                  <div
                    className={cn("px-4 py-3.5", onRowClick && "cursor-pointer active:bg-slate-50")}
                    onClick={() => onRowClick?.(row)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-bold tabular-nums text-slate-500">
                        {cells[0]}
                      </span>
                      {cells.length > 3 && (
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {cells[3]}
                        </span>
                      )}
                    </div>

                    <p className="m-0 mt-1 text-sm font-bold text-slate-800 [overflow-wrap:anywhere]">
                      {cells[1]}
                    </p>
                    {cells[2] ? (
                      <p className="m-0 mt-0.5 text-xs font-medium text-slate-500 [overflow-wrap:anywhere]">
                        {cells[2]}
                      </p>
                    ) : null}

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {columns.slice(moneyFrom).map((column, offset) => {
                        const value = cells[moneyFrom + offset];
                        return (
                          <div key={column} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                            <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {column}
                            </p>
                            <Money className="mt-0.5 block text-sm font-bold text-slate-900">
                              {value}
                            </Money>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Tablet and up: the full table. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {columns.map((column, i) => (
                    <th
                      key={column}
                      className={cn(
                        "py-3",
                        i >= moneyFrom ? "text-right" : "text-left",
                        i === 0 && "pl-6 lg:pl-8",
                        i === columns.length - 1 ? "pr-6 lg:pr-8" : "pr-3",
                        i > 0 && "pl-3"
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRows.map((row, index) => (
                  <tr
                    key={getRowKey?.(row, index) ?? index}
                    className={cn(
                      "group transition-colors hover:bg-blue-50/40",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {renderRow(row).map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cn(
                          "py-3 align-top text-slate-600",
                          cellIndex >= moneyFrom ? "text-right" : "text-left",
                          cellIndex === 0 && "pl-6 whitespace-nowrap lg:pl-8",
                          cellIndex === columns.length - 1 ? "pr-6 lg:pr-8" : "pr-3",
                          cellIndex > 0 && "pl-3"
                        )}
                      >
                        {cellIndex >= moneyFrom ? (
                          <Money className="font-medium text-slate-800">{cell}</Money>
                        ) : (
                          <span
                            className={cn(
                              onRowClick && cellIndex === 0 && "font-medium group-hover:text-blue-600"
                            )}
                          >
                            {cell}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {footer ? (
            <div className="border-t-2 border-slate-900 bg-slate-50/80 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-sm font-black text-slate-900">{footer[0]}</p>
                <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-8">
                  {columns.slice(moneyFrom).map((column, offset) => (
                    <div key={column} className="sm:text-right">
                      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {column}
                      </p>
                      <Money className="mt-0.5 block text-base font-black text-slate-900">
                        {footer[moneyFrom + offset]}
                      </Money>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </ReportShell>
  );
}

function ReportDrilldownDrawer({
  selection,
  rows,
  onClose,
  onOpenLedger,
}: {
  selection: DrilldownSelection;
  rows: GeneralLedgerRow[];
  onClose: () => void;
  onOpenLedger: () => void;
}) {
  const { format: formatMinor } = useCurrency();
  const categoryLabel = reportCategoryLabels[selection.reportCategory as keyof typeof reportCategoryLabels] ?? selection.reportCategory;
  const debitTotal = rows.reduce((total, row) => total + row.debitMinor, 0);
  const creditTotal = rows.reduce((total, row) => total + row.creditMinor, 0);

  const isAccountsReceivable = selection.accountName.toLowerCase().includes("accounts receivable") || selection.accountCode === "1100";
  const isAccountsPayable = selection.accountName.toLowerCase().includes("accounts payable") || selection.accountCode === "2100";

  const drawerRef = useRef<HTMLElement>(null);

  const [page, setPage] = useState(1);
  const rowsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const paginatedRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // 🚀 Track if we are on a mobile device
  const [isMobile, setIsMobile] = useState(false);

  // Back to page one when a different account is opened, adjusted during render
  // rather than from an effect so the drawer never paints page 3 of the old
  // account's entries before correcting itself.
  const [lastAccountId, setLastAccountId] = useState(selection.accountId);
  if (lastAccountId !== selection.accountId) {
    setLastAccountId(selection.accountId);
    setPage(1);
  }

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1280);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 🚀 ONLY run GSAP scrolling on Desktop!
  useEffect(() => {
    if (isMobile) return;

    gsap.registerPlugin(ScrollTrigger);
    let anim: gsap.core.Tween;

    const leftCol = document.getElementById("report-main-content");
    const drawer = drawerRef.current;

    if (!leftCol || !drawer) return;

    const rect = leftCol.getBoundingClientRect();
    const elapsed = 112 - rect.top;
    const maxMove = leftCol.offsetHeight - drawer.offsetHeight;
    const immediateY = Math.max(0, Math.min(maxMove, elapsed));

    gsap.set(drawer, { y: immediateY });

    const ctx = gsap.context(() => {
      anim = gsap.fromTo(drawer,
        { y: immediateY },
        {
          y: () => Math.max(0, leftCol.offsetHeight - drawer.offsetHeight),
          ease: "none",
          scrollTrigger: {
            trigger: "#report-main-content",
            start: "top 112px",
            end: () => `bottom ${112 + drawer.offsetHeight}px`,
            scrub: true,
            invalidateOnRefresh: true,
          }
        }
      );
    });

    // Settled rather than fired per resize. The column width is animated now,
    // so an un-debounced observer ran a full ScrollTrigger.refresh() on every
    // frame of that 300ms transition — around eighteen recalculations, each one
    // able to nudge the drawer. This waits for the width to stop changing and
    // recalculates once.
    let settleTimer: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => ScrollTrigger.refresh(), 180);
    });

    resizeObserver.observe(leftCol);
    resizeObserver.observe(drawer);

    return () => {
      if (anim) {
        anim.scrollTrigger?.kill();
        anim.kill();
      }
      clearTimeout(settleTimer);
      resizeObserver.disconnect();
    };
  }, [isMobile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 20);
    return () => clearTimeout(timer);
  }, [selection, page]);

  // 🚀 THE CONTENT: We build the drawer UI here so we can optionally Portal it below
  const content = (
    <aside
      ref={drawerRef}
      className={cn(
        isMobile
          ? "flex flex-col w-full max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
          : // No entrance animation here: GSAP owns this element's transform for
            // the scroll sync, and anything else writing to it fights that.
            "z-10 static w-[380px] max-h-[calc(100vh-8rem)] rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
      )}
    >
      <div className="shrink-0 border-b border-slate-100 p-4 pt-6 xl:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-slate-400">{selection.contextLabel}</p>
            <h2 className="mt-1 text-base font-bold text-slate-900 break-words">{selection.accountCode} - {selection.accountName}</h2>
            <p className="mt-1 text-xs text-slate-500">{categoryLabel} / {selection.periodLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-400 xl:hidden">Close</span>
            <button type="button" onClick={onClose} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200">
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <p className="font-bold uppercase text-slate-400">Balance</p>
            <p className="mt-1 font-mono font-bold text-slate-900">{formatMinor(selection.displayedBalanceMinor)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <p className="font-bold uppercase text-slate-400">Debit</p>
            <p className="mt-1 font-mono font-bold text-slate-900">{formatMinor(debitTotal)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <p className="font-bold uppercase text-slate-400">Credit</p>
            <p className="mt-1 font-mono font-bold text-slate-900">{formatMinor(creditTotal)}</p>
          </div>
        </div>
        
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={onOpenLedger} className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-bold text-white transition hover:bg-blue-700 shadow-sm">
            Open in General Ledger
          </button>

          {isAccountsReceivable && (
            <button 
              type="button" 
              onClick={() => window.location.href = "/reports/ar-aging"} 
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm gap-1.5"
            >
              <Clock className="size-4 text-slate-500" />
              <span>Open AR Aging Schedule</span>
            </button>
          )}

          {isAccountsPayable && (
            <button 
              type="button" 
              onClick={() => window.location.href = "/reports/ap-aging"} 
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm gap-1.5"
            >
              <Building2 className="size-4 text-slate-500" />
              <span>Open AP Aging Schedule</span>
            </button>
          )}
        </div>
      </div>
      
      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No posted ledger entries exist for this account and period.</div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 bg-white">
          <div className="flex-1 overflow-x-auto overflow-y-auto modern-scrollbar min-h-0">
            <table className="w-full text-xs min-w-[480px] table-layout-fixed">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="border-b border-slate-100 font-semibold uppercase text-slate-400">
                  <th className="px-3 py-2 text-left w-[85px]">Date</th>
                  <th className="px-3 py-2 text-left w-[215px]">Details</th>
                  <th className="px-3 py-2 text-right w-[90px]">Debit</th>
                  <th className="px-3 py-2 text-right w-[90px]">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedRows.map((row) => {
                  let displayDate = row.journalDate;
                  const parts = row.journalDate.split("-");
                  if (parts.length === 3) {
                    const [y, m, d] = parts;
                    displayDate = `${d}/${m}/${y}`;
                  }
                  
                  return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-600 align-top whitespace-nowrap">{displayDate}</td>
                    <td className="px-3 py-2 align-top">
                      <p className="font-semibold text-slate-800 break-words">{row.memo || row.journalMemo || "Posted journal"}</p>
                      <p className="mt-0.5 text-slate-400 break-words">{row.sourceLabel}{row.contactName ? ` / ${row.contactName}` : ""}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-300 tracking-tight">{row.journalId.slice(0, 8)}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700 align-top whitespace-nowrap">{formatMinor(row.debitMinor)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700 align-top whitespace-nowrap">{formatMinor(row.creditMinor)}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 mt-auto shrink-0">
              <span className="text-xs font-semibold text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs font-bold text-slate-600 rounded hover:bg-slate-200 disabled:opacity-30 transition-all"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs font-bold text-slate-600 rounded hover:bg-slate-200 disabled:opacity-30 transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );

  // 🚀 THE ULTIMATE FIX: On mobile, we rip the drawer out of the layout entirely and float it over the screen as a true Modal Popup!
  if (isMobile && typeof document !== "undefined") {
    return createPortal(
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 p-4 animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>,
      document.body
    );
  }

  // On desktop, render it normally into the GSAP layout
  return content;
}