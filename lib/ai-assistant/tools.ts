import "server-only";

import { Prisma } from "@prisma/client";

import { getVatReturn } from "@/lib/accounting/vat-return";
import { prisma } from "@/lib/prisma";

import type { AiCitation } from "./types";
import type { AiDataArea } from "./permissions";
import { taskGuide, TASK_GUIDES, type TaskGuideKey } from "./workflows";

type ToolResult = { data: unknown; citations: AiCitation[] };

type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
};

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const optionalString = { type: ["string", "null"] };
const optionalLimit = { type: ["integer", "null"], minimum: 1, maximum: 50 };

type ToolPolicy = { areas: AiDataArea[]; readOnly: true; maxRows: number };

const DEFINITIONS: Record<string, ToolDefinition & ToolPolicy> = {
  get_financial_summary: {
    areas: ["reports"],
    readOnly: true,
    maxRows: 10,
    type: "function",
    name: "get_financial_summary",
    description: "Return posted revenue, expenses, profit, assets, liabilities and equity for a date range in the workspace base currency.",
    strict: true,
    parameters: objectSchema(
      { start_date: optionalString, end_date: optionalString },
      ["start_date", "end_date"]
    ),
  },
  list_invoices: {
    areas: ["sales"],
    readOnly: true,
    maxRows: 50,
    type: "function",
    name: "list_invoices",
    description: "Find customer invoices, including overdue or unpaid invoices, and return links to the matching records.",
    strict: true,
    parameters: objectSchema(
      { search: optionalString, status: optionalString, overdue_only: { type: ["boolean", "null"] }, limit: optionalLimit },
      ["search", "status", "overdue_only", "limit"]
    ),
  },
  list_bills: {
    areas: ["purchases"],
    readOnly: true,
    maxRows: 50,
    type: "function",
    name: "list_bills",
    description: "Find supplier bills, including unpaid or overdue bills, and return links to the matching records.",
    strict: true,
    parameters: objectSchema(
      { search: optionalString, status: optionalString, overdue_only: { type: ["boolean", "null"] }, limit: optionalLimit },
      ["search", "status", "overdue_only", "limit"]
    ),
  },
  list_contact_balances: {
    areas: ["contacts"],
    readOnly: true,
    maxRows: 50,
    type: "function",
    name: "list_contact_balances",
    description: "Rank customers by outstanding invoice value or suppliers by unpaid bill value.",
    strict: true,
    parameters: objectSchema(
      { kind: { type: "string", enum: ["customer", "supplier"] }, limit: optionalLimit },
      ["kind", "limit"]
    ),
  },
  list_journals: {
    areas: ["accounting"],
    readOnly: true,
    maxRows: 50,
    type: "function",
    name: "list_journals",
    description: "Find posted, draft or reversed journals and their debit and credit totals.",
    strict: true,
    parameters: objectSchema(
      { search: optionalString, status: optionalString, start_date: optionalString, end_date: optionalString, limit: optionalLimit },
      ["search", "status", "start_date", "end_date", "limit"]
    ),
  },
  list_bank_transactions: {
    areas: ["banking"],
    readOnly: true,
    maxRows: 50,
    type: "function",
    name: "list_bank_transactions",
    description: "Find imported bank transactions and their reconciliation status.",
    strict: true,
    parameters: objectSchema(
      { search: optionalString, reconcile_status: optionalString, start_date: optionalString, end_date: optionalString, limit: optionalLimit },
      ["search", "reconcile_status", "start_date", "end_date", "limit"]
    ),
  },
  get_vat_return: {
    areas: ["taxes"],
    readOnly: true,
    maxRows: 1,
    type: "function",
    name: "get_vat_return",
    description: "Return the VAT boxes and supporting source totals for a VAT period. Omit period_key for the current period.",
    strict: true,
    parameters: objectSchema({ period_key: optionalString }, ["period_key"]),
  },
  get_document_details: {
    areas: ["sales", "purchases", "accounting"],
    readOnly: true,
    maxRows: 1,
    type: "function",
    name: "get_document_details",
    description: "Get one invoice or bill with its lines, discounts, exchange rate, account coding and posted journal.",
    strict: true,
    parameters: objectSchema({ document_type: { type: "string", enum: ["invoice", "bill"] }, document_number: { type: "string" } }, ["document_type", "document_number"]),
  },
  suggest_bill_account: {
    areas: ["purchases"],
    readOnly: true,
    maxRows: 3,
    type: "function",
    name: "suggest_bill_account",
    description: "Suggest up to three chart-of-accounts codes for a bill line from its description, supplier and prior approved bill coding. This is a suggestion only.",
    strict: true,
    parameters: objectSchema({ description: { type: "string" }, supplier_name: optionalString }, ["description", "supplier_name"]),
  },
  get_review_insights: {
    areas: ["sales", "purchases", "banking", "reports"],
    readOnly: true,
    maxRows: 5,
    type: "function",
    name: "get_review_insights",
    description: "Find deterministic items worth reviewing: overdue invoices, old drafts, unreconciled bank lines and unusual missing VAT on supplier bills.",
    strict: true,
    parameters: objectSchema({}, []),
  },
  get_task_guide: {
    areas: ["sales", "purchases", "banking", "accounting"],
    readOnly: true,
    maxRows: 1,
    type: "function",
    name: "get_task_guide",
    description: "Return the trusted WAWPROFI steps and route for a supported accounting task. It never performs the task.",
    strict: true,
    parameters: objectSchema({ task: { type: "string", enum: Object.keys(TASK_GUIDES) } }, ["task"]),
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function limitArg(args: Record<string, unknown>) {
  const value = args.limit;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(50, Math.max(1, Math.trunc(value)))
    : 10;
}

function isoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateText(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function invoiceCitation(id: string, invoiceNo: string): AiCitation {
  return { id, label: `Invoice ${invoiceNo}`, href: `/sales/invoices?search=${encodeURIComponent(invoiceNo)}`, type: "invoice" };
}

function billCitation(id: string, invoiceNo: string): AiCitation {
  return { id, label: `Bill ${invoiceNo}`, href: `/purchases/bills?search=${encodeURIComponent(invoiceNo)}`, type: "bill" };
}

async function financialSummary(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const start = isoDate(args.start_date);
  const end = isoDate(args.end_date);
  const startSql = start ? Prisma.sql`and gle.journal_date >= ${start}::date` : Prisma.empty;
  const endSql = end ? Prisma.sql`and gle.journal_date <= ${end}::date` : Prisma.empty;

  // tenancy:safe: raw query is explicitly restricted to the active organization.
  const [rows, drivers] = await Promise.all([
    prisma.$queryRaw<Array<{ account_type: string; balance_minor: bigint }>>(Prisma.sql`
    select gle.account_type::text as account_type,
      case when gle.account_type = 'revenue'::account_type
        then (sum(gle.credit_minor) - sum(gle.debit_minor))::bigint
        when gle.account_type in ('asset'::account_type, 'expense'::account_type)
        then (sum(gle.debit_minor) - sum(gle.credit_minor))::bigint
        else (sum(gle.credit_minor) - sum(gle.debit_minor))::bigint
      end as balance_minor
    from general_ledger_entries gle
    where gle.org_id = ${organizationId}::uuid ${startSql} ${endSql}
    group by gle.account_type
  `),
    // tenancy:safe: raw query is explicitly restricted to the active organization.
    prisma.$queryRaw<Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance_minor: bigint }>>(Prisma.sql`
      select gle.account_id::text as account_id, gle.account_code, gle.account_name,
        gle.account_type::text as account_type,
        case when gle.account_type = 'revenue'::account_type
          then (sum(gle.credit_minor) - sum(gle.debit_minor))::bigint
          else (sum(gle.debit_minor) - sum(gle.credit_minor))::bigint
        end as balance_minor
      from general_ledger_entries gle
      where gle.org_id = ${organizationId}::uuid
        and gle.account_type in ('revenue'::account_type, 'expense'::account_type)
        ${startSql} ${endSql}
      group by gle.account_id, gle.account_code, gle.account_name, gle.account_type
      order by abs(case when gle.account_type = 'revenue'::account_type
        then sum(gle.credit_minor) - sum(gle.debit_minor)
        else sum(gle.debit_minor) - sum(gle.credit_minor) end) desc
      limit 10
    `),
  ]);
  const totals = Object.fromEntries(rows.map((row) => [row.account_type, Number(row.balance_minor)]));
  return {
    data: {
      period: { startDate: dateText(start), endDate: dateText(end) },
      currencyBasis: "workspace base currency, minor units",
      revenueMinor: totals.revenue ?? 0,
      expenseMinor: totals.expense ?? 0,
      profitMinor: (totals.revenue ?? 0) - (totals.expense ?? 0),
      assetsMinor: totals.asset ?? 0,
      liabilitiesMinor: totals.liability ?? 0,
      equityMinor: totals.equity ?? 0,
      largestRevenueAndExpenseAccounts: drivers.map((row) => ({ accountCode: row.account_code, accountName: row.account_name, accountType: row.account_type, balanceMinor: Number(row.balance_minor), citationKey: `account:${row.account_id}` })),
    },
    citations: [
      { id: "profit-and-loss", label: "Financial reports", href: "/reports", type: "report" },
      ...drivers.map((row) => ({ id: row.account_id, label: `${row.account_code} · ${row.account_name}`, href: `/accounting/chart-of-accounts?search=${encodeURIComponent(row.account_code)}`, type: "account" as const })),
    ],
  };
}

async function invoices(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const search = textArg(args, "search");
  const status = textArg(args, "status")?.toUpperCase();
  const overdueOnly = args.overdue_only === true;
  const today = new Date();
  const rows = await prisma.invoice.findMany({
    where: {
      organizationId,
      ...(status && ["DRAFT", "APPROVED", "SENT", "VOID"].includes(status) ? { status: status as "DRAFT" | "APPROVED" | "SENT" | "VOID" } : {}),
      ...(overdueOnly ? { dueDate: { lt: today }, paid_at: null, status: { in: ["APPROVED", "SENT"] } } : {}),
      ...(search ? { OR: [{ invoiceNo: { contains: search, mode: "insensitive" } }, { contact: { name: { contains: search, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { issueDate: "desc" }],
    take: limitArg(args),
    select: { id: true, invoiceNo: true, status: true, issueDate: true, dueDate: true, paid_at: true, currency: true, exchangeRate: true, totalMinor: true, baseTotalMinor: true, contact: { select: { name: true } } },
  });
  return {
    data: rows.map((row) => ({ id: row.id, invoiceNo: row.invoiceNo, customer: row.contact.name, status: row.status, issueDate: dateText(row.issueDate), dueDate: dateText(row.dueDate), paidAt: dateText(row.paid_at), currency: row.currency, exchangeRate: Number(row.exchangeRate), totalMinor: Number(row.totalMinor), baseTotalMinor: Number(row.baseTotalMinor) })),
    citations: rows.map((row) => invoiceCitation(row.id, row.invoiceNo)),
  };
}

async function bills(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const search = textArg(args, "search");
  const status = textArg(args, "status")?.toUpperCase();
  const overdueOnly = args.overdue_only === true;
  const rows = await prisma.bill.findMany({
    where: {
      organizationId,
      ...(status && ["DRAFT", "APPROVED", "VOID", "PAID"].includes(status) ? { status: status as "DRAFT" | "APPROVED" | "VOID" | "PAID" } : {}),
      ...(overdueOnly ? { dueDate: { lt: new Date() }, paidAt: null, status: "APPROVED" } : {}),
      ...(search ? { OR: [{ invoiceNo: { contains: search, mode: "insensitive" } }, { contact: { name: { contains: search, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { issueDate: "desc" }],
    take: limitArg(args),
    select: { id: true, invoiceNo: true, status: true, issueDate: true, dueDate: true, paidAt: true, currency: true, exchangeRate: true, totalMinor: true, baseTotalMinor: true, contact: { select: { name: true } } },
  });
  return {
    data: rows.map((row) => ({ id: row.id, billNo: row.invoiceNo, supplier: row.contact.name, status: row.status, issueDate: dateText(row.issueDate), dueDate: dateText(row.dueDate), paidAt: dateText(row.paidAt), currency: row.currency, exchangeRate: Number(row.exchangeRate), totalMinor: Number(row.totalMinor), baseTotalMinor: Number(row.baseTotalMinor) })),
    citations: rows.map((row) => billCitation(row.id, row.invoiceNo)),
  };
}

async function contactBalances(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const kind = args.kind === "supplier" ? "supplier" : "customer";
  const take = limitArg(args);
  const rows = kind === "customer"
    ? await prisma.invoice.groupBy({ where: { organizationId, paid_at: null, status: { in: ["APPROVED", "SENT"] } }, by: ["contactId"], _sum: { baseTotalMinor: true }, orderBy: { _sum: { baseTotalMinor: "desc" } }, take })
    : await prisma.bill.groupBy({ where: { organizationId, paidAt: null, status: "APPROVED" }, by: ["contactId"], _sum: { baseTotalMinor: true }, orderBy: { _sum: { baseTotalMinor: "desc" } }, take });
  const contacts = await prisma.contact.findMany({ where: { organizationId, id: { in: rows.map((row) => row.contactId) } }, select: { id: true, name: true } });
  const names = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const data = rows.map((row) => ({ contactId: row.contactId, name: names.get(row.contactId) ?? "Unknown contact", outstandingBaseMinor: Number(row._sum.baseTotalMinor ?? 0) }));
  return {
    data,
    citations: data.map((row) => ({ id: row.contactId, label: row.name, href: kind === "customer" ? `/sales/customers?search=${encodeURIComponent(row.name)}` : `/purchases/suppliers?search=${encodeURIComponent(row.name)}`, type: "contact" })),
  };
}

async function journals(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const search = textArg(args, "search");
  const status = textArg(args, "status")?.toUpperCase();
  const start = isoDate(args.start_date);
  const end = isoDate(args.end_date);
  const rows = await prisma.journal.findMany({
    where: { organizationId, ...(status && ["DRAFT", "POSTED", "REVERSED"].includes(status) ? { status: status as "DRAFT" | "POSTED" | "REVERSED" } : {}), ...(search ? { memo: { contains: search, mode: "insensitive" } } : {}), ...(start || end ? { journalDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) },
    orderBy: [{ journalDate: "desc" }, { createdAt: "desc" }], take: limitArg(args),
    select: { id: true, status: true, journalDate: true, memo: true, sourceType: true, lines: { select: { debitMinor: true, creditMinor: true } } },
  });
  return {
    data: rows.map((row) => ({ id: row.id, status: row.status, date: dateText(row.journalDate), memo: row.memo, sourceType: row.sourceType, debitMinor: row.lines.reduce((sum, line) => sum + Number(line.debitMinor), 0), creditMinor: row.lines.reduce((sum, line) => sum + Number(line.creditMinor), 0) })),
    citations: rows.map((row) => ({ id: row.id, label: `Journal ${row.id.slice(0, 8)}`, href: `/accounting/journals?search=${row.id}`, type: "journal" })),
  };
}

async function bankTransactions(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const search = textArg(args, "search");
  const reconcileStatus = textArg(args, "reconcile_status");
  const start = isoDate(args.start_date);
  const end = isoDate(args.end_date);
  const rows = await prisma.banking_feed_transactions.findMany({
    where: { org_id: organizationId, deleted_at: null, ...(search ? { description: { contains: search, mode: "insensitive" } } : {}), ...(reconcileStatus ? { reconcile_status: reconcileStatus } : {}), ...(start || end ? { transaction_date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) },
    orderBy: [{ transaction_date: "desc" }, { created_at: "desc" }], take: limitArg(args), include: { banking_bank_accounts: { select: { display_name: true, currency: true } } },
  });
  return {
    data: rows.map((row) => ({ id: row.id, date: dateText(row.transaction_date), description: row.description, debitMinor: Number(row.debit_minor), creditMinor: Number(row.credit_minor), currency: row.banking_bank_accounts.currency, bankAccount: row.banking_bank_accounts.display_name, reconciliationStatus: row.reconcile_status })),
    citations: rows.map((row) => ({ id: row.id, label: `${row.description} · ${dateText(row.transaction_date)}`, href: `/banking/transactions?search=${encodeURIComponent(row.description)}`, type: "bank_transaction" })),
  };
}

async function vatReturn(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const periodKey = textArg(args, "period_key");
  const result = await getVatReturn(organizationId, { periodKey });
  return { data: { registration: result.registration, period: result.selected, boxes: result.boxes, sources: result.sources, adjustments: result.adjustments, lateEntries: result.lateEntries }, citations: [{ id: result.selected.key, label: `VAT return ${result.selected.label}`, href: `/taxes/vat?period=${encodeURIComponent(result.selected.key)}`, type: "vat" }] };
}

async function documentDetails(
  organizationId: string,
  args: Record<string, unknown>,
  allowedAreas: readonly AiDataArea[]
): Promise<ToolResult> {
  const documentType = args.document_type === "bill" ? "bill" : "invoice";
  const documentNumber = textArg(args, "document_number");
  const permitted = documentType === "invoice"
    ? allowedAreas.some((area) => area === "sales" || area === "accounting")
    : allowedAreas.some((area) => area === "purchases" || area === "accounting");
  if (!permitted) return { data: { error: "This document is not available for the current role." }, citations: [] };
  if (!documentNumber) return { data: { error: "Enter a document number." }, citations: [] };

  const commonSelect = {
    id: true, invoiceNo: true, status: true, issueDate: true, dueDate: true,
    currency: true, exchangeRate: true, subtotalMinor: true, discountMinor: true,
    taxMinor: true, totalMinor: true, baseTotalMinor: true, amountsAre: true,
    contact: { select: { name: true } },
    lines: { select: { description: true, quantity: true, unitAmountMinor: true, subtotalMinor: true, discountMinor: true, taxCode: true, taxRate: true, taxMinor: true, totalMinor: true, account: { select: { code: true, name: true, accountType: true } } } },
    postedJournal: { select: { id: true, status: true, journalDate: true, memo: true, lines: { select: { debitMinor: true, creditMinor: true, memo: true, account: { select: { code: true, name: true } } } } } },
  } as const;
  const row = documentType === "invoice"
    ? await prisma.invoice.findFirst({ where: { organizationId, invoiceNo: { equals: documentNumber, mode: "insensitive" } }, select: { ...commonSelect, paid_at: true, reference: true, poNumber: true } })
    : await prisma.bill.findFirst({ where: { organizationId, invoiceNo: { equals: documentNumber, mode: "insensitive" } }, select: { ...commonSelect, paidAt: true, isExpenseClaim: true } });
  if (!row) return { data: { error: `${documentType === "invoice" ? "Invoice" : "Bill"} ${documentNumber} was not found.` }, citations: [] };

  const citation = documentType === "invoice" ? invoiceCitation(row.id, row.invoiceNo) : billCitation(row.id, row.invoiceNo);
  const journalCitation: AiCitation[] = row.postedJournal
    ? [{ id: row.postedJournal.id, label: `Journal ${row.postedJournal.id.slice(0, 8)}`, href: `/accounting/journals?search=${row.postedJournal.id}`, type: "journal" }]
    : [];
  return {
    data: {
      ...row,
      exchangeRate: Number(row.exchangeRate),
      subtotalMinor: Number(row.subtotalMinor), discountMinor: Number(row.discountMinor),
      taxMinor: Number(row.taxMinor), totalMinor: Number(row.totalMinor), baseTotalMinor: Number(row.baseTotalMinor),
      lines: row.lines.map((line) => ({ ...line, quantity: Number(line.quantity), unitAmountMinor: Number(line.unitAmountMinor), subtotalMinor: Number(line.subtotalMinor), discountMinor: Number(line.discountMinor), taxRate: Number(line.taxRate), taxMinor: Number(line.taxMinor), totalMinor: Number(line.totalMinor) })),
      postedJournal: row.postedJournal ? { ...row.postedJournal, date: dateText(row.postedJournal.journalDate), lines: row.postedJournal.lines.map((line) => ({ ...line, debitMinor: Number(line.debitMinor), creditMinor: Number(line.creditMinor) })) } : null,
    },
    citations: [citation, ...journalCitation],
  };
}

function words(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
}

async function suggestBillAccount(organizationId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const description = textArg(args, "description");
  const supplier = textArg(args, "supplier_name");
  if (!description) return { data: { error: "Enter a bill-line description." }, citations: [] };
  const rows = await prisma.billLine.findMany({
    where: { organizationId, bill: { status: { in: ["APPROVED", "PAID"] }, ...(supplier ? { contact: { name: { contains: supplier, mode: "insensitive" } } } : {}) }, account: { isActive: true } },
    orderBy: { createdAt: "desc" }, take: 250,
    select: { description: true, createdAt: true, account: { select: { id: true, code: true, name: true, accountType: true } }, bill: { select: { contact: { select: { name: true } } } } },
  });
  const sought = words(description);
  const scored = new Map<string, { id: string; code: string; name: string; accountType: string; score: number; uses: number; supplierUses: number }>();
  for (const row of rows) {
    const current = scored.get(row.account.id) ?? { ...row.account, accountType: String(row.account.accountType), score: 0, uses: 0, supplierUses: 0 };
    const overlap = [...words(row.description)].filter((word) => sought.has(word)).length;
    const sameSupplier = supplier && row.bill.contact.name.toLowerCase().includes(supplier.toLowerCase());
    current.uses += 1;
    current.supplierUses += sameSupplier ? 1 : 0;
    current.score += overlap * 5 + (sameSupplier ? 3 : 0) + 1;
    scored.set(row.account.id, current);
  }
  const suggestions = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 3).map((row, index) => ({
    code: row.code, name: row.name, accountType: row.accountType,
    confidence: index === 0 && row.score >= 10 ? "high" : row.score >= 5 ? "medium" : "low",
    reason: `${row.uses} prior approved line${row.uses === 1 ? "" : "s"}${row.supplierUses ? `, including ${row.supplierUses} for this supplier` : ""}`,
  }));
  return {
    data: { description, supplier, suggestions, note: "Suggestions use prior approved bill coding and do not change the bill." },
    citations: suggestions.map((row) => ({ id: row.code, label: `${row.code} · ${row.name}`, href: `/accounting/chart-of-accounts?search=${encodeURIComponent(row.code)}`, type: "account" })),
  };
}

export type AiReviewInsight = { key: string; level: "warning" | "info"; title: string; detail: string; href: string };

const reviewInsightCache = new Map<string, { expiresAt: number; value: Promise<AiReviewInsight[]> }>();

export function getCachedWorkspaceReviewInsights(organizationId: string, allowedAreas: readonly AiDataArea[]) {
  const key = `${organizationId}:${[...allowedAreas].sort().join(",")}`;
  const now = Date.now();
  const cached = reviewInsightCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (reviewInsightCache.size >= 100) {
    for (const [cacheKey, entry] of reviewInsightCache) if (entry.expiresAt <= now) reviewInsightCache.delete(cacheKey);
    if (reviewInsightCache.size >= 100) reviewInsightCache.delete(reviewInsightCache.keys().next().value as string);
  }
  const value = getWorkspaceReviewInsights(organizationId, allowedAreas).catch((error) => {
    reviewInsightCache.delete(key);
    throw error;
  });
  reviewInsightCache.set(key, { expiresAt: now + 30_000, value });
  return value;
}

export async function getWorkspaceReviewInsights(organizationId: string, allowedAreas: readonly AiDataArea[]): Promise<AiReviewInsight[]> {
  const now = new Date();
  const oldDraft = new Date(now); oldDraft.setDate(oldDraft.getDate() - 14);
  const insights: AiReviewInsight[] = [];
  if (allowedAreas.includes("sales")) {
    const [overdue, drafts] = await Promise.all([
      prisma.invoice.count({ where: { organizationId, status: { in: ["APPROVED", "SENT"] }, paid_at: null, dueDate: { lt: now } } }),
      prisma.invoice.count({ where: { organizationId, status: "DRAFT", createdAt: { lt: oldDraft } } }),
    ]);
    if (overdue) insights.push({ key: "overdue-invoices", level: "warning", title: `${overdue} overdue invoice${overdue === 1 ? "" : "s"}`, detail: "Review payment status or follow up with the customer.", href: "/sales/invoices" });
    if (drafts) insights.push({ key: "old-draft-invoices", level: "info", title: `${drafts} invoice draft${drafts === 1 ? "" : "s"} over 14 days old`, detail: "Check whether each draft should be completed or removed.", href: "/sales/invoices" });
  }
  if (allowedAreas.includes("purchases")) {
    const [drafts, recentBills] = await Promise.all([
      prisma.bill.count({ where: { organizationId, status: "DRAFT", createdAt: { lt: oldDraft } } }),
      prisma.bill.findMany({
        where: { organizationId, status: { in: ["APPROVED", "PAID"] } },
        orderBy: { issueDate: "desc" }, take: 200,
        select: { id: true, invoiceNo: true, issueDate: true, taxMinor: true, contactId: true, contact: { select: { name: true } } },
      }),
    ]);
    if (drafts) insights.push({ key: "old-draft-bills", level: "info", title: `${drafts} bill draft${drafts === 1 ? "" : "s"} over 14 days old`, detail: "Review the supplier, VAT and account coding.", href: "/purchases/bills" });
    const bySupplier = new Map<string, typeof recentBills>();
    for (const bill of recentBills) bySupplier.set(bill.contactId, [...(bySupplier.get(bill.contactId) ?? []), bill]);
    for (const supplierBills of bySupplier.values()) {
      const latest = supplierBills[0];
      const history = supplierBills.slice(1);
      const normallyHasVat = history.length >= 3 && history.filter((bill) => bill.taxMinor > 0).length / history.length >= 0.75;
      if (latest && latest.taxMinor === BigInt(0) && normallyHasVat) {
        insights.push({ key: `missing-vat-${latest.id}`, level: "warning", title: `Check VAT on bill ${latest.invoiceNo}`, detail: `${latest.contact.name}'s recent bills normally include VAT, but this one does not.`, href: `/purchases/bills?search=${encodeURIComponent(latest.invoiceNo)}` });
      }
      if (insights.length >= 5) break;
    }
  }
  if (allowedAreas.includes("banking")) {
    const unreconciled = await prisma.banking_feed_transactions.count({ where: { org_id: organizationId, deleted_at: null, reconcile_status: { not: "reconciled" }, transaction_date: { lt: oldDraft } } });
    if (unreconciled) insights.push({ key: "old-unreconciled", level: "warning", title: `${unreconciled} older unreconciled bank transaction${unreconciled === 1 ? "" : "s"}`, detail: "Match or record these lines before relying on the bank balance.", href: "/banking/transactions" });
  }
  return insights.slice(0, 5);
}

async function reviewInsights(organizationId: string, _args: Record<string, unknown>, allowedAreas: readonly AiDataArea[]): Promise<ToolResult> {
  const items = await getCachedWorkspaceReviewInsights(organizationId, allowedAreas);
  return { data: items, citations: items.map((item) => ({ id: item.key, label: item.title, href: item.href, type: "report" })) };
}

async function guide(_organizationId: string, args: Record<string, unknown>, allowedAreas: readonly AiDataArea[]): Promise<ToolResult> {
  const key = textArg(args, "task") as TaskGuideKey | null;
  if (!key || !(key in TASK_GUIDES)) return { data: { error: "That guided task is not available." }, citations: [] };
  const result = taskGuide(key);
  if (!allowedAreas.includes(result.guide.area)) return { data: { error: "This task is not available for the current role." }, citations: [] };
  return { data: result.guide, citations: [result.citation] };
}

type ToolExecutor = (organizationId: string, args: Record<string, unknown>, allowedAreas: readonly AiDataArea[]) => Promise<ToolResult>;

const EXECUTORS: Record<string, ToolExecutor> = {
  get_financial_summary: financialSummary,
  list_invoices: invoices,
  list_bills: bills,
  list_contact_balances: contactBalances,
  list_journals: journals,
  list_bank_transactions: bankTransactions,
  get_vat_return: vatReturn,
  get_document_details: documentDetails,
  suggest_bill_account: suggestBillAccount,
  get_review_insights: reviewInsights,
  get_task_guide: guide,
};

export function aiToolDefinitions(areas: readonly AiDataArea[]): ToolDefinition[] {
  const allowed = new Set(areas);
  return Object.values(DEFINITIONS)
    .filter((definition) => definition.areas.some((area) => allowed.has(area)))
    .map(({ areas: _areas, readOnly: _readOnly, maxRows: _maxRows, ...definition }) => definition);
}

export function aiToolPolicies() {
  return Object.fromEntries(Object.entries(DEFINITIONS).map(([name, definition]) => [name, { areas: definition.areas, readOnly: definition.readOnly, maxRows: definition.maxRows }]));
}

export async function executeAiTool(input: { organizationId: string; allowedAreas: readonly AiDataArea[]; name: string; argumentsJson: string }): Promise<ToolResult> {
  const startedAt = performance.now();
  const definition = DEFINITIONS[input.name];
  const executor = EXECUTORS[input.name];
  if (!definition || !executor || !definition.areas.some((area) => input.allowedAreas.includes(area))) {
    return { data: { error: "This data is not available for the current role." }, citations: [] };
  }
  let args: Record<string, unknown> = {};
  try { args = asRecord(JSON.parse(input.argumentsJson)); } catch { return { data: { error: "The tool arguments were invalid." }, citations: [] }; }
  const result = await executor(input.organizationId, args, input.allowedAreas);
  console.info(JSON.stringify({ category: "ai_performance", organizationId: input.organizationId, tool: input.name, durationMs: Math.round(performance.now() - startedAt), at: new Date().toISOString() }));
  return result;
}
