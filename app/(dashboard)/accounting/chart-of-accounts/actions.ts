"use server";

import { CURRENCY_CODES } from "@/lib/currency";
import { getCurrencyLock } from "@/lib/accounting/currency-lock";
import { revalidatePath } from "next/cache";
import {
  AccountReportCategory,
  AccountType,
  AuditAction,
  CurrencyCode,
  MemberRole,
  type Prisma,
} from "@prisma/client";

import { requireAccountingWorkspace, requireAccountantRole, getChartAccountsWithBalances } from "@/lib/accounting/dal";
import { createStarterAccountsForOrganization } from "@/lib/accounting/account-templates";
import { createChartAccountRecord } from "@/lib/accounting/chart-accounts";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { createClient } from "@/lib/supabase/server";
import {
  isWorkspaceDateFormat,
  type WorkspaceDateFormat,
} from "@/lib/workspace-date-format";

const accountTypeMap = {
  asset: AccountType.ASSET,
  liability: AccountType.LIABILITY,
  equity: AccountType.EQUITY,
  revenue: AccountType.REVENUE,
  expense: AccountType.EXPENSE,
} as const;

const reportCategoryMap = {
  bank: AccountReportCategory.BANK,
  current_asset: AccountReportCategory.CURRENT_ASSET,
  fixed_asset: AccountReportCategory.FIXED_ASSET,
  non_current_asset: AccountReportCategory.NON_CURRENT_ASSET,
  current_liability: AccountReportCategory.CURRENT_LIABILITY,
  non_current_liability: AccountReportCategory.NON_CURRENT_LIABILITY,
  equity: AccountReportCategory.EQUITY,
  sales: AccountReportCategory.SALES,
  other_income: AccountReportCategory.OTHER_INCOME,
  cost_of_sales: AccountReportCategory.COST_OF_SALES,
  expense: AccountReportCategory.EXPENSE,
  depreciation: AccountReportCategory.DEPRECIATION,
} as const;

const taxCodeMap = {
  vat_20: "vat_20",
  vat_5: "vat_5",
  vat_0: "vat_0",
  vat_exempt: "vat_exempt",
  no_vat: "no_vat",
} as const;

type AccountTypeInput = keyof typeof accountTypeMap;
type AccountReportCategoryInput = keyof typeof reportCategoryMap;
type TaxCodeInput = keyof typeof taxCodeMap;

const accountTypeValues = Object.keys(accountTypeMap) as AccountTypeInput[];
const reportCategoryValues = Object.keys(
  reportCategoryMap
) as AccountReportCategoryInput[];
const taxCodeValues = Object.keys(taxCodeMap) as TaxCodeInput[];

export type UpdateAccountInput = {
  code: string;
  name: string;
  description: string;
  account_type: AccountTypeInput;
  report_category: AccountReportCategoryInput;
  tax_code: string;
  tax_rate: number;
  is_active: boolean;
};

export type AccountActivityRow = {
  id: string;
  journalId: string;
  journalDate: string;
  memo: string | null;
  journalMemo: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceLabel: string;
  contactName: string | null;
  debitMinor: number;
  creditMinor: number;
  runningBalanceMinor: number;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

function ensureEnumValue<T extends string>(
  value: string,
  values: readonly T[],
  label: string
): T {
  if (values.includes(value as T)) return value as T;
  throw new Error(`Invalid ${label}.`);
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "";
}

function sourceLabel(row: {
  source_type: string | null;
  source_id: string | null;
  invoice_no: string | null;
  bill_no: string | null;
}) {
  if (row.source_type === "invoice") {
    return row.invoice_no ? `Invoice ${row.invoice_no}` : `Invoice ${shortId(row.source_id)}`;
  }

  if (row.source_type === "bill") {
    return row.bill_no ? `Bill ${row.bill_no}` : `Bill ${shortId(row.source_id)}`;
  }

  if (row.source_type === "invoice_void") return "Void invoice";
  if (row.source_type === "bill_void") return "Void bill";
  if (row.source_type === "manual" || row.source_type === "manual_reversal") {
    return "Manual journal";
  }

  return row.source_type ?? "Journal";
}

export async function createAccountingWorkspace() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("Sign in before creating an accounting workspace.");
  }

  // Keep auth check outside; capture narrowed user reference for use inside the wrapper.
  const user = data.user;

  // Pre-workspace bootstrap runs in system mode (no tenant context exists yet).
  return runAsSystem(async () => {
    const existing = await prisma.userRole.findFirst({
      where: { userId: user.id },
      select: { organizationId: true },
    });

    if (existing) {
      revalidatePath("/accounting/chart-of-accounts");
      return existing.organizationId;
    }

    const emailName = user.email?.split("@")[0] ?? "My";
    const organizationName = `${emailName} Workspace`;
    const baseSlug = slugify(organizationName);
    const slug = `${baseSlug}-${user.id.slice(0, 8)}`;

    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          baseCurrency: CurrencyCode.GBP,
          members: {
            create: {
              userId: user.id,
              role: MemberRole.OWNER,
            },
          },
        },
        select: { id: true },
      });

      await createStarterAccountsForOrganization(tx, created.id);

      return created;
    });

    revalidatePath("/accounting/chart-of-accounts");
    revalidatePath("/dashboard");

    return organization.id;
  });
}

