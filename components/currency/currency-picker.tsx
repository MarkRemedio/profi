"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Search, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CURRENCIES, CURRENCY_CODES, currencySymbol } from "@/lib/currency";
import {
  AVAILABLE_CURRENCIES,
  UPCOMING_CURRENCIES,
  type CatalogueCurrency,
} from "@/lib/currency-catalogue";

/**
 * A currency, chosen from a searchable list.
 *
 * It was five tiles in a row — every supported currency, laid out flat. That
 * reads as the complete set of currencies the product knows about, so somebody
 * whose books are in Kenyan Shillings saw five boxes with no Kenya in them and
 * no way to tell whether they had missed something or the product could not
 * serve them.
 *
 * A search that finds their currency answers that question honestly, and a
 * hundred and thirty-five is exactly the length that has to be searched rather
 * than scanned — which is also why the native select it replaces elsewhere had
 * to go once the supported list stopped being five long.
 *
 * Lives outside `onboarding/` because it is no longer an onboarding control:
 * workspace settings, banking and purchases all choose currencies too, and a
 * shared one is how they keep behaving the same way.
 */
export function CurrencyPicker({
  value,
  onChange,
  id,
  disabled = false,
  availableOnly = false,
  size = "hero",
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  disabled?: boolean;
  /**
   * Drop the currencies the books cannot keep yet.
   *
   * Right for a field naming a currency among many — a bank account, a default
   * for a supplier — where an unpickable option is just noise. Wrong for the
   * base currency, where "we do not have yours yet" is the answer somebody
   * came for.
   */
  availableOnly?: boolean;
  /** "hero" is the onboarding tile; "field" sits in a normal form row. */
  size?: "hero" | "field";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = CURRENCIES[value as keyof typeof CURRENCIES];
  const field = size === "field";

  /* Matched against code, name and countries together, because nobody types
     "AUD" — they type "Australia". */
  const matches = (entry: CatalogueCurrency) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      entry.code.toLowerCase().includes(needle) ||
      entry.name.toLowerCase().includes(needle) ||
      entry.countries.toLowerCase().includes(needle)
    );
  };

  const available = AVAILABLE_CURRENCIES.filter(matches);
  const unsupported = UPCOMING_CURRENCIES.filter(matches);
  const upcoming = availableOnly ? [] : unsupported;

  const row = (entry: CatalogueCurrency) => {
    const isSelected = entry.code === value;
    return (
      <button
        key={entry.code}
        type="button"
        disabled={!entry.available}
        onClick={() => {
          if (!entry.available) return;
          onChange(entry.code);
          setOpen(false);
          setQuery("");
        }}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
          entry.available ? "cursor-pointer hover:bg-slate-50" : "cursor-default opacity-70",
          isSelected && "bg-blue-50/70",
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold",
            entry.available ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-400",
          )}
        >
          {entry.available ? currencySymbol(entry.code) : entry.code.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-bold",
                entry.available ? "text-slate-900" : "text-slate-500",
              )}
            >
              {entry.code}
            </span>
            <span className="truncate text-xs text-slate-500">{entry.name}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-400">{entry.countries}</span>
        </span>
        {entry.available ? (
          isSelected ? <Check className="size-4 shrink-0 text-blue-600" /> : null
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            <Clock className="size-2.5" /> Soon
          </span>
        )}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-3 border bg-white text-left transition-colors",
            "focus:border-blue-500 focus:outline-none",
            "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70",
            field
              ? "h-10 rounded-md border-input px-3"
              : "h-14 rounded-xl border-slate-200 px-4 shadow-sm hover:border-slate-300",
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-full bg-blue-600 font-bold text-white",
                field ? "size-6 text-[10px]" : "size-9 text-sm",
              )}
            >
              {selected ? selected.symbol : "?"}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">
                {selected?.code ?? value}
              </span>
              {/* The name is the tile's second line. In a form row it would
                  crowd the field, where the code is what somebody scans for. */}
              {field ? null : (
                <span className="block truncate text-xs text-slate-500">
                  {selected?.name ?? "Choose a currency"}
                </span>
              )}
            </span>
            {field && selected ? (
              <span className="truncate text-xs text-slate-500">{selected.name}</span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        /* z-[10000] because the popover portals to document.body at z-50 while
           the dialogs this sits in — adding a contact, adding a bank account —
           are z-[9999]. It opened behind them, which reads as the trigger
           doing nothing at all. Above everything is right for a transient
           popover regardless of where it is opened from. */
        className="z-[10000] w-[var(--radix-popover-trigger-width)] min-w-[18rem] overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search currency or country…"
            className="h-11 w-full border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="custom-scrollbar max-h-[19rem] overflow-y-auto">
          {available.length > 0 ? (
            <>
              {/* The heading only earns its place when there is a second group
                  under it to tell apart. */}
              {upcoming.length > 0 ? (
                <p className="sticky top-0 z-10 m-0 bg-white/95 px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 backdrop-blur">
                  Available now
                </p>
              ) : null}
              {available.map(row)}
            </>
          ) : null}

          {upcoming.length > 0 ? (
            <>
              {/* Shown rather than hidden. Somebody searching for their own
                  currency deserves to find it and be told it is coming, not to
                  be handed an empty result that reads as a broken search. */}
              <p className="sticky top-0 z-10 m-0 border-t border-slate-100 bg-white/95 px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 backdrop-blur">
                Coming soon
              </p>
              {upcoming.map(row)}
            </>
          ) : null}

          {available.length === 0 && upcoming.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-xs text-slate-500">
              {/* When the list is filtered to what works, a currency we know
                  about but cannot keep books in would otherwise come back as
                  "nothing matches" — which reads as a broken search rather
                  than an answer. Name it instead. */}
              {unsupported.length > 0 ? (
                <>
                  We cannot keep books in{" "}
                  <span className="font-semibold text-slate-700">
                    {unsupported
                      .slice(0, 3)
                      .map((entry) => entry.code)
                      .join(", ")}
                  </span>{" "}
                  yet. Pick another for now — you can still be paid in any currency.
                </>
              ) : (
                <>Nothing matches “{query.trim()}”. Try a country name, or the three-letter code.</>
              )}
            </p>
          ) : null}
        </div>

        {/* Counted, not written down. The previous copy said five currencies
            were supported, and was wrong the day the list grew. */}
        {availableOnly ? null : (
          <p className="m-0 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            {CURRENCY_CODES.length} currencies are supported today. The rest are listed so you can
            see what is on the way.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
