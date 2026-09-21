export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// formatCurrency lived here and was hardcoded to GBP. Its two callers are
// client components, so they now use useCurrency() and render whatever the
// workspace is set to. Anything server-side should call formatMoney from
// @/lib/currency with an explicit currency instead.
