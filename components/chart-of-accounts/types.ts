export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type AccountReportCategory =
  | "bank"
  | "current_asset"
  | "fixed_asset"
  | "non_current_asset"
  | "current_liability"
  | "non_current_liability"
  | "equity"
  | "sales"
  | "other_income"
  | "cost_of_sales"
  | "expense"
  | "depreciation";

export type TaxCode = string;

export type Role = "owner" | "accountant" | "employee";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  baseCurrency?: string;
  multicurrencyEnabled?: boolean;
  /** The customer's own logo, if they have uploaded one. Usually null. */
  logoUrl?: string | null;
};

export type ChartAccount = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  account_type: AccountType;
  report_category: AccountReportCategory;
  tax_code: TaxCode;
  tax_rate: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  debit_minor: number;
  credit_minor: number;
  balance_minor: number;
  mtd_movement_minor: number;
  ytd_movement_minor: number;
};

export type SortMode = "code" | "name" | "type" | "recent";
export type AccountStatusFilter = "all" | "active" | "inactive" | "system" | "custom";

export type AccountCounts = Record<AccountType, number> & {
  total: number;
  active: number;
};
