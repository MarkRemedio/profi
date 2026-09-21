import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import * as bankingDal from "@/lib/banking/dal";
import {
  decryptTrueLayerSecret,
  encryptTrueLayerSecret,
} from "@/lib/banking/truelayer-crypto";
import {
  getTrueLayerAccounts,
  getTrueLayerTransactions,
  pickTrueLayerAccount,
  refreshTrueLayerToken,
  tokenNeedsRefresh,
  type TrueLayerAccount,
  type TrueLayerTokens,
} from "@/lib/banking/truelayer";

export type TrueLayerBankFeedStatus = {
  id: string;
  bankAccountId: string;
  status: "PENDING" | "CONNECTED" | "PAUSED" | "RECONNECT_REQUIRED" | "ERROR";
  lastSyncedAt: string | null;
  lastError: string | null;
  consentExpiresAt: string | null;
};

export type TrueLayerAvailableAccount = {
  id: string;
  displayName: string;
  currency: string | null;
  sortCode: string | null;
  last4: string | null;
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function initialSyncFrom(lastSyncedAt: Date | null): string {
  const date = lastSyncedAt ? new Date(lastSyncedAt) : new Date();
  // Re-read two days to pick up a pending card item that settles later. The
  // provider transaction identifier makes this safe and idempotent.
  date.setUTCDate(date.getUTCDate() - (lastSyncedAt ? 2 : 89));
  return dateOnly(date);
}

function feedStatus(row: {
  id: string;
  bankAccountId: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  consentExpiresAt: Date | null;
}): TrueLayerBankFeedStatus {
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    status: row.status as TrueLayerBankFeedStatus["status"],
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
    consentExpiresAt: row.consentExpiresAt?.toISOString() ?? null,
  };
}

export async function listTrueLayerBankFeedStatuses(
  organizationId: string,
): Promise<TrueLayerBankFeedStatus[]> {
  const rows = await prisma.trueLayerBankFeedConnection.findMany({
    where: { organizationId, bankAccountId: { not: null } },
    select: {
      id: true,
      bankAccountId: true,
      status: true,
      lastSyncedAt: true,
      lastError: true,
      consentExpiresAt: true,
    },
  });
  return rows.map((row) => feedStatus({ ...row, bankAccountId: row.bankAccountId! }));
}

/** Pause keeps encrypted consent in place; the action layer syncs immediately on resume. */
export async function setTrueLayerBankFeedSync(input: {
  organizationId: string;
  bankAccountId: string;
  enabled: boolean;
}): Promise<void> {
  const connection = await prisma.trueLayerBankFeedConnection.findFirst({
    where: { organizationId: input.organizationId, bankAccountId: input.bankAccountId },
    select: { id: true, accessToken: true, refreshToken: true, consentExpiresAt: true },
  });
  if (!connection) throw new Error("TrueLayer connection not found.");
  if (input.enabled && (!connection.accessToken || !connection.refreshToken || (connection.consentExpiresAt && connection.consentExpiresAt <= new Date()))) {
    throw new Error("This bank connection needs renewed consent. Reconnect TrueLayer first.");
  }
  await prisma.trueLayerBankFeedConnection.update({
    where: { id: connection.id },
    data: { status: input.enabled ? "CONNECTED" : "PAUSED", lastError: null },
  });
}

export async function startTrueLayerAccountSelection(input: {
  organizationId: string;
  userId: string;
  tokens: TrueLayerTokens;
}): Promise<{ id: string }> {
  const row = await prisma.trueLayerBankFeedConnection.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      bankAccountId: null,
      status: "PENDING_SELECTION",
      connectedBy: input.userId,
      accessToken: encryptTrueLayerSecret(input.tokens.accessToken),
      refreshToken: encryptTrueLayerSecret(input.tokens.refreshToken),
      expiresAt: input.tokens.expiresAt,
      consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
  return row;
}

