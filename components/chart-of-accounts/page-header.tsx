import { FileUp, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type PageHeaderProps = {
  canManage: boolean;
  hasOrganization: boolean;
  onAddAccount: () => void;
  onImportAccounts: () => void;
};

export function PageHeader({
  canManage,
  hasOrganization,
  onAddAccount,
  onImportAccounts,
}: PageHeaderProps) {
  return (
    <section className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-4xl font-extrabold tracking-normal text-slate-950">
          Chart of Accounts
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-500">
          Manage your organization ledger architecture. Categorize assets,
          liabilities, equity, revenue, and expenses for reliable reporting.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="h-10 px-4"
          disabled={!canManage || !hasOrganization}
          onClick={onImportAccounts}
        >
          <FileUp className="size-4" />
          Import CoA
        </Button>
        <Button
          className="h-10 bg-orange-500 px-5 text-white hover:bg-orange-600"
          disabled={!canManage || !hasOrganization}
          onClick={onAddAccount}
        >
          <Plus className="size-4" />
          Add New Account
        </Button>
      </div>
    </section>
  );
}
