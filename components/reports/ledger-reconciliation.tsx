"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import {
  getAgingReconciliation,
  type AgingReconciliation,
} from "@/app/(dashboard)/reports/aging-reconciliation-action";
import { agingMoney as money } from "@/components/reports/aging-money";

/**
 * Proves an aged report against the ledger, on the report itself.
 *
 * The report walks the documents and adds up what looks unsettled. The control
 * account already holds the answer, arrived at from the other direction — every
 * posting that has ever touched receivables or payables. Two independent
 * derivations of the same number, so agreement is evidence and disagreement is
 * a defect with an amount attached.
 *
 * Shown always, not only when it fails. A check that appears only on failure
 * teaches nobody it exists, and the point is that the figure above it can be
 * relied on.
 */

type Props = {
  /** Which side of the ledger this report is claiming. */
  side: "receivable" | "payable";
  /** The report's own total, in major units — what the summary card shows. */
  reportTotal: number;
  /** Currency symbol, from the workspace. */
  symbol: string;
  /**
   * Credits the report has already taken off its total. Passed back so the
   * strip can say so, rather than the reader wondering where they went.
   */
  creditsApplied?: number;
  /**
   * The reconciliation data. The report loads it anyway, because it has to
   * apply the adjustments before it can total anything — so it is handed down
   * rather than fetched twice for one screen.
   */
  data: AgingReconciliation | null;
  /** True while `data` is still loading, and false once it failed to load. */
  loading: boolean;
};

/**
 * Loads the reconciliation once for a report.
 *
 * A failure resolves to null rather than throwing: the strip is a check on the
 * report, not part of it, and a report that renders should not be taken down by
 * the thing verifying it.
 */
export function useAgingReconciliation() {
  const [data, setData] = useState<AgingReconciliation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    getAgingReconciliation()
      .then((result) => {
        if (live) setData(result);
      })
      .catch(() => {
        /* Left as null; the strip renders nothing. */
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return { reconciliation: data, reconciliationLoading: loading };
}

export function LedgerReconciliation({
  side,
  reportTotal,
  symbol,
  creditsApplied = 0,
  data,
  loading,
}: Props) {
  if (!data && !loading) return null;

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Checking this report against the ledger…
      </div>
    );
  }

  const isReceivable = side === "receivable";
  const accountName = isReceivable ? "1100 Accounts Receivable" : "2000 Accounts Payable";
  const missing = isReceivable ? data.missingReceivableAccount : data.missingPayableAccount;

  if (missing) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-amber-900">
          This workspace has no <span className="font-semibold">{accountName}</span> account, so
          there is nothing to check the report against.
        </p>
      </div>
    );
  }

  const ledgerMinor = isReceivable ? data.receivableControlMinor : data.payableControlMinor;
  const ledgerTotal = ledgerMinor / 100;

  /* Compared in whole pence. Both sides came from integers, so any difference
     is a real one rather than a floating-point artefact — but the report total
     arrives here as a float, so it is rounded back before comparing. */
  const differenceMinor = Math.round(reportTotal * 100) - ledgerMinor;
  const agrees = differenceMinor === 0;

  if (agrees) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        <span className="font-semibold text-emerald-900">
          Agrees with the ledger — {money(ledgerTotal, symbol)}
        </span>
        <span className="text-emerald-700">
          Matches <span className="font-medium">{accountName}</span> on the trial balance
          {creditsApplied > 0 && (
            <>
              , after {money(creditsApplied, symbol)} of credits and{" "}
              {isReceivable ? "receipts" : "payments"} on account
            </>
          )}
          .
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="space-y-1">
        <p className="font-semibold text-amber-900">
          Out by {money(Math.abs(differenceMinor) / 100, symbol)} against the ledger
        </p>
        <p className="text-amber-800">
          This report totals {money(reportTotal, symbol)}, while{" "}
          <span className="font-medium">{accountName}</span> holds{" "}
          {money(ledgerTotal, symbol)}. Credits and payments on account are already accounted
          for, so a gap here means a document whose ledger entries no longer match it — most
          often one settled twice. Check the general ledger for{" "}
          {isReceivable ? "1100" : "2000"} around the amount above. The trial balance is the
          authority.
        </p>
      </div>
    </div>
  );
}