async function pendingTokens(organizationId: string, connectionId: string): Promise<TrueLayerTokens> {
  const pending = await prisma.trueLayerBankFeedConnection.findFirst({
    where: { id: connectionId, organizationId, bankAccountId: null, status: "PENDING_SELECTION" },
    select: { accessToken: true, refreshToken: true, expiresAt: true },
  });
  if (!pending?.accessToken || !pending.refreshToken) throw new Error("This bank-account selection has expired. Connect again.");
  let accessToken = decryptTrueLayerSecret(pending.accessToken);
  let refreshToken = decryptTrueLayerSecret(pending.refreshToken);
  let expiresAt = pending.expiresAt ?? new Date(0);
  if (tokenNeedsRefresh(pending.expiresAt)) {
    const refreshed = await refreshTrueLayerToken(refreshToken);
    if (!refreshed.ok) throw new Error(refreshed.error);
    accessToken = refreshed.data.accessToken;
    refreshToken = refreshed.data.refreshToken;
    expiresAt = refreshed.data.expiresAt;
    await prisma.trueLayerBankFeedConnection.update({
      where: { id: connectionId },
      data: { accessToken: encryptTrueLayerSecret(accessToken), refreshToken: encryptTrueLayerSecret(refreshToken), expiresAt },
    });
  }
  return { accessToken, refreshToken, expiresAt, scope: "accounts balance transactions offline_access" };
}

export async function listTrueLayerAvailableAccounts(input: {
  organizationId: string;
  connectionId: string;
}): Promise<TrueLayerAvailableAccount[]> {
  const tokens = await pendingTokens(input.organizationId, input.connectionId);
  const accounts = await getTrueLayerAccounts(tokens.accessToken);
  if (!accounts.ok) throw new Error(accounts.error);
  return (accounts.data.results ?? []).map((account) => {
    const details = providerAccountDetails(account);
    return {
      id: account.account_id,
      displayName: details.displayName,
      currency: details.currency ?? null,
      sortCode: details.sortCode || null,
      last4: details.last4 || null,
    };
  });
}

function providerAccountDetails(account: TrueLayerAccount) {
  const digits = account.account_number?.number?.replace(/\D/g, "") ?? "";
  return {
    displayName: account.display_name?.trim().slice(0, 120) || "Connected bank account",
    bankName: "TrueLayer",
    sortCode: account.account_number?.sort_code?.replace(/\D/g, "") ?? "",
    last4: digits.slice(-4),
    currency: account.currency?.trim().toUpperCase().slice(0, 3) || undefined,
  };
}

/**
 * Creates WAW Profi accounts from the accounts returned by one approved
 * TrueLayer authorization. We intentionally import every returned account:
 * the user has just granted consent for them, and this avoids guessing which
 * current/savings account they meant when their bank returns more than one.
 */
export async function createTrueLayerBankAccounts(input: {
  organizationId: string;
  userId: string;
  tokens: TrueLayerTokens;
  providerAccountIds?: string[];
}): Promise<{ connected: number; imported: number }> {
  const accountsResult = await getTrueLayerAccounts(input.tokens.accessToken);
  if (!accountsResult.ok) throw new Error(accountsResult.error);
  const selected = input.providerAccountIds ? new Set(input.providerAccountIds) : null;
  const providerAccounts = (accountsResult.data.results ?? []).filter((account) => !selected || selected.has(account.account_id));
  if (selected && (selected.size === 0 || providerAccounts.length !== selected.size)) {
    throw new Error("One or more selected bank accounts are no longer available. Connect again.");
  }

  let connected = 0;
  let imported = 0;
  for (const providerAccount of providerAccounts) {
    const details = providerAccountDetails(providerAccount);
    // A fresh connection creates new WAW Profi accounts from the accounts the
    // user approved at their bank. Reconnecting is a separate card action.
    const bankAccountId = (await bankingDal.createBankAccount(
      prisma,
      input.organizationId,
      input.userId,
      {
        display_name: details.displayName,
        bank_name: details.bankName,
        sort_code: details.sortCode,
        account_number_last4: details.last4,
        currency: details.currency,
        connection_type: "truelayer",
        notes: "Connected through TrueLayer.",
      },
    )).id;

    const connection = await prisma.trueLayerBankFeedConnection.upsert({
      where: { organizationId_bankAccountId: { organizationId: input.organizationId, bankAccountId } },
      create: {
        id: randomUUID(),
        organizationId: input.organizationId,
        bankAccountId,
        status: "PENDING",
        connectedBy: input.userId,
        accessToken: encryptTrueLayerSecret(input.tokens.accessToken),
        refreshToken: encryptTrueLayerSecret(input.tokens.refreshToken),
        expiresAt: input.tokens.expiresAt,
        consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        providerAccountId: encryptTrueLayerSecret(providerAccount.account_id),
      },
      update: {
        status: "PENDING",
        connectedBy: input.userId,
        accessToken: encryptTrueLayerSecret(input.tokens.accessToken),
        refreshToken: encryptTrueLayerSecret(input.tokens.refreshToken),
        expiresAt: input.tokens.expiresAt,
        consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        providerAccountId: encryptTrueLayerSecret(providerAccount.account_id),
        lastError: null,
      },
      select: { id: true },
    });
    await prisma.banking_bank_accounts.update({
      where: { id: bankAccountId },
      data: { connection_type: "truelayer", status: "active", updated_at: new Date() },
    });
    const sync = await syncTrueLayerBankFeed({ organizationId: input.organizationId, connectionId: connection.id });
    connected++;
    imported += sync.imported;
  }
  return { connected, imported };
}

