import type { DbOrTx } from "@/lib/prisma";

export const FEEDBACK_MODULES = [
  "dashboard",
  "sales",
  "purchases",
  "banking",
  "payroll",
  "taxes",
  "reports",
  "pos",
  "settings",
  "other",
] as const;

export type FeedbackModule = (typeof FEEDBACK_MODULES)[number];

export const FEEDBACK_MODULE_LABELS: Record<FeedbackModule, string> = {
  dashboard: "Dashboard",
  sales: "Sales",
  purchases: "Purchases",
  banking: "Banking",
  payroll: "Payroll",
  taxes: "Taxes",
  reports: "Reports",
  pos: "POS",
  settings: "Settings",
  other: "Other",
};

export const FEEDBACK_SUB_MODULES: Record<FeedbackModule, { id: string; label: string }[]> = {
  dashboard: [
    { id: "overview", label: "Overview" },
    { id: "widgets", label: "Widgets" },
    { id: "other", label: "Other" },
  ],
  sales: [
    { id: "invoices", label: "Invoices" },
    { id: "customers", label: "Customers" },
    { id: "quotes", label: "Quotes" },
    { id: "receipts", label: "Sales Receipts" },
    { id: "refund-receipts", label: "Refund Receipts" },
    { id: "statements", label: "Customer Statements" },
    { id: "credit-notes", label: "Credit Notes" },
    { id: "other", label: "Other" },
  ],
  purchases: [
    { id: "bills", label: "Bills" },
    { id: "suppliers", label: "Suppliers" },
    { id: "expense-claims", label: "Expense Claims" },
    { id: "other", label: "Other" },
  ],
  banking: [
    { id: "transactions", label: "Transactions & Feeds" },
    { id: "statements", label: "Uploaded Statements" },
    { id: "bank-accounts", label: "Bank Accounts" },
    { id: "other", label: "Other" },
  ],
  payroll: [
    { id: "employees", label: "Employees" },
    { id: "run-payroll", label: "Run Payroll / Payslips" },
    { id: "timesheets", label: "Timesheets" },
    { id: "benefits", label: "Benefits in Kind" },
    { id: "settings", label: "HMRC / Pension Settings" },
    { id: "other", label: "Other" },
  ],
  taxes: [
    { id: "vat", label: "VAT Returns" },
    { id: "corporation", label: "Corporation Tax" },
    { id: "cis", label: "CIS Returns" },
    { id: "other", label: "Other" },
  ],
  reports: [
    { id: "financial-statements", label: "Profit & Loss / Balance Sheet" },
    { id: "aging", label: "Aged Payables / Receivables" },
    { id: "audit-trail", label: "Audit Trail" },
    { id: "other", label: "Other" },
  ],
  pos: [
    { id: "terminal", label: "POS Terminal (Register)" },
    { id: "inventory", label: "Product Inventory" },
    { id: "transactions", label: "POS Transactions" },
    { id: "refunds", label: "POS Refunds" },
    { id: "other", label: "Other" },
  ],
  settings: [
    { id: "profile-access", label: "Profile & Team Access" },
    { id: "security", label: "Security & 2FA" },
    { id: "billing", label: "Billing & Subscription" },
    { id: "organization", label: "Organization Settings" },
    { id: "other", label: "Other" },
  ],
  other: [{ id: "general", label: "General" }],
};

export const MAX_FEEDBACK_ATTACHMENTS = 3;
export const FEEDBACK_STORAGE_PREFIX = "feedback/";

// Attachments must be public URLs into workspace_assets under the feedback/ prefix.
const ATTACHMENT_URL_RE =
  /^https?:\/\/.+\/storage\/v1\/object\/public\/workspace_assets\/feedback\//;

export function moduleFromPathname(pathname: string): FeedbackModule {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return (FEEDBACK_MODULES as readonly string[]).includes(first)
    ? (first as FeedbackModule)
    : "other";
}

export function subModuleFromPathname(pathname: string, module: FeedbackModule): string {
  const segments = pathname.split("/").filter(Boolean);
  const second = segments[1] ?? "";
  const allowedSubModules = FEEDBACK_SUB_MODULES[module] || [];
  const matched = allowedSubModules.find((sm) => sm.id === second);
  return matched ? matched.id : (allowedSubModules[0]?.id ?? "");
}

export type FeedbackReportInput = {
  module: string;
  subModule?: string | null;
  details: string;
  attachments: string[];
  pageUrl: string;
  userAgent?: string | null;
};

export async function createFeedbackReportRecord(
  db: DbOrTx,
  organizationId: string,
  userId: string,
  input: FeedbackReportInput,
) {
  const details = input.details?.trim();
  if (!details) throw new Error("Please describe the issue.");

  const attachments = input.attachments ?? [];
  if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) {
    throw new Error(`At most ${MAX_FEEDBACK_ATTACHMENTS} images are allowed.`);
  }
  for (const url of attachments) {
    if (typeof url !== "string" || !ATTACHMENT_URL_RE.test(url)) {
      throw new Error("Invalid attachment URL.");
    }
  }

  const resolvedModule = (FEEDBACK_MODULES as readonly string[]).includes(input.module)
    ? input.module
    : input.module?.trim() || "other";

  const resolvedModuleKey = (FEEDBACK_MODULES as readonly string[]).includes(resolvedModule)
    ? (resolvedModule as FeedbackModule)
    : "other";

  const allowedSubModules = FEEDBACK_SUB_MODULES[resolvedModuleKey] || [];
  let resolvedSubModule = "";
  if (allowedSubModules.some((sm) => sm.id === input.subModule)) {
    resolvedSubModule = input.subModule as string;
  } else {
    const trimmed = input.subModule?.trim();
    if (trimmed) {
      resolvedSubModule = trimmed;
    } else {
      resolvedSubModule = (FEEDBACK_MODULES as readonly string[]).includes(resolvedModule)
        ? allowedSubModules[0]?.id || ""
        : "";
    }
  }

  const report = await db.feedbackReport.create({
    data: {
      organizationId,
      userId,
      module: resolvedModule,
      subModule: resolvedSubModule,
      details,
      attachments,
      pageUrl: (input.pageUrl || "").slice(0, 2000),
      userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    },
  });

  const subjectParts = [resolvedModule, resolvedSubModule]
    .filter(Boolean)
    .map((part) => part.replaceAll("_", " "));
  const subject = subjectParts.join(" · ").slice(0, 200) || "Customer feedback";
  const ticket = await db.supportTicket.create({
    data: {
      organizationId,
      requesterUserId: userId,
      feedbackReportId: report.id,
      subject,
      category: resolvedModule.slice(0, 80),
    },
  });
  await db.supportMessage.create({
    data: {
      organizationId,
      ticketId: ticket.id,
      authorType: "CUSTOMER",
      authorUserId: userId,
      authorName: "Customer",
      body: details,
      attachments,
      readByCustomerAt: new Date(),
    },
  });

  return report;
}
