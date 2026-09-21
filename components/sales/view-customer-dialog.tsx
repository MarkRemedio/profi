"use client";

import { useCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { contactDisplayName } from "@/lib/accounting/contact-name";
import { CustomerContactsSection } from "./customer-contacts-section";
import { CustomerDocumentsSection } from "./customer-documents-section";
import { CustomerPaymentScheduleSection } from "./customer-payment-schedule-section";
import type { Contact } from "./use-customers";

type Props = {
  open: boolean;
  contact?: Contact | null;
  onOpenChange: (open: boolean) => void;
};

export function ViewCustomerDialog({ open, contact, onOpenChange }: Props) {
  const { currency: workspaceCurrency } = useCurrency();
  if (!open || !contact) return null;

  const displayName = contactDisplayName(contact);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="min-w-0 pr-4">
            <h2 className="text-[19px] font-bold text-slate-900 truncate" title={displayName}>
              {displayName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mr-2 ${
                  contact.is_active
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {contact.is_active ? "Active" : "Inactive"}
              </span>
              Account No: {contact.account_number || "N/A"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        {/* Scrollable Body - Clean Data Display */}
        <div className="px-8 py-6 overflow-y-auto custom-scrollbar bg-slate-50/50">
          <div className="space-y-6">
            {/* Primary Person */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
              <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                Contact Info
              </h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Full Name
                  </p>
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={
                      contact.first_name || contact.last_name
                        ? `${contact.first_name || ""} ${contact.last_name || ""}`
                        : "—"
                    }
                  >
                    {contact.first_name || contact.last_name
                      ? `${contact.first_name || ""} ${contact.last_name || ""}`
                      : "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">Email</p>
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={contact.email ?? undefined}
                  >
                    {contact.email || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">Phone</p>
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={contact.phone ?? undefined}
                  >
                    {contact.phone || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">Website</p>
                  {contact.website ? (
                    <a
                      href={contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline truncate block"
                      title={contact.website ?? undefined}
                    >
                      {contact.website}
                    </a>
                  ) : (
                    <p className="font-medium text-blue-600">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Details */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
              <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                Financial Details
              </h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Bank Account Name
                  </p>
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={contact.bank_account_name ?? undefined}
                  >
                    {contact.bank_account_name || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Currency
                  </p>
                  <p className="font-medium text-slate-900 truncate">
                    {contact.default_currency || workspaceCurrency}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Sort Code
                  </p>
                  <p className="font-medium text-slate-900 truncate">{contact.sort_code || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Account Number
                  </p>
                  <p className="font-medium text-slate-900 truncate">
                    {contact.bank_account_number || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    VAT Number
                  </p>
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={contact.tax_number ?? undefined}
                  >
                    {contact.tax_number || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Reg Number
                  </p>
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={contact.registration_number ?? undefined}
                  >
                    {contact.registration_number || "—"}
                  </p>
                </div>
              </div>
            </div>

            <CustomerPaymentScheduleSection key={`schedule-${contact.id}`} contactId={contact.id} />

            {/* Addresses */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
              <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                Addresses
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Billing Address
                  </p>
                  <p className="font-medium text-slate-900 whitespace-pre-wrap break-words">
                    {contact.billing_address || "No address provided"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-[11px] uppercase font-semibold mb-1">
                    Delivery Address
                  </p>
                  <p className="font-medium text-slate-900 whitespace-pre-wrap break-words">
                    {contact.delivery_address || "No address provided"}
                  </p>
                </div>
              </div>
            </div>

            {/* Secondary contacts */}
            <CustomerContactsSection key={`contacts-${contact.id}`} contactId={contact.id} />

            {/* Documents */}
            <CustomerDocumentsSection key={`documents-${contact.id}`} contactId={contact.id} />

            {/* Notes */}
            {contact.notes && (
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                  Internal Notes
                </h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {contact.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold h-9 px-6"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
