import {
  // BadgeDollarSign,  // uncomment when Payroll is re-enabled
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  Download,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import type {
  AccountReportCategory,
  AccountType,
  TaxCode,
} from "./types";

export const accountTypes: Array<"all" | AccountType> = [
  "all",
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
];

export const reportCategoryOptions: Record<
  AccountType,
  Array<{ value: AccountReportCategory; label: string }>
> = {
  // "bank" is intentionally not offered here: bank ledger accounts are created
  // by the Banking module (which stamps reportCategory BANK for payment
  // routing) and are presented as current assets everywhere in the UI.
  asset: [
    { value: "current_asset", label: "Current asset" },
    { value: "fixed_asset", label: "Fixed asset" },
    { value: "non_current_asset", label: "Non-current asset" },
  ],
  liability: [
    { value: "current_liability", label: "Current liability" },
    { value: "non_current_liability", label: "Non-current liability" },
  ],
  equity: [{ value: "equity", label: "Equity" }],
  revenue: [
    { value: "sales", label: "Sales" },
    { value: "other_income", label: "Other income" },
  ],
  expense: [
    { value: "cost_of_sales", label: "Cost of sales" },
    { value: "expense", label: "Expense" },
    { value: "depreciation", label: "Depreciation" },
  ],
};

export const defaultReportCategory: Record<AccountType, AccountReportCategory> =
  {
    asset: "current_asset",
    liability: "current_liability",
    equity: "equity",
    revenue: "sales",
    expense: "expense",
  };

export const reportCategoryLabels: Record<AccountReportCategory, string> = {
  bank: "Current asset",
  current_asset: "Current asset",
  fixed_asset: "Fixed asset",
  non_current_asset: "Non-current asset",
  current_liability: "Current liability",
  non_current_liability: "Non-current liability",
  equity: "Equity",
  sales: "Sales",
  other_income: "Other income",
  cost_of_sales: "Cost of sales",
  expense: "Expense",
  depreciation: "Depreciation",
};

export const accountStatusOptions = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "system", label: "System" },
  { value: "custom", label: "Custom" },
] as const;

export const guideSections: Array<{
  title: string;
  groups: Array<{
    label: string;
    items: Array<{
      label: string;
      accountType: AccountType;
      reportCategory: AccountReportCategory;
      note?: string;
    }>;
  }>;
}> = [
  {
    title: "Profit & Loss",
    groups: [
      {
        label: "Income",
        items: [
          {
            label: "Sales, revenue, income",
            accountType: "revenue",
            reportCategory: "sales",
            note: "Trading income and standard customer sales.",
          },
          {
            label: "Other income",
            accountType: "revenue",
            reportCategory: "other_income",
            note: "Interest, grants, or non-core income.",
          },
        ],
      },
      {
        label: "Less cost of sales",
        items: [
          {
            label: "Direct costs, cost of sales",
            accountType: "expense",
            reportCategory: "cost_of_sales",
            note: "Costs directly tied to delivering sales.",
          },
        ],
      },
      {
        label: "Less expenses",
        items: [
          {
            label: "Expenses, overheads",
            accountType: "expense",
            reportCategory: "expense",
            note: "General operating costs.",
          },
          {
            label: "Depreciation",
            accountType: "expense",
            reportCategory: "depreciation",
            note: "Asset depreciation charges.",
          },
        ],
      },
    ],
  },
  {
    title: "Balance Sheet",
    groups: [
      {
        label: "Assets",
        items: [
          {
            label: "Bank accounts",
            accountType: "asset",
            reportCategory: "current_asset",
            note: "Current, savings, and cash accounts. Tick \"This is a bank account\" so payments can be deposited into them.",
          },
          {
            label: "Inventory, prepayments, current assets",
            accountType: "asset",
            reportCategory: "current_asset",
            note: "Assets expected to convert within a year.",
          },
          {
            label: "Fixed assets",
            accountType: "asset",
            reportCategory: "fixed_asset",
            note: "Equipment, vehicles, and long-term assets.",
          },
          {
            label: "Non-current assets",
            accountType: "asset",
            reportCategory: "non_current_asset",
            note: "Long-term assets outside fixed assets.",
          },
        ],
      },
      {
        label: "Liabilities",
        items: [
          {
            label: "Current liabilities",
            accountType: "liability",
            reportCategory: "current_liability",
            note: "Amounts due within a year.",
          },
          {
            label: "Non-current liabilities",
            accountType: "liability",
            reportCategory: "non_current_liability",
            note: "Loans and obligations due after a year.",
          },
        ],
      },
      {
        label: "Equity",
        items: [
          {
            label: "Equity, plus net profit",
            accountType: "equity",
            reportCategory: "equity",
            note: "Net profit is carried forward to equity in reports.",
          },
        ],
      },
    ],
  },
];

export const taxOptions: Array<{
  code: TaxCode;
  label: string;
  shortLabel: string;
  rate: number;
}> = [
  {
    code: "vat_20",
    label: "VAT 20% - standard rate",
    shortLabel: "VAT 20%",
    rate: 20,
  },
  {
    code: "vat_5",
    label: "VAT 5% - reduced rate",
    shortLabel: "VAT 5%",
    rate: 5,
  },
  {
    code: "vat_0",
    label: "VAT 0% - zero-rated",
    shortLabel: "VAT 0%",
    rate: 0,
  },
  {
    code: "vat_exempt",
    label: "VAT exempt",
    shortLabel: "Exempt",
    rate: 0,
  },
  {
    code: "no_vat",
    label: "No VAT / outside scope",
    shortLabel: "No VAT",
    rate: 0,
  },
];

export const typeMeta: Record<
  AccountType,
  {
    label: string;
    icon: LucideIcon;
    iconClass: string;
    badgeClass: string;
    taxLabel: string;
  }
> = {
  asset: {
    label: "Asset",
    icon: Landmark,
    iconClass: "bg-blue-50 text-blue-700",
    badgeClass: "bg-blue-50 text-blue-700 ring-blue-100",
    taxLabel: "Tax exempt",
  },
  liability: {
    label: "Liability",
    icon: CreditCard,
    iconClass: "bg-orange-50 text-orange-700",
    badgeClass: "bg-orange-50 text-orange-700 ring-orange-100",
    taxLabel: "Tax exempt",
  },
  equity: {
    label: "Equity",
    icon: BriefcaseBusiness,
    iconClass: "bg-violet-50 text-violet-700",
    badgeClass: "bg-violet-50 text-violet-700 ring-violet-100",
    taxLabel: "N/A",
  },
  revenue: {
    label: "Revenue",
    icon: TrendingUp,
    iconClass: "bg-emerald-50 text-emerald-700",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    taxLabel: "Standard VAT",
  },
  expense: {
    label: "Expense",
    icon: Building2,
    iconClass: "bg-slate-100 text-slate-700",
    badgeClass: "bg-slate-100 text-slate-700 ring-slate-200",
    taxLabel: "Standard VAT",
  },
};

export const navItems: Array<{
  label: string;
  icon: LucideIcon;
  active?: boolean;
}> = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Sales", icon: ReceiptText },
  { label: "Purchases", icon: ShoppingCart },
  // { label: "Banking", icon: Landmark },
  // { label: "Payroll", icon: BadgeDollarSign },
  { label: "Taxes", icon: WalletCards },
  { label: "Accounting", icon: BarChart3, active: true },
  { label: "Reports", icon: Download },
];