export async function seedStarterAccounts() {
  const workspace = await requireAccountantRole();

  await createStarterAccountsForOrganization(prisma, workspace.organizationId);

  revalidatePath("/accounting/chart-of-accounts");
  revalidatePath("/accounting/journals");
  revalidatePath("/dashboard");
}

export type QuickCreateAccountInput = {
  code: string;
  name: string;
  account_type: AccountTypeInput;
  report_category: AccountReportCategoryInput;
};

export async function createChartAccount(input: QuickCreateAccountInput) {
  const workspace = await requireAccountantRole();

  const accountType = ensureEnumValue(input.account_type, accountTypeValues, "account type");
  const reportCategory = ensureEnumValue(
    input.report_category,
    reportCategoryValues,
    "report category"
  );

  const account = await createChartAccountRecord(
    prisma,
    workspace.organizationId,
    workspace.userId,
    {
      code: input.code,
      name: input.name,
      accountType: accountTypeMap[accountType],
      reportCategory: reportCategoryMap[reportCategory],
    }
  );

  revalidatePath("/accounting/chart-of-accounts");

  // Shape matches ChartAccountOption (lib/accounting/documents.ts:74-81)
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    accountType: account.accountType.toLowerCase(),
    reportCategory: account.reportCategory.toLowerCase(),
    taxCode: account.taxCode,
  };
}

export async function updateChartAccount(
  accountId: string,
  input: UpdateAccountInput
) {
  const workspace = await requireAccountantRole();

  const current = await prisma.chartAccount.findFirstOrThrow({
    where: {
      id: accountId,
      organizationId: workspace.organizationId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      accountType: true,
      reportCategory: true,
      taxCode: true,
      taxRate: true,
      isSystem: true,
      isActive: true,
    },
  });

  const trimmedCode = input.code.trim();
  const trimmedName = input.name.trim();

  if (!/^\d+$/.test(trimmedCode)) {
    throw new Error("Account code must contain numbers only.");
  }

  if (!trimmedName) {
    throw new Error("Account name is required.");
  }

  const accountType = ensureEnumValue(
    input.account_type,
    accountTypeValues,
    "account type"
  );
  const reportCategory = ensureEnumValue(
    input.report_category,
    reportCategoryValues,
    "report category"
  );
  const taxCode = ensureEnumValue(input.tax_code, taxCodeValues, "tax code");

  if (accountTypeMap[accountType] !== current.accountType) {
    throw new Error("Account type cannot be changed after creation.");
  }

  const data: Prisma.ChartAccountUpdateInput = {
    name: trimmedName,
    description: input.description.trim() || null,
  };

  if (!current.isSystem) {
    data.code = trimmedCode;
    data.reportCategory = reportCategoryMap[reportCategory];
    data.taxCode = taxCodeMap[taxCode];
    data.taxRate = input.tax_rate.toFixed(2);
    data.isActive = input.is_active;
  }

  const updated = await prisma.chartAccount.update({
    where: { id: current.id },
    data,
    select: {
      id: true,
      organizationId: true,
      code: true,
      name: true,
      description: true,
      accountType: true,
      reportCategory: true,
      taxCode: true,
      taxRate: true,
      isSystem: true,
      isActive: true,
      createdAt: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: workspace.organizationId,
      actorUserId: workspace.userId,
      entityType: "chart_account",
      entityId: current.id,
      action: AuditAction.UPDATE,
      before: {
        code: current.code,
        name: current.name,
        description: current.description,
        accountType: current.accountType,
        reportCategory: current.reportCategory,
        taxCode: current.taxCode,
        taxRate: current.taxRate.toString(),
        isActive: current.isActive,
      },
      after: {
        code: updated.code,
        name: updated.name,
        description: updated.description,
        accountType: updated.accountType,
        reportCategory: updated.reportCategory,
        taxCode: updated.taxCode,
        taxRate: updated.taxRate.toString(),
        isActive: updated.isActive,
      },
    },
  });

  revalidatePath("/accounting/chart-of-accounts");
  revalidatePath("/reports");

  return {
    id: updated.id,
    org_id: updated.organizationId,
    code: updated.code,
    name: updated.name,
    description: updated.description,
    account_type: updated.accountType.toLowerCase() as AccountTypeInput,
    report_category: updated.reportCategory.toLowerCase() as AccountReportCategoryInput,
    tax_code: updated.taxCode.toLowerCase() as TaxCodeInput,
    tax_rate: Number(updated.taxRate),
    is_system: updated.isSystem,
    is_active: updated.isActive,
    created_at: updated.createdAt.toISOString(),
  };
}

