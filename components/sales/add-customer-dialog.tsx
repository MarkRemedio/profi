"use client";

import { useCurrency } from "@/components/currency-provider";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { Loader2 } from "lucide-react";
import { contactDisplayName } from "@/lib/accounting/contact-name";
import type { Contact, NewContactInput } from "./use-customers";

type Props = {
  open: boolean;
  saving: boolean;
  contact?: Contact | null;
  readOnly?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: NewContactInput) => Promise<boolean>;
};

export function AddCustomerDialog({ open, saving, contact, readOnly = false, onOpenChange, onSubmit }: Props) {
  const { currency: workspaceCurrency, multicurrencyEnabled } = useCurrency();
  // ✅ 1. State to safely use portals in Next.js
  const [mounted, setMounted] = useState(false);

  // PhoneInput is controlled — strip the spaces the old format stored
  // ("+44 7911 123456") so existing numbers parse as E.164.
  const [phone, setPhone] = useState(() => (contact?.phone || "").replace(/\s+/g, ""));

  const [namePreference, setNamePreference] = useState(
    contact?.display_name_preference === "primary" ? "primary" : "business"
  );
  const [businessName, setBusinessName] = useState(contact?.name || "");
  const [firstName, setFirstName] = useState(contact?.first_name || "");
  const [lastName, setLastName] = useState(contact?.last_name || "");
  /* Controlled now that this is a picker rather than a select, with a hidden
     input carrying it into the FormData the submit handler reads. */
  const [currency, setCurrency] = useState(contact?.default_currency || workspaceCurrency);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPhone((contact?.phone || "").replace(/\s+/g, ""));
    setNamePreference(contact?.display_name_preference === "primary" ? "primary" : "business");
    setBusinessName(contact?.name || "");
    setFirstName(contact?.first_name || "");
    setLastName(contact?.last_name || "");
    setCurrency(contact?.default_currency || workspaceCurrency);
  }, [contact, workspaceCurrency]);

  if (!open || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return; 

    const formData = new FormData(e.currentTarget);
    const allData = Object.fromEntries(formData.entries());
    
    // PhoneInput already produces a full E.164 value (e.g. "+447911123456")
    // or "" when nothing is entered.
    const combinedPhone = phone;

    const newCustomer: NewContactInput = {
      name: (allData.contact_name as string) || "",
      contact_type: "customer", 
      email: (allData.email as string) || "",
      phone: combinedPhone, // <-- Saved securely with country code!
      first_name: (allData.first_name as string) || "",
      last_name: (allData.last_name as string) || "",
      display_name_preference: namePreference,
      account_number: (allData.account_number as string) || "",
      website: (allData.website as string) || "",
      registration_number: (allData.registration_number as string) || "",
      notes: (allData.notes as string) || "",
      billing_address: (allData.billing_address as string) || "", 
      delivery_address: (allData.delivery_address as string) || "",
      bank_account_name: (allData.bank_account_name as string) || "",
      sort_code: (allData.sort_code as string) || "",
      bank_account_number: (allData.bank_account_number as string) || "",
      tax_number: (allData.vat_number as string) || "",
      payment_terms_days: 30, 
      default_currency: (allData.currency as string) || workspaceCurrency,
    };

    const success = await onSubmit(newCustomer);
    if (success) {
      onOpenChange(false);
    }
  };

  // ✅ 2. Wrap the entire return inside createPortal()
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <h2 className="text-lg font-bold text-slate-900">
            {readOnly ? "Contact Details" : contact ? "Edit Contact" : "Add New Contact"}
          </h2>
          <button type="button" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="px-6 py-6 overflow-y-auto custom-scrollbar bg-white">
          <form id="customer-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* 1. Contact Details */}
            <section>
              <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Contact details</h3>
              <div className="grid gap-4 sm:grid-cols-1">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Contact name <span className="font-normal text-slate-400">(required)</span>
                  </label>
                  <input name="contact_name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={readOnly} required type="text" placeholder="A business or person's name" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Name to display
                  </label>
                  <p className="mb-2 text-[11px] text-slate-500">
                    Choose which name appears on invoices, statements and lists for this contact.
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer transition hover:border-slate-300 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50/50">
                      <input
                        type="radio"
                        name="display_name_preference"
                        value="business"
                        checked={namePreference === "business"}
                        onChange={() => setNamePreference("business")}
                        disabled={readOnly}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Business name</span>
                        <span className="block truncate text-xs text-slate-500">
                          {businessName.trim() || "—"}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer transition hover:border-slate-300 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50/50">
                      <input
                        type="radio"
                        name="display_name_preference"
                        value="primary"
                        checked={namePreference === "primary"}
                        onChange={() => setNamePreference("primary")}
                        disabled={readOnly}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Primary person</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[firstName, lastName].filter(Boolean).join(" ").trim() ||
                            "no primary person entered — will use business name"}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Account number <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input name="account_number" defaultValue={contact?.account_number || ""} disabled={readOnly} type="text" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                  <p className="mt-1.5 text-[11px] text-slate-500">Add a unique account number to identify, reference and search for the contact.</p>
                </div>
              </div>
            </section>

            {/* 2. Primary Person */}
            <section>
              <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Primary person</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">First name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input name="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={readOnly} type="text" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Last name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input name="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={readOnly} type="text" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    </div>
                    <input name="email" defaultValue={contact?.email || ""} disabled={readOnly} type="email" placeholder="name@email.com" className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Business Information */}
            <section>
              <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Business information</h3>
              <div className="grid gap-4 sm:grid-cols-1">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Phone number <span className="font-normal text-slate-400">(optional)</span></label>
                  <PhoneInput
                    defaultCountry="GB"
                    placeholder="Number"
                    disabled={readOnly}
                    value={phone}
                    onChange={setPhone}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Website</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                    </div>
                    <input name="website" defaultValue={contact?.website || ""} disabled={readOnly} type="url" placeholder="https://" className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Company registration number <span className="font-normal text-slate-400">(optional)</span></label>
                  <input name="registration_number" defaultValue={contact?.registration_number || ""} disabled={readOnly} type="text" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Notes</label>
                  <textarea name="notes" defaultValue={contact?.notes || ""} disabled={readOnly} rows={3} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 resize-none disabled:bg-slate-50 disabled:text-slate-500"></textarea>
                </div>
              </div>
            </section>

            {/* 4. Addresses */}
            <section>
              <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Addresses</h3>
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50">
                  <label className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Billing address <span className="text-slate-400 font-normal ml-1 text-xs">(required)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input name="billing_address" defaultValue={contact?.billing_address || ""} disabled={readOnly} required type="text" placeholder="Search address in United Kingdom" className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm bg-white outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50">
                  <label className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                    Delivery address <span className="text-slate-400 font-normal ml-1 text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input name="delivery_address" defaultValue={contact?.delivery_address || ""} disabled={readOnly} type="text" placeholder="Search address in United Kingdom" className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm bg-white outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Financial Details */}
            <section>
              <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Financial details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Bank account name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input name="bank_account_name" defaultValue={contact?.bank_account_name || ""} disabled={readOnly} type="text" placeholder="e.g. A business or person's name" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Sort code <span className="font-normal text-slate-400">(optional)</span></label>
                  <input name="sort_code" defaultValue={contact?.sort_code || ""} disabled={readOnly} type="text" placeholder="e.g. 12-34-56" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Bank account number <span className="font-normal text-slate-400">(optional)</span></label>
                  <input name="bank_account_number" defaultValue={contact?.bank_account_number || ""} disabled={readOnly} type="text" placeholder="e.g. 12345678" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">VAT Number <span className="font-normal text-slate-400">(optional)</span></label>
                  <div className="flex h-10 rounded-lg border border-slate-200 overflow-hidden focus-within:ring-4 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all">
                    <select disabled={readOnly} className="bg-slate-50 px-3 border-r border-slate-200 text-sm focus:outline-none cursor-pointer disabled:bg-slate-50 disabled:text-slate-500">
                      <option>VAT Number</option>
                    </select>
                    <input name="vat_number" defaultValue={contact?.tax_number || ""} disabled={readOnly} type="text" placeholder="e.g. AB1234567890" className="flex-1 px-3 text-sm focus:outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Currency</label>
                  {/* Only meaningful with multicurrency on. The server stamps every
                      document with the workspace currency while it is off, so a
                      picker here promised something that would be silently
                      ignored: choose TZS for a customer, raise their invoice, and
                      it comes out in the workspace currency anyway. The stored
                      value is left alone rather than reset — switching
                      multicurrency back on should restore what was set. */}
                  {multicurrencyEnabled ? (
                    <>
                      {/* Searchable, and matched on country: this list is a
                          hundred and one long, and a bare column of codes asks
                          somebody to already know that Canada is CAD. The
                          hidden input is what keeps it in the FormData the
                          submit handler reads, now that the control itself is
                          not a form field.

                          availableOnly, because a customer can only be billed
                          in a currency the books can keep. */}
                      <input type="hidden" name="currency" value={currency ?? ""} />
                      <CurrencyPicker
                        value={currency ?? workspaceCurrency}
                        onChange={setCurrency}
                        disabled={readOnly}
                        availableOnly
                        size="field"
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                        {workspaceCurrency}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Every document uses the workspace currency. Turn on multicurrency in
                        Workspace Settings to bill this customer in their own.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </section>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-xl">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-500 hover:text-slate-700">
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="submit" form="customer-form" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-10 px-6 shadow-sm">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {contact ? "Save Changes" : "Save Contact"}
            </Button>
          )}
        </div>

      </div>
    </div>,
    document.body // <-- This forces the modal into the very top layer of the DOM
  );
}