import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  AuditAction,
  ContactType,
  JournalStatus,
  Prisma,
  type AccountReportCategory,
  type AccountType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Db } from "@/lib/banking/posting";
import type {
  BankAccount,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  DashboardSummary,
  AccountBalance,
  FeedTransaction,
  ParsedTransaction,
  JournalCandidate,
  BulkAcceptMatchesResult,
  CategoryAccount,
  CategoryStatus,
  TransactionKind,
  ImportedStatement,
  ImportedStatementPage,
  ImportedStatementRowUpdate,
} from "@/lib/banking/types";
import { matchScore, scoreAmount, scoreDate, scoreDescription } from "@/lib/banking/matching";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import { suggestAiCategories } from "@/lib/banking/ai-categorization";

function toPounds(minor: number): string {
  return (minor / 100).toFixed(2);
}

async function inTransaction<T>(db: Db, run: (tx: Db) => Promise<T>): Promise<T> {
  if ("$transaction" in db) {
    return (db as typeof prisma).$transaction((tx) => run(tx));
  }
  return run(db);
}

/**
 * The workspace's own currency, used as the default for a bank account created
 * without one. Hardcoding sterling gave a workspace keeping books in pesos or
 * shillings bank accounts denominated in a currency it never uses.
 */
async function orgBaseCurrency(db: Db, orgId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { baseCurrency: true },
  });
  return org?.baseCurrency ?? DEFAULT_CURRENCY;
}

export async function getAccountBalance(
  db: Db,
  orgId: string,
  chartAccountId: string,
): Promise<{ balance_minor: number; balance: string }> {
  // tenancy:safe: org enforced directly in the query via j.org_id = orgId; a wrong-org chartAccountId returns 0
  const rows = await db.$queryRaw<Array<{ debits: bigint; credits: bigint }>>`
    SELECT COALESCE(SUM(jl.debit_minor), 0) AS debits,
           COALESCE(SUM(jl.credit_minor), 0) AS credits
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    WHERE jl.account_id = ${chartAccountId}::uuid AND j.status = 'posted'
      AND j.org_id = ${orgId}::uuid`;
  const debits = Number(rows[0]?.debits ?? 0);
  const credits = Number(rows[0]?.credits ?? 0);
  const balance = debits - credits;
  return { balance_minor: balance, balance: toPounds(balance) };
}

export async function getOrgCashPosition(
  db: Db,
  orgId: string,
): Promise<{ balance_minor: number; balance: string }> {
  const rows = await db.$queryRaw<Array<{ debits: bigint; credits: bigint }>>`
    SELECT COALESCE(SUM(jl.debit_minor), 0) AS debits,
           COALESCE(SUM(jl.credit_minor), 0) AS credits
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE ba.org_id = ${orgId}::uuid AND ba.deleted_at IS NULL AND j.status = 'posted'`;
  const debits = Number(rows[0]?.debits ?? 0);
  const credits = Number(rows[0]?.credits ?? 0);
  const balance = debits - credits;
  return { balance_minor: balance, balance: toPounds(balance) };
}

