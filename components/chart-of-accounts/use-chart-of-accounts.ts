"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createAccountingWorkspace,
  seedStarterAccounts,
  updateChartAccount,
  updateOrganizationSettings,
  loadChartOfAccountsData,
} from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import { createClient } from "@/lib/supabase/client";

import type {
  AccountCounts,
  AccountReportCategory,
  AccountStatusFilter,
  AccountType,
  ChartAccount,
  Organization,
  Role,
  SortMode,
  TaxCode,
} from "./types";

const accountSelect =
  "id, org_id, code, name, description, account_type, report_category, tax_code, tax_rate, is_system, is_active, created_at, debit_minor, credit_minor, balance_minor, mtd_movement_minor, ytd_movement_minor";

export type ImportedAccountInput = {
  code: string;
  name: string;
  description: string | null;
  account_type: AccountType;
  report_category: AccountReportCategory;
  tax_code: TaxCode;
  tax_rate: number;
  is_active: boolean;
};

export type UpdateAccountInput = {
  code: string;
  name: string;
  description: string;
  account_type: AccountType;
  report_category: AccountReportCategory;
  tax_code: TaxCode;
  tax_rate: number;
  is_active: boolean;
};

export function useChartOfAccounts() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<"all" | AccountType>("all");
  const [activeReportCategory, setActiveReportCategory] =
    useState<"all" | AccountReportCategory>("all");
  const [activeTaxCode, setActiveTaxCode] = useState<"all" | TaxCode>("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all");
  const [nonZeroOnly, setNonZeroOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("code");

  const canManage = role === "owner" || role === "accountant";

  async function loadWorkspace() {
    setLoading(true);
    setError("");

    try {
      // 🚀 Calls the secure server action instead of bypassing via client-side Supabase!
      const data = await loadChartOfAccountsData();
      
      setRole(data.role as Role);
      setOrganization(data.organization as Organization);
      setAccounts(data.accounts as any);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load workspace data.");
      if (err.message?.toLowerCase().includes("sign in")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return accounts
      .filter((account) => {
        const matchesType =
          activeType === "all" || account.account_type === activeType;
        const matchesReportCategory =
          activeReportCategory === "all" ||
          account.report_category === activeReportCategory ||
          // Bank ledger accounts are presented as current assets in the UI
          (activeReportCategory === "current_asset" &&
            account.report_category === "bank");
        const matchesTaxCode =
          activeTaxCode === "all" || account.tax_code === activeTaxCode;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && account.is_active) ||
          (statusFilter === "inactive" && !account.is_active) ||
          (statusFilter === "system" && account.is_system) ||
          (statusFilter === "custom" && !account.is_system);
        const matchesBalance =
          !nonZeroOnly ||
          account.balance_minor !== 0 ||
          account.mtd_movement_minor !== 0 ||
          account.ytd_movement_minor !== 0;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          account.code.toLowerCase().includes(normalizedQuery) ||
          account.name.toLowerCase().includes(normalizedQuery) ||
          account.description?.toLowerCase().includes(normalizedQuery);

        return (
          matchesType &&
          matchesReportCategory &&
          matchesTaxCode &&
          matchesStatus &&
          matchesBalance &&
          matchesQuery
        );
      })
      .sort((first, second) => {
        if (sortMode === "name") return first.name.localeCompare(second.name);
        if (sortMode === "type") {
          return first.account_type.localeCompare(second.account_type);
        }
        if (sortMode === "recent") {
          return (
            new Date(second.created_at).getTime() -
            new Date(first.created_at).getTime()
          );
        }
        return first.code.localeCompare(second.code, undefined, {
          numeric: true,
        });
      });
  }, [
    accounts,
    activeReportCategory,
    activeTaxCode,
    activeType,
    nonZeroOnly,
    query,
    sortMode,
    statusFilter,
  ]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    activeType !== "all" ||
    activeReportCategory !== "all" ||
    activeTaxCode !== "all" ||
    statusFilter !== "all" ||
    nonZeroOnly;

  function clearFilters() {
    setQuery("");
    setActiveType("all");
    setActiveReportCategory("all");
    setActiveTaxCode("all");
    setStatusFilter("all");
    setNonZeroOnly(false);
  }

  const counts = useMemo<AccountCounts>(() => {
    return accounts.reduce<AccountCounts>(
      (acc, account) => {
        acc.total += 1;
        acc[account.account_type] += 1;
        if (account.is_active) acc.active += 1;
        return acc;
      },
      {
        total: 0,
        active: 0,
        asset: 0,
        liability: 0,
        equity: 0,
        revenue: 0,
        expense: 0,
      }
    );
  }, [accounts]);

  async function signOut() {
    // 🧹 Clear the short-term memory so the next user doesn't see ghost menus!
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem("wawprofi-features");
    }
    
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function createWorkspace() {
    setCreatingWorkspace(true);
    setError("");

    try {
      await createAccountingWorkspace();
      await loadWorkspace();
      return true;
    } catch (workspaceError) {
      setError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Could not create an accounting workspace."
      );
      return false;
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function addAccount(input: {
    code: string;
    name: string;
    description: string;
    account_type: AccountType;
    report_category: ChartAccount["report_category"];
    tax_code: TaxCode;
    tax_rate: number;
    is_active?: boolean;
  }) {
    if (!organization) return false;

    setSaving(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("chart_of_accounts")
      .insert({
        org_id: organization.id,
        code: input.code.trim(),
        name: input.name.trim(),
        description: input.description.trim() || null,
        account_type: input.account_type,
        report_category: input.report_category,
        tax_code: input.tax_code,
        tax_rate: input.tax_rate,
        is_system: false,
        is_active: input.is_active ?? true,
      })
      .select("id, org_id, code, name, description, account_type, report_category, tax_code, tax_rate, is_system, is_active, created_at")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return false;
    }

    setAccounts((current) => [
      ...current,
      {
        ...(data as Omit<
          ChartAccount,
          | "debit_minor"
          | "credit_minor"
          | "balance_minor"
          | "mtd_movement_minor"
          | "ytd_movement_minor"
        >),
        debit_minor: 0,
        credit_minor: 0,
        balance_minor: 0,
        mtd_movement_minor: 0,
        ytd_movement_minor: 0,
      },
    ]);
    setSaving(false);
    return true;
  }

  async function updateAccount(accountId: string, input: UpdateAccountInput) {
    setSaving(true);
    setError("");

    try {
      const data = await updateChartAccount(accountId, input);

      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId
            ? {
                ...account,
                ...data,
              }
            : account
        )
      );
      return true;
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update this account."
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function seedAccounts() {
    if (!organization) return;

    setSeeding(true);
    setError("");

    try {
      await seedStarterAccounts();
      await loadWorkspace();
    } catch (seedError) {
      setError(
        seedError instanceof Error
          ? seedError.message
          : "Could not create starter accounts."
      );
    } finally {
      setSeeding(false);
    }
  }

  async function importAccounts(rows: ImportedAccountInput[]) {
    if (!organization) return false;

    setSaving(true);
    setError("");

    const { error: importError } = await supabase.from("chart_of_accounts").upsert(
      rows.map((row) => ({
        ...row,
        org_id: organization.id,
        is_system: false,
      })),
      { onConflict: "org_id,code" }
    );

    if (importError) {
      setError(importError.message);
      setSaving(false);
      return false;
    }

    await loadWorkspace();
    setSaving(false);
    return true;
  }

  async function updateSettings(input: {
    multicurrencyEnabled?: boolean;
    baseCurrency?: string;
  }) {
    setSaving(true);
    setError("");

    try {
      const data = await updateOrganizationSettings(input);
      setOrganization((current) =>
        current
          ? {
              ...current,
              baseCurrency: data.baseCurrency,
              multicurrencyEnabled: data.multicurrencyEnabled,
            }
          : null
      );
      return true;
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update settings."
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    accounts,
    activeReportCategory,
    activeTaxCode,
    activeType,
    canManage,
    clearFilters,
    counts,
    creatingWorkspace,
    error,
    filteredAccounts,
    hasActiveFilters,
    loading,
    nonZeroOnly,
    organization,
    query,
    role,
    saving,
    seeding,
    statusFilter,
    sortMode,
    addAccount,
    createWorkspace,
    importAccounts,
    seedAccounts,
    setActiveReportCategory,
    setActiveTaxCode,
    setActiveType,
    setNonZeroOnly,
    setQuery,
    setSortMode,
    setStatusFilter,
    signOut,
    updateAccount,
    updateSettings,
  };
}
