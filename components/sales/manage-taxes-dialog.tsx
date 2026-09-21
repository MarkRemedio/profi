"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createTaxRate,
  deleteCustomTaxRate,
  listManagedTaxRates,
  updateCustomTaxRate,
  type ManagedTaxRate,
} from "@/app/(dashboard)/taxes/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ManageTaxesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a new rate is created, with its code — e.g. to select it on a line. */
  onCreated?: (code: string) => void;
  /** Fired after any create/edit so callers can refetch their tax rate lists. */
  onChanged?: () => void;
};

type RowDraft = { name: string; rate: string };

export function ManageTaxesDialog({
  open,
  onOpenChange,
  onCreated,
  onChanged,
}: ManageTaxesDialogProps) {
  const [rates, setRates] = useState<ManagedTaxRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    listManagedTaxRates()
      .then((rows) => {
        if (!active) return;
        setRates(rows);
        setDrafts({});
      })
      .catch(() => {
        if (active) toast.error("Could not load tax rates.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const refresh = async () => {
    setRates(await listManagedTaxRates());
    setDrafts({});
    onChanged?.();
  };

  const draftFor = (rate: ManagedTaxRate): RowDraft =>
    drafts[rate.id] ?? { name: rate.name, rate: rate.rate.toString() };

  const isDirty = (rate: ManagedTaxRate) => {
    const draft = drafts[rate.id];
    if (!draft) return false;
    return draft.name !== rate.name || draft.rate !== rate.rate.toString();
  };

  const handleCreate = async () => {
    const parsedRate = Number(newRate);
    if (!newName.trim()) return toast.error("Enter a name for the tax rate.");
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      return toast.error("Enter a rate between 0 and 100.");
    }
    setCreating(true);
    try {
      const created = await createTaxRate({ name: newName, rate: parsedRate });
      toast.success(`Tax rate "${created.name}" added.`);
      setNewName("");
      setNewRate("");
      await refresh();
      onCreated?.(created.code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the tax rate.");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveRow = async (rate: ManagedTaxRate) => {
    const draft = draftFor(rate);
    const parsedRate = Number(draft.rate);
    if (!draft.name.trim()) return toast.error("Name is required.");
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      return toast.error("Enter a rate between 0 and 100.");
    }
    setSavingId(rate.id);
    try {
      await updateCustomTaxRate(rate.id, { name: draft.name, rate: parsedRate });
      toast.success("Tax rate updated. New documents will use the new rate.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the tax rate.");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (rate: ManagedTaxRate) => {
    setSavingId(rate.id);
    try {
      await updateCustomTaxRate(rate.id, { isActive: !rate.isActive });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the tax rate.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (rate: ManagedTaxRate) => {
    setSavingId(rate.id);
    try {
      await deleteCustomTaxRate(rate.id);
      toast.success(`Tax rate "${rate.name}" deleted.`);
      await refresh();
    } catch (error) {
      // Server refuses when the rate is in use — deactivate is the fallback
      toast.error(error instanceof Error ? error.message : "Could not delete the tax rate.");
    } finally {
      setSavingId(null);
    }
  };

  const systemRates = rates.filter((rate) => rate.isSystem);
  const customRates = rates.filter((rate) => !rate.isSystem);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage taxes</DialogTitle>
          <DialogDescription>
            Add your own tax rates or adjust existing custom ones. Documents
            already saved keep the rate they were saved with.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500">
            <Loader2 className="size-4 animate-spin text-blue-600" />
            Loading tax rates...
          </div>
        ) : (
          <div className="space-y-5">
            {/* System rates — read-only */}
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                System rates
              </h3>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {systemRates.map((rate) => (
                  <div key={rate.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Lock className="size-3.5 shrink-0 text-slate-300" />
                    <span className="flex-1 font-medium text-slate-700">{rate.name}</span>
                    <span className="font-mono text-slate-500">{rate.rate}%</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Custom rates — editable */}
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Your custom rates
              </h3>
              {customRates.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                  No custom rates yet — add one below.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {customRates.map((rate) => {
                    const draft = draftFor(rate);
                    return (
                      <div
                        key={rate.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2",
                          !rate.isActive && "opacity-60"
                        )}
                      >
                        <input
                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          value={draft.name}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [rate.id]: { ...draft, name: event.target.value },
                            }))
                          }
                        />
                        <div className="relative w-20 shrink-0">
                          <input
                            className="h-8 w-full rounded-md border border-slate-200 pl-2 pr-6 text-right font-mono text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            inputMode="decimal"
                            value={draft.rate}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [rate.id]: { ...draft, rate: event.target.value },
                              }))
                            }
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            %
                          </span>
                        </div>
                        {isDirty(rate) ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 shrink-0 bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
                            disabled={savingId === rate.id}
                            onClick={() => handleSaveRow(rate)}
                          >
                            {savingId === rate.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        ) : (
                          <button
                            type="button"
                            className={cn(
                              "h-8 shrink-0 rounded-md border px-3 text-xs font-semibold transition-colors",
                              rate.isActive
                                ? "border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                                : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                            )}
                            disabled={savingId === rate.id}
                            onClick={() => handleToggleActive(rate)}
                          >
                            {savingId === rate.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : rate.isActive ? (
                              "Deactivate"
                            ) : (
                              "Reactivate"
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          title="Delete (only possible while unused)"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                          disabled={savingId === rate.id}
                          onClick={() => handleDelete(rate)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Add new rate */}
            <section className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-800">
                Add a tax rate
              </h3>
              <div className="flex items-center gap-2">
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="Name, e.g. CIS Reverse Charge"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <div className="relative w-20 shrink-0">
                  <input
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-2 pr-6 text-right font-mono text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    inputMode="decimal"
                    placeholder="0"
                    value={newRate}
                    onChange={(event) => setNewRate(event.target.value)}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    %
                  </span>
                </div>
                <Button
                  type="button"
                  className="h-9 shrink-0 gap-1.5 bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
                  disabled={creating}
                  onClick={handleCreate}
                >
                  {creating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Add
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