export async function completeTrueLayerAccountSelection(input: {
  organizationId: string;
  connectionId: string;
  userId: string;
  providerAccountIds: string[];
}): Promise<{ connected: number; imported: number }> {
  const tokens = await pendingTokens(input.organizationId, input.connectionId);
  const result = await createTrueLayerBankAccounts({
    organizationId: input.organizationId,
    userId: input.userId,
    tokens,
    providerAccountIds: input.providerAccountIds,
  });
  await prisma.trueLayerBankFeedConnection.deleteMany({
    where: { id: input.connectionId, organizationId: input.organizationId, bankAccountId: null, status: "PENDING_SELECTION" },
  });
  return result;
}

export async function cancelTrueLayerAccountSelection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<void> {
  await prisma.trueLayerBankFeedConnection.deleteMany({
    where: { id: input.connectionId, organizationId: input.organizationId, bankAccountId: null, status: "PENDING_SELECTION" },
  });
}

export async function beginTrueLayerBankFeedConnection(input: {
  organizationId: string;
  bankAccountId: string;
  userId: string;
}): Promise<{ id: string }> {
  const bank = await prisma.banking_bank_accounts.findFirst({
    where: { id: input.bankAccountId, org_id: input.organizationId, deleted_at: null },
    select: { id: true },
  });
  if (!bank) throw new Error("Bank account not found.");

  const row = await prisma.trueLayerBankFeedConnection.upsert({
    where: {
      organizationId_bankAccountId: {
        organizationId: input.organizationId,
        bankAccountId: input.bankAccountId,
      },
    },
    create: {
      id: randomUUID(),
      organizationId: input.organizationId,
      bankAccountId: input.bankAccountId,
      status: "PENDING",
      connectedBy: input.userId,
      lastError: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      providerAccountId: null,
      providerConnectionId: null,
      consentExpiresAt: null,
      lastSyncedAt: null,
    },
    update: {
      status: "PENDING",
      connectedBy: input.userId,
      lastError: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      providerAccountId: null,
      providerConnectionId: null,
      consentExpiresAt: null,
      lastSyncedAt: null,
    },
    select: { id: true },
  });
  await prisma.banking_bank_accounts.updateMany({
    where: { id: input.bankAccountId, org_id: input.organizationId, deleted_at: null },
    data: { connection_type: "truelayer", status: "active", updated_at: new Date() },
  });
  return row;
}

