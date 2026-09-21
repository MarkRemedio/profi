"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Receipt, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createChargeItem,
  getChargeItemWorkspace,
  setChargeItemActiveState,
  updateChargeItem,
} from "@/app/(dashboard)/sales/charge-item-actions";
import type { ChargeItemDto } from "@/lib/accounting/charge-items";
import type { ChartAccountOption, TaxRateOption } from "@/lib/accounting/documents";

type ChargeItemForm = {
  name: string;
  accountId: string;
  /** Pounds, as typed. Converted to integer minor units on save. */
  defaultAmount: string;
  defaultTaxCode: string;
};

const EMPTY_FORM: ChargeItemForm = {
  name: "",
  accountId: "",
  defaultAmount: "",
  defaultTaxCode: "no_vat",
};

function amountToMinor(value: string): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
}

/**
 * Org-level catalogue of additional charges offered on the invoice form.
 * Each entry names the chart account its lines post to, a default amount the
 * invoice form prefills (editable per invoice), and a default tax code.
 */
export function AdditionalChargesSettings() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChargeItemDto[]>([]);
  const [accounts, setAccounts] = useState<ChartAccountOption[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [form, setForm] = useState<ChargeItemForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChargeItemWorkspace()
      .then((data) => {
        if (cancelled) return;
        setItems(data.chargeItems);
        setAccounts(data.accounts);
        setTaxRates(data.taxRates);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load the charge catalogue.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accountLabel = (item: ChargeItemDto) => `${item.accountCode} · ${item.accountName}`;
  const taxLabel = (code: string | null) =>
    taxRates.find((rate) => rate.code === code)?.name ?? "No VAT";

  function openCreateForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, accountId: accounts[0]?.id ?? "" });
    setIsFormOpen(true);
  }

  function openEditForm(item: ChargeItemDto) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      accountId: item.accountId,
      defaultAmount: item.defaultAmountMinor > 0 ? (item.defaultAmountMinor / 100).toFixed(2) : "",
      defaultTaxCode: item.defaultTaxCode ?? "no_vat",
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Give this charge a name.");
      return;
    }
    if (!form.accountId) {
      toast.error("Choose the income account this charge posts to.");
      return;
    }
    const defaultAmountMinor = form.defaultAmount.trim() === "" ? 0 : amountToMinor(form.defaultAmount);
    if (!Number.isFinite(defaultAmountMinor) || defaultAmountMinor < 0) {
      toast.error("Enter a valid default amount.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        name,
        accountId: form.accountId,
        defaultAmountMinor,
        defaultTaxCode: form.defaultTaxCode === "no_vat" ? null : form.defaultTaxCode,
      };
      const saved = editingId
        ? await updateChargeItem(editingId, input)
        : await createChargeItem(input);
      setItems((current) => {
        const next = editingId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      toast.success(editingId ? "Charge updated." : `"${saved.name}" added to the charge catalogue.`);
      closeForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this charge.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: ChargeItemDto, isActive: boolean) {
    setTogglingId(item.id);
    try {
      const saved = await setChargeItemActiveState(item.id, isActive);
      setItems((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      toast.success(
        isActive
          ? `"${saved.name}" is offered on invoices again.`
          : `"${saved.name}" archived — kept on invoices that already carry it.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this charge.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">Additional Charges</h2>
        </div>
        {!isFormOpen && (
          <Button
            variant="outline"
            className="h-8 gap-1.5 bg-white text-xs font-bold text-slate-700"
            onClick={openCreateForm}
            disabled={loading || accounts.length === 0}
          >
            <Plus className="size-3" /> New charge
          </Button>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          Charges offered on the invoice form — congestion fee, fuel surcharge, admin fee.
          A chosen charge is added to the invoice as its own line, posted to the account
          saved here, so VAT and reports need no extra steps.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 className="size-4 animate-spin" /> Loading charge catalogue…
          </div>
        ) : (
          <>
            {accounts.length === 0 && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Charges post to income accounts, and this workspace has none yet. Set up
                your chart of accounts first.
              </p>
            )}

            {items.length === 0 && !isFormOpen ? (
              <p className="py-2 text-xs text-slate-400">
                No charges saved yet. Add one and it becomes available on every new invoice.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-semibold",
                          item.isActive ? "text-slate-900" : "text-slate-400 line-through"
                        )}
                      >
                        {item.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {accountLabel(item)} · default{" "}
                        {item.defaultAmountMinor > 0
                          ? (item.defaultAmountMinor / 100).toFixed(2)
                          : "none"}{" "}
                        · {taxLabel(item.defaultTaxCode)}
                      </p>
                    </div>
                    <button
                      type="button"
                      title="Edit this charge"
                      onClick={() => openEditForm(item)}
                      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <div className="flex items-center gap-1.5" title={item.isActive ? "Offered on new invoices" : "Archived"}>
                      <Switch
                        checked={item.isActive}
                        disabled={togglingId === item.id}
                        onCheckedChange={(checked) => void handleToggleActive(item, checked)}
                        aria-label={`${item.name} active`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {isFormOpen && (
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800">
                    {editingId ? "Edit charge" : "New charge"}
                  </h3>
                  <button
                    type="button"
                    title="Close"
                    onClick={closeForm}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                      Name
                    </label>
                    <Input
                      className="h-9 bg-white text-xs"
                      placeholder="e.g. Congestion charge"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                      Posts to account
                    </label>
                    <Select
                      value={form.accountId}
                      onValueChange={(value) => setForm((current) => ({ ...current, accountId: value }))}
                    >
                      <SelectTrigger className="h-9 w-full bg-white text-xs">
                        <SelectValue placeholder="Income account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                      Default amount
                    </label>
                    <Input
                      className="h-9 bg-white text-xs"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={form.defaultAmount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultAmount: event.target.value.replace(/[^0-9.]/g, ""),
                        }))
                      }
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Prefilled on the invoice, editable there.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                      Default VAT
                    </label>
                    <Select
                      value={form.defaultTaxCode}
                      onValueChange={(value) => setForm((current) => ({ ...current, defaultTaxCode: value }))}
                    >
                      <SelectTrigger className="h-9 w-full bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {taxRates.map((rate) => (
                          <SelectItem key={rate.code} value={rate.code}>
                            {rate.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" className="h-8 text-xs" onClick={closeForm} disabled={saving}>
                    Cancel
                  </Button>
                  <Button className="h-8 gap-1.5 text-xs font-bold" onClick={() => void handleSave()} disabled={saving}>
                    {saving && <Loader2 className="size-3 animate-spin" />}
                    {editingId ? "Save changes" : "Add charge"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
