"use client";

import { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_CURRENCY,
  formatMoney,
  toCurrencyCode,
  currencySymbol,
  type CurrencyCode,
} from "@/lib/currency";

type CurrencyContextValue = {
  currency: CurrencyCode;
  symbol: string;
  /**
   * Whether documents may be raised in a currency other than the workspace's.
   * False everywhere until exchange rates exist, because journal posting has no
   * FX conversion and would write foreign minor units into the ledger as-is.
   */
  multicurrencyEnabled: boolean;
  /** Format an amount held in minor units, in the workspace's currency. */
  format: (minor: number | bigint | null | undefined) => string;
};

/**
 * Defaults to GBP rather than throwing when no provider is present, so a
 * component rendered outside the workspace shell still shows a sane figure
 * instead of crashing the page.
 */
const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  symbol: currencySymbol(DEFAULT_CURRENCY),
  multicurrencyEnabled: false,
  format: (minor) => formatMoney(minor, DEFAULT_CURRENCY),
});

export function CurrencyProvider({
  currency,
  multicurrencyEnabled = false,
  children,
}: {
  currency: string | null | undefined;
  multicurrencyEnabled?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<CurrencyContextValue>(() => {
    const code = toCurrencyCode(currency);
    return {
      currency: code,
      symbol: currencySymbol(code),
      multicurrencyEnabled,
      format: (minor) => formatMoney(minor, code),
    };
  }, [currency, multicurrencyEnabled]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * The workspace's currency and a formatter bound to it.
 *
 * Replaces the per-component formatCurrency helpers, which all hardcoded GBP
 * and so ignored whatever the organisation chose at signup.
 */
export function useCurrency() {
  return useContext(CurrencyContext);
}