export async function saveTrueLayerTokens(input: {
  organizationId: string;
  connectionId: string;
  tokens: TrueLayerTokens;
}): Promise<void> {
  const connection = await prisma.trueLayerBankFeedConnection.findFirst({
    where: { id: input.connectionId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!connection) throw new Error("This bank connection is no longer available.");
  await prisma.trueLayerBankFeedConnection.update({
    where: { id: connection.id },
    data: {
      status: "PENDING",
      accessToken: encryptTrueLayerSecret(input.tokens.accessToken),
      refreshToken: encryptTrueLayerSecret(input.tokens.refreshToken),
      expiresAt: input.tokens.expiresAt,
      // TrueLayer Data API v1 connections require renewed consent after 90 days.
      consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      lastError: null,
    },
  });
}

async function markConnectionFailure(
  id: string,
  error: string,
  reauthorise: boolean,
): Promise<never> {
  await prisma.trueLayerBankFeedConnection.update({
    where: { id },
    data: {
      status: reauthorise ? "RECONNECT_REQUIRED" : "ERROR",
      lastError: error.slice(0, 1000),
    },
  });
  throw new Error(error);
}

export async function syncTrueLayerBankFeed(input: {
  organizationId: string;
  connectionId: string;
}): Promise<{ imported: number; duplicates: number }> {
  const connection = await prisma.trueLayerBankFeedConnection.findFirst({
    where: { id: input.connectionId, organizationId: input.organizationId },
    select: {
      id: true,
      bankAccountId: true,
      status: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      providerAccountId: true,
      lastSyncedAt: true,
      consentExpiresAt: true,
    },
  });
  if (!connection) throw new Error("Bank connection not found.");
  if (connection.status === "PAUSED") throw new Error("Automatic syncing is paused for this bank account.");
  if (!connection.bankAccountId) {
    throw new Error("Choose one or more bank accounts before syncing this TrueLayer connection.");
  }
  const bankAccountId = connection.bankAccountId;
  if (connection.consentExpiresAt && connection.consentExpiresAt <= new Date()) {
    return markConnectionFailure(connection.id, "This bank connection needs renewed consent. Reconnect the bank account.", true);
  }
  if (!connection.accessToken || !connection.refreshToken) {
    return markConnectionFailure(connection.id, "This bank connection has not been authorised yet.", true);
  }

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptTrueLayerSecret(connection.accessToken);
    refreshToken = decryptTrueLayerSecret(connection.refreshToken);
  } catch {
    return markConnectionFailure(connection.id, "This bank connection can no longer be read securely. Reconnect the bank account.", true);
  }

  if (tokenNeedsRefresh(connection.expiresAt)) {
    const refreshed = await refreshTrueLayerToken(refreshToken);
    if (!refreshed.ok) return markConnectionFailure(connection.id, refreshed.error, refreshed.reauthorise);
    accessToken = refreshed.data.accessToken;
    await prisma.trueLayerBankFeedConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptTrueLayerSecret(refreshed.data.accessToken),
        refreshToken: encryptTrueLayerSecret(refreshed.data.refreshToken),
        expiresAt: refreshed.data.expiresAt,
      },
    });
  }

  let providerAccountId: string | null = null;
  try {
    providerAccountId = connection.providerAccountId
      ? decryptTrueLayerSecret(connection.providerAccountId)
      : null;
  } catch {
    return markConnectionFailure(connection.id, "This bank account link can no longer be read securely. Reconnect the bank account.", true);
  }

  if (!providerAccountId) {
    const [accountsResult, bank] = await Promise.all([
      getTrueLayerAccounts(accessToken),
      prisma.banking_bank_accounts.findFirst({
        where: { id: bankAccountId, org_id: input.organizationId, deleted_at: null },
        select: { currency: true, sort_code: true, account_number_last4: true },
      }),
    ]);
    if (!accountsResult.ok) return markConnectionFailure(connection.id, accountsResult.error, accountsResult.reauthorise);
    if (!bank) return markConnectionFailure(connection.id, "The linked WAW Profi bank account no longer exists.", false);
    const selected = pickTrueLayerAccount(accountsResult.data.results ?? [], bank);
    if (!selected) {
      return markConnectionFailure(
        connection.id,
        "TrueLayer returned more than one possible account. Add the bank account's sort code and last four account digits, then reconnect it.",
        false,
      );
    }
    providerAccountId = selected.account_id;
    await prisma.trueLayerBankFeedConnection.update({
      where: { id: connection.id },
      data: { providerAccountId: encryptTrueLayerSecret(providerAccountId) },
    });
  }

  const transactionsResult = await getTrueLayerTransactions(
    accessToken,
    providerAccountId,
    initialSyncFrom(connection.lastSyncedAt),
    dateOnly(new Date()),
  );
  if (!transactionsResult.ok) return markConnectionFailure(connection.id, transactionsResult.error, transactionsResult.reauthorise);

  const now = new Date();
  const rows = (transactionsResult.data.results ?? []).flatMap((transaction) => {
    const date = new Date(transaction.timestamp);
    const amount = Number(transaction.amount);
    if (!transaction.transaction_id || Number.isNaN(date.getTime()) || !Number.isFinite(amount) || amount === 0) return [];
    const minor = Math.round(Math.abs(amount) * 100);
    if (!Number.isSafeInteger(minor)) return [];
    const providerTransactionId = transaction.normalised_provider_transaction_id
      ?? transaction.meta?.provider_transaction_id
      ?? transaction.provider_transaction_id
      ?? transaction.transaction_id;
    return [{
      id: randomUUID(),
      org_id: input.organizationId,
      bank_account_id: bankAccountId,
      transaction_date: new Date(`${dateOnly(date)}T00:00:00.000Z`),
      description: (transaction.description ?? transaction.transaction_type ?? "Bank transaction").trim().slice(0, 500),
      debit_minor: BigInt(amount > 0 ? minor : 0),
      credit_minor: BigInt(amount < 0 ? minor : 0),
      raw_description: transaction.description ?? "",
      reference: transaction.transaction_id.slice(0, 255),
      reconcile_status: "unmatched",
      ai_match_label: "",
      ai_match_confidence: null,
      source: "truelayer",
      imported_statement_id: null,
      provider_transaction_id: providerTransactionId.slice(0, 255),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }];
  });

  const inserted = rows.length > 0
    ? await prisma.banking_feed_transactions.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  await prisma.trueLayerBankFeedConnection.update({
    where: { id: connection.id },
    data: { status: "CONNECTED", lastSyncedAt: now, lastError: null },
  });
  return { imported: inserted.count, duplicates: rows.length - inserted.count };
}