async function serializeBankAccount(
  db: Db,
  row: {
    id: string;
    org_id: string;
    chart_account_id: string;
    display_name: string;
    bank_name: string;
    sort_code: string;
    account_number_last4: string;
    currency: string;
    connection_type: string;
    status: string;
    color_tone: string;
    notes: string;
    created_at: Date;
    updated_at: Date;
  },
): Promise<BankAccount> {
  const coa = await db.chartAccount.findFirst({
    where: { id: row.chart_account_id, organizationId: row.org_id },
    select: { code: true, name: true },
  });
  const { balance, balance_minor } = await getAccountBalance(db, row.org_id, row.chart_account_id);
  return {
    id: row.id,
    org_id: row.org_id,
    chart_account_id: row.chart_account_id,
    chart_account_code: coa?.code ?? null,
    chart_account_name: coa?.name ?? null,
    display_name: row.display_name,
    bank_name: row.bank_name,
    sort_code: row.sort_code,
    account_number_last4: row.account_number_last4,
    currency: row.currency,
    connection_type: row.connection_type as BankAccount["connection_type"],
    status: row.status as BankAccount["status"],
    color_tone: row.color_tone,
    notes: row.notes,
    balance,
    balance_minor,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function ensureBankingRowsForChartBankAccounts(db: Db, orgId: string): Promise<void> {
  const chartBankAccounts = await db.chartAccount.findMany({
    where: {
      organizationId: orgId,
      reportCategory: "BANK",
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
    },
    orderBy: { code: "asc" },
  });

  if (chartBankAccounts.length === 0) return;

  const existing = await prisma.banking_bank_accounts.findMany({
    where: {
      org_id: orgId,
      chart_account_id: { in: chartBankAccounts.map((account) => account.id) },
    },
    select: { chart_account_id: true },
  });
  const existingChartIds = new Set(existing.map((account) => account.chart_account_id));
  const now = new Date();
  const missing = chartBankAccounts.filter((account) => !existingChartIds.has(account.id));

  if (missing.length === 0) return;

  const defaultCurrency = await orgBaseCurrency(db, orgId);

  await prisma.banking_bank_accounts.createMany({
    data: missing.map((account, index) => ({
      id: randomUUID(),
      org_id: orgId,
      chart_account_id: account.id,
      display_name: account.name,
      bank_name: account.name,
      sort_code: "",
      account_number_last4: "",
      currency: defaultCurrency,
      connection_type: "manual_import",
      status: "active",
      color_tone: ["blue", "green", "orange", "purple", "slate"][index % 5],
      notes: account.description ?? "",
      created_by_user_id: null,
      conversion_balance_minor: 0,
      created_at: now,
      updated_at: now,
    })),
  });
}

export async function listBankAccounts(db: Db, orgId: string): Promise<BankAccount[]> {
  await ensureBankingRowsForChartBankAccounts(db, orgId);

  const rows = await prisma.banking_bank_accounts.findMany({
    where: { org_id: orgId, deleted_at: null },
    orderBy: { display_name: "asc" },
  });
  return Promise.all(rows.map((r) => serializeBankAccount(db, r)));
}

export async function nextBankAccountCode(db: Db, orgId: string): Promise<string> {
  const rows = await db.$queryRaw<Array<{ code: string }>>`
    SELECT code FROM chart_of_accounts
    WHERE org_id = ${orgId}::uuid AND code ~ '^10[0-9][0-9]$'
    ORDER BY code DESC LIMIT 1`;
  if (rows.length === 0) return "1000";
  const next = Number(rows[0].code) + 1;
  return Number.isNaN(next) ? "1099" : String(next);
}

export async function createBankAccount(
  db: Db,
  orgId: string,
  userId: string,
  input: CreateBankAccountInput,
): Promise<BankAccount> {
  return prisma.$transaction(async (tx) => {
    let chartAccountId = input.chart_account_id ?? null;

    if (chartAccountId) {
      const coa = await tx.chartAccount.findFirst({
        where: {
          id: chartAccountId,
          organizationId: orgId,
          isActive: true,
          accountType: "ASSET",
          reportCategory: "BANK",
        },
        select: { id: true },
      });
      if (!coa) throw new Error("Choose an active bank account from your Chart of Accounts.");
    } else {
      const code = await nextBankAccountCode(tx, orgId);
      const created = await tx.chartAccount.create({
        data: {
          organizationId: orgId,
          code,
          name: input.display_name,
          accountType: "ASSET",
          isSystem: false,
          isActive: true,
          description: `Bank account: ${input.bank_name}`,
          taxCode: "no_vat",
          taxRate: "0",
          reportCategory: "BANK",
        },
        select: { id: true },
      });
      chartAccountId = created.id;
    }

    const now = new Date();
    const bank = await tx.banking_bank_accounts.create({
      data: {
        id: randomUUID(),
        org_id: orgId,
        chart_account_id: chartAccountId,
        display_name: input.display_name,
        bank_name: input.bank_name,
        sort_code: input.sort_code ?? "",
        account_number_last4: input.account_number_last4 ?? "",
        currency: input.currency ?? (await orgBaseCurrency(tx, orgId)),
        connection_type: input.connection_type ?? "manual_import",
        status: "active",
        color_tone: input.color_tone ?? "blue",
        notes: input.notes ?? "",
        created_by_user_id: userId,
        conversion_balance_minor: 0,
        created_at: now,
        updated_at: now,
      },
    });
    return serializeBankAccount(tx, bank);
  });
}

/**
 * Older imported bank accounts can outlive a deleted Chart of Accounts row
 * because this legacy table has no Prisma relation. Repair only a missing row;
 * never silently replace a real non-bank account, since posted journals may
 * already depend on that link.
 */
export async function ensureBankAccountChartAccount(
  db: Db,
  orgId: string,
  bankAccountId: string,
): Promise<string> {
  return inTransaction(db, async (tx) => {
    const [bank] = await tx.$queryRaw<Array<{
      id: string;
      chart_account_id: string;
      display_name: string;
      bank_name: string;
    }>>`
      SELECT id, chart_account_id, display_name, bank_name
      FROM banking_bank_accounts
      WHERE id = ${bankAccountId}::uuid
        AND org_id = ${orgId}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`;
    if (!bank) throw new Error("This bank account could not be found.");

    const linked = await tx.chartAccount.findFirst({
      where: { id: bank.chart_account_id, organizationId: orgId },
      select: { id: true, isActive: true, accountType: true, reportCategory: true },
    });
    if (linked) {
      if (!linked.isActive || linked.accountType !== "ASSET" || linked.reportCategory !== "BANK") {
        const [postedLines, reconciledRows] = await Promise.all([
          tx.journalLine.count({ where: { organizationId: orgId, accountId: linked.id, journal: { status: "POSTED", organizationId: orgId } } }),
          tx.banking_feed_transactions.count({ where: { org_id: orgId, bank_account_id: bank.id, reconcile_status: "reconciled", deleted_at: null } }),
        ]);
        if (postedLines || reconciledRows) {
          throw new Error("This bank account is linked to the wrong Chart of Accounts entry and already has accounting history. An accountant must relink it without changing the posted records.");
        }
      } else {
        return linked.id;
      }
    }

    const code = await nextBankAccountCode(tx, orgId);
    const replacement = await tx.chartAccount.create({
      data: {
        organizationId: orgId,
        code,
        name: bank.display_name,
        accountType: "ASSET",
        isSystem: false,
        isActive: true,
        description: `Bank account: ${bank.bank_name}`,
        taxCode: "no_vat",
        taxRate: "0",
        reportCategory: "BANK",
      },
      select: { id: true },
    });
    await tx.banking_bank_accounts.update({
      where: { id: bank.id },
      data: { chart_account_id: replacement.id, updated_at: new Date() },
    });
    return replacement.id;
  });
}

export async function updateBankAccount(
  db: Db,
  orgId: string,
  accountId: string,
  input: UpdateBankAccountInput,
): Promise<BankAccount> {
  const existing = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Bank account not found.");

  const data: Record<string, unknown> = { updated_at: new Date() };
  for (const key of [
    "display_name",
    "bank_name",
    "sort_code",
    "account_number_last4",
    "currency",
    "connection_type",
    "status",
    "color_tone",
    "notes",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }

  const updated = await prisma.banking_bank_accounts.update({
    where: { id: accountId },
    data,
  });
  return serializeBankAccount(db, updated);
}

export async function deleteBankAccount(db: Db, orgId: string, accountId: string): Promise<void> {
  const existing = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Bank account not found.");
  await prisma.banking_bank_accounts.update({
    where: { id: accountId },
    data: { deleted_at: new Date(), status: "inactive", updated_at: new Date() },
  });
}

export async function getBalanceSummary(
  db: Db,
  orgId: string,
): Promise<DashboardSummary["balance_summary"]> {
  const orgRows = await db.$queryRaw<Array<{ accounting_period_start: Date | null }>>`
    SELECT accounting_period_start FROM organizations WHERE id = ${orgId}::uuid`;
  const periodStart = orgRows[0]?.accounting_period_start ?? null;

  const obRows = await db.$queryRaw<Array<{ amount: bigint }>>`
    SELECT COALESCE(SUM(jl.debit_minor) - SUM(jl.credit_minor), 0) AS amount
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE ba.org_id = ${orgId}::uuid AND ba.deleted_at IS NULL
      AND j.status = 'posted' AND j.source_type = 'opening_balance'`;
  const opening = Number(obRows[0]?.amount ?? 0);
  const initialConversion = opening;

  const closing = (await getOrgCashPosition(db, orgId)).balance_minor;
  const netMovement = closing - opening;

  return {
    initial_conversion_minor: initialConversion,
    initial_conversion: toPounds(initialConversion),
    opening_minor: opening,
    opening: toPounds(opening),
    closing_minor: closing,
    closing: toPounds(closing),
    net_movement_minor: netMovement,
    net_movement: toPounds(netMovement),
    period_start: periodStart ? periodStart.toISOString().slice(0, 10) : null,
  };
}

export async function getDashboardSummary(db: Db, orgId: string): Promise<DashboardSummary> {
  const cash = await getOrgCashPosition(db, orgId);
  const summary = await getBalanceSummary(db, orgId);
  const unreconciled = await prisma.banking_feed_transactions.count({
    where: {
      org_id: orgId,
      deleted_at: null,
      reconcile_status: { in: ["unmatched", "ai_suggested"] },
    },
  });

  // Statement balance = net movement of every imported statement row;
  // matched balance = the same sum over reconciled rows only. When the two
  // are equal, every statement line has reached the ledger.
  const [allRows, matchedRows] = await Promise.all([
    prisma.banking_feed_transactions.aggregate({
      where: { org_id: orgId, deleted_at: null },
      _sum: { credit_minor: true, debit_minor: true },
    }),
    prisma.banking_feed_transactions.aggregate({
      where: { org_id: orgId, deleted_at: null, reconcile_status: "reconciled" },
      _sum: { credit_minor: true, debit_minor: true },
    }),
  ]);
  const net = (s: { credit_minor: bigint | null; debit_minor: bigint | null }) =>
    Number(s.credit_minor ?? 0) - Number(s.debit_minor ?? 0);

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [cashFlow] = await db.$queryRaw<Array<{ money_in: bigint; money_out: bigint }>>`
    SELECT
      COALESCE(SUM(jl.debit_minor), 0)::bigint AS money_in,
      COALESCE(SUM(jl.credit_minor), 0)::bigint AS money_out
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE j.org_id = ${orgId}::uuid
      AND ba.org_id = ${orgId}::uuid
      AND ba.deleted_at IS NULL
      AND j.status = 'posted'
      AND j.journal_date >= ${periodStart}::date
      AND j.journal_date <= ${periodEnd}::date
      AND COALESCE(j.source_type, '') <> 'bank_transfer'`;
  const moneyIn = Number(cashFlow?.money_in ?? 0);
  const moneyOut = Number(cashFlow?.money_out ?? 0);

  return {
    cash_validation: cash,
    balance_summary: summary,
    statement_balance: toPounds(net(allRows._sum)),
    matched_balance: toPounds(net(matchedRows._sum)),
    unreconciled_count: unreconciled,
    cash_flow: {
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      money_in_minor: moneyIn,
      money_out_minor: moneyOut,
      net_minor: moneyIn - moneyOut,
      money_in: toPounds(moneyIn),
      money_out: toPounds(moneyOut),
      net: toPounds(moneyIn - moneyOut),
    },
  };
}

export async function getOpeningClosingBalances(db: Db, orgId: string): Promise<AccountBalance[]> {
  const accounts = await prisma.banking_bank_accounts.findMany({
    where: { org_id: orgId, deleted_at: null },
    orderBy: { display_name: "asc" },
  });

  const result: AccountBalance[] = [];
  for (const account of accounts) {
    const closing = (await getAccountBalance(db, orgId, account.chart_account_id)).balance_minor;
    // tenancy:safe: account.chart_account_id is from the org_id-filtered findMany above; only accounts belonging to orgId are iterated
    const obRows = await db.$queryRaw<Array<{ amount: bigint }>>`
      SELECT COALESCE(SUM(jl.debit_minor) - SUM(jl.credit_minor), 0) AS amount
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id
      WHERE jl.account_id = ${account.chart_account_id}::uuid
        AND j.status = 'posted' AND j.source_type = 'opening_balance'`;
    const opening = Number(obRows[0]?.amount ?? 0);
    result.push({
      account_id: account.id,
      display_name: account.display_name,
      bank_name: account.bank_name,
      currency: account.currency,
      opening_balance_minor: opening,
      closing_balance_minor: closing,
      opening_balance: toPounds(opening),
      closing_balance: toPounds(closing),
    });
  }
  return result;
}

export async function setOpeningBalance(
  db: Db,
  orgId: string,
  userId: string,
  accountId: string,
  openingBalanceMinor: number,
): Promise<{ account_id: string; opening_balance_minor: number; opening_balance: string }> {
  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true, chart_account_id: true, display_name: true },
  });
  if (!account) throw new Error("Bank account not found.");

  const opening = Math.trunc(openingBalanceMinor);
  const now = new Date();
  const label = `Opening balance — ${account.display_name}`;

  await prisma.$transaction(async (tx) => {
    await assertPeriodOpen(tx, orgId, now);

    // Posted journals are immutable. Instead of deleting any prior
    // opening-balance journal (which would erase it from the audit trail and
    // requires disabling DB triggers), post a balanced REVERSING journal for it
    // — debits/credits swapped — so the original and its reversal both remain in
    // the ledger and net to zero. We then post the new opening-balance journal,
    // leaving the account at the requested balance.
    const priorJournals = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT j.id FROM journals j
      JOIN journal_lines jl ON jl.journal_id = j.id
      WHERE j.org_id = ${orgId}::uuid AND j.source_type = 'opening_balance'
        AND j.status = 'posted'
        AND jl.account_id = ${account.chart_account_id}::uuid
        -- Exclude reversal journals themselves (they carry reversed_journal_id);
        -- only original opening-balance journals should be reversed.
        AND j.reversed_journal_id IS NULL
        -- Exclude originals that have already been reversed (idempotency).
        AND NOT EXISTS (
          SELECT 1 FROM journals r WHERE r.reversed_journal_id = j.id
        )`;

    for (const prior of priorJournals) {
      // tenancy:safe: prior.id is from priorJournals which is org_id-filtered by orgId in the SELECT above; fetching lines by journal_id is safe
      const priorLines = await tx.$queryRaw<
        Array<{
          account_id: string;
          contact_id: string | null;
          debit_minor: bigint;
          credit_minor: bigint;
          memo: string | null;
        }>
      >`
        SELECT account_id, contact_id, debit_minor, credit_minor, memo
        FROM journal_lines WHERE journal_id = ${prior.id}::uuid`;

      // Re-post the prior journal's lines with debits/credits swapped.
      const reversalId = await postBalancedJournal(tx, {
        orgId,
        journalDate: now,
        memo: `Reversal of opening balance — ${account.display_name}`,
        sourceType: "opening_balance",
        sourceId: null,
        createdByUserId: userId,
        lines: priorLines.map((l) => ({
          accountId: l.account_id,
          debitMinor: Number(l.credit_minor),
          creditMinor: Number(l.debit_minor),
          memo: l.memo ? `Reversal: ${l.memo}` : "Reversal",
          contactId: l.contact_id,
        })),
      });

      // Link the reversal to the original so this stays idempotent.
      await tx.$executeRaw`
        UPDATE journals SET reversed_journal_id = ${prior.id}::uuid, updated_at = ${now}
        WHERE id = ${reversalId}::uuid`;

      await tx.auditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId: userId,
          entityType: "opening_balance",
          entityId: prior.id,
          action: AuditAction.REVERSE,
          after: { reversalJournalId: reversalId },
        },
      });
    }

    // Ensure an OB001 equity account exists.
    const obRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM chart_of_accounts WHERE org_id = ${orgId}::uuid AND code = 'OB001' LIMIT 1`;
    let obAccountId = obRows[0]?.id ?? null;
    if (!obAccountId) {
      const created = await tx.chartAccount.create({
        data: {
          organizationId: orgId,
          code: "OB001",
          name: "Opening Balances",
          accountType: "EQUITY",
          isSystem: true,
          isActive: true,
          description: "Opening balances equity account",
          taxCode: "no_vat",
          taxRate: "0",
          reportCategory: "EQUITY",
        },
        select: { id: true },
      });
      obAccountId = created.id;
    }

    // Post the new opening-balance journal (bank vs OB001) via the balanced-post
    // helper, which drafts → inserts lines → flips to posted under the triggers.
    const journalId = await postBalancedJournal(tx, {
      orgId,
      journalDate: now,
      memo: label,
      sourceType: "opening_balance",
      sourceId: null,
      createdByUserId: userId,
      lines: [
        {
          accountId: account.chart_account_id,
          debitMinor: opening >= 0 ? opening : 0,
          creditMinor: opening < 0 ? Math.abs(opening) : 0,
          memo: label,
          contactId: null,
        },
        {
          accountId: obAccountId,
          debitMinor: opening < 0 ? Math.abs(opening) : 0,
          creditMinor: opening >= 0 ? opening : 0,
          memo: label,
          contactId: null,
        },
      ],
    });

    await tx.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        entityType: "opening_balance",
        entityId: journalId,
        action: AuditAction.UPDATE,
        after: { openingBalanceMinor: opening },
      },
    });
  });

  return {
    account_id: account.id,
    opening_balance_minor: opening,
    opening_balance: toPounds(opening),
  };
}

const feedTransactionInclude = Prisma.validator<Prisma.banking_feed_transactionsInclude>()({
  banking_bank_accounts: { select: { display_name: true, currency: true } },
  allocations: {
    orderBy: [{ is_confirmed: "desc" }, { created_at: "asc" }],
    include: {
      account: { select: { code: true, name: true, reportCategory: true } },
    },
  },
});

type FeedRow = Prisma.banking_feed_transactionsGetPayload<{
  include: typeof feedTransactionInclude;
}>;

function feedRowToDto(tx: FeedRow): FeedTransaction {
  return {
    id: tx.id,
    bank_account_id: tx.bank_account_id,
    bank_account_name: tx.banking_bank_accounts.display_name,
    currency: tx.banking_bank_accounts.currency,
    transaction_date: tx.transaction_date.toISOString().slice(0, 10),
    description: tx.description,
    debit_minor: Number(tx.debit_minor),
    credit_minor: Number(tx.credit_minor),
    reconcile_status: tx.reconcile_status as FeedTransaction["reconcile_status"],
    ai_match_label: tx.ai_match_label,
    ai_match_confidence: tx.ai_match_confidence,
    ai_document_kind: tx.ai_document_kind as FeedTransaction["ai_document_kind"],
    ai_document_confidence: tx.ai_document_confidence,
    ai_review_status: tx.ai_review_status as FeedTransaction["ai_review_status"],
    matched_journal_id: tx.matched_journal_id,
    matched_journal_line_id: tx.matched_journal_line_id,
    transaction_kind: tx.transaction_kind as TransactionKind,
    transaction_scope: tx.transaction_scope as FeedTransaction["transaction_scope"],
    category_status: tx.category_status as CategoryStatus,
    category_allocations: tx.allocations.map((allocation) => ({
      id: allocation.id,
      account_id: allocation.account_id,
      account_code: allocation.account.code,
      account_name: allocation.account.name,
      report_category: allocation.account.reportCategory.toLowerCase(),
      amount_minor: Number(allocation.amount_minor),
      source: allocation.source as FeedTransaction["category_allocations"][number]["source"],
      confidence: allocation.confidence,
      is_confirmed: allocation.is_confirmed,
    })),
    source: tx.source,
    created_at: tx.created_at.toISOString(),
  };
}

