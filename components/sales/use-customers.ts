"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export type ContactType = "customer" | "supplier" | "both";

export type Contact = {
  id: string;
  org_id: string;
  contact_type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  tax_number: string | null;
  payment_terms_days: number;
  payment_schedule_type: "day_of_month" | "end_of_month" | null;
  payment_schedule_day: number | null;
  default_currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // ADD THESE NEW ONES:
  first_name: string | null;
  last_name: string | null;
  display_name_preference: string;
  account_number: string | null;
  website: string | null;
  registration_number: string | null;
  notes: string | null;
  delivery_address: string | null;
  bank_account_name: string | null;
  sort_code: string | null;
  bank_account_number: string | null;

  // NEW: Store the calculated balance
  outstandingBalanceMinor?: number;
};
export type NewContactInput = {
  name: string;
  contact_type: ContactType;
  email?: string;
  phone?: string;
  billing_address?: string;
  tax_number?: string;
  payment_terms_days?: number;
  default_currency?: string;

  // ALL YOUR NEW FIELDS:
  first_name?: string;
  last_name?: string;
  display_name_preference?: string;
  account_number?: string;
  website?: string;
  registration_number?: string;
  notes?: string;
  delivery_address?: string;
  bank_account_name?: string;
  sort_code?: string;
  bank_account_number?: string;
};