export async function disconnectTrueLayerBankFeed(input: {
  organizationId: string;
  bankAccountId: string;
}): Promise<void> {
  await prisma.trueLayerBankFeedConnection.deleteMany({
    where: { organizationId: input.organizationId, bankAccountId: input.bankAccountId },
  });
  await prisma.banking_bank_accounts.updateMany({
    where: {
      id: input.bankAccountId,
      org_id: input.organizationId,
      deleted_at: null,
      connection_type: "truelayer",
    },
    data: { connection_type: "truelayer", status: "disconnected", updated_at: new Date() },
  });
}

/**
 * Five-minute unattended refresh. Paused connections are excluded, and the
 * last-sync check prevents a connection from being refreshed more than once
 * during the same scheduling window.
 */
export async function syncStaleTrueLayerBankFeeds(): Promise<{
  considered: number;
  imported: number;
  failures: number;
}> {
  return runAsSystem(async () => {
    // Use a small scheduling tolerance so a cron invocation that starts a few
    // seconds early does not postpone an account for another five minutes.
    const staleBefore = new Date(Date.now() - 4 * 60 * 1000);
    const connections = await prisma.trueLayerBankFeedConnection.findMany({
      where: {
        status: "CONNECTED",
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
      },
      orderBy: { lastSyncedAt: "asc" },
      take: 25,
      select: { id: true, organizationId: true },
    });
    let imported = 0;
    let failures = 0;
    for (const connection of connections) {
      try {
        const result = await syncTrueLayerBankFeed({
          organizationId: connection.organizationId,
          connectionId: connection.id,
        });
        imported += result.imported;
      } catch (error) {
        failures++;
        console.error("[cron] TrueLayer bank-feed sync failed", {
          connectionId: connection.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return { considered: connections.length, imported, failures };
  });
}