export async function listFeedTransactions(
  db: Db,
  orgId: string,
  opts: { bankAccountId?: string; search?: string } = {},
): Promise<FeedTransaction[]> {
  const rows = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      ...(opts.bankAccountId ? { bank_account_id: opts.bankAccountId } : {}),
      ...(opts.search ? { description: { contains: opts.search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ transaction_date: "desc" }, { created_at: "desc" }],
    take: 200,
    include: feedTransactionInclude,
  });

  return rows.map(feedRowToDto);
}

export async function getFeedTransactionPage(
  db: Db,
  orgId: string,
  opts: {
    bankAccountId?: string;
    search?: string;
    reconcileStatus?: FeedTransaction["reconcile_status"];
    page?: number;
    pageSize?: number;
  } = {},
): Promise<import("./types").FeedTransactionPage> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  // Keep page sizes bounded even if an action is called outside the UI.
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 25)));
  const where = {
    org_id: orgId,
    deleted_at: null,
    ...(opts.bankAccountId ? { bank_account_id: opts.bankAccountId } : {}),
    ...(opts.search
      ? { description: { contains: opts.search, mode: "insensitive" as const } }
      : {}),
    ...(opts.reconcileStatus ? { reconcile_status: opts.reconcileStatus } : {}),
  };

  const [rows, total, statuses] = await Promise.all([
    prisma.banking_feed_transactions.findMany({
      where,
      orderBy: [{ transaction_date: "desc" }, { created_at: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: feedTransactionInclude,
    }),
    prisma.banking_feed_transactions.count({ where }),
    prisma.banking_feed_transactions.groupBy({
      by: ["reconcile_status"],
      where,
      _count: { _all: true },
    }),
  ]);
  const statusCounts = new Map(statuses.map((row) => [row.reconcile_status, row._count._all]));

  return {
    transactions: rows.map(feedRowToDto),
    total,
    reconciled: statusCounts.get("reconciled") ?? 0,
    unmatched: statusCounts.get("unmatched") ?? 0,
    ai_suggested: statusCounts.get("ai_suggested") ?? 0,
    ignored: statusCounts.get("ignored") ?? 0,
    page,
    page_size: pageSize,
  };
}

/**
 * Historical imports do not have their own table. Their existing import UUID
 * is the source of truth, so reconstruct a compact picker from those rows.
 */
export async function listImportedStatements(db: Db, orgId: string): Promise<ImportedStatement[]> {
  const rows = await db.banking_feed_transactions.findMany({
    where: { org_id: orgId, deleted_at: null, imported_statement_id: { not: null } },
    select: {
      imported_statement_id: true,
      bank_account_id: true,
      transaction_date: true,
      created_at: true,
      reconcile_status: true,
      banking_bank_accounts: { select: { display_name: true, currency: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const statements = new Map<string, ImportedStatement>();
  for (const row of rows) {
    if (!row.imported_statement_id) continue;
    const date = row.transaction_date.toISOString().slice(0, 10);
    const existing = statements.get(row.imported_statement_id);
    if (existing) {
      existing.transaction_count += 1;
      if (row.reconcile_status === "reconciled") existing.reconciled_count += 1;
      if (date < existing.period_start) existing.period_start = date;
      if (date > existing.period_end) existing.period_end = date;
      continue;
    }
    statements.set(row.imported_statement_id, {
      id: row.imported_statement_id,
      bank_account_id: row.bank_account_id,
      bank_account_name: row.banking_bank_accounts.display_name,
      currency: row.banking_bank_accounts.currency,
      imported_at: row.created_at.toISOString(),
      period_start: date,
      period_end: date,
      transaction_count: 1,
      reconciled_count: row.reconcile_status === "reconciled" ? 1 : 0,
    });
  }
  return [...statements.values()].sort((a, b) => b.imported_at.localeCompare(a.imported_at));
}

export async function getImportedStatementPage(
  db: Db,
  orgId: string,
  importedStatementId: string,
  opts: { page?: number; pageSize?: number; search?: string } = {},
): Promise<ImportedStatementPage> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(opts.pageSize ?? 50)));
  const where = {
    org_id: orgId,
    imported_statement_id: importedStatementId,
    deleted_at: null,
    ...(opts.search ? { description: { contains: opts.search, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.banking_feed_transactions.findMany({
      where,
      orderBy: [{ transaction_date: "asc" }, { created_at: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: feedTransactionInclude,
    }),
    db.banking_feed_transactions.count({ where }),
  ]);
  return { transactions: rows.map(feedRowToDto), total, page, page_size: pageSize };
}

/** Persist spreadsheet edits in one guarded request. Posted/reconciled rows stay immutable. */
export async function updateImportedStatementRows(
  db: Db,
  orgId: string,
  userId: string,
  importedStatementId: string,
  updates: ImportedStatementRowUpdate[],
): Promise<{ updated: number; skipped: number }> {
  const unique = [...new Map(updates.slice(0, 500).map((update) => [update.id, update])).values()];
  if (!unique.length) return { updated: 0, skipped: 0 };

  const ids = unique.map((update) => update.id);
  const rows = await db.banking_feed_transactions.findMany({
    where: { id: { in: ids }, org_id: orgId, imported_statement_id: importedStatementId, deleted_at: null },
    select: { id: true, reconcile_status: true, category_status: true },
  });
  const editable = new Map(rows.map((row) => [row.id, row]));
  const categoryIds = unique.flatMap((update) => update.category_account_id ? [update.category_account_id] : []);
  const accounts = categoryIds.length
    ? await db.chartAccount.findMany({
        where: { id: { in: categoryIds }, organizationId: orgId, isActive: true, reportCategory: { not: "BANK" } },
        select: { id: true, accountType: true, reportCategory: true },
      })
    : [];
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  let updated = 0;
  await inTransaction(db, async (txDb) => {
    for (const update of unique) {
      const existing = editable.get(update.id);
      if (!existing) continue;
      const date = new Date(`${update.transaction_date}T00:00:00.000Z`);
      const description = update.description.trim().slice(0, 500);
      const debit = Math.round(Number(update.debit_minor));
      const credit = Math.round(Number(update.credit_minor));
      if (Number.isNaN(date.getTime()) || !description || !Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) continue;
      const categoryWasChanged = update.category_account_id !== undefined;
      const account = update.category_account_id ? accountsById.get(update.category_account_id) : null;
      if (update.category_account_id && !account) continue;

      if (existing.reconcile_status === "reconciled") {
        await unreconcileFeed(txDb, orgId, userId, update.id);
      }

      await txDb.banking_feed_transactions.update({
        where: { id: update.id },
        data: {
          transaction_date: date,
          description,
          raw_description: description,
          debit_minor: BigInt(debit),
          credit_minor: BigInt(credit),
          reconcile_status: "unmatched",
          matched_journal_id: null,
          matched_journal_line_id: null,
          matched_at: null,
          matched_by_user_id: null,
          ai_match_label: "",
          ai_match_confidence: null,
          ai_document_kind: null,
          ai_document_confidence: null,
          ai_document_reason: null,
          ai_document_contact_id: null,
          ai_document_contact_name: null,
          ai_document_account_id: null,
          ai_document_id: null,
          ai_document_journal_id: null,
          ai_review_status: null,
          ai_reviewed_at: null,
          ai_reviewed_by_user_id: null,
          ...(categoryWasChanged
            ? {
                transaction_kind: account
                  ? transactionKindForAccount(account.accountType, account.reportCategory, credit > 0)
                  : "uncategorized",
                category_status: account ? "confirmed" : "uncategorized",
              }
            : existing.category_status === "suggested"
              ? { transaction_kind: "uncategorized", category_status: "uncategorized" }
              : {}),
          updated_at: new Date(),
        },
      });
      if (categoryWasChanged || existing.category_status === "suggested") {
        await txDb.banking_transaction_allocations.deleteMany({
          where: { org_id: orgId, feed_transaction_id: update.id },
        });
      } else {
        await txDb.banking_transaction_allocations.updateMany({
          where: { org_id: orgId, feed_transaction_id: update.id },
          data: { amount_minor: BigInt(Math.max(debit, credit)), updated_at: new Date() },
        });
      }
      if (categoryWasChanged && account) {
        await txDb.banking_transaction_allocations.create({
          data: {
            org_id: orgId,
            feed_transaction_id: update.id,
            account_id: account.id,
            amount_minor: BigInt(Math.max(debit, credit)),
            source: "manual",
            confidence: 1,
            is_confirmed: true,
            created_by_user_id: userId,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }
      updated += 1;
    }
  });
  return { updated, skipped: unique.length - updated };
}

export async function deleteFeedTransaction(db: Db, orgId: string, txId: string): Promise<void> {
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!tx) throw new Error("Transaction not found.");
  await prisma.banking_feed_transactions.update({
    where: { id: txId },
    data: { deleted_at: new Date(), updated_at: new Date() },
  });
}

export async function bulkDeleteFeed(
  db: Db,
  orgId: string,
  ids: string[],
): Promise<{ deleted: number }> {
  if (ids.length === 0) throw new Error("No IDs provided.");
  // Reconciled rows are the audit trail of a posted match — never bulk-delete them.
  const res = await prisma.banking_feed_transactions.updateMany({
    where: {
      id: { in: ids },
      org_id: orgId,
      deleted_at: null,
      reconcile_status: { not: "reconciled" },
    },
    data: { deleted_at: new Date(), updated_at: new Date() },
  });
  return { deleted: res.count };
}

/** Delete every non-reconciled feed row matching the current Statements filters. */
export async function bulkDeleteAllFeed(
  db: Db,
  orgId: string,
  opts: { search?: string; reconcileStatus?: FeedTransaction["reconcile_status"] } = {},
): Promise<{ deleted: number }> {
  const res = await db.banking_feed_transactions.updateMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      reconcile_status: {
        not: "reconciled",
        ...(opts.reconcileStatus ? { equals: opts.reconcileStatus } : {}),
      },
      ...(opts.search
        ? { description: { contains: opts.search, mode: "insensitive" as const } }
        : {}),
    },
    data: { deleted_at: new Date(), updated_at: new Date() },
  });
  return { deleted: res.count };
}

type FeedAmountShape = {
  debit_minor: bigint;
  credit_minor: bigint;
  category_status?: string;
};

function transactionKindForAccount(
  accountType: string,
  reportCategory: string,
  isMoneyIn: boolean,
): TransactionKind {
  if (reportCategory === "BANK") return "transfer";
  if (accountType === "REVENUE") return isMoneyIn ? "income" : "refund";
  if (accountType === "EXPENSE") return isMoneyIn ? "refund" : "expense";
  if (accountType === "EQUITY") return "equity";
  if (accountType === "LIABILITY") return isMoneyIn ? "loan" : "payment";
  return accountType === "ASSET" ? "asset" : "payment";
}

async function deriveJournalAllocations(
  db: Db,
  orgId: string,
  userId: string,
  feedTransactionId: string,
  journalId: string,
  feed: FeedAmountShape,
): Promise<void> {
  const current = await db.banking_feed_transactions.findFirst({
    where: { id: feedTransactionId, org_id: orgId },
    select: { category_status: true },
  });
  if (current?.category_status === "confirmed") return;

  const journal = await db.journal.findFirst({
    where: { id: journalId, organizationId: orgId, status: JournalStatus.POSTED },
    select: {
      sourceType: true,
      sourceId: true,
      lines: {
        select: {
          accountId: true,
          debitMinor: true,
          creditMinor: true,
          account: {
            select: { code: true, accountType: true, reportCategory: true },
          },
        },
      },
    },
  });
  if (!journal) return;

  if (journal.sourceType === "bank_transfer") {
    await db.banking_transaction_allocations.deleteMany({
      where: { org_id: orgId, feed_transaction_id: feedTransactionId },
    });
    await db.banking_feed_transactions.update({
      where: { id: feedTransactionId },
      data: { transaction_kind: "transfer", category_status: "derived" },
    });
    return;
  }

  type WeightedAccount = {
    accountId: string;
    weight: bigint;
    accountType: string;
    reportCategory: string;
  };
  let weighted: WeightedAccount[] = [];

  if (journal.sourceId && journal.sourceType === "invoice_payment") {
    const lines = await db.invoiceLine.findMany({
      where: { organizationId: orgId, invoiceId: journal.sourceId },
      select: {
        accountId: true,
        subtotalMinor: true,
        account: { select: { accountType: true, reportCategory: true } },
      },
    });
    weighted = lines.map((line) => ({
      accountId: line.accountId,
      weight: line.subtotalMinor,
      accountType: line.account.accountType,
      reportCategory: line.account.reportCategory,
    }));
  } else if (journal.sourceId && journal.sourceType === "bill_payment") {
    const lines = await db.billLine.findMany({
      where: { organizationId: orgId, billId: journal.sourceId },
      select: {
        accountId: true,
        subtotalMinor: true,
        account: { select: { accountType: true, reportCategory: true } },
      },
    });
    weighted = lines.map((line) => ({
      accountId: line.accountId,
      weight: line.subtotalMinor,
      accountType: line.account.accountType,
      reportCategory: line.account.reportCategory,
    }));
  } else {
    const moneyIn = feed.credit_minor > BigInt(0);
    weighted = journal.lines
      .filter(
        (line) =>
          line.account.reportCategory !== "BANK" &&
          !["1100", "2100", "2200", "2201"].includes(line.account.code),
      )
      .map((line) => ({
        accountId: line.accountId,
        weight: moneyIn ? line.creditMinor : line.debitMinor,
        accountType: line.account.accountType,
        reportCategory: line.account.reportCategory,
      }))
      .filter((line) => line.weight > BigInt(0));
  }

  const grouped = new Map<string, WeightedAccount>();
  for (const item of weighted) {
    if (item.weight <= BigInt(0)) continue;
    const existing = grouped.get(item.accountId);
    if (existing) existing.weight += item.weight;
    else grouped.set(item.accountId, { ...item });
  }
  weighted = [...grouped.values()];

  if (weighted.length === 0) {
    await db.banking_feed_transactions.update({
      where: { id: feedTransactionId },
      data: {
        transaction_kind: journal.sourceType?.includes("payment") ? "payment" : "uncategorized",
        category_status: "uncategorized",
      },
    });
    return;
  }

  const amount = feed.credit_minor > BigInt(0) ? feed.credit_minor : feed.debit_minor;
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, BigInt(0));
  let assigned = BigInt(0);
  const allocations = weighted.map((item, index) => {
    const allocationAmount =
      index === weighted.length - 1 ? amount - assigned : (amount * item.weight) / totalWeight;
    assigned += allocationAmount;
    return {
      id: randomUUID(),
      org_id: orgId,
      feed_transaction_id: feedTransactionId,
      account_id: item.accountId,
      amount_minor: allocationAmount,
      source: "journal",
      confidence: 100,
      is_confirmed: true,
      created_by_user_id: userId,
      created_at: new Date(),
      updated_at: new Date(),
    };
  });

  await db.banking_transaction_allocations.deleteMany({
    where: { org_id: orgId, feed_transaction_id: feedTransactionId },
  });
  await db.banking_transaction_allocations.createMany({ data: allocations });
  const first = weighted[0];
  await db.banking_feed_transactions.update({
    where: { id: feedTransactionId },
    data: {
      transaction_kind: transactionKindForAccount(
        first.accountType,
        first.reportCategory,
        feed.credit_minor > BigInt(0),
      ),
      category_status: "derived",
    },
  });
}

export async function reconcileFeed(
  db: Db,
  orgId: string,
  userId: string,
  txId: string,
  journalId: string,
): Promise<{ status: string; id: string }> {
  if (!journalId) throw new Error("journal_id required.");
  return inTransaction(db, async (txDb) => {
    const [feed] = await txDb.$queryRaw<
      Array<{
        id: string;
        bank_account_id: string;
        debit_minor: bigint;
        credit_minor: bigint;
        reconcile_status: string;
      }>
    >`
      SELECT id, bank_account_id, debit_minor, credit_minor, reconcile_status
      FROM banking_feed_transactions
      WHERE id = ${txId}::uuid AND org_id = ${orgId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    if (!feed) throw new Error("Transaction not found.");
    if (feed.reconcile_status === "reconciled") {
      throw new Error("This statement line is already reconciled.");
    }

    const account = await txDb.banking_bank_accounts.findFirst({
      where: { id: feed.bank_account_id, org_id: orgId, deleted_at: null },
      select: { chart_account_id: true, currency: true },
    });
    if (!account) throw new Error("Bank account not found.");
    const baseCurrency = await orgBaseCurrency(txDb, orgId);
    if (account.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      throw new Error(
        `Foreign-currency reconciliation is not available yet. Convert ${account.currency} to ${baseCurrency} before matching.`,
      );
    }

    const line = await txDb.journalLine.findFirst({
      where: {
        journalId,
        organizationId: orgId,
        accountId: account.chart_account_id,
        journal: { status: "POSTED", organizationId: orgId },
        ...(feed.credit_minor > BigInt(0)
          ? { debitMinor: feed.credit_minor }
          : { creditMinor: feed.debit_minor }),
      },
      select: { id: true },
    });
    if (!line) {
      throw new Error(
        "Journal does not match this statement line: it must be posted, on the same bank account, and for the same amount and direction.",
      );
    }

    const alreadyMatched = await txDb.banking_feed_transactions.findFirst({
      where: {
        org_id: orgId,
        deleted_at: null,
        matched_journal_line_id: line.id,
        id: { not: txId },
      },
      select: { id: true },
    });
    if (alreadyMatched) {
      throw new Error("This bank journal line is already reconciled to another statement line.");
    }

    await txDb.banking_feed_transactions.update({
      where: { id: txId },
      data: {
        reconcile_status: "reconciled",
        matched_journal_id: journalId,
        matched_journal_line_id: line.id,
        matched_at: new Date(),
        matched_by_user_id: userId,
        updated_at: new Date(),
      },
    });
    await deriveJournalAllocations(txDb, orgId, userId, txId, journalId, feed);
    return { status: "reconciled", id: txId };
  });
}

export async function unreconcileFeed(
  db: Db,
  orgId: string,
  userId: string,
  txId: string,
): Promise<{ status: string; id: string }> {
  return inTransaction(db, async (txDb) => {
    const [feed] = await txDb.$queryRaw<
      Array<{
        id: string;
        reconcile_status: string;
        matched_journal_id: string | null;
        category_status: string;
      }>
    >`
      SELECT id, reconcile_status, matched_journal_id, category_status
      FROM banking_feed_transactions
      WHERE id = ${txId}::uuid AND org_id = ${orgId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    if (!feed) throw new Error("Transaction not found.");
    if (feed.reconcile_status !== "reconciled") {
      throw new Error("This statement line is not reconciled.");
    }

    if (feed.matched_journal_id) {
      const recorded = await txDb.journal.findFirst({
        where: {
          id: feed.matched_journal_id,
          organizationId: orgId,
          sourceId: txId,
          sourceType: { in: ["bank_feed_income", "bank_feed_expense"] },
          status: JournalStatus.POSTED,
        },
        include: { lines: true },
      });
      if (recorded) {
        const existingReversal = await txDb.journal.findFirst({
          where: { organizationId: orgId, reversedJournalId: recorded.id },
          select: { id: true },
        });
        if (!existingReversal) {
          const reversalId = await postBalancedJournal(txDb, {
            orgId,
            journalDate: new Date(),
            memo: `Undo bank-feed record: ${recorded.memo ?? txId}`,
            sourceType: "bank_feed_unrecord",
            sourceId: txId,
            reversedJournalId: recorded.id,
            createdByUserId: userId,
            lines: recorded.lines.map((line) => ({
              accountId: line.accountId,
              debitMinor: Number(line.creditMinor),
              creditMinor: Number(line.debitMinor),
              memo: line.memo ? `Reversal: ${line.memo}` : "Bank-feed record reversal",
              contactId: line.contactId,
            })),
          });
          await txDb.auditEvent.create({
            data: {
              organizationId: orgId,
              actorUserId: userId,
              entityType: "bank_feed_transaction",
              entityId: txId,
              action: AuditAction.REVERSE,
              after: { originalJournalId: recorded.id, reversalJournalId: reversalId },
            },
          });
        }
      }
    }

    if (feed.category_status === "derived") {
      await txDb.banking_transaction_allocations.deleteMany({
        where: { org_id: orgId, feed_transaction_id: txId },
      });
    }
    await txDb.banking_feed_transactions.update({
      where: { id: txId },
      data: {
        reconcile_status: "unmatched",
        matched_journal_id: null,
        matched_journal_line_id: null,
        matched_at: null,
        matched_by_user_id: null,
        ai_match_label: "",
        ai_match_confidence: null,
        ...(feed.category_status === "derived"
          ? { category_status: "uncategorized", transaction_kind: "uncategorized" }
          : {}),
        updated_at: new Date(),
      },
    });
    return { status: "unmatched", id: txId };
  });
}

export async function rejectAiSuggestion(
  db: Db,
  orgId: string,
  txId: string,
): Promise<{ status: string; id: string }> {
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null },
    select: { id: true, reconcile_status: true },
  });
  if (!tx) throw new Error("Transaction not found.");
  if (tx.reconcile_status !== "ai_suggested") {
    throw new Error("This statement line has no pending suggestion.");
  }
  await prisma.banking_feed_transactions.update({
    where: { id: txId },
    data: {
      reconcile_status: "unmatched",
      matched_journal_id: null,
      matched_journal_line_id: null,
      ai_match_label: "",
      ai_match_confidence: null,
      updated_at: new Date(),
    },
  });
  return { status: "unmatched", id: txId };
}

type CandidateRow = {
  journal_id: string;
  journal_line_id: string;
  journal_date: Date;
  memo: string | null;
  debit_minor: bigint;
  credit_minor: bigint;
  bank_account_id: string;
};

/**
 * Bank descriptions often carry a changing reference number (for example a
 * card authorisation ID). Removing numbers lets a confirmed category for
 * "Acme Supplies 48291" help with a later "Acme Supplies 93810", while
 * retaining the merchant words that make the suggestion meaningful.
 */
function categoryHistoryKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/\d+/g, " ")
    .replace(/[^A-Z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type CategoryHistoryCandidate = { accountId: string; count: number };

async function loadCategoryHistory(
  db: Db,
  orgId: string,
): Promise<Map<string, CategoryHistoryCandidate>> {
  // Only learn from choices a person explicitly confirmed. Journal-derived
  // categories and earlier AI suggestions must not reinforce themselves.
  const rows = await db.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      category_status: "confirmed",
      allocations: { some: { is_confirmed: true, source: "manual" } },
    },
    select: {
      description: true,
      debit_minor: true,
      credit_minor: true,
      allocations: {
        where: { is_confirmed: true, source: "manual" },
        select: { account_id: true },
        take: 1,
      },
    },
    take: 5_000,
    orderBy: { updated_at: "desc" },
  });

  const votes = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const accountId = row.allocations[0]?.account_id;
    const descriptionKey = categoryHistoryKey(row.description);
    if (!accountId || !descriptionKey) continue;
    const direction = row.credit_minor > BigInt(0) ? "in" : "out";
    const key = `${direction}|${descriptionKey}`;
    const byAccount = votes.get(key) ?? new Map<string, number>();
    byAccount.set(accountId, (byAccount.get(accountId) ?? 0) + 1);
    votes.set(key, byAccount);
  }

  const history = new Map<string, CategoryHistoryCandidate>();
  for (const [key, byAccount] of votes) {
    const ranked = [...byAccount.entries()].sort((a, b) => b[1] - a[1]);
    const [accountId, count] = ranked[0] ?? [];
    // A conflicting history is not a useful suggestion. Require one clear
    // winner, and never infer a category from a merchant with mixed treatment.
    if (!accountId || !count || (ranked.length > 1 && ranked[1][1] === count)) continue;
    history.set(key, { accountId, count });
  }
  return history;
}

