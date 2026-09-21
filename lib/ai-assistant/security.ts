import "server-only";

import { Prisma } from "@prisma/client";

import type { AccountingWorkspace } from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

import { aiDataAreasForWorkspace, type AiDataArea } from "./permissions";
import type { AiCitation } from "./types";

const REQUESTS_PER_MINUTE = 10;
const REQUESTS_PER_DAY = 200;
const MAX_CONCURRENT_REQUESTS = 2;
const PENDING_WINDOW_MS = 2 * 60 * 1000;
const CONVERSATIONS_PER_MINUTE = 5;
const MAX_CONVERSATIONS_PER_USER = 100;

const CITATION_PREFIXES: Record<AiCitation["type"], readonly string[]> = {
  invoice: ["/sales/invoices"],
  bill: ["/purchases/bills"],
  contact: ["/sales/customers", "/purchases/suppliers"],
  journal: ["/accounting/journals"],
  bank_transaction: ["/banking/transactions"],
  report: ["/reports", "/sales/invoices", "/purchases/bills", "/banking/transactions"],
  vat: ["/taxes/vat"],
  account: ["/accounting/chart-of-accounts"],
  guide: ["/sales/adjustments", "/sales/invoices", "/purchases/bills", "/banking/transactions", "/accounting/journals"],
};

export class AiRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("AI_RATE_LIMITED");
  }
}

export type AiAccessContext = {
  workspace: AccountingWorkspace;
  organization: { name: string; baseCurrency: string; features: string[] };
  allowedAreas: AiDataArea[];
};

export function logAiSecurityEvent(input: {
  event: "request_allowed" | "request_limited" | "tool_access" | "request_failed";
  organizationId: string;
  userId: string;
  metadata?: Record<string, string | number | boolean>;
}) {
  console.info(JSON.stringify({ category: "ai_security", ...input, at: new Date().toISOString() }));
}

export function recordAiOperationalEvent(input: {
  type: "REQUEST_COMPLETED" | "REQUEST_FAILED" | "REQUEST_BLOCKED" | "TOOL_ACCESS";
  organizationId: string;
  userId: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean>;
}) {
  // Observability must never make an assistant request fail. Do not put the
  // prompt, answer, document labels or source data in metadata.
  void prisma.aiAssistantEvent.create({
    data: { organizationId: input.organizationId, userId: input.userId, type: input.type, durationMs: input.durationMs, metadata: input.metadata ?? {} },
  }).catch((error) => console.error("AI Assistant telemetry write failed", error));
}

export async function resolveAiAccessContext(workspace: AccountingWorkspace): Promise<AiAccessContext> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: workspace.organizationId },
    select: { name: true, baseCurrency: true, features: true },
  });
  return { workspace, organization, allowedAreas: aiDataAreasForWorkspace(workspace, organization.features) };
}

/**
 * Uses persisted chat turns as a distributed quota ledger. The advisory lock
 * makes the check-and-create operation atomic across serverless instances.
 */
export async function createRateLimitedUserMessage(input: {
  workspace: AccountingWorkspace;
  conversationId: string;
  content: string;
}) {
  const now = new Date();
  const minuteStart = new Date(now.getTime() - 60_000);
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const pendingStart = new Date(now.getTime() - PENDING_WINDOW_MS);

  return prisma.$transaction(async (tx) => {
    // tenancy:safe: lock key contains the server-resolved organization and user.
    // pg_advisory_xact_lock returns PostgreSQL's `void` type. `$queryRaw`
    // attempts to deserialize that value and fails before the rate-limit query
    // can run; `$executeRaw` acquires the same transaction-scoped lock without
    // reading its void result.
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${input.workspace.organizationId}:${input.workspace.userId}:ai`}))`);
    const where = { organizationId: input.workspace.organizationId, conversation: { userId: input.workspace.userId } } as const;
    const [minuteCount, dayCount, pendingUsers, pendingAssistants] = await Promise.all([
      tx.aiMessage.count({ where: { ...where, role: "USER", createdAt: { gte: minuteStart } } }),
      tx.aiMessage.count({ where: { ...where, role: "USER", createdAt: { gte: dayStart } } }),
      tx.aiMessage.count({ where: { ...where, role: "USER", createdAt: { gte: pendingStart } } }),
      tx.aiMessage.count({ where: { ...where, role: "ASSISTANT", createdAt: { gte: pendingStart } } }),
    ]);
    const reject = (retryAfterSeconds: number, reason: string): never => {
      logAiSecurityEvent({ event: "request_limited", organizationId: input.workspace.organizationId, userId: input.workspace.userId, metadata: { reason, retryAfterSeconds } });
      throw new AiRateLimitError(retryAfterSeconds);
    };
    if (minuteCount >= REQUESTS_PER_MINUTE) reject(60, "minute_limit");
    if (dayCount >= REQUESTS_PER_DAY) reject(Math.max(60, Math.ceil((dayStart.getTime() + 86_400_000 - now.getTime()) / 1000)), "daily_limit");
    if (pendingUsers - pendingAssistants >= MAX_CONCURRENT_REQUESTS) reject(Math.ceil(PENDING_WINDOW_MS / 1000), "concurrency_limit");
    return tx.aiMessage.create({
      data: { organizationId: input.workspace.organizationId, conversationId: input.conversationId, role: "USER", content: input.content },
      select: { id: true, role: true, content: true, citations: true, createdAt: true },
    });
  });
}

export async function createRateLimitedConversation(workspace: AccountingWorkspace) {
  const minuteStart = new Date(Date.now() - 60_000);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${workspace.organizationId}:${workspace.userId}:ai-conversation`}))`);
    const where = { organizationId: workspace.organizationId, userId: workspace.userId } as const;
    const [recent, total] = await Promise.all([
      tx.aiConversation.count({ where: { ...where, createdAt: { gte: minuteStart } } }),
      tx.aiConversation.count({ where }),
    ]);
    if (recent >= CONVERSATIONS_PER_MINUTE) throw new AiRateLimitError(60);
    if (total >= MAX_CONVERSATIONS_PER_USER) throw new Error("AI_CONVERSATION_LIMIT");
    return tx.aiConversation.create({
      data: { organizationId: workspace.organizationId, userId: workspace.userId },
      select: { id: true, title: true, lastOpenAiResponseId: true, createdAt: true, updatedAt: true },
    });
  });
}

export function validateAiCitation(value: unknown): AiCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.length > 200 || typeof row.label !== "string" || row.label.length > 200 || typeof row.href !== "string" || typeof row.type !== "string") return null;
  if (!(row.type in CITATION_PREFIXES)) return null;
  const type = row.type as AiCitation["type"];
  if (!row.href.startsWith("/") || row.href.startsWith("//") || row.href.includes("\\") || /[\u0000-\u001f]/.test(row.href)) return null;
  const path = row.href.split("?")[0].split("#")[0];
  if (!CITATION_PREFIXES[type].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;
  return { id: row.id, label: row.label, href: row.href, type };
}

/** Remove database identifiers from tool data before it leaves our server. */
export function redactToolData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactToolData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "id" && !key.endsWith("Id") && !key.endsWith("_id") && key !== "href")
    .map(([key, child]) => [key, redactToolData(child)]));
}
