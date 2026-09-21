"use client";

import { useCurrency } from "@/components/currency-provider";
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  User,
  Mail,
  MapPin,
  Printer,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import {
  computeCustomerStatement,
  type CustomerStatementBundle,
  type StatementRow,
} from "@/lib/accounting/customer-statement";


const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type View = "activity" | "outstanding";
type Preset = "all" | "this_month" | "last_month" | "custom";

/** Build a from/to range (yyyy-mm-dd) for a preset, derived purely from the
 *  server-provided as-at date so it never touches the client clock. */
function presetRange(preset: Preset, todayIso: string): { from: string | null; to: string | null } {
  const [y, m] = todayIso.split("-").map(Number);
  const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");

  if (preset === "this_month") {
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  }
  if (preset === "last_month") {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(lastDay(ly, lm))}` };
  }
  return { from: null, to: null };
}

function DaysBadge({ row }: { row: StatementRow }) {
  if (row.daysLate) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
        {row.daysLate} {row.daysLate === 1 ? "day" : "days"} late
      </span>
    );
  }
  if (row.daysEarly) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        {row.daysEarly} {row.daysEarly === 1 ? "day" : "days"} early
      </span>
    );
  }
  return null;
}

export function CustomerStatements({
  bundles,
  todayIso,
  vatRegistered = true,
}: {
  bundles: CustomerStatementBundle[];
  todayIso: string;
  /**
   * Whether the business is registered for VAT. When it is not, the breakdown
   * drops the VAT column entirely rather than showing a line of zeros — which
   * reads as "VAT was accounted for and came to nothing" rather than "VAT does
   * not apply here", and is the impression an unregistered business is not
   * allowed to give a customer.
   */
  vatRegistered?: boolean;
}) {
  const router = useRouter();
  const { currency: workspaceCurrency } = useCurrency();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(bundles[0]?.customer.id ?? "");
  const [view, setView] = useState<View>("activity");
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeBundle = useMemo(
    () => bundles.find((b) => b.customer.id === selectedCustomerId),
    [bundles, selectedCustomerId]
  );

  const range = useMemo(() => {
    if (preset === "custom") {
      return { from: customFrom || null, to: customTo || null };
    }
    return presetRange(preset, todayIso);
  }, [preset, customFrom, customTo, todayIso]);

  const statement = useMemo(() => {
    if (!activeBundle) return null;
    return computeCustomerStatement({
      invoices: activeBundle.invoices,
      documents: activeBundle.documents,
      // Without this the statement defaults to GBP and the mixed-currency
      // guard excludes every document, producing a statement of zeros.
      params: { fromDate: range.from, toDate: range.to, asOfDate: todayIso, currency: workspaceCurrency },
    });
  }, [activeBundle, range, todayIso, workspaceCurrency]);

  const openPrintStatement = () => {
    if (!selectedCustomerId) return;
    const qs = new URLSearchParams();
    if (range.from) qs.set("from", range.from);
    if (range.to) qs.set("to", range.to);
    qs.set("asOf", todayIso);
    window.open(`/print/statement/${selectedCustomerId}?${qs.toString()}`, "_blank");
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasCreditNotes = activeBundle?.documents.some((d) => d.kind === "credit_note") ?? false;

  return (
    <div className="flex-1 space-y-6">
      {/* HEADER WRAPPER MATCHING YOUR STANDARD */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 print:hidden">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Customer Statements</h2>
          <p className="mt-1 text-sm text-slate-500">
            Statement of account with running balance, aging, and itemised activity.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="size-4 text-slate-500" />
            Back
          </button>
          {activeBundle && (
            <button
              onClick={openPrintStatement}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Printer className="size-4 text-slate-500" />
              Print Statement
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3 print:hidden">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Customer</label>
          {/* With nobody to choose between, this is a flat box rather than a
              menu. An empty dropdown still opens — onto a blank strip — which
              reads as a page that has failed to load rather than a workspace
              that has no customers yet. The same reason the VAT treatment is a
              plain box for a business that is not registered. */}
          {bundles.length === 0 ? (
            <div className="flex w-full items-center rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
              No customers yet
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {bundles.map((b) => (
                  <option key={b.customer.id} value={b.customer.id}>
                    {b.customer.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-slate-400" />
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">View</label>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setView("activity")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === "activity" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setView("outstanding")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === "outstanding" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Outstanding
            </button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Period</label>
          <div className="relative">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              disabled={view === "outstanding"}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All time</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="custom">Custom range…</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-slate-400" />
          </div>
          {preset === "custom" && view === "activity" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs shadow-sm outline-none focus:border-blue-500"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs shadow-sm outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {!activeBundle || !statement ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          {/* Two different situations wearing one message. "No customer
              accounts" is wrong for a customer who exists but has nothing in
              the chosen period, and sends someone to the wrong screen. */}
          {bundles.length === 0
            ? "No customers yet. Add one in Sales → Customers to build a statement."
            : "Nothing to show for this customer in the selected period."}
        </div>
      ) : (
        <div className="space-y-6 print:space-y-4">
          {/* Recipient + as-at */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-6 md:flex-row">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  Statement Recipient
                </span>
                <h4 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <User className="size-5 text-slate-400" />
                  {activeBundle.customer.name}
                </h4>
                {activeBundle.customer.email && (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Mail className="size-4 text-slate-400" /> {activeBundle.customer.email}
                  </p>
                )}
              </div>
              <div className="space-y-1 text-left text-sm text-slate-500 md:text-right">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Billing Address
                </label>
                <p className="flex items-start gap-2 whitespace-pre-line md:justify-end">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  {activeBundle.customer.billingAddress || "No address provided"}
                </p>
                <p className="pt-2 text-xs text-slate-400">
                  As at {formatDate(todayIso)}
                  {view === "activity" && (range.from || range.to) ? (
                    <>
                      {" · "}
                      {range.from ? formatDate(range.from) : "start"} – {range.to ? formatDate(range.to) : "today"}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </div>

          {statement.excludedCurrencies.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {statement.excludedCurrencies.join(", ")} documents are excluded — this statement covers {statement.currency} only.
              </span>
            </div>
          )}

          {view === "activity" ? (
            <ActivityView
              statement={statement}
              expanded={expanded}
              toggleRow={toggleRow}
              hasCreditNotes={hasCreditNotes}
              vatRegistered={vatRegistered}
            />
          ) : (
            <OutstandingView statement={statement} />
          )}

          <AgingFooter statement={statement} />
        </div>
      )}
    </div>
  );
}

function SummaryTiles({
  tiles,
}: {
  tiles: { label: string; value: number; tone?: "default" | "positive" | "accent" }[];
}) {
  const { format: formatCurrency } = useCurrency();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 print:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-xl border p-5 shadow-sm print:p-4 ${
            t.tone === "accent" ? "border-indigo-100 bg-indigo-50/50" : "border-slate-200 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${
              t.tone === "accent" ? "text-indigo-700" : "text-slate-500"
            }`}
          >
            {t.label}
          </p>
          <h3
            className={`mt-2 text-2xl font-bold ${
              t.tone === "positive"
                ? "text-emerald-600"
                : t.tone === "accent"
                  ? "text-indigo-900"
                  : "text-slate-900"
            }`}
          >
            {formatCurrency(t.value)}
          </h3>
        </div>
      ))}
    </div>
  );
}