export function useCustomers(activeOrgId: string) {
  const { currency: workspaceCurrency } = useCurrency();
  const queryClient = useQueryClient();

  /**
   * Contacts are read here through Supabase directly, but the bill, invoice and
   * receipt dialogs read them from react-query workspace caches. Without this,
   * a supplier or customer added on the directory page stayed invisible in those
   * dialogs until the user reloaded the page.
   */
  const invalidateContactConsumers = useCallback(() => {
    for (const key of [
      queryKeys.billWorkspace,
      queryKeys.invoiceWorkspace,
      queryKeys.salesReceiptWorkspace,
      queryKeys.refundReceiptWorkspace,
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);
  const supabase = useMemo(() => createClient(), []);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  // refreshContacts re-runs after every mutation, so `loading` alone can't drive
  // the page skeleton — it would blow the whole table away on each save.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // orgId state removed!

  // NEW: Helper function to calculate outstanding balances for each customer
  const fetchAndMergeBalances = async (organizationId: string, contactList: Contact[]) => {
    // 1. Get all approved/sent invoices (Removed partially_paid because it's not a real DB enum!)
    const { data: invoices, error: invError } = await supabase
      .from("invoices")
      .select("id, contact_id, total_minor")
      .eq("org_id", organizationId)
      .in("status", ["approved", "sent"]); // <-- FIX: Only real DB statuses!

    if (invError) console.error("Invoice Fetch Error:", JSON.stringify(invError, null, 2));

    // 2. Get all payments made against those invoices
    const { data: paymentJournals, error: payError } = await supabase
      .from("journals")
      .select("source_id, journal_lines(debit_minor)")
      .eq("org_id", organizationId)
      .eq("source_type", "invoice_payment")
      .eq("status", "posted");

    if (payError) console.error("Payment Fetch Error:", JSON.stringify(payError, null, 2));

    if (!invoices) return contactList;

    // 3. Map out how much has been paid per invoice
    const amountPaidMap = new Map<string, number>();
    if (paymentJournals) {
      for (const j of paymentJournals) {
        // Handle snake_case or camelCase from Prisma/Supabase
        const sourceId = (j as any).source_id || (j as any).sourceId;
        if (!sourceId || !(j as any).journal_lines) continue;

        // Sum up the debits to find the total payment amount
        const paidAmount = (j as any).journal_lines.reduce((sum: number, line: any) => {
          return sum + Number(line.debit_minor || line.debitMinor || 0);
        }, 0);

        const currentTotal = amountPaidMap.get(sourceId) || 0;
        amountPaidMap.set(sourceId, currentTotal + paidAmount);
      }
    }

    // 4. Group the remaining debts by Customer ID
    const customerDebts = new Map<string, number>();
    for (const inv of invoices) {
      const contactId = (inv as any).contact_id || (inv as any).contactId;
      const totalMinor = (inv as any).total_minor || (inv as any).totalMinor;

      if (!contactId) continue;

      const total = Number(totalMinor) || 0;
      const paid = amountPaidMap.get(inv.id) || 0;
      const remaining = total - paid;

      // If they still owe money on this invoice, add it to their total debt!
      if (remaining > 0) {
        const currentDebt = customerDebts.get(contactId) || 0;
        customerDebts.set(contactId, currentDebt + remaining);
      }
    }

    // 5. Merge the math into the contact list
    return contactList.map((contact) => ({
      ...contact,
      outstandingBalanceMinor: customerDebts.get(contact.id) || 0,
    }));
  };

  const refreshContacts = useCallback(
    async (organizationId = activeOrgId) => {
      if (!organizationId) return;

      // 🚀 1. Turn the spinner ON when fetching starts
      setLoading(true);

      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("org_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
        // 🚀 2. Turn the spinner OFF if there's an error
        setLoading(false);
        setHasLoaded(true);
        return;
      }

      setError(null);

      // NEW: Attach the math!
      const mergedData = await fetchAndMergeBalances(organizationId, data ?? []);
      setContacts(mergedData);

      // 🚀 3. Turn the spinner OFF when the data is ready! (This is what I forgot!)
      setLoading(false);
      setHasLoaded(true);
    },
    [activeOrgId, supabase],
  );

  // Automatically load contacts when the activeOrgId is passed in
  useEffect(() => {
    refreshContacts();
  }, [refreshContacts]);

  // Add contact — returns the created row so callers can select it immediately
  async function addContact(input: NewContactInput): Promise<Contact | null> {
    if (!activeOrgId) return null;
    setSaving(true);

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        org_id: activeOrgId,
        name: input.name,
        contact_type: input.contact_type,
        email: input.email || null,
        phone: input.phone || null,
        billing_address: input.billing_address || null,
        tax_number: input.tax_number || null,
        payment_terms_days: input.payment_terms_days || 30,
        default_currency: input.default_currency || workspaceCurrency, // currency:allow resolved from the workspace above
        is_active: true,

        // ✨ ADD ALL YOUR NEW FIELDS HERE ✨
        first_name: input.first_name || null,
        last_name: input.last_name || null,
        display_name_preference: input.display_name_preference || "business",
        account_number: input.account_number || null,
        website: input.website || null,
        registration_number: input.registration_number || null,
        notes: input.notes || null,
        delivery_address: input.delivery_address || null,
        bank_account_name: input.bank_account_name || null,
        sort_code: input.sort_code || null,
        bank_account_number: input.bank_account_number || null,
      })
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return null;
    }

    await refreshContacts();
    invalidateContactConsumers();
    return data as Contact;
  }

  // Edit / Update contact
  async function updateContact(id: string, input: Partial<NewContactInput>): Promise<boolean> {
    setSaving(true);

    const { error } = await supabase
      .from("contacts")
      .update(input) // This magically updates only the fields you changed!
      .eq("id", id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return false;
    }

    await refreshContacts();
    invalidateContactConsumers();
    return true;
  }

  // Toggle active status
  async function toggleActive(id: string, current: boolean): Promise<void> {
    await supabase.from("contacts").update({ is_active: !current }).eq("id", id);
    await refreshContacts();
    invalidateContactConsumers();
  }

  // Delete contact
  async function deleteContact(id: string): Promise<boolean> {
    const { error } = await supabase.from("contacts").delete().eq("id", id);

    if (error) {
      // This catches the error (like if they have invoices) and shows it in your red error banner!
      setError("Cannot delete: This customer has invoices or data attached to them.");
      return false;
    }

    await refreshContacts();
    invalidateContactConsumers();
    return true;
  }

  const activeCount = contacts.filter((c) => c.is_active).length;
  const inactiveCount = contacts.filter((c) => !c.is_active).length;

  return {
    contacts,
    loading,
    // True only for the very first fetch — drives the full-page skeleton.
    initialLoading: loading && !hasLoaded,
    saving,
    error,
    addContact,
    updateContact,
    toggleActive,
    deleteContact,
    stats: { activeCount, inactiveCount },
  };
}
