import { formatMoney } from "@/lib/currency";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type {
  CustomerStatement,
  StatementCustomer,
} from "@/lib/accounting/customer-statement";
import type { StatementTemplateConfig } from "./statement-config";

export type StatementDocumentData = {
  customer: StatementCustomer;
  statement: CustomerStatement;
  period: { from: string | null; to: string | null; asOf: string };
  /**
   * Whether the business is registered for VAT.
   *
   * A business that is not registered may not present VAT amounts to a
   * customer — a column of zeros still reads as "VAT was accounted for", which
   * is the impression the rules exist to prevent. Defaults to true so an older
   * caller that does not pass it keeps showing the breakdown it always showed.
   */
  vatRegistered?: boolean;
};

// The statement carries its own currency, so a printed copy keeps the figures
// it was issued in even if the workspace later changes.
const money = (minor: number, currency?: string | null) => formatMoney(minor, currency);

const day = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const fontClass = (f: StatementTemplateConfig["font"]) =>
  f === "serif" ? "font-serif" : f === "mono" ? "font-mono" : "font-sans";

export function StatementDocument({
  config,
  data,
}: {
  config: StatementTemplateConfig;
  data: StatementDocumentData;
}) {
  const { customer, statement, period } = data;
  /* Undefined means "not told", which for a template that has always shown the
     column is safer read as registered than as not. */
  const showVat = data.vatRegistered !== false;
  const brand = config.brandColor;

  return (
    <div className={cn("bg-white text-slate-800 w-full", fontClass(config.font))}>
      {/* HEADER */}
      <div
        className="flex items-start justify-between gap-6 border-b-2 pb-5"
        style={{ borderColor: brand }}
      >
        <div className="space-y-1.5">
          {config.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logo} alt="Logo" className="max-h-14 object-contain" />
          ) : (
            <h1 className="text-2xl font-black tracking-tight" style={{ color: brand }}>
              {config.statementTitle}
            </h1>
          )}
          {config.logo && (
            <p className="text-sm font-bold" style={{ color: brand }}>
              {config.statementTitle}
            </p>
          )}
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
            {config.companyAddress}
          </p>
          {config.vatNumber && (
            <p className="text-xs text-slate-500">
              VAT: <span className="font-mono font-bold text-slate-700">{config.vatNumber}</span>
            </p>
          )}
          {config.regNumber && (
            <p className="text-xs text-slate-500">
              CRN: <span className="font-mono font-bold text-slate-700">{config.regNumber}</span>
            </p>
          )}
        </div>

        <div className="max-w-[45%] text-right text-xs text-slate-500">
          <p className="mb-1 font-bold uppercase tracking-wide text-slate-400">Statement For</p>
          <p className="text-base font-bold text-slate-900">{customer.name}</p>
          {customer.email && <p>{customer.email}</p>}
          {customer.billingAddress && (
            <p className="whitespace-pre-line leading-relaxed">{customer.billingAddress}</p>
          )}
          <p className="pt-2">
            As at <span className="font-bold text-slate-700">{day(period.asOf)}</span>
            {period.from || period.to ? (
              <>
                <br />
                {period.from ? day(period.from) : "start"} – {period.to ? day(period.to) : "today"}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {config.introText && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {config.introText}
        </p>
      )}

      {/* 1. SUMMARY TILES */}
      {config.showSummaryTiles && (
        <div className="mt-6 grid grid-cols-4 gap-3 text-center">
          {[
            { label: "Opening", value: statement.openingBalanceMinor },
            { label: "Invoiced", value: statement.totalDebitsMinor },
            { label: "Paid", value: statement.totalCreditsMinor },
            { label: "Closing", value: statement.closingBalanceMinor },
          ].map((t) => (
            <div key={t.label} className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t.label}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">{money(t.value, statement.currency)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 2. ACTIVITY LEDGER */}
      {config.showActivityLedger && (
        <table className="statement-ledger mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-2">Date</th>
              <th className="py-2">Reference</th>
              <th className="py-2">Details</th>
              <th className="py-2 text-right">Charge</th>
              <th className="py-2 text-right">Payment</th>
              <th className="py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr className="font-semibold text-slate-600">
              <td className="py-2" colSpan={5}>
                Balance brought forward
              </td>
              <td className="py-2 text-right font-bold text-slate-900">
                {money(statement.openingBalanceMinor, statement.currency)}
              </td>
            </tr>

            {statement.rows.map((row, i) => {
              const hasBreakdown =
                config.showLineBreakdown && row.kind === "invoice" && !!row.lines && row.lines.length > 0;
              return (
              <Fragment key={`row-${i}`}>
                <tr className={cn("statement-row", hasBreakdown && "statement-row-keep", row.informational && "text-slate-400")}>
                  <td className="py-2 align-top">{day(row.date)}</td>
                  <td className="py-2 align-top font-bold text-slate-900">{row.ref}</td>
                  <td className="py-2 align-top">
                    {row.description}
                    {row.informational ? (
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({money(row.amountMinor ?? 0, statement.currency)} · no balance impact)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right align-top">
                    {row.debitMinor ? money(row.debitMinor, statement.currency) : "—"}
                  </td>
                  <td className="py-2 text-right align-top">
                    {row.creditMinor ? money(row.creditMinor, statement.currency) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right align-top font-bold",
                      row.informational ? "text-slate-400" : "text-slate-900"
                    )}
                  >
                    {money(row.runningBalanceMinor, statement.currency)}
                  </td>
                </tr>

                {hasBreakdown && (
                  <tr className="statement-lines">
                    <td colSpan={6} className="px-4 pb-3">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            <th className="py-1">Description</th>
                            <th className="py-1 text-right">Qty</th>
                            <th className="py-1 text-right">Unit</th>
                            <th className="py-1 text-right">Net</th>
                            {showVat && <th className="py-1 text-right">VAT</th>}
                            <th className="py-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-600">
                          {row.lines!.map((ln, li) => (
                            <tr key={li}>
                              <td className="py-1">{ln.description}</td>
                              <td className="py-1 text-right">{ln.quantity}</td>
                              <td className="py-1 text-right">{money(ln.unitPriceMinor, statement.currency)}</td>
                              <td className="py-1 text-right">{money(ln.subtotalMinor, statement.currency)}</td>
                              {showVat && (
                                <td className="py-1 text-right">
                                  {money(ln.taxMinor, statement.currency)}
                                  {ln.taxRate ? <span className="ml-1 text-slate-400">({ln.taxRate}%)</span> : null}
                                </td>
                              )}
                              <td className="py-1 text-right font-semibold text-slate-800">
                                {money(ln.totalMinor, statement.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}

            <tr className="border-t-2 border-slate-200 font-bold text-slate-900">
              <td className="py-2" colSpan={5}>
                Balance carried forward
              </td>
              <td className="py-2 text-right" style={{ color: brand }}>
                {money(statement.closingBalanceMinor, statement.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* 3. AGING SUMMARY */}
      {config.showAgingSummary && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Aging Summary
          </p>
          <div className="grid grid-cols-6 gap-2 text-center text-xs">
            {[
              { label: "Current", value: statement.aging.current },
              { label: "1–30", value: statement.aging.d1_30 },
              { label: "31–60", value: statement.aging.d31_60 },
              { label: "61–90", value: statement.aging.d61_90 },
              { label: "90+", value: statement.aging.d90plus },
              { label: "Total", value: statement.aging.total },
            ].map((c) => (
              <div key={c.label} className="rounded-md border border-slate-200 p-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">{c.label}</p>
                <p className="mt-1 font-bold text-slate-900">{money(c.value, statement.currency)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. OUTSTANDING TABLE */}
      {config.showOutstandingTable && statement.outstandingItems.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Outstanding Invoices
          </p>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-2">Invoice</th>
                <th className="py-2">Issued</th>
                <th className="py-2">Due</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Paid</th>
                <th className="py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {statement.outstandingItems.map((it) => (
                <tr key={it.invoiceId} className="statement-row">
                  <td className="py-2 font-bold text-slate-900">{it.invoiceNo}</td>
                  <td className="py-2 text-slate-500">{day(it.issueDate)}</td>
                  <td className="py-2 text-slate-500">{it.dueDate ? day(it.dueDate) : "—"}</td>
                  <td className="py-2 text-right">{money(it.totalMinor, statement.currency)}</td>
                  <td className="py-2 text-right">{money(it.paidMinor, statement.currency)}</td>
                  <td className="py-2 text-right font-bold text-slate-900">
                    {money(it.outstandingMinor, statement.currency)}
                    {it.daysOverdue > 0 ? (
                      <span className="ml-1 text-[10px] font-bold text-red-600">
                        ({it.daysOverdue}d overdue)
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. DISCLOSURES */}
      {config.showDisclosures && (
        <>
          {statement.rows.some((r) => r.informational) && (
            <p className="mt-6 text-xs italic text-slate-500">
              Informational documents (credit notes, receipts) are shown for reference and do not
              affect the running balance.
            </p>
          )}
          {statement.excludedCurrencies.length > 0 && (
            <p className="mt-2 text-xs italic text-amber-700">
              {statement.excludedCurrencies.join(", ")} documents are excluded — this statement
              covers {statement.currency} only.
            </p>
          )}
        </>
      )}

      {/* FOOTER */}
      {config.footer && (
        <div className="mt-8 whitespace-pre-line border-t border-slate-100 pt-4 text-center text-xs font-bold tracking-wide text-slate-400">
          {config.footer}
        </div>
      )}
    </div>
  );
}