export async function getAccountActivity(
  accountId: string
): Promise<AccountActivityRow[]> {
  const workspace = await requireAccountingWorkspace();

  // tenancy:safe: SQL filters by gle.org_id = workspace.organizationId in the WHERE clause; type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      journal_id: string;
      journal_date: Date;
      account_type: string;
      journal_memo: string | null;
      line_memo: string | null;
      source_type: string | null;
      source_id: string | null;
      invoice_no: string | null;
      bill_no: string | null;
      contact_name: string | null;
      debit_minor: bigint;
      credit_minor: bigint;
    }>
  >`
    select
      gle.id,
      gle.journal_id,
      gle.journal_date,
      gle.account_type::text as account_type,
      gle.journal_memo,
      gle.line_memo,
      gle.source_type,
      gle.source_id,
      i.invoice_no,
      b.invoice_no as bill_no,
      -- Mirrors contactDisplayName() in lib/accounting/contact-name.ts.
      -- If you change the rule there, change it here too.
      case when c.display_name_preference = 'primary'
                and nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') is not null
           then trim(concat_ws(' ', c.first_name, c.last_name))
           else c.name
      end as contact_name,
      gle.debit_minor,
      gle.credit_minor
    from general_ledger_entries gle
    left join invoices i
      on gle.source_type in ('invoice', 'invoice_void')
      and gle.source_id = i.id
      and gle.org_id = i.org_id
    left join bills b
      on gle.source_type in ('bill', 'bill_void')
      and gle.source_id = b.id
      and gle.org_id = b.org_id
    left join contacts c
      on gle.contact_id = c.id
      and gle.org_id = c.org_id
    where gle.org_id = ${workspace.organizationId}::uuid
      and gle.account_id = ${accountId}::uuid
    order by gle.journal_date asc, gle.created_at asc, gle.id asc
  `;

  let runningBalanceMinor = 0;

  return rows.map((row) => {
    const debitMinor = Number(row.debit_minor);
    const creditMinor = Number(row.credit_minor);
    const normalDebitAccount =
      row.account_type === "asset" || row.account_type === "expense";
    const movement = normalDebitAccount
      ? debitMinor - creditMinor
      : creditMinor - debitMinor;

    runningBalanceMinor += movement;

    return {
      id: row.id,
      journalId: row.journal_id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      memo: row.line_memo ?? row.journal_memo,
      journalMemo: row.journal_memo,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceLabel: sourceLabel(row),
      contactName: row.contact_name,
      debitMinor,
      creditMinor,
      runningBalanceMinor,
    };
  });
}