async function suggestCategoryFromHistory(
  db: Db,
  orgId: string,
  tx: {
    id: string;
    description: string;
    debit_minor: bigint;
    credit_minor: bigint;
    category_status: string;
  },
  history: Map<string, CategoryHistoryCandidate>,
  accounts: Map<string, { accountType: AccountType; reportCategory: AccountReportCategory }>,
): Promise<boolean> {
  if (tx.category_status === "confirmed" || tx.category_status === "derived") return false;
  const direction = tx.credit_minor > BigInt(0) ? "in" : "out";
  const candidate = history.get(`${direction}|${categoryHistoryKey(tx.description)}`);
  const account = candidate ? accounts.get(candidate.accountId) : null;
  if (!candidate || !account) return false;

  const amount = tx.credit_minor > BigInt(0) ? tx.credit_minor : tx.debit_minor;
  // One previous confirmed choice is useful but deliberately not treated as
  // high confidence. Regardless of confidence, the user must click Record
  // before a suggested category can create and post a journal.
  const confidence = candidate.count >= 2 ? 95 : 80;
  await db.banking_transaction_allocations.deleteMany({
    where: { org_id: orgId, feed_transaction_id: tx.id, is_confirmed: false },
  });
  await db.banking_transaction_allocations.create({
    data: {
      id: randomUUID(),
      org_id: orgId,
      feed_transaction_id: tx.id,
      account_id: candidate.accountId,
      amount_minor: amount,
      source: "history",
      confidence,
      is_confirmed: false,
      created_by_user_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  await db.banking_feed_transactions.update({
    where: { id: tx.id },
    data: {
      transaction_kind: transactionKindForAccount(
        account.accountType,
        account.reportCategory,
        direction === "in",
      ),
      category_status: "suggested",
      updated_at: new Date(),
    },
  });
  return true;
}

/** A conservative no-API fallback for unfamiliar merchants. */
async function suggestCategoryFromAccountKeywords(
  db: Db,
  orgId: string,
  tx: { id: string; description: string; debit_minor: bigint; credit_minor: bigint; category_status: string },
  accounts: Array<{ id: string; name: string; accountType: AccountType; reportCategory: AccountReportCategory }>,
): Promise<boolean> {
  if (tx.category_status !== "uncategorized") return false;
  const words = new Set((tx.description.toUpperCase().match(/[A-Z]{4,}/g) ?? []));
  let best: (typeof accounts)[number] | null = null;
  let score = 0;
  for (const account of accounts) {
    const accountWords = account.name.toUpperCase().match(/[A-Z]{4,}/g) ?? [];
    const overlap = accountWords.filter((word) => words.has(word)).length;
    if (overlap > score) { score = overlap; best = account; }
  }
  // One generic word is too weak to automate; require a meaningful overlap.
  if (!best || score < 1) return false;
  const amount = tx.credit_minor > BigInt(0) ? tx.credit_minor : tx.debit_minor;
  await db.banking_transaction_allocations.deleteMany({ where: { org_id: orgId, feed_transaction_id: tx.id, is_confirmed: false } });
  await db.banking_transaction_allocations.create({ data: { id: randomUUID(), org_id: orgId, feed_transaction_id: tx.id, account_id: best.id, amount_minor: amount, source: "rule", confidence: 65, is_confirmed: false, created_by_user_id: null, created_at: new Date(), updated_at: new Date() } });
  await db.banking_feed_transactions.update({ where: { id: tx.id }, data: { transaction_kind: transactionKindForAccount(best.accountType, best.reportCategory, tx.credit_minor > BigInt(0)), category_status: "suggested", updated_at: new Date() } });
  return true;
}

async function loadJournalCandidates(
  db: Db,
  orgId: string,
  limit: number,
): Promise<CandidateRow[]> {
  return db.$queryRaw<CandidateRow[]>`
    SELECT j.id AS journal_id, jl.id AS journal_line_id, j.journal_date, j.memo, jl.debit_minor, jl.credit_minor,
           ba.id AS bank_account_id
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE j.org_id = ${orgId}::uuid AND j.status = 'posted'
      AND ba.deleted_at IS NULL AND ba.org_id = ${orgId}::uuid
      AND jl.id NOT IN (
        SELECT matched_journal_line_id FROM banking_feed_transactions
        WHERE org_id = ${orgId}::uuid AND reconcile_status = 'reconciled'
          AND matched_journal_line_id IS NOT NULL
      )
    ORDER BY j.journal_date DESC
    LIMIT ${limit}`;
}

export async function runAiMatch(
  db: Db,
  orgId: string,
  opts: { importedStatementId?: string } = {},
): Promise<{
  matched: number;
  skipped: number;
  total_feed_rows: number;
  total_journal_candidates: number;
  categories_suggested: number;
  categories_failed: number;
  message?: string;
}> {
  const feed = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      reconcile_status: { in: ["unmatched", "ai_suggested"] },
      ...(opts.importedStatementId ? { imported_statement_id: opts.importedStatementId } : {}),
    },
  });
  if (feed.length === 0) {
    return {
      matched: 0,
      skipped: 0,
      total_feed_rows: 0,
      total_journal_candidates: 0,
      categories_suggested: 0,
      categories_failed: 0,
      message: "No unmatched feed rows.",
    };
  }

  const candidates = await loadJournalCandidates(db, orgId, 500);
  const categoryHistory = await loadCategoryHistory(db, orgId);
  const allCategoryAccounts = await db.chartAccount.findMany({
    where: { organizationId: orgId, isActive: true, reportCategory: { not: "BANK" }, code: { notIn: ["1100", "2100", "2200", "2201"] } },
    select: { id: true, code: true, name: true, accountType: true, reportCategory: true },
  });
  const categoryAccounts = new Map(
    allCategoryAccounts.map((account) => [
      account.id,
      { accountType: account.accountType, reportCategory: account.reportCategory },
    ]),
  );

  let matched = 0;
  let categoriesSuggested = 0;
  const aiFallbackRows: typeof feed = [];
  const suggestedJournalLineIds = new Set<string>();
  const candidatesByExactBankAmount = new Map<string, CandidateRow[]>();
  for (const candidate of candidates) {
    const direction = candidate.debit_minor > BigInt(0) ? "in" : "out";
    const amount =
      candidate.debit_minor > BigInt(0) ? candidate.debit_minor : candidate.credit_minor;
    const key = `${candidate.bank_account_id}|${direction}|${amount}`;
    const bucket = candidatesByExactBankAmount.get(key) ?? [];
    bucket.push(candidate);
    candidatesByExactBankAmount.set(key, bucket);
  }
  // Read once rather than per matched row — it is the same value every time.
  const labelCurrency = await orgBaseCurrency(db, orgId);

  for (const tx of feed) {
    const feedAmount =
      Number(tx.credit_minor) > 0 ? Number(tx.credit_minor) : Number(tx.debit_minor);
    const direction = tx.credit_minor > BigInt(0) ? "in" : "out";
    const exactCandidates =
      candidatesByExactBankAmount.get(`${tx.bank_account_id}|${direction}|${feedAmount}`) ?? [];
    let bestScore = 0;
    let best: CandidateRow | null = null;
    for (const c of exactCandidates) {
      if (suggestedJournalLineIds.has(c.journal_line_id)) continue;
      const journalAmount =
        Number(c.debit_minor) > 0 ? Number(c.debit_minor) : Number(c.credit_minor);
      const score = matchScore({
        feedAmountMinor: feedAmount,
        feedDate: tx.transaction_date,
        feedDescription: tx.description,
        journalAmountMinor: journalAmount,
        journalDate: c.journal_date,
        journalMemo: c.memo,
      });
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (bestScore >= 75 && best) {
      suggestedJournalLineIds.add(best.journal_line_id);
      // The candidate is a journal, so this figure is in the workspace currency.
      const amountLabel = formatMoney(
        Math.max(Number(best.debit_minor), Number(best.credit_minor)),
        labelCurrency,
      );
      const label = `${(best.memo ?? "Journal").slice(0, 30)} (${amountLabel})`;
      await prisma.banking_feed_transactions.update({
        where: { id: tx.id },
        data: {
          reconcile_status: "ai_suggested",
          ai_match_label: label,
          ai_match_confidence: bestScore,
          matched_journal_id: best.journal_id,
          matched_journal_line_id: best.journal_line_id,
          updated_at: new Date(),
        },
      });
      matched++;
      continue;
    }

    // No pre-existing journal can be safely reconciled. Offer a category
    // learned from this workspace's own confirmed history instead; it does
    // not create or post a journal until the user explicitly records the row.
    if (
      tx.reconcile_status === "unmatched" &&
      (
        (await suggestCategoryFromHistory(db, orgId, tx, categoryHistory, categoryAccounts)) ||
        (await suggestCategoryFromAccountKeywords(db, orgId, tx, allCategoryAccounts))
      )
    ) {
      categoriesSuggested++;
    } else if (tx.reconcile_status === "unmatched" && tx.category_status === "uncategorized") {
      aiFallbackRows.push(tx);
    }
  }

  const aiCategoryResult = await suggestAiCategories(
    aiFallbackRows.map((tx) => ({ id: tx.id, description: tx.description, moneyIn: tx.credit_minor > BigInt(0) })),
    allCategoryAccounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType.toLowerCase(),
      reportCategory: account.reportCategory.toLowerCase(),
    })),
  );
  const aiSuggestions = aiCategoryResult.suggestions;
  for (const tx of aiFallbackRows) {
    const suggestion = aiSuggestions.get(tx.id);
    const account = suggestion ? allCategoryAccounts.find((item) => item.id === suggestion.accountId) : null;
    if (!suggestion || !account) continue;
    const amount = tx.credit_minor > BigInt(0) ? tx.credit_minor : tx.debit_minor;
    await prisma.banking_transaction_allocations.deleteMany({ where: { org_id: orgId, feed_transaction_id: tx.id, is_confirmed: false } });
    await prisma.banking_transaction_allocations.create({ data: { id: randomUUID(), org_id: orgId, feed_transaction_id: tx.id, account_id: account.id, amount_minor: amount, source: "ai", confidence: suggestion.confidence, is_confirmed: false, created_by_user_id: null, created_at: new Date(), updated_at: new Date() } });
    await prisma.banking_feed_transactions.update({ where: { id: tx.id }, data: { transaction_kind: transactionKindForAccount(account.accountType, account.reportCategory, tx.credit_minor > BigInt(0)), transaction_scope: suggestion.scope, category_status: "suggested", updated_at: new Date() } });
    categoriesSuggested++;
  }

  return {
    matched,
    skipped: feed.length - matched,
    total_feed_rows: feed.length,
    total_journal_candidates: candidates.length,
    categories_suggested: categoriesSuggested,
    categories_failed: aiCategoryResult.failedTransactions,
    ...(candidates.length === 0 && categoryHistory.size === 0
      ? { message: "No candidate journals or confirmed category history found." }
      : {}),
  };
}

