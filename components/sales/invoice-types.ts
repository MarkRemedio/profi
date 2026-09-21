import type {
  ChartAccountOption,
  ContactSummary,
  DocumentDraftInput,
  InvoiceWithLines,
  TaxRateOption,
} from "@/lib/accounting/documents";
import type { ChargeItemDto } from "@/lib/accounting/charge-items";
import type { InvoiceTrackingSettingsDto } from "@/lib/accounting/tracking-types";

export type InvoiceStatus = "draft" | "approved" | "sent" | "void" | "paid" | "partially_paid";
export type Invoice = InvoiceWithLines & { amountPaidMinor?: number };
export type NewInvoiceInput = DocumentDraftInput;

/**
 * Outcome of a create/edit submission, resolved only after the server has
 * actually saved (and, when requested, approved) the invoice. The id lets
 * follow-up actions — emailing, marking sent — target the real record instead
 * of guessing by invoice number.
 */
export type InvoiceSubmitResult = {
  success: boolean;
  /** Database id of the saved invoice; present when the save reached the server. */
  id?: string;
  /** False when the save succeeded but the requested approval failed (invoice stays a draft). */
  approved?: boolean;
};

const PAYMENT_TERMS_LABELS: Record<number, string> = {
  0: "Due on Receipt",
  7: "Net 7",
  15: "Net 15",
  30: "Net 30",
  45: "Net 45",
  60: "Net 60",
  90: "Net 90",
};

export function paymentTermsLabel(days: number): string {
  return PAYMENT_TERMS_LABELS[days] ?? `Net ${days}`;
}

export type InvoiceWorkspaceData = {
  invoices: Invoice[];
  contacts: ContactSummary[];
  accounts: ChartAccountOption[];
  bankAccounts: ChartAccountOption[];
  taxRates: TaxRateOption[];
  /** Active catalogue charges offered by the additional-charges control. */
  chargeItems: ChargeItemDto[];
  vatRegistered: boolean;
  trackingSettings: InvoiceTrackingSettingsDto;
  canManage: boolean;
};
