"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";

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
import { cn } from "@/lib/utils";

import {
  accountTypes,
  defaultReportCategory,
  guideSections,
  reportCategoryLabels,
  reportCategoryOptions,
  taxOptions,
} from "./constants";
import type {
  AccountReportCategory,
  AccountType,
  ChartAccount,
  Organization,
  TaxCode,
} from "./types";
import { titleCase } from "./utils";

type AddAccountDialogProps = {
  open: boolean;
  accounts: ChartAccount[];
  account?: ChartAccount | null;
  organization: Organization | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    code: string;
    name: string;
    description: string;
    account_type: AccountType;
    report_category: AccountReportCategory;
    tax_code: TaxCode;
    tax_rate: number;
    is_active: boolean;
  }) => Promise<boolean>;
};

export function AddAccountDialog({
  open,
  accounts,
  account,
  organization,
  saving,
  onOpenChange,
  onSubmit,
}: AddAccountDialogProps) {
  const editing = Boolean(account);
  const systemLocked = Boolean(account?.is_system);
  const [activeGuide, setActiveGuide] = useState(guideSections[0].title);
  const [form, setForm] = useState(() => ({
    code: account?.code ?? "",
    name: account?.name ?? "",
    description: account?.description ?? "",
    account_type: account?.account_type ?? ("asset" as AccountType),
    report_category:
      account?.report_category ?? ("current_asset" as AccountReportCategory),
    tax_code: account?.tax_code ?? ("no_vat" as TaxCode),
    tax_rate: account?.tax_rate ?? 0,
    is_active: account?.is_active ?? true,
  }));
  const normalizedCode = form.code.trim().toLowerCase();
  const codeStatus = useMemo(() => {
    if (!normalizedCode) return "empty";

    return accounts.some(
      (existingAccount) =>
        existingAccount.id !== account?.id &&
        existingAccount.code.trim().toLowerCase() === normalizedCode
    )
      ? "taken"
      : "available";
  }, [account?.id, accounts, normalizedCode]);
  const codeMessage = {
    empty: "Enter a unique code for this account.",
    available: "This account code is available.",
    taken: "This account code already exists.",
  }[codeStatus];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (codeStatus === "taken") return;

    const added = await onSubmit(form);
    if (!added) return;

    setForm({
      code: "",
      name: "",
      description: "",
      account_type: "asset",
      report_category: "current_asset",
      tax_code: "no_vat",
      tax_rate: 0,
      is_active: true,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Update ${account?.code ?? "this account"} in ${
                    organization?.name ?? "this workspace"
                  }.`
                : `Create a new account code for ${
                    organization?.name ?? "this workspace"
                  }.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)]">
            <FieldGroup>
              <Field>
                <FieldLabel>Account type</FieldLabel>
                <Select
                  value={form.account_type}
                  disabled={editing}
                  onValueChange={(value) => {
                    const accountType = value as AccountType;
                    setForm((current) => ({
                      ...current,
                      account_type: accountType,
                      report_category: defaultReportCategory[accountType],
                    }));
                  }}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypes
                      .filter((type): type is AccountType => type !== "all")
                      .map((type) => (
                        <SelectItem key={type} value={type}>
                          {titleCase(type)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>Report category</FieldLabel>
                <Select
                  // The internal "bank" category is presented as Current asset
                  value={
                    form.report_category === "bank"
                      ? "current_asset"
                      : form.report_category
                  }
                  disabled={systemLocked}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      // Re-picking Current asset keeps the bank marker intact
                      report_category:
                        value === "current_asset" &&
                        current.report_category === "bank"
                          ? "bank"
                          : (value as AccountReportCategory),
                    }))
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportCategoryOptions[form.account_type].map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.account_type === "asset" &&
                  (form.report_category === "current_asset" ||
                    form.report_category === "bank") && (
                    <label className="mt-2 flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100"
                        checked={form.report_category === "bank"}
                        disabled={systemLocked}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            report_category: event.target.checked
                              ? "bank"
                              : "current_asset",
                          }))
                        }
                      />
                      <span>
                        <span className="block text-sm font-bold text-slate-900">
                          This is a bank account
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          Bank accounts can receive invoice payments and cash
                          sale deposits. They report as current assets.
                        </span>
                      </span>
                    </label>
                  )}
              </Field>

              <Field>
                <FieldLabel htmlFor="account-code">Account code</FieldLabel>
                <input
                  id="account-code"
                  aria-describedby="account-code-status"
                  aria-invalid={codeStatus === "taken"}
                  className={cn(
                    "h-10 rounded-lg border px-3 text-sm outline-none transition focus:ring-4",
                    codeStatus === "taken"
                      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                      : codeStatus === "available"
                        ? "border-green-300 focus:border-green-400 focus:ring-green-100"
                        : "border-slate-200 focus:border-blue-300 focus:ring-blue-100"
                  )}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="6100"
                  required
                  disabled={systemLocked}
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: event.target.value.replace(/[^0-9]/g, ""),
                    }))
                  }
                />
                <p
                  id="account-code-status"
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    codeStatus === "taken"
                      ? "text-red-600"
                      : codeStatus === "available"
                        ? "text-green-700"
                        : "text-slate-400"
                  )}
                >
                  {codeStatus === "available" ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : null}
                  {codeStatus === "taken" ? <XCircle className="size-3.5" /> : null}
                  {codeMessage}
                </p>
              </Field>

              <Field>
                <FieldLabel htmlFor="account-name">Account name</FieldLabel>
                <input
                  id="account-name"
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  placeholder="Merchant fees"
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="account-description">
                  Description <span className="font-normal text-slate-400">(optional)</span>
                </FieldLabel>
                <textarea
                  id="account-description"
                  className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  placeholder="What this account is used for"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Tax</FieldLabel>
                <Select
                  value={form.tax_code}
                  disabled={systemLocked}
                  onValueChange={(value) =>
                    setForm((current) => {
                      const tax = taxOptions.find((option) => option.code === value);

                      return {
                        ...current,
                        tax_code: value as TaxCode,
                        tax_rate: tax?.rate ?? 0,
                      };
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taxOptions.map((tax) => (
                      <SelectItem key={tax.code} value={tax.code}>
                        {tax.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100"
                    checked={form.is_active}
                    disabled={systemLocked}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-900">
                      Active account
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Inactive accounts stay in history but can be hidden from
                      day-to-day selection lists.
                    </span>
                  </span>
                </label>
              </Field>
            </FieldGroup>

            {editing ? (
              <EditGuardPanel account={account} />
            ) : (
              <AccountGuidePanel
                activeGuide={activeGuide}
                selectedReportCategory={form.report_category}
                onActiveGuideChange={setActiveGuide}
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || codeStatus === "taken"}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus />}
              {editing ? "Update account" : "Save account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditGuardPanel({ account }: { account?: ChartAccount | null }) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        Edit rules
      </p>
      <h3 className="mt-2 text-sm font-bold text-slate-900">
        Account type stays fixed
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Account type controls the debit and credit balance formula, so it is
        locked after creation to keep posted activity consistent.
      </p>

      {account?.is_system ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">System account</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            Only name and description can be changed. Code, report category,
            tax, and active status are protected because documents rely on this
            account.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-sm font-bold text-blue-900">Custom account</p>
          <p className="mt-1 text-xs leading-5 text-blue-800">
            You can update classification, tax defaults, and active status while
            preserving the account type.
          </p>
        </div>
      )}
    </aside>
  );
}

function AccountGuidePanel({
  activeGuide,
  selectedReportCategory,
  onActiveGuideChange,
}: {
  activeGuide: string;
  selectedReportCategory: AccountReportCategory;
  onActiveGuideChange: (title: string) => void;
}) {
  const section =
    guideSections.find((guide) => guide.title === activeGuide) ?? guideSections[0];

  return (
    <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex rounded-lg bg-white p-1 shadow-sm">
        {guideSections.map((guide) => (
          <button
            key={guide.title}
            type="button"
            className={cn(
              "h-9 flex-1 rounded-md px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100",
              activeGuide === guide.title
                ? "bg-blue-600 text-white"
                : "text-slate-500 hover:bg-slate-50"
            )}
            onClick={() => onActiveGuideChange(guide.title)}
          >
            {guide.title}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {section.groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.items.map((item) => {
                const selected = selectedReportCategory === item.reportCategory;

                return (
                  <div
                    key={`${item.accountType}-${item.reportCategory}-${item.label}`}
                    className={cn(
                      "w-full rounded-lg border bg-white p-3 text-left",
                      selected
                        ? "border-blue-300 ring-2 ring-blue-100"
                        : "border-slate-200"
                    )}
                  >
                    <span className="block text-sm font-bold text-slate-900">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-blue-700">
                      {titleCase(item.accountType)} -{" "}
                      {reportCategoryLabels[item.reportCategory]}
                    </span>
                    {item.note ? (
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {item.note}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