export async function bulkAcceptSuggestedMatches(
  db: Db,
  orgId: string,
  userId: string,
  opts: { ids?: string[]; minConfidence?: number; importedStatementId?: string } = {},
): Promise<BulkAcceptMatchesResult> {
  const minConfidence = opts.minConfidence ?? 90;
  const rows = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      reconcile_status: "ai_suggested",
      matched_journal_id: { not: null },
      ai_match_confidence: { gte: minConfidence },
      ...(opts.importedStatementId ? { imported_statement_id: opts.importedStatementId } : {}),
      ...(opts.ids && opts.ids.length > 0 ? { id: { in: opts.ids } } : {}),
    },
    select: { id: true, matched_journal_id: true },
    orderBy: [{ ai_match_confidence: "desc" }, { transaction_date: "asc" }],
  });

  let accepted = 0;
  const errors: BulkAcceptMatchesResult["errors"] = [];
  for (const row of rows) {
    try {
      await reconcileFeed(db, orgId, userId, row.id, row.matched_journal_id as string);
      accepted++;
    } catch (err) {
      errors.push({
        tx_id: row.id,
        message: err instanceof Error ? err.message : "Failed to accept suggestion.",
      });
    }
  }

  return { accepted, skipped: rows.length - accepted, errors };
}

export async function getFeedCandidates(
  db: Db,
  orgId: string,
  txId: string,
): Promise<JournalCandidate[]> {
  const tx = await prisma.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null },
    select: {
      bank_account_id: true,
      transaction_date: true,
      description: true,
      debit_minor: true,
      credit_minor: true,
    },
  });
  if (!tx) throw new Error("Transaction not found.");

  // Only candidates reconcileFeed would accept: same bank account, exact
  // amount, matching direction (money in = bank debit, money out = bank credit).
  const rows = await db.$queryRaw<Array<CandidateRow & { bank_account_name: string }>>`
    SELECT j.id AS journal_id, jl.id AS journal_line_id, j.journal_date, j.memo, jl.debit_minor, jl.credit_minor,
           ba.id AS bank_account_id, ba.display_name AS bank_account_name
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    JOIN banking_bank_accounts ba ON ba.chart_account_id = jl.account_id
    WHERE j.org_id = ${orgId}::uuid AND j.status = 'posted' AND ba.deleted_at IS NULL
      AND ba.id = ${tx.bank_account_id}::uuid
      AND ${
        tx.credit_minor > BigInt(0)
          ? Prisma.sql`jl.debit_minor = ${tx.credit_minor}`
          : Prisma.sql`jl.credit_minor = ${tx.debit_minor}`
      }
      AND jl.id NOT IN (
        SELECT matched_journal_line_id FROM banking_feed_transactions
        WHERE org_id = ${orgId}::uuid AND reconcile_status = 'reconciled' AND matched_journal_line_id IS NOT NULL
      )
    ORDER BY j.journal_date DESC LIMIT 100`;

  const feedAmount = Number(tx.credit_minor) > 0 ? Number(tx.credit_minor) : Number(tx.debit_minor);
  const scored = rows.map((row) => {
    const journalAmount =
      Number(row.debit_minor) > 0 ? Number(row.debit_minor) : Number(row.credit_minor);
    const score = matchScore({
      feedAmountMinor: feedAmount,
      feedDate: tx.transaction_date,
      feedDescription: tx.description,
      journalAmountMinor: journalAmount,
      journalDate: row.journal_date,
      journalMemo: row.memo,
    });
    return {
      journal_id: row.journal_id,
      journal_line_id: row.journal_line_id,
      journal_date: row.journal_date.toISOString().slice(0, 10),
      memo: row.memo,
      debit_minor: Number(row.debit_minor),
      credit_minor: Number(row.credit_minor),
      bank_account_name: row.bank_account_name,
      score,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map(({ score, ...rest }) => rest);
}

export async function getReconciliationAnalysis(
  db: Db,
  orgId: string,
  txId: string,
): Promise<import("./types").ReconciliationAnalysis> {
  const feed = await db.banking_feed_transactions.findFirst({
    where: { id: txId, org_id: orgId, deleted_at: null, reconcile_status: "reconciled" },
    select: {
      id: true, transaction_date: true, description: true, debit_minor: true, credit_minor: true,
      matched_journal_id: true, matched_journal_line_id: true, ai_match_label: true,
      ai_document_kind: true, ai_document_confidence: true, ai_document_reason: true, ai_review_status: true,
      banking_bank_accounts: { select: { chart_account_id: true, display_name: true } },
      allocations: { where: { is_confirmed: true }, select: { amount_minor: true, account: { select: { code: true, name: true, reportCategory: true } } } },
    },
  });
  if (!feed?.matched_journal_id || !feed.matched_journal_line_id) {
    throw new Error("This transaction does not have a completed reconciliation to analyse.");
  }
  const journal = await db.journal.findFirst({
    where: { id: feed.matched_journal_id, organizationId: orgId, status: JournalStatus.POSTED },
    select: {
      id: true, journalDate: true, memo: true, sourceType: true, sourceId: true,
      lines: {
        where: { id: feed.matched_journal_line_id },
        select: { accountId: true, debitMinor: true, creditMinor: true, contact: { select: { name: true } } },
        take: 1,
      },
    },
  });
  const line = journal?.lines[0];
  if (!journal || !line) throw new Error("The accounting entry behind this reconciliation could not be found.");

  const feedAmount = Number(feed.credit_minor > BigInt(0) ? feed.credit_minor : feed.debit_minor);
  const journalAmount = Number(line.debitMinor > BigInt(0) ? line.debitMinor : line.creditMinor);
  const amountPoints = scoreAmount(feedAmount, journalAmount);
  const datePoints = scoreDate(feed.transaction_date, journal.journalDate);
  const descriptionPoints = scoreDescription(feed.description, journal.memo);
  const directionMatches = feed.credit_minor > BigInt(0) ? line.debitMinor === feed.credit_minor : line.creditMinor === feed.debit_minor;
  const accountMatches = line.accountId === feed.banking_bank_accounts.chart_account_id;
  const verificationConfidence = Math.max(0, Math.min(100, amountPoints + datePoints + descriptionPoints));
  const dayDifference = Math.abs(Math.round((feed.transaction_date.getTime() - journal.journalDate.getTime()) / 86_400_000));
  const aiCreated = feed.ai_review_status === "needs_review" || feed.ai_review_status === "reviewed";
  const confidence = aiCreated && feed.ai_document_confidence !== null
    ? Math.round(feed.ai_document_confidence)
    : verificationConfidence;
  const recordInfo = (() => {
    switch (journal.sourceType) {
      case "invoice_payment": return { type: "Paid customer invoice", href: journal.sourceId ? `/print/invoice/${journal.sourceId}` : "/sales/invoices" };
      case "sales_receipt": return { type: "Sales receipt", href: journal.sourceId ? `/sales/receipts?receiptId=${journal.sourceId}` : "/sales/receipts" };
      case "bill_payment": return { type: "Paid supplier bill / purchase", href: journal.sourceId ? `/print/bill/${journal.sourceId}?type=bill` : "/purchases/bills" };
      case "bank_feed_expense": return { type: "Expense accounting entry", href: "/purchases" };
      case "bank_feed_income": return { type: "Sales income accounting entry", href: "/sales" };
      default: return { type: "Posted journal", href: null };
    }
  })();
  return {
    transaction_id: feed.id,
    confidence,
    summary: aiCreated
      ? `${feed.ai_document_reason ?? "AI created the supporting record from the bank description."} The accounting checks passed, but the created record should still be reviewed.`
      : confidence >= 90
        ? "The bank transaction and accounting entry have a strong match."
        : confidence >= 75
          ? "The required accounting checks passed, with some supporting details worth reviewing."
          : "The required accounting checks passed, but the description or date provides limited supporting evidence.",
    ai_created: aiCreated,
    ai_review_status: feed.ai_review_status === "needs_review" || feed.ai_review_status === "reviewed"
      ? feed.ai_review_status
      : null,
    matched_record: {
      journal_id: journal.id,
      date: journal.journalDate.toISOString().slice(0, 10),
      memo: journal.memo ?? "Accounting entry",
      source_type: journal.sourceType ?? "journal",
      source_id: journal.sourceId,
      contact_name: line.contact?.name ?? null,
      record_type: recordInfo.type,
      record_href: recordInfo.href,
      chart_accounts: feed.allocations.map((allocation) => ({
        code: allocation.account.code,
        name: allocation.account.name,
        report_category: allocation.account.reportCategory.toLowerCase(),
        amount_minor: Number(allocation.amount_minor),
      })),
    },
    breakdown: [
      { key: "amount", label: "Amount match", score: Math.round((amountPoints / 50) * 100), detail: amountPoints === 50 ? "The bank amount exactly matches the accounting entry." : "The amounts do not match exactly." },
      { key: "direction", label: "Money direction", score: directionMatches ? 100 : 0, detail: directionMatches ? "Money received or spent is recorded on the correct side." : "The money direction does not match." },
      { key: "bank_account", label: "Bank account", score: accountMatches ? 100 : 0, detail: accountMatches ? `Matched to ${feed.banking_bank_accounts.display_name}.` : "The accounting entry uses a different bank account." },
      { key: "date", label: "Date proximity", score: Math.round((datePoints / 30) * 100), detail: dayDifference === 0 ? "The dates are the same." : `${dayDifference} day${dayDifference === 1 ? "" : "s"} between the bank transaction and accounting entry.` },
      { key: "description", label: "Description similarity", score: Math.round((descriptionPoints / 20) * 100), detail: descriptionPoints > 0 ? "The bank description and accounting memo share identifying words." : "No strong identifying words were shared; review the supporting record." },
    ],
  };
}

export async function confirmStatementImport(
  db: Db,
  orgId: string,
  bankAccountId: string,
  transactions: ParsedTransaction[],
): Promise<{
  created: number;
  skipped_duplicates: number;
  bank_account_id: string;
  imported_statement_id: string;
}> {
  if (!bankAccountId) throw new Error("bank_account_id is required.");
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error("transactions list is required.");
  }
  const account = await prisma.banking_bank_accounts.findFirst({
    where: { id: bankAccountId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!account) throw new Error("Bank account not found.");

  const now = new Date();
  const importedStatementId = randomUUID();
  const data = transactions.map((t) => {
    const date = new Date(`${t.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid date in transaction: ${t.date}`);
    const debitMinor = BigInt(Math.trunc(t.debit || 0));
    const creditMinor = BigInt(Math.trunc(t.credit || 0));
    if (
      debitMinor < BigInt(0) ||
      creditMinor < BigInt(0) ||
      !(
        (debitMinor > BigInt(0) && creditMinor === BigInt(0)) ||
        (creditMinor > BigInt(0) && debitMinor === BigInt(0))
      )
    ) {
      throw new Error(`Transaction on ${t.date} must contain one positive debit or credit amount.`);
    }
    const description = (t.description ?? "").trim().slice(0, 500) || "—";
    const rowHash = createHash("md5")
      .update(`${date.toISOString().slice(0, 10)}|${debitMinor}|${creditMinor}|${description}`)
      .digest("hex");
    return {
      id: randomUUID(),
      org_id: orgId,
      bank_account_id: bankAccountId,
      transaction_date: date,
      description,
      debit_minor: debitMinor,
      credit_minor: creditMinor,
      raw_description: t.description ?? "",
      reference: "",
      reconcile_status: "unmatched",
      ai_match_label: "",
      source: "import",
      imported_statement_id: importedStatementId,
      row_hash: rowHash,
      created_at: now,
      updated_at: now,
    };
  });

  // Duplicate protection: skip rows already in the feed for this account with
  // the same date + amounts + description (covers re-importing a statement),
  // and dedupe identical rows within the batch itself.
  const dates = data.map((d) => d.transaction_date.getTime());
  const existing = await prisma.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      bank_account_id: bankAccountId,
      deleted_at: null,
      transaction_date: {
        gte: new Date(Math.min(...dates)),
        lte: new Date(Math.max(...dates)),
      },
    },
    select: { transaction_date: true, description: true, debit_minor: true, credit_minor: true },
  });
  const rowKey = (r: {
    transaction_date: Date;
    description: string;
    debit_minor: bigint;
    credit_minor: bigint;
  }) =>
    `${r.transaction_date.toISOString().slice(0, 10)}|${r.debit_minor}|${r.credit_minor}|${r.description}`;
  const seen = new Set(existing.map(rowKey));
  const fresh = data.filter((d) => {
    const key = rowKey(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const created =
    fresh.length > 0
      ? await prisma.banking_feed_transactions.createMany({ data: fresh, skipDuplicates: true })
      : { count: 0 };
  return {
    created: created.count,
    skipped_duplicates: data.length - created.count,
    bank_account_id: bankAccountId,
    imported_statement_id: importedStatementId,
  };
}

import { postBalancedJournal, findAccountByCode } from "@/lib/banking/posting";
import { assertPeriodOpen } from "@/lib/accounting/period-close";
import type { ExpenseAccount, Contact } from "@/lib/banking/types";
import { formatMoney, DEFAULT_CURRENCY } from "@/lib/currency";

export function toMinor(value: unknown): number {
  if (value === null || value === undefined) return 0;
  // Integer-passthrough fast path: callers may hand us a minor-unit integer.
  if (typeof value === "number" && Number.isInteger(value)) return value;

  // Otherwise parse a pounds string with up to 2 decimals using exact integer
  // math (no float rounding, so 1.005 → 100 pence, not 101). Supports a leading
  // "-" for negative amounts (e.g. expenses), unlike poundsToMinor.
  const str = String(value).trim();
  if (str === "") return 0;
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(str);
  if (!match) {
    throw new Error(`Invalid amount: ${str}. Enter a number with up to 2 decimal places.`);
  }
  const [, sign, whole, fractional = ""] = match;
  const minor = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return sign ? -minor : minor;
}

function parseInputDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()))
    throw new Error(`Invalid date format (expected YYYY-MM-DD): ${value}`);
  return d;
}

