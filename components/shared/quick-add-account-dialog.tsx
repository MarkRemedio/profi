"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createChartAccount } from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChartAccountOption } from "@/lib/accounting/documents";

// Category choices depend on which form launched the dialog: invoice lines
// map to income accounts, bill lines to purchase/expense accounts. These
// pairs must stay inside the filters used by getInvoiceWorkspace /
// getBillWorkspace so the new account appears in the select immediately.
const CATEGORY_CHOICES = {
  income: [
    { value: "sales", label: "Sales", accountType: "revenue" },
    { value: "other_income", label: "Other income", accountType: "revenue" },
  ],
  purchase: [
    { value: "expense", label: "Expense", accountType: "expense" },
    { value: "cost_of_sales", label: "Cost of sales", accountType: "expense" },
    { value: "current_asset", label: "Current asset", accountType: "asset" },
    { value: "fixed_asset", label: "Fixed asset", accountType: "asset" },
  ],
} as const;

type QuickAddAccountDialogProps = {
  open: boolean;
  kind: "income" | "purchase";
  onOpenChange: (open: boolean) => void;
  onCreated: (account: ChartAccountOption) => void;
};

export function QuickAddAccountDialog({
  open,
  kind,
  onOpenChange,
  onCreated,
}: QuickAddAccountDialogProps) {
  const choices = CATEGORY_CHOICES[kind];
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(choices[0].value);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = choices.find((c) => c.value === category) ?? choices[0];
    setSaving(true);
    try {
      const account = await createChartAccount({
        code,
        name,
        account_type: choice.accountType,
        report_category: choice.value,
      });
      toast.success(`Account ${account.code} - ${account.name} created.`);
      onCreated(account as ChartAccountOption);
      setCode("");
      setName("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a new account</DialogTitle>
            <DialogDescription>
              Adds an account to your chart of accounts and selects it on this line.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="quick-account-code">Account code</FieldLabel>
              <input
                id="quick-account-code"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={kind === "income" ? "4200" : "6200"}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="quick-account-name">Account name</FieldLabel>
              <input
                id="quick-account-name"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                placeholder={kind === "income" ? "Consulting income" : "Software subscriptions"}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !code.trim() || !name.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
