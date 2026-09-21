"use client";

import { useState } from "react";

import { AccountDetailsDialog } from "./account-details-dialog";
import { AccountsTable } from "./accounts-table";
import { AddAccountDialog } from "./add-account-dialog";
import { ImportAccountsDialog } from "./import-accounts-dialog";
import { AccountStats } from "./stats";
import { EmptyAccountsState, ErrorBanner, NoWorkspaceState } from "./states"; // 🚀 Removed LoadingState
import { ChartOfAccountsSkeleton } from "./chart-of-accounts-skeleton"; // 🚀 Added your new modular skeleton!
import { Insights } from "./insights";
import { PageHeader } from "./page-header";
import { TableControls } from "./table-controls";
import type { ChartAccount } from "./types";
import { useChartOfAccounts } from "./use-chart-of-accounts";

export function ChartOfAccountsShell() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [viewingAccount, setViewingAccount] = useState<ChartAccount | null>(null);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const workspace = useChartOfAccounts();

  return (
    <>
      <PageHeader
        canManage={workspace.canManage}
        hasOrganization={Boolean(workspace.organization)}
        onAddAccount={() => setDialogOpen(true)}
        onImportAccounts={() => setImportOpen(true)}
      />

      <ErrorBanner message={workspace.error} />

      {workspace.loading ? (
        <ChartOfAccountsSkeleton />
      ) : !workspace.organization ? (
        <NoWorkspaceState
          creating={workspace.creatingWorkspace}
          onCreate={workspace.createWorkspace}
        />
      ) : (
        <>
          <AccountStats counts={workspace.counts} />
          <TableControls
            activeReportCategory={workspace.activeReportCategory}
            activeTaxCode={workspace.activeTaxCode}
            activeType={workspace.activeType}
            hasActiveFilters={workspace.hasActiveFilters}
            nonZeroOnly={workspace.nonZeroOnly}
            query={workspace.query}
            sortMode={workspace.sortMode}
            statusFilter={workspace.statusFilter}
            onActiveReportCategoryChange={workspace.setActiveReportCategory}
            onActiveTaxCodeChange={workspace.setActiveTaxCode}
            onActiveTypeChange={workspace.setActiveType}
            onClearFilters={workspace.clearFilters}
            onNonZeroOnlyChange={workspace.setNonZeroOnly}
            onQueryChange={workspace.setQuery}
            onSortModeChange={workspace.setSortMode}
            onStatusFilterChange={workspace.setStatusFilter}
          />
          <AccountsTable
            accounts={workspace.filteredAccounts}
            canManage={workspace.canManage}
            totalCount={workspace.accounts.length}
            // Any change here sends the table back to page one. Without it,
            // filtering while on page two sliced past the end of the shorter
            // result and showed nothing.
            filterKey={[
              workspace.activeType,
              workspace.activeReportCategory,
              workspace.activeTaxCode,
              workspace.statusFilter,
              workspace.sortMode,
              workspace.query,
              String(workspace.nonZeroOnly),
            ].join("|")}
            onEditAccount={setEditingAccount}
            onViewAccount={setViewingAccount}
            emptyState={
              <EmptyAccountsState
                canManage={workspace.canManage}
                hasAccounts={workspace.accounts.length > 0}
                seeding={workspace.seeding}
                onSeed={workspace.seedAccounts}
                onAdd={() => setDialogOpen(true)}
              />
            }
          />
          <Insights
            accounts={workspace.accounts}
            canManage={workspace.canManage}
            seeding={workspace.seeding}
            onSeedAccounts={workspace.seedAccounts}
          />
        </>
      )}

      <AddAccountDialog
        open={dialogOpen}
        accounts={workspace.accounts}
        organization={workspace.organization}
        saving={workspace.saving}
        onOpenChange={setDialogOpen}
        onSubmit={workspace.addAccount}
      />
      {editingAccount ? (
        <AddAccountDialog
          open
          account={editingAccount}
          accounts={workspace.accounts}
          organization={workspace.organization}
          saving={workspace.saving}
          onOpenChange={(open) => {
            if (!open) setEditingAccount(null);
          }}
          onSubmit={async (input) => {
            const updated = await workspace.updateAccount(editingAccount.id, input);
            if (updated) setEditingAccount(null);
            return updated;
          }}
        />
      ) : null}
      <ImportAccountsDialog
        open={importOpen}
        accounts={workspace.accounts}
        saving={workspace.saving}
        onOpenChange={setImportOpen}
        onImport={workspace.importAccounts}
      />
      <AccountDetailsDialog
        open={viewingAccount !== null}
        account={viewingAccount}
        onOpenChange={(open) => {
          if (!open) setViewingAccount(null);
        }}
      />
    </>
  );
}