async function getBankAccountOr404(db: Db, orgId: string, accountId: string) {
  const acc = await db.banking_bank_accounts.findFirst({
    where: { id: accountId, org_id: orgId, deleted_at: null },
    select: { id: true, chart_account_id: true, display_name: true, currency: true },
  });
  if (!acc) throw new Error("Bank account not found.");
  return acc;
}

export async function createTransfer(
  db: Db,
  orgId: string,
  userId: string,
  input: {
    from_account_id: string;
    to_account_id: string;
    amount?: string;
    amount_minor?: number;
    date?: string;
    memo?: string;
  },
): Promise<{ journal_id: string; amount_minor: number }> {
  const amount = input.amount_minor || toMinor(input.amount);
  const memo = (input.memo || "Transfer between bank accounts").trim();
  const txDate = parseInputDate(input.date);

  if (!input.from_account_id || !input.to_account_id)
    throw new Error("from_account_id and to_account_id are required.");
  if (input.from_account_id === input.to_account_id)
    throw new Error("From and To must be different bank accounts.");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than zero.");

  const src = await getBankAccountOr404(db, orgId, input.from_account_id);
  const dst = await getBankAccountOr404(db, orgId, input.to_account_id);
  const baseCurrency = await orgBaseCurrency(db, orgId);
  if (
    src.currency.toUpperCase() !== dst.currency.toUpperCase() ||
    src.currency.toUpperCase() !== baseCurrency.toUpperCase()
  ) {
    throw new Error(
      `Transfers involving foreign-currency accounts require an exchange rate. Both accounts must currently use ${baseCurrency}.`,
    );
  }

  return inTransaction(db, async (tx) => {
    const journalId = await postBalancedJournal(tx, {
      orgId,
      journalDate: txDate,
      memo: `${memo}: ${src.display_name} → ${dst.display_name}`,
      sourceType: "bank_transfer",
      sourceId: null,
      createdByUserId: userId,
      lines: [
        {
          accountId: dst.chart_account_id,
          debitMinor: amount,
          creditMinor: 0,
          memo: `Transfer from ${src.display_name}`,
          contactId: null,
        },
        {
          accountId: src.chart_account_id,
          debitMinor: 0,
          creditMinor: amount,
          memo: `Transfer to ${dst.display_name}`,
          contactId: null,
        },
      ],
    });
    await tx.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        entityType: "bank_transfer",
        entityId: journalId,
        action: AuditAction.POST,
        after: { amountMinor: amount },
      },
    });
    return { journal_id: journalId, amount_minor: amount };
  });
}

