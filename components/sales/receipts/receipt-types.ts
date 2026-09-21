// Client-side mirrors of the server DTOs in lib/accounting/receipts.ts.
// Kept separate because that module is server-only.

export type ReceiptLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  quantity: string;
  unitPriceMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxCode: string;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
};

export type Receipt = {
  id: string;
  receiptNo: string;
  status: "posted" | "void";
  contactId: string;
  contactName: string;
  receiptDate: string;
  currency: string;
  amountsAre: "exclusive" | "inclusive" | "no_vat";
  paymentMethod: "cash" | "cheque" | "bank_transfer" | null;
  bankAccountId: string;
  bankAccountName: string;
  reference: string | null;
  notes: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  postedJournalId: string | null;
  createdAt: string;
  lines: ReceiptLine[];
};

export type ReceiptWorkspaceData = {
  receipts: Receipt[];
  contacts: Array<{ id: string; name: string; contactType: string }>;
  accounts: Array<{ id: string; code: string; name: string; reportCategory: string; taxCode: string }>;
  bankAccounts: Array<{ id: string; code: string; name: string }>;
  taxRates: Array<{ code: string; name: string; rate: number }>;
  vatRegistered: boolean;
  canManage: boolean;
};

export type NewReceiptLine = {
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
};

export type NewReceiptInput = {
  contactId: string;
  receiptDate: string;
  amountsAre: "exclusive" | "inclusive" | "no_vat";
  paymentMethod: "cash" | "cheque" | "bank_transfer" | null;
  bankAccountId: string | null;
  reference?: string;
  notes?: string;
  lines: NewReceiptLine[];
};
