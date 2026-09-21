import type { AiPageContext } from "./types";

const PAGES = [
  ["/sales/invoices", "Invoices", "sales"],
  ["/sales/adjustments", "Sales adjustments", "sales"],
  ["/sales", "Sales", "sales"],
  ["/purchases/bills", "Bills", "purchases"],
  ["/purchases", "Purchases", "purchases"],
  ["/banking/transactions", "Bank transactions", "banking"],
  ["/banking", "Banking", "banking"],
  ["/accounting/journals", "Journals", "accounting"],
  ["/accounting/chart-of-accounts", "Chart of accounts", "accounting"],
  ["/accounting", "Accounting", "accounting"],
  ["/taxes/vat", "VAT return", "taxes"],
  ["/taxes", "Taxes", "taxes"],
  ["/reports", "Reports", "reports"],
  ["/dashboard", "Dashboard", "dashboard"],
] as const;

/** Treat browser context as a hint only; never accept record IDs or arbitrary text. */
export function safePageContext(value: unknown): AiPageContext {
  const path = typeof value === "string" && value.startsWith("/")
    ? value.slice(0, 200).split("?")[0].split("#")[0]
    : "/dashboard";
  const match = PAGES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return { path, label: match?.[1] ?? "Workspace", module: match?.[2] ?? "other" };
}