export async function createReceivedPayment(
  db: Db,
  orgId: string,
  userId: string,
  input: {
    bank_account_id: string;
    contact_id?: string | null;
    amount?: string;
    amount_minor?: number;
    date?: string;
    memo?: string;
    source_account_code?: string;
  },
): Promise<{ journal_id: string; amount_minor: number }> {
  const amount = input.amount_minor || toMinor(input.amount);
  const memo = (input.memo || "Customer payment received").trim();
  const srcCode = input.source_account_code || "1100";
  const txDate = parseInputDate(input.date);

  if (!input.bank_account_id) throw new Error("bank_account_id is required.");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than zero.");

  const bank = await getBankAccountOr404(db, orgId, input.bank_account_id);
  const baseCurrency = await orgBaseCurrency(db, orgId);
  if (bank.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
    throw new Error(
      `Record this ${bank.currency} receipt with an exchange rate before posting to the ${baseCurrency} ledger.`,
    );
  }
  const arId = await findAccountByCode(db, orgId, srcCode);
  if (!arId)
    throw new Error(`Source account code '${srcCode}' not found in your chart of accounts.`);

  return inTransaction(db, async (tx) => {
    const journalId = await postBalancedJournal(tx, {
      orgId,
      journalDate: txDate,
      memo,
      sourceType: "payment_received",
      sourceId: null,
      createdByUserId: userId,
      lines: [
        {
          accountId: bank.chart_account_id,
          debitMinor: amount,
          creditMinor: 0,
          memo: `Received into ${bank.display_name}`,
          contactId: input.contact_id ?? null,
        },
        {
          accountId: arId,
          debitMinor: 0,
          creditMinor: amount,
          memo,
          contactId: input.contact_id ?? null,
        },
      ],
    });
    await tx.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        entityType: "payment_received",
        entityId: journalId,
        action: AuditAction.POST,
        after: { amountMinor: amount },
      },
    });
    return { journal_id: journalId, amount_minor: amount };
  });
}

export async function createPaidExpense(
  db: Db,
  orgId: string,
  userId: string,
  input: {
    bank_account_id: string;
    expense_account_id: string;
    contact_id?: string | null;
    amount?: string;
    amount_minor?: number;
    date?: string;
    memo?: string;
  },
): Promise<{ journal_id: string; amount_minor: number }> {
  const amount = input.amount_minor || toMinor(input.amount);
  const memo = (input.memo || "Expense paid").trim();
  const txDate = parseInputDate(input.date);

  if (!input.bank_account_id || !input.expense_account_id)
    throw new Error("bank_account_id and expense_account_id are required.");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than zero.");

  const bank = await getBankAccountOr404(db, orgId, input.bank_account_id);
  const baseCurrency = await orgBaseCurrency(db, orgId);
  if (bank.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
    throw new Error(
      `Record this ${bank.currency} payment with an exchange rate before posting to the ${baseCurrency} ledger.`,
    );
  }
  const expense = await db.chartAccount.findFirst({
    where: {
      id: input.expense_account_id,
      organizationId: orgId,
      isActive: true,
      accountType: "EXPENSE",
      reportCategory: { in: ["EXPENSE", "COST_OF_SALES", "DEPRECIATION"] },
    },
    select: { id: true },
  });
  if (!expense) throw new Error("Expense account not found in your organization.");

  return inTransaction(db, async (tx) => {
    const journalId = await postBalancedJournal(tx, {
      orgId,
      journalDate: txDate,
      memo,
      sourceType: "expense_paid",
      sourceId: null,
      createdByUserId: userId,
      lines: [
        {
          accountId: expense.id,
          debitMinor: amount,
          creditMinor: 0,
          memo,
          contactId: input.contact_id ?? null,
        },
        {
          accountId: bank.chart_account_id,
          debitMinor: 0,
          creditMinor: amount,
          memo: `Paid from ${bank.display_name}`,
          contactId: input.contact_id ?? null,
        },
      ],
    });
    await tx.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        entityType: "expense_paid",
        entityId: journalId,
        action: AuditAction.POST,
        after: { amountMinor: amount },
      },
    });
    return { journal_id: journalId, amount_minor: amount };
  });
}

/**
 * Post a journal straight from an unmatched feed row and reconcile the row to
 * it — the path for statement lines that have no pre-existing journal.
 * Money in → payment received; money out → paid expense (needs an expense account).
 */
