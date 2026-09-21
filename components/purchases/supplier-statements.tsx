"use client";

import { useCurrency } from "@/components/currency-provider";
import React, { useState, useMemo, useEffect, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, User, Mail, MapPin, Printer, ChevronDown, ArrowLeft, Loader2, Banknote } from "lucide-react";

// Import your hooks and live database server action
import { useCustomers } from "@/components/sales/use-customers";
import { getSupplierBillsAction } from "@/app/(dashboard)/purchases/statements/actions";


function SupplierStatementsContent({ suppliers }: { suppliers: any[] }) {
  const { format: formatCurrency } = useCurrency();
  const searchParams = useSearchParams();
  const urlSupplierId = searchParams.get("supplierId");

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || "");
  const [realBills, setRealBills] = useState<any[]>([]);
  const [billsLoading, setBillsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (urlSupplierId) {
      setSelectedSupplierId(urlSupplierId);
    }
  }, [urlSupplierId]);

  const activeSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId);
  }, [selectedSupplierId, suppliers]);

  // 🔄 Trigger live database fetch on dropdown change
  useEffect(() => {
    if (!selectedSupplierId) {
      setRealBills([]);
      return;
    }

    setBillsLoading(true);
    startTransition(async () => {
      const data = await getSupplierBillsAction(selectedSupplierId);
      setRealBills(data);
      setBillsLoading(false);
    });
  }, [selectedSupplierId]);

  // 🧮 Compute Dynamic Accounting Statistics
  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalSettled = 0;
    let netBalance = 0;

    realBills.forEach(bill => {
      if (bill.status !== "VOID" && bill.status !== "void") {
        totalBilled += bill.amountMinor;
        if (bill.status === "PAID" || bill.status === "paid") {
          totalSettled += bill.amountMinor;
        } else {
          netBalance += bill.amountMinor;
        }
      }
    });

    return { totalBilled, totalSettled, netBalance };
  }, [realBills]);

  return (
    <div className="space-y-6">
      {/* SELECTOR CARD */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Select Active Account</label>
        <div className="relative max-w-md">
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            disabled={suppliers.length === 0}
            className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {suppliers.length === 0 ? (
              <option value="">No suppliers yet</option>
            ) : (
              suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))
            )}
          </select>
          <ChevronDown className="absolute right-3 top-3 size-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {activeSupplier ? (
        <div className="space-y-6 print:space-y-4">
          {/* METRICS CARDS */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:p-4">
              <p className="text-sm font-medium text-slate-500">Total Billed Volume</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(metrics.totalBilled)}</h3>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:p-4">
              <p className="text-sm font-medium text-slate-500">Total Settled Cleared</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(metrics.totalSettled)}</h3>
            </div>
            <div className="rounded-xl border border-slate-200 bg-indigo-50/50 border-indigo-100 p-6 shadow-sm print:p-4">
              <p className="text-sm font-semibold text-indigo-700">Net Balance Outstanding</p>
              <h3 className="text-2xl font-black text-indigo-900 mt-2">{formatCurrency(metrics.netBalance)}</h3>
            </div>
          </div>

          {/* MAIN SHEET CONTAINER */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between gap-6 pb-6 border-b border-slate-100">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  Statement Recipient
                </span>
                <h4 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <User className="size-5 text-slate-400" />
                  {activeSupplier.name}
                </h4>
                <div className="text-sm text-slate-500 space-y-1">
                  <p className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /> {activeSupplier.email || "No email on file"}</p>
                </div>
              </div>

              <div className="space-y-1 text-left md:text-right text-sm text-slate-500">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Billing Remittance Address</label>
                <p className="flex items-start md:justify-end gap-2 whitespace-pre-line">
                  <MapPin className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  {activeSupplier.billingAddress || (activeSupplier as any).address || "No record address provided"}
                </p>
              </div>
            </div>

            {/* TABLE ACTIVITY */}
            <div>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-slate-400" />
                Itemized Activity Statement
              </h3>

              <div className="overflow-x-auto">
                {billsLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 font-semibold text-slate-400 text-sm">
                    <Loader2 className="animate-spin size-4 text-blue-600" />
                    Querying account statements...
                  </div>
                ) : realBills.length === 0 ? (
                  <div className="text-center py-12">
                    <Banknote className="size-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">Clear Ledger History</p>
                    <p className="text-xs text-slate-500 mt-0.5">No purchases or historical bills logged for this supplier yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70">
                        <th className="py-3 px-4">Document Date</th>
                        <th className="py-3 px-4">Reference No</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Amount Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                      {realBills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4">
                            {new Date(bill.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">{bill.ref}</td>
                          <td className="py-3.5 px-4 text-slate-500">
                            {new Date(bill.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border
                              ${bill.status === 'PAID' || bill.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                bill.status === 'PENDING' || bill.status === 'pending' || bill.status === 'APPROVED' || bill.status === 'approved' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-slate-100 text-slate-600 border-slate-200'}`}
                            >
                              {bill.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatCurrency(bill.amountMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          No registered supplier accounts detected.
        </div>
      )}
    </div>
  );
}

export function SupplierStatementsUI({ activeOrgId }: { activeOrgId: string }) {
  const { contacts, loading: contactsLoading } = useCustomers(activeOrgId);
  const router = useRouter();

  // Filter to exclusively show supplier accounts
  const suppliers = useMemo(() => {
    return contacts.filter((c: any) =>
      c.contact_type === "supplier" || c.contact_type === "both" || c.contact_type === "BOTH"
    );
  }, [contacts]);

  const hasSupplier = suppliers.length > 0;

  return (
    <div className="flex-1 space-y-6">

      {/* PRINT ENGINE CSS CORRECTIONS */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          header, nav, sidebar, button, select, .print\\:hidden, [role="navigation"] {
            display: none !important;
          }
          main, .flex-1, body {
            padding-top: 0 !important;
            margin-top: 0 !important;
            background: white !important;
          }
          @page {
            margin: 1.6cm;
          }
        }
      `}} />

      {/* HEADER SECTION */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Supplier Statements</h2>
          <p className="text-slate-500 mt-1">Generate dynamic vendor summaries and itemized billing positions.</p>
        </div>

        {/* BUTTON ROW GRID MATCHING CUSTOMER CODES */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="size-4 text-slate-500" />
            Back
          </button>

          {hasSupplier && (
            <button
              onClick={() => window.print()}
              disabled={contactsLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Printer className="size-4 text-slate-500" />
              Print Statement
            </button>
          )}
        </div>
      </div>

      {contactsLoading ? (
        /* One wait, shaped like what follows it. There were three: the route
           skeleton, a Suspense fallback that could never fire because the child
           is an ordinary client component that never suspends, and a line of
           text. The page settled twice and the second settle looked like a
           different page. */
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-2.5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-10 max-w-md animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      ) : (
        <SupplierStatementsContent suppliers={suppliers} />
      )}
    </div>
  );
}