import "server-only";

import { redirect } from "next/navigation";
import type { AccountType, JournalStatus, MemberRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { readImpersonation } from "@/lib/admin/impersonation";
import { enterScopedContext, runAsSystem } from "@/lib/tenancy/context";

type Role = "owner" | "accountant" | "employee" | "custom";

const roleMap: Record<MemberRole, Role> = {
  OWNER: "owner",
  ACCOUNTANT: "accountant",
  EMPLOYEE: "employee",
  CUSTOM: "custom", // 🚀 NEW: Map the new Prisma enum value to the frontend string
};

const accountTypeMap: Record<AccountType, Lowercase<AccountType>> = {
  ASSET: "asset",
  LIABILITY: "liability",
  EQUITY: "equity",
  REVENUE: "revenue",
  EXPENSE: "expense",
};

const statusMap: Record<JournalStatus, Lowercase<JournalStatus>> = {
  DRAFT: "draft",
  POSTED: "posted",
  REVERSED: "reversed",
};

function dateToIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function dateTimeToIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export type AccountingWorkspace = {
  userId: string;
  organizationId: string;
  role: Role;
  /**
   * Modules granted to a custom role, empty for every other role.
   *
   * Read on the server so a permission can actually be enforced — the sidebar
   * has always had these, but only to decide what to draw.
   */
  customFeatures: string[];
};

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  accountType: string;
};

export type AccountBalanceRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  account_type: string;
  report_category: string;
  tax_code: string;
  tax_rate: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  debit_minor: number;
  credit_minor: number;
  balance_minor: number;
  mtd_movement_minor: number;
  ytd_movement_minor: number;
};

export type JournalListItem = {
  id: string;
  status: string;
  journalDate: string;
  memo: string | null;
  sourceType: string | null;
  debitMinor: number;
  creditMinor: number;
  autoReversalDate: string | null;
  postedAt: string | null;
  lineCount: number;
  reversedJournalId: string | null;
  reversingJournalId: string | null;
};

export type WorkspaceResolution =
  | { ok: true; workspace: AccountingWorkspace }
  | { ok: false; reason: "unauthenticated" | "no-workspace" };

/**
 * Non-redirecting workspace lookup.
 *
 * Use this from background/optional work — widget polls, server actions fired
 * on mount — where navigating the whole page on a miss would be wrong. Page
 * loads that genuinely require a workspace should call
 * `requireAccountingWorkspace()` instead, which turns a miss into a redirect.
 */
export async function resolveAccountingWorkspace(): Promise<WorkspaceResolution> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { ok: false, reason: "unauthenticated" };
  }

  // Admin impersonation: a platform admin holding a valid pass views the target
  // org as owner. userId stays the admin's, so audit events trace back to them.
  const pass = await readImpersonation();
  if (pass && isPlatformAdmin(data.user)) {
    const org = await prisma.organization.findUnique({
      where: { id: pass.orgId },
      select: { id: true },
    });
    if (org) {
      // Organization is not org-scoped so no runAsSystem needed above.
      enterScopedContext({ userId: data.user.id, organizationId: pass.orgId, role: "owner" });
      return {
        ok: true,
        workspace: {
          userId: data.user.id,
          organizationId: pass.orgId,
          role: roleMap.OWNER,
          // An impersonating admin views as owner, which grants everything a
          // custom feature list could.
          customFeatures: [],
        },
      };
    }
    // Stale pass (org gone): fall through to the normal membership path.
  }
// Chicken-and-egg: UserRole is org-scoped but we must query it by userId BEFORE
  // we know which org this user belongs to. Wrap in runAsSystem so the extension
  // allows it through; the userId filter ensures only this user's own rows are returned.
  const membership = await runAsSystem(async () => {
    return await prisma.userRole.findFirst({
      where: { userId: data.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        organizationId: true,
        role: true,
        customFeatures: true,
      },
    });
  });
  
  if (!membership) {
    return { ok: false, reason: "no-workspace" };
  }

  enterScopedContext({ userId: data.user.id, organizationId: membership.organizationId, role: roleMap[membership.role] as any });
  return {
    ok: true,
    workspace: {
      userId: data.user.id,
      organizationId: membership.organizationId,
      role: roleMap[membership.role],
      customFeatures: membership.customFeatures ?? [],
    },
  };
}

/**
 * Workspace lookup for pages that cannot render without one. A signed-out user
 * goes to /login; a signed-in user with no workspace hasn't finished onboarding
 * and is guided there rather than crashing the layout with a raw 500.
 */
export async function requireAccountingWorkspace(): Promise<AccountingWorkspace> {
  const result = await resolveAccountingWorkspace();

  if (result.ok) {
    return result.workspace;
  }

  redirect(result.reason === "unauthenticated" ? "/login" : "/onboarding");
}

export async function requireAccountantRole() {
  const workspace = await requireAccountingWorkspace();

  if (workspace.role !== "owner" && workspace.role !== "accountant") {
    throw new Error("Only owners and accountants can change accounting records.");
  }

  return workspace;
}

export async function getWorkspaceShell() {
  const workspace = await requireAccountingWorkspace();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: workspace.organizationId },
    select: { id: true, name: true, slug: true, baseCurrency: true, multicurrencyEnabled: true },
  });

  return {
    workspace,
    organization,
  };
}

export async function getAccountOptions(
  organizationId: string
): Promise<AccountOption[]> {
  const accounts = await prisma.chartAccount.findMany({
    where: { organizationId, isActive: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
    },
  });

  return accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    accountType: accountTypeMap[account.accountType],
  }));
}

export async function getChartAccountsWithBalances(
  organizationId: string
): Promise<AccountBalanceRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      org_id: string;
      code: string;
      name: string;
      description: string | null;
      account_type: string;
      report_category: string;
      tax_code: string;
      tax_rate: unknown;
      is_system: boolean;
      is_active: boolean;
      created_at: Date;
      debit_minor: bigint;
      credit_minor: bigint;
      balance_minor: bigint;
      mtd_movement_minor: bigint;
      ytd_movement_minor: bigint;
    }>
  >`
    select *
    from account_balances
    where org_id = ${organizationId}::uuid
    order by code asc
  `;

  return rows.map((row) => ({
    ...row,
    tax_rate: Number(row.tax_rate),
    created_at: row.created_at.toISOString(),
    debit_minor: Number(row.debit_minor),
    credit_minor: Number(row.credit_minor),
    balance_minor: Number(row.balance_minor),
    mtd_movement_minor: Number(row.mtd_movement_minor),
    ytd_movement_minor: Number(row.ytd_movement_minor),
  }));
}

export type JournalListPage = {
  items: JournalListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getJournalList(
  organizationId: string,
  opts?: { page?: number; pageSize?: number }
): Promise<JournalListPage> {
  const pageSize = opts?.pageSize ?? 50;
  const page = Math.max(1, opts?.page ?? 1);
  const skip = (page - 1) * pageSize;

  const where = { organizationId };
  const orderBy = [{ journalDate: "desc" as const }, { createdAt: "desc" as const }];
  const select = {
    id: true,
    status: true,
    journalDate: true,
    memo: true,
    sourceType: true,
    autoReversalDate: true,
    postedAt: true,
    reversedJournalId: true,
    reversingJournal: {
      select: {
        id: true,
      },
    },
    lines: {
      select: {
        debitMinor: true,
        creditMinor: true,
      },
    },
  };

  const [journals, total] = await Promise.all([
    prisma.journal.findMany({ where, orderBy, select, take: pageSize, skip }),
    prisma.journal.count({ where }),
  ]);

  const items = journals.map((journal) => ({
    id: journal.id,
    status: statusMap[journal.status],
    journalDate: dateToIsoDate(journal.journalDate) ?? "",
    memo: journal.memo,
    sourceType: journal.sourceType,
    debitMinor: Number(
      journal.lines.reduce((total, line) => total + line.debitMinor, BigInt(0))
    ),
    creditMinor: Number(
      journal.lines.reduce((total, line) => total + line.creditMinor, BigInt(0))
    ),
    autoReversalDate: dateToIsoDate(journal.autoReversalDate),
    postedAt: dateTimeToIso(journal.postedAt),
    lineCount: journal.lines.length,
    reversedJournalId: journal.reversedJournalId,
    reversingJournalId: journal.reversingJournal?.id ?? null,
  }));

  return { items, total, page, pageSize };
}