export async function recordFeedTransaction(
  db: Db,
  orgId: string,
  userId: string,
  txId: string,
  input: {
    category_account_id?: string;
    expense_account_id?: string;
    contact_id?: string | null;
    memo?: string;
  },
): Promise<{ journal_id: string; status: string; id: string }> {
  return inTransaction(db, async (txDb) => {
    const [feed] = await txDb.$queryRaw<
      Array<{
        id: string;
        bank_account_id: string;
        transaction_date: Date;
        description: string;
        debit_minor: bigint;
        credit_minor: bigint;
        reconcile_status: string;
      }>
    >`
      SELECT id, bank_account_id, transaction_date, description,
             debit_minor, credit_minor, reconcile_status
      FROM banking_feed_transactions
      WHERE id = ${txId}::uuid AND org_id = ${orgId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    if (!feed) throw new Error("Transaction not found.");
    if (feed.reconcile_status === "reconciled") {
      throw new Error("This statement line is already reconciled.");
    }

    const existingAllocation = await txDb.banking_transaction_allocations.findFirst({
      where: {
        org_id: orgId,
        feed_transaction_id: txId,
        OR: [
          { is_confirmed: true },
          // The user clicking Record is the explicit confirmation to create
          // the journal. A history suggestion simply saves them from choosing
          // the same category again; it never posts on its own.
          { source: "history", is_confirmed: false },
        ],
      },
      select: { account_id: true },
      orderBy: [{ is_confirmed: "desc" }, { confidence: "desc" }, { created_at: "asc" }],
    });
    const categoryAccountId =
      input.category_account_id ?? input.expense_account_id ?? existingAllocation?.account_id;
    if (!categoryAccountId) {
      throw new Error("Choose a category before recording this transaction.");
    }

    const category = await setFeedCategoryAllocation(txDb, orgId, userId, feed, categoryAccountId);
    const bank = await getBankAccountOr404(txDb, orgId, feed.bank_account_id);
    const baseCurrency = await orgBaseCurrency(txDb, orgId);
    if (bank.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      throw new Error(
        `Foreign-currency feed recording needs an exchange rate before it can enter the ${baseCurrency} ledger.`,
      );
    }

    const isMoneyIn = feed.credit_minor > BigInt(0);
    const amountMinor = Number(isMoneyIn ? feed.credit_minor : feed.debit_minor);
    const memo = (input.memo ?? "").trim() || feed.description;
    const journalId = await postBalancedJournal(txDb, {
      orgId,
      journalDate: feed.transaction_date,
      memo,
      sourceType: isMoneyIn ? "bank_feed_income" : "bank_feed_expense",
      sourceId: feed.id,
      createdByUserId: userId,
      lines: isMoneyIn
        ? [
            {
              accountId: bank.chart_account_id,
              debitMinor: amountMinor,
              creditMinor: 0,
              memo: `Received into ${bank.display_name}`,
              contactId: input.contact_id ?? null,
            },
            {
              accountId: category.id,
              debitMinor: 0,
              creditMinor: amountMinor,
              memo,
              contactId: input.contact_id ?? null,
            },
          ]
        : [
            {
              accountId: category.id,
              debitMinor: amountMinor,
              creditMinor: 0,
              memo,
              contactId: input.contact_id ?? null,
            },
            {
              accountId: bank.chart_account_id,
              debitMinor: 0,
              creditMinor: amountMinor,
              memo: `Paid from ${bank.display_name}`,
              contactId: input.contact_id ?? null,
            },
          ],
    });

    const bankLine = await txDb.journalLine.findFirstOrThrow({
      where: { journalId, accountId: bank.chart_account_id, organizationId: orgId },
      select: { id: true },
    });
    await txDb.banking_feed_transactions.update({
      where: { id: txId },
      data: {
        reconcile_status: "reconciled",
        matched_journal_id: journalId,
        matched_journal_line_id: bankLine.id,
        matched_at: new Date(),
        matched_by_user_id: userId,
        ai_match_label: "",
        ai_match_confidence: null,
        updated_at: new Date(),
      },
    });
    await txDb.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        entityType: "bank_feed_transaction",
        entityId: txId,
        action: AuditAction.POST,
        after: { journalId, categoryAccountId: category.id, amountMinor },
      },
    });
    return { journal_id: journalId, status: "reconciled", id: txId };
  });
}

/** Rows from one just-imported statement that still need a user decision. */
export async function getStatementReconciliationReview(
  db: Db,
  orgId: string,
  importedStatementId: string,
): Promise<FeedTransaction[]> {
  const rows = await db.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      imported_statement_id: importedStatementId,
      deleted_at: null,
      reconcile_status: { in: ["unmatched", "ai_suggested"] },
    },
    orderBy: [{ transaction_date: "asc" }, { created_at: "asc" }],
    include: feedTransactionInclude,
  });
  return rows.map(feedRowToDto);
}

/** Current unresolved feed rows, used by the bulk reconciliation review. */
export async function getReconciliationReview(db: Db, orgId: string): Promise<FeedTransaction[]> {
  const rows = await db.banking_feed_transactions.findMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      reconcile_status: { in: ["unmatched", "ai_suggested"] },
    },
    orderBy: [{ transaction_date: "asc" }, { created_at: "asc" }],
    // The dialog is a bulk workflow, so it must not silently hide the majority
    // of a large statement. The UI keeps this bounded at a practical maximum.
    take: 5_000,
    include: feedTransactionInclude,
  });
  return rows.map(feedRowToDto);
}

/**
 * Records only rows the user selected in the post-import review. Each row
 * travels through recordFeedTransaction, retaining the normal currency,
 * category, period-close and balanced-journal checks.
 */
export async function recordStatementReviewRows(
  db: Db,
  orgId: string,
  userId: string,
  items: Array<{ txId: string; categoryAccountId?: string }>,
): Promise<{ recorded: number; skipped: number; errors: Array<{ tx_id: string; message: string }> }> {
  const uniqueItems = [...new Map(items.map((item) => [item.txId, item])).values()].slice(0, 5_000);
  let recorded = 0;
  const errors: Array<{ tx_id: string; message: string }> = [];
  // A controlled worker pool keeps a large selected batch responsive without
  // overwhelming the database with thousands of simultaneous posting writes.
  let cursor = 0;
  const worker = async () => {
    while (cursor < uniqueItems.length) {
      const item = uniqueItems[cursor++];
      try {
        await recordFeedTransaction(db, orgId, userId, item.txId, {
          category_account_id: item.categoryAccountId,
        });
        recorded++;
      } catch (cause) {
        errors.push({ tx_id: item.txId, message: cause instanceof Error ? cause.message : "Could not record transaction." });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, uniqueItems.length) }, worker));
  return { recorded, skipped: uniqueItems.length - recorded, errors };
}

async function setFeedCategoryAllocation(
  db: Db,
  orgId: string,
  userId: string,
  feed: { id: string; debit_minor: bigint; credit_minor: bigint },
  accountId: string,
) {
  const account = await db.chartAccount.findFirst({
    where: {
      id: accountId,
      organizationId: orgId,
      isActive: true,
      reportCategory: { not: "BANK" },
    },
    select: { id: true, accountType: true, reportCategory: true },
  });
  if (!account) throw new Error("The selected category is not available in this organization.");

  const amount = feed.credit_minor > BigInt(0) ? feed.credit_minor : feed.debit_minor;
  await db.banking_transaction_allocations.deleteMany({
    where: { org_id: orgId, feed_transaction_id: feed.id },
  });
  await db.banking_transaction_allocations.create({
    data: {
      id: randomUUID(),
      org_id: orgId,
      feed_transaction_id: feed.id,
      account_id: account.id,
      amount_minor: amount,
      source: "manual",
      confidence: 100,
      is_confirmed: true,
      created_by_user_id: userId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  await db.banking_feed_transactions.update({
    where: { id: feed.id },
    data: {
      transaction_kind: transactionKindForAccount(
        account.accountType,
        account.reportCategory,
        feed.credit_minor > BigInt(0),
      ),
      category_status: "confirmed",
      updated_at: new Date(),
    },
  });
  return account;
}

export async function categorizeFeedTransaction(
  db: Db,
  orgId: string,
  userId: string,
  txId: string,
  accountId: string | null,
): Promise<{ id: string; category_status: CategoryStatus }> {
  return inTransaction(db, async (txDb) => {
    const [feed] = await txDb.$queryRaw<
      Array<{
        id: string;
        debit_minor: bigint;
        credit_minor: bigint;
        reconcile_status: string;
      }>
    >`
      SELECT id, debit_minor, credit_minor, reconcile_status
      FROM banking_feed_transactions
      WHERE id = ${txId}::uuid AND org_id = ${orgId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    if (!feed) throw new Error("Transaction not found.");
    const wasReconciled = feed.reconcile_status === "reconciled";
    if (wasReconciled) {
      await unreconcileFeed(txDb, orgId, userId, txId);
      await txDb.banking_feed_transactions.update({
        where: { id: txId },
        data: {
          ai_document_kind: null, ai_document_confidence: null, ai_document_reason: null,
          ai_document_contact_id: null, ai_document_contact_name: null, ai_document_account_id: null,
          ai_document_id: null, ai_document_journal_id: null, ai_review_status: null,
          ai_reviewed_at: null, ai_reviewed_by_user_id: null,
        },
      });
    }

    if (!accountId) {
      await txDb.banking_transaction_allocations.deleteMany({
        where: { org_id: orgId, feed_transaction_id: txId },
      });
      await txDb.banking_feed_transactions.update({
        where: { id: txId },
        data: {
          category_status: "uncategorized",
          transaction_kind: "uncategorized",
          ai_document_kind: null,
          ai_document_confidence: null,
          ai_document_reason: null,
          ai_document_contact_id: null,
          ai_document_contact_name: null,
          ai_document_account_id: null,
          ai_document_id: null,
          ai_document_journal_id: null,
          ai_review_status: null,
          ai_reviewed_at: null,
          ai_reviewed_by_user_id: null,
          updated_at: new Date(),
        },
      });
      return { id: txId, category_status: "uncategorized" };
    }

    await setFeedCategoryAllocation(txDb, orgId, userId, feed, accountId);
    if (!wasReconciled) {
      await txDb.banking_feed_transactions.updateMany({
        where: { id: txId, org_id: orgId, ai_review_status: "proposed" },
        data: { ai_document_account_id: accountId, updated_at: new Date() },
      });
    }
    return { id: txId, category_status: "confirmed" };
  });
}

/** Classify the statement line without changing its accounting category or journal. */
export async function setFeedTransactionScope(
  db: Db,
  orgId: string,
  userId: string,
  txId: string,
  scope: FeedTransaction["transaction_scope"],
): Promise<{ id: string; transaction_scope: FeedTransaction["transaction_scope"] }> {
  if (scope !== "company" && scope !== "personal") throw new Error("Choose either company or personal.");
  await inTransaction(db, async (tx) => {
    const feed = await tx.banking_feed_transactions.findFirst({ where: { id: txId, org_id: orgId, deleted_at: null }, select: { reconcile_status: true } });
    if (!feed) throw new Error("Transaction not found.");
    if (feed.reconcile_status === "reconciled") await unreconcileFeed(tx, orgId, userId, txId);
    await tx.banking_feed_transactions.update({
      where: { id: txId },
      data: {
        transaction_scope: scope,
        ai_document_kind: null,
        ai_document_confidence: null,
        ai_document_reason: null,
        ai_document_contact_id: null,
        ai_document_contact_name: null,
        ai_document_account_id: null,
        ai_document_id: null,
        ai_document_journal_id: null,
        ai_review_status: null,
        ai_reviewed_at: null,
        ai_reviewed_by_user_id: null,
        updated_at: new Date(),
      },
    });
  });
  return { id: txId, transaction_scope: scope };
}

export async function listCategorizationAccounts(
  db: Db,
  orgId: string,
): Promise<CategoryAccount[]> {
  const rows = await db.chartAccount.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      reportCategory: { not: "BANK" },
      code: { notIn: ["1100", "2100", "2200", "2201"] },
    },
    orderBy: [{ accountType: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, accountType: true, reportCategory: true },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    account_type: row.accountType.toLowerCase() as CategoryAccount["account_type"],
    report_category: row.reportCategory.toLowerCase(),
  }));
}

export async function listExpenseAccounts(db: Db, orgId: string): Promise<ExpenseAccount[]> {
  const rows = await prisma.chartAccount.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      reportCategory: { in: ["EXPENSE", "COST_OF_SALES", "DEPRECIATION"] },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, reportCategory: true },
  });
  return rows.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    report_category: a.reportCategory.toLowerCase(),
  }));
}

export async function listContacts(
  db: Db,
  orgId: string,
  type: "customer" | "supplier" | "both",
): Promise<Contact[]> {
  const typeFilter =
    type === "customer"
      ? { in: [ContactType.CUSTOMER, ContactType.BOTH] }
      : type === "supplier"
        ? { in: [ContactType.SUPPLIER, ContactType.BOTH] }
        : undefined;
  const rows = await prisma.contact.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      ...(typeFilter ? { contactType: typeFilter } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, ...CONTACT_NAME_SELECT, contactType: true, email: true },
  });
  return rows.map((c) => ({
    id: c.id,
    name: contactDisplayName(c),
    contact_type: c.contactType.toLowerCase() as Contact["contact_type"],
    email: c.email,
  }));
}

export async function getAccountTransactions(
  db: Db,
  orgId: string,
  chartAccountId: string,
): Promise<
  Array<{
    id: string;
    journal_id: string;
    journal_date: string;
    memo: string | null;
    debit_minor: number;
    credit_minor: number;
    source_type: string | null;
  }>
> {
  const account = await prisma.banking_bank_accounts.findFirst({
    where: { chart_account_id: chartAccountId, org_id: orgId, deleted_at: null },
    select: { id: true },
  });
  if (!account) throw new Error("Bank account not found.");
  // tenancy:safe: chartAccountId ownership verified by org_id-scoped findFirst above; query scoped to that account_id
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      journal_id: string;
      journal_date: Date;
      memo: string | null;
      debit_minor: bigint;
      credit_minor: bigint;
      source_type: string | null;
    }>
  >`
    SELECT jl.id, jl.journal_id, j.journal_date, COALESCE(jl.memo, j.memo) AS memo,
           jl.debit_minor, jl.credit_minor, j.source_type
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    WHERE jl.account_id = ${chartAccountId}::uuid AND j.status = 'posted'
    ORDER BY j.journal_date DESC, jl.id DESC`;
  return rows.map((r) => ({
    id: r.id,
    journal_id: r.journal_id,
    journal_date: r.journal_date.toISOString().slice(0, 10),
    memo: r.memo,
    debit_minor: Number(r.debit_minor),
    credit_minor: Number(r.credit_minor),
    source_type: r.source_type,
  }));
}
