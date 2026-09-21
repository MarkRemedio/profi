import type {
  BillWithLines,
  ChartAccountOption,
  ContactSummary,
  DocumentDraftInput,
  TaxRateOption,
} from "@/lib/accounting/documents";

export type BillStatus = "draft" | "approved" | "paid" | "void";
export type Bill = BillWithLines;
export type NewBillInput = DocumentDraftInput;

export type BillWorkspaceData = {
  bills: Bill[];
  contacts: ContactSummary[];
  accounts: ChartAccountOption[];
  bankAccounts: ChartAccountOption[];
  taxRates: TaxRateOption[];
  vatRegistered: boolean;
  canManage: boolean;
};