function ActivityView({
  statement,
  expanded,
  toggleRow,
  hasCreditNotes,
  vatRegistered,
}: {
  statement: NonNullable<ReturnType<typeof computeCustomerStatement>>;
  expanded: Set<string>;
  toggleRow: (id: string) => void;
  hasCreditNotes: boolean;
  /** False hides the VAT column outright — see CustomerStatements. */
  vatRegistered: boolean;
}) {
  const { format: formatCurrency } = useCurrency();
  return (
    <>
      <SummaryTiles
        tiles={[
          { label: "Opening Balance", value: statement.openingBalanceMinor },
          { label: "Invoiced", value: statement.totalDebitsMinor },
          { label: "Paid", value: statement.totalCreditsMinor, tone: "positive" },
          { label: "Closing Balance", value: statement.closingBalanceMinor, tone: "accent" },
        ]}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <FileSpreadsheet className="size-4 text-slate-400" />
            Itemised Activity Statement
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3 text-right">Charge</th>
                <th className="px-4 py-3 text-right">Payment</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              <tr className="bg-slate-50/40 font-semibold text-slate-600">
                <td className="px-4 py-3" colSpan={5}>
                  Balance brought forward
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">
                  {formatCurrency(statement.openingBalanceMinor)}
                </td>
              </tr>

              {statement.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-normal text-slate-400">
                    No activity in the selected period.
                  </td>
                </tr>
              )}

              {statement.rows.map((row, idx) => {
                const isInvoice = row.kind === "invoice";
                const isOpen = row.invoiceId ? expanded.has(row.invoiceId) : false;
                return (
                  <React.Fragment key={`${row.kind}-${row.ref}-${idx}`}>
                    <tr
                      className={`transition-colors ${isInvoice ? "cursor-pointer hover:bg-slate-50/60" : ""} ${
                        row.informational ? "text-slate-400" : ""
                      }`}
                      onClick={isInvoice && row.invoiceId ? () => toggleRow(row.invoiceId!) : undefined}
                    >
                      <td className="px-4 py-3.5 align-top">{formatDate(row.date)}</td>
                      <td className="px-4 py-3.5 align-top font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          {isInvoice &&
                            (isOpen ? (
                              <ChevronDown className="size-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="size-3.5 text-slate-400" />
                            ))}
                          {row.ref}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{row.description}</span>
                          {isInvoice && row.daysOverdue ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                              {row.daysOverdue} {row.daysOverdue === 1 ? "day" : "days"} overdue
                            </span>
                          ) : null}
                          {row.kind === "payment" && <DaysBadge row={row} />}
                          {row.informational && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {formatCurrency(row.amountMinor ?? 0)} · no balance impact
                            </span>
                          )}
                        </div>
                        {isInvoice && (row.poNumber || row.reference) ? (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                            {row.poNumber ? <span>PO: {row.poNumber}</span> : null}
                            {row.reference ? <span>Ref: {row.reference}</span> : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top font-medium text-slate-700">
                        {row.debitMinor ? formatCurrency(row.debitMinor) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top font-medium text-emerald-600">
                        {row.creditMinor ? formatCurrency(row.creditMinor) : "—"}
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right align-top font-bold ${
                          row.informational ? "text-slate-400" : "text-slate-900"
                        }`}
                      >
                        {formatCurrency(row.runningBalanceMinor)}
                      </td>
                    </tr>

                    {isInvoice && isOpen && row.lines && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 font-bold uppercase tracking-wide text-slate-400">
                                  <th className="px-3 py-2">Description</th>
                                  <th className="px-3 py-2 text-right">Qty</th>
                                  <th className="px-3 py-2 text-right">Unit</th>
                                  <th className="px-3 py-2 text-right">Net</th>
                                  {vatRegistered && <th className="px-3 py-2 text-right">VAT</th>}
                                  <th className="px-3 py-2 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 text-slate-600">
                                {row.lines.map((line, li) => (
                                  <tr key={li}>
                                    <td className="px-3 py-2">{line.description}</td>
                                    <td className="px-3 py-2 text-right">{line.quantity}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(line.unitPriceMinor)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(line.subtotalMinor)}</td>
                                    {vatRegistered && (
                                      <td className="px-3 py-2 text-right">
                                        {formatCurrency(line.taxMinor)}
                                        {line.taxRate ? (
                                          <span className="ml-1 text-[10px] text-slate-400">({line.taxRate}%)</span>
                                        ) : null}
                                      </td>
                                    )}
                                    <td className="px-3 py-2 text-right font-semibold text-slate-800">
                                      {formatCurrency(line.totalMinor)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold text-slate-900">
                <td className="px-4 py-3" colSpan={5}>
                  Balance carried forward
                </td>
                <td className="px-4 py-3 text-right text-indigo-900">
                  {formatCurrency(statement.closingBalanceMinor)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {hasCreditNotes && (
        <p className="text-xs italic text-slate-400">
          Credit notes are shown for reference only and are not yet reflected in the running balance.
        </p>
      )}
    </>
  );
}

function OutstandingView({
  statement,
}: {
  statement: NonNullable<ReturnType<typeof computeCustomerStatement>>;
}) {
  const { format: formatCurrency } = useCurrency();
  return (
    <>
      <SummaryTiles
        tiles={[
          { label: "Total Outstanding", value: statement.aging.total, tone: "accent" },
          { label: "Current", value: statement.aging.current, tone: "positive" },
          { label: "1–30 Days", value: statement.aging.d1_30 },
          { label: "31+ Days", value: statement.aging.d31_60 + statement.aging.d61_90 + statement.aging.d90plus },
        ]}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {statement.outstandingItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-normal text-slate-400">
                    Nothing outstanding — this account is fully settled.
                  </td>
                </tr>
              )}
              {statement.outstandingItems.map((item) => (
                <tr key={item.invoiceId} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3.5 font-bold text-slate-900">{item.invoiceNo}</td>
                  <td className="px-4 py-3.5 text-slate-500">{formatDate(item.issueDate)}</td>
                  <td className="px-4 py-3.5 text-slate-500">{item.dueDate ? formatDate(item.dueDate) : "—"}</td>
                  <td className="px-4 py-3.5">
                    {item.daysOverdue > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                        {item.daysOverdue} {item.daysOverdue === 1 ? "day" : "days"} overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-500">{formatCurrency(item.totalMinor)}</td>
                  <td className="px-4 py-3.5 text-right text-emerald-600">{formatCurrency(item.paidMinor)}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(item.outstandingMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AgingFooter({
  statement,
}: {
  statement: NonNullable<ReturnType<typeof computeCustomerStatement>>;
}) {
  const { format: formatCurrency } = useCurrency();
  const { aging } = statement;
  const cells = [
    { label: "Current", value: aging.current },
    { label: "1–30 Days", value: aging.d1_30 },
    { label: "31–60 Days", value: aging.d31_60 },
    { label: "61–90 Days", value: aging.d61_90 },
    { label: "90+ Days", value: aging.d90plus },
    { label: "Total", value: aging.total, total: true },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
        Aging Summary
      </div>
      <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className={`p-4 ${c.total ? "bg-indigo-50/40" : ""}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
            <p className={`mt-1 text-lg font-bold ${c.total ? "text-indigo-900" : "text-slate-900"}`}>
              {formatCurrency(c.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
