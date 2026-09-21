/**
 * ORG_SCOPED: Prisma model name → the Prisma field name that holds the org id.
 *
 * Membership is determined by dmmf reflection (see tests/tenancy/registry-completeness.test.ts):
 * every model that carries an `organizationId` field in the Prisma schema must appear here
 * or in KNOWN_EXCLUDED. The "every ORG_SCOPED field actually exists on its model" test
 * ensures no phantom entries creep in.
 *
 * NOTE: The snake_case banking_* / pos_* tables use `org_id` as their Prisma field name
 * (no `organizationId` alias) and are reached only via raw SQL — they do NOT appear in
 * dmmf with an `organizationId` field, so they are omitted here.
 */
export const ORG_SCOPED: Record<string, string> = {
  // One row per workspace; missing from this registry until now, so the
  // firewall was not covering it.
  NotificationState: "organizationId",
  // Per (user, workspace). Scoped for the same reason as the row above: what
  // somebody has muted is theirs, and a query that forgot the organisation
  // would read preferences across every workspace they belong to.
  NotificationPreference: "organizationId",
  PurchaseSettings: "organizationId",
  // Membership / access
  UserRole: "organizationId",

  // Chart of accounts
  ChartAccount: "organizationId",

  // CRM
  Contact: "organizationId",
  ContactPerson: "organizationId",
  ContactAttachment: "organizationId",

  // Journals
  Journal: "organizationId",
  JournalLine: "organizationId",

  // Sales
  Invoice: "organizationId",
  InvoiceLine: "organizationId",
  InvoiceAttachment: "organizationId",
  ChargeItem: "organizationId",
  ReminderLog: "organizationId",
  TrackingDimension: "organizationId",
  TrackingOption: "organizationId",
  InvoiceTrackingAssignment: "organizationId",
  JournalTrackingAssignment: "organizationId",
  SalesReceipt: "organizationId",
  SalesReceiptLine: "organizationId",

  // Refunds
  RefundReceipt: "organizationId",
  RefundReceiptLine: "organizationId",

  // Purchases
  Bill: "organizationId",
  BillLine: "organizationId",
  BillAttachment: "organizationId",
  PurchaseOrder: "organizationId",
  PurchaseOrderLine: "organizationId",

  // Payroll
  PayrollSettings: "organizationId",
  Employee: "organizationId",
  PayrollSchedule: "organizationId",
  PayrollRun: "organizationId",
  Timesheet: "organizationId",

  // Audit
  AuditEvent: "organizationId",

  // Document templates
  DocumentTemplate: "organizationId",

  // Credit notes
  CreditNote: "organizationId",

  // Team invitations
  WorkspaceInvitation: "organizationId",

  // Feedback Center
  FeedbackReport: "organizationId",

  // Roadmap / feature requests
  FeatureRequest: "organizationId",

  // Support & Chat
  SupportTicket: "organizationId",
  SupportMessage: "organizationId",

  // Workspace AI Assistant
  AiConversation: "organizationId",
  AiMessage: "organizationId",
  AiMessageFeedback: "organizationId",
  AiAssistantEvent: "organizationId",

  // HMRC Making Tax Digital authorisation
  HmrcConnection: "organizationId",

  // TrueLayer Open Banking bank feeds
  TrueLayerBankFeedConnection: "organizationId",
};

/**
 * KNOWN_EXCLUDED: Prisma models intentionally NOT in ORG_SCOPED.
 *
 * Every model listed here must have a code comment justifying why it is global
 * or why it should not be auto-scoped by the tenancy extension.
 */
export const KNOWN_EXCLUDED = new Set<string>([
  // A client invitation exists before its workspace does, so organizationId is
  // nullable and only set once the client completes checkout. It cannot be
  // auto-scoped; access is guarded by the invite token and admin role instead.
  "ClientInvitation",
  // Published central bank rates are public reference data shared by every
  // workspace, so there is no org_id to scope by.
  "ExchangeRate",
  // An HMRC authorisation granted during onboarding, before the workspace it
  // will belong to exists. Keyed by the person who granted it, not an
  // organisation, so it cannot be auto-scoped. Every read is by that user's own
  // id from their session, and the row is swept once it expires.
  "HmrcPendingConnection",
  // ─── Platform-level / global tables ───────────────────────────────────────
  "Organization", // the root tenant entity — scoped by its own id, not a foreign org
  "AccountTemplate", // global platform chart-of-accounts seed data; no org column
  "TaxRate", // global tax rate catalogue; no organizationId in schema
  "SubscriptionPlan", // global billing plan catalogue; no organizationId in schema

  // ─── Child rows scoped through their parent (no direct org FK) ────────────
  "PayrollRunEmployee", // scoped via payrollRunId → PayrollRun.organizationId; no direct org column
  "TimesheetEntry", // scoped via timesheetId → Timesheet.organizationId; no direct org column

  // ─── Auth schema (Supabase) ───────────────────────────────────────────────
  // audit_log_entries, flow_state, identities, instances, mfa_amr_claims,
  // mfa_challenges, mfa_factors, oauth_authorizations, oauth_client_states,
  // oauth_clients, oauth_consents, one_time_tokens, refresh_tokens,
  // saml_providers, saml_relay_states, schema_migrations, sessions,
  // sso_domains, sso_providers, users, webauthn_challenges, webauthn_credentials,
  // custom_oauth_providers — all auth.* tables; no organizationId column.
  "audit_log_entries",
  "custom_oauth_providers",
  "flow_state",
  "identities",
  "instances",
  "mfa_amr_claims",
  "mfa_challenges",
  "mfa_factors",
  "oauth_authorizations",
  "oauth_client_states",
  "oauth_clients",
  "oauth_consents",
  "one_time_tokens",
  "refresh_tokens",
  "saml_providers",
  "saml_relay_states",
  "schema_migrations",
  "sessions",
  "sso_domains",
  "sso_providers",
  "users",
  "webauthn_challenges",
  "webauthn_credentials",

  // ─── Legacy Django scaffold (no org column) ───────────────────────────────
  "auth_group",
  "auth_permission",
  "django_content_type",
  "django_migrations",

  // ─── Banking / POS snake_case tables (org_id field, not organizationId) ───
  // These use raw SQL only; Prisma dmmf shows `org_id` not `organizationId`,
  // so they never appear in the first completeness test. Listed here for clarity.
  "banking_bank_accounts",
  "banking_bank_conversions",
  "banking_feed_transactions",
  "pos_day_closes",
  "pos_products",
  "pos_sale_items",
  "pos_sales",
  "pos_stock_logs",
]);
