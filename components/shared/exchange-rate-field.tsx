"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDocumentExchangeRate } from "@/app/(dashboard)/exchange-rate-actions";

type Props = {
  documentCurrency: string;
  /** The workspace's own currency, known synchronously by the caller. */
  baseCurrency: string;
  /** yyyy-mm-dd — the rate is the one published on the document's own date. */
  issueDate: string;
  rate: number | undefined;
  onRateChange: (rate: number) => void;
  disabled?: boolean;
  /**
   * Show the rate but refuse typed edits, so the only value the document can be
   * recorded at is the published one. Refresh stays available — otherwise a
   * failed lookup would leave the document with no way to get a rate at all.
   */
  readOnly?: boolean;
};

/**
 * The exchange rate a foreign document is recorded at.
 *
 * Renders nothing when the document is already in the workspace currency, so
 * the overwhelmingly common case is untouched.
 *
 * The published rate is fetched as a convenience and pre-filled, but the field
 * stays editable: rates come from a free service with no SLA, and a business may
 * legitimately need the rate their own bank actually gave them rather than the
 * central bank's. Whatever sits here when the document is saved is what the
 * ledger records, and it never changes afterwards.
 */
export function ExchangeRateField({
  documentCurrency,
  baseCurrency,
  issueDate,
  rate,
  onRateChange,
  disabled,
  readOnly = false,
}: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const lookup = useCallback(
    async (force: boolean) => {
      setStatus("loading");
      setNote("");
      try {
        const result = await getDocumentExchangeRate(documentCurrency, issueDate);

        if (!result.ok) {
          setStatus("error");
          setNote(result.reason);
          return;
        }

        setStatus("idle");
        // A rate the user has edited is theirs. Only overwrite it when they
        // explicitly ask to refresh, or when they have not touched it yet.
        if (force || !touched) onRateChange(result.rate);
        setNote(
          result.rolledBack
            ? `Using the rate published ${result.rateDate} — no rate is published at weekends.`
            : `Central bank rate for ${result.rateDate}.`
        );
      } catch {
        setStatus("error");
        setNote("Could not reach the rate service. Enter a rate manually.");
      }
    },
    [documentCurrency, issueDate, onRateChange, touched]
  );

  useEffect(() => {
    if (!documentCurrency || !issueDate) return;
    // Nothing to look up for a document already in the workspace's currency.
    if (documentCurrency === baseCurrency) return;
    // A rate typed for the previous currency is meaningless for this one, so
    // the edit is forgotten and the published rate applies again.
    setTouched(false);
    lookup(true);
    // Deliberately keyed on the currency and date only: re-running whenever the
    // callback identity changes would refetch on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentCurrency, issueDate]);

  // Nothing to show for a document in the workspace's own currency. Decided
  // synchronously from a prop rather than waiting on the lookup, which made the
  // field flash into view on GBP invoices before vanishing again.
  if (documentCurrency === baseCurrency) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Exchange rate
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || status === "loading"}
          onClick={() => lookup(true)}
          className="h-6 gap-1 px-2 text-[11px] font-bold text-slate-500 hover:text-slate-700"
        >
          {status === "loading" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-slate-500">
          1 {documentCurrency} =
        </span>
        <Input
          type="number"
          step="0.000001"
          value={rate ?? ""}
          disabled={disabled}
          // readOnly rather than disabled: the number still has to be legible
          // and selectable, since it is what the ledger entries are built from.
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          onChange={(event) => {
            if (readOnly) return;
            setTouched(true);
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next > 0) onRateChange(next);
          }}
          className={cn(
            "h-9 flex-1 rounded-lg text-sm",
            readOnly && "cursor-default bg-slate-100 font-medium text-slate-600"
          )}
        />
        <span className="shrink-0 text-xs font-medium text-slate-500">{baseCurrency}</span>
      </div>

      <p className={status === "error" ? "text-[11px] text-amber-700" : "text-[11px] text-slate-400"}>
        {note ||
          (readOnly
            ? "Published rate for this date. Recorded on this document and used for its ledger entries."
            : "Recorded on this document and used for its ledger entries.")}
      </p>
    </div>
  );
}