export async function updateOrganizationSettings(input: {
  multicurrencyEnabled?: boolean;
  baseCurrency?: string;
  dateFormat?: string;
}) {
  const workspace = await requireAccountantRole();

  const data: Prisma.OrganizationUpdateInput = {};

  if (input.multicurrencyEnabled !== undefined) {
    data.multicurrencyEnabled = input.multicurrencyEnabled;
  }

  if (input.baseCurrency !== undefined) {
    const next = ensureEnumValue(input.baseCurrency, [...CURRENCY_CODES], "base currency") as CurrencyCode;

    // Enforced here, not just in the dialog: a server action is callable
    // directly, and this one silently rewrites the meaning of every stored
    // amount. A disabled <select> is a hint, not a control.
    const current = await prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: { baseCurrency: true },
    });

    if (current?.baseCurrency !== next) {
      const lock = await getCurrencyLock(workspace.organizationId);
      if (lock.locked) {
        throw new Error(
          `${lock.reason} To move to a different currency you would need to convert the existing ` +
            `figures, which is a migration rather than a settings change.`
        );
      }
      data.baseCurrency = next;
    }
  }

  if (input.dateFormat !== undefined) {
    if (!isWorkspaceDateFormat(input.dateFormat)) {
      throw new Error("Choose a supported date format.");
    }
    data.dateFormat = input.dateFormat satisfies WorkspaceDateFormat;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No valid settings to update.");
  }

  const updated = await prisma.organization.update({
    where: { id: workspace.organizationId },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      baseCurrency: true,
      multicurrencyEnabled: true,
      dateFormat: true,
    },
  });

  /* Everything under the root layout, not the five pages this used to name.
     The base currency is the unit every amount in the product is quoted in, so
     sales, purchases, banking, POS and taxes were all left showing figures
     labelled in the old one. Naming pages also missed the layout itself, which
     is where the currency reaches the client from. */
  revalidatePath("/", "layout");

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    baseCurrency: updated.baseCurrency,
    multicurrencyEnabled: updated.multicurrencyEnabled,
    dateFormat: updated.dateFormat,
  };
}
export type StarterAccountGroup = {
  label: string;
  accounts: string[];
};

/**
 * What "Create starter accounts" would actually add.
 *
 * Read from account_templates rather than listed in the component, because a
 * hardcoded copy of this would drift from the table the seeder uses and the
 * panel would end up promising accounts nobody gets. Loaded on demand, only
 * when someone opens the list.
 */
export async function getStarterAccountTemplates(): Promise<StarterAccountGroup[]> {
  await requireAccountingWorkspace();

  const templates = await prisma.accountTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { code: true, name: true, accountType: true },
  });

  const labels: Record<string, string> = {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    revenue: "Revenue",
    expense: "Expenses",
  };

  const grouped = new Map<string, string[]>();
  for (const template of templates) {
    // The Prisma enum is uppercase (ASSET, LIABILITY); lowered so the order and
    // label lookups below match. Grouping on the raw value made every lookup
    // miss, which returned an empty list the panel reported as a load failure.
    const key = String(template.accountType).toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(`${template.code} ${template.name}`);
    grouped.set(key, list);
  }

  // Balance-sheet order, then profit and loss — how an accountant reads a chart.
  return ["asset", "liability", "equity", "revenue", "expense"]
    .filter((type) => grouped.has(type))
    .map((type) => ({ label: labels[type] ?? type, accounts: grouped.get(type)! }));
}

export async function loadChartOfAccountsData() {
  // 🚀 This runs securely on the server and respects the Impersonation Cookie!
  const workspace = await requireAccountingWorkspace();
  
  const organization = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { 
      id: true, 
      name: true, 
      slug: true, 
      baseCurrency: true, 
      multicurrencyEnabled: true,
      features: true,
      // Read here because this is what populates the sidebar's organisation
      // block; there is no other client-side source for it.
      logoUrl: true
    }
  });

  const accounts = await getChartAccountsWithBalances(workspace.organizationId);

  return {
    role: workspace.role,
    organization,
    accounts,
  };
}

/**
 * Whether the base currency can still be changed, and why not if it cannot.
 *
 * Read by the workspace settings dialog so the control can explain itself
 * rather than just appearing greyed out.
 */
export async function getBaseCurrencyLock() {
  const workspace = await requireAccountingWorkspace();
  return getCurrencyLock(workspace.organizationId);
}
