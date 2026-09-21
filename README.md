# WAW-Profi

**WAW-Profi** is a multi-tenant SaaS accounting platform for UK small businesses, built by WAW Group Global. It combines double-entry bookkeeping, sales & purchase document management, bank statement import with AI-assisted reconciliation, point-of-sale, internal payroll, and tax workspaces — all behind a Stripe-billed subscription, with a separate "Master Control" admin portal for operating the platform itself.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
  - [High-Level Design](#high-level-design)
  - [Application Layers](#application-layers)
  - [Route Groups](#route-groups)
  - [Multi-Tenancy & Data Isolation](#multi-tenancy--data-isolation)
  - [The Accounting Core](#the-accounting-core)
  - [Databases](#databases)
  - [Authentication & Authorization](#authentication--authorization)
- [Feature Modules](#feature-modules)
  - [Customer Portal](#customer-portal)
  - [Admin Portal (Master Control)](#admin-portal-master-control)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Further Documentation](#further-documentation)

---

## System Overview

The platform serves three audiences from a single Next.js codebase:

| Audience | Entry point | What they get |
|---|---|---|
| **Prospects** | `/` (public site) | Marketing pages, waitlist, signup & Stripe checkout onboarding |
| **Customers** | `/dashboard` and siblings | The full accounting workspace for their organization |
| **Platform operators** | `/admin` | Master Control: clients, subscriptions, plans, support, health, team & security |

Every customer belongs to an **Organization** (the tenant). All accounting activity — invoices, bills, receipts, POS sales, payroll runs, bank imports — ultimately posts **balanced double-entry journals** against the organization's chart of accounts, so reports (P&L, balance sheet, trial balance, AR/AP aging, audit trail) derive from a single ledger of truth.

---

## Architecture

### High-Level Design

```
                        ┌────────────────────────────────────────────┐
                        │                Next.js App                 │
                        │  (App Router, Server Components + Actions) │
                        └───────┬──────────────┬─────────────┬───────┘
                                │              │             │
              ┌─────────────────▼───┐   ┌──────▼──────┐   ┌──▼─────────────┐
              │  (public) marketing │   │ (dashboard) │   │ (admin) portal │
              │  signup /onboarding │   │ customer app│   │ Master Control │
              └─────────┬───────────┘   └──────┬──────┘   └──┬─────────────┘
                        │                      │             │
   proxy.ts (Supabase session refresh on every request; Stripe webhook bypassed)
                        │                      │             │
        ┌───────────────▼──────────────────────▼─────────────▼───────────────┐
        │                     Server Actions → DAL layer                     │
        │   lib/accounting · lib/banking · lib/pos · lib/payroll · lib/admin │
        └───────┬─────────────────────┬───────────────────────┬──────────────┘
                │                     │                       │
      ┌─────────▼─────────┐  ┌────────▼────────┐   ┌──────────▼──────────┐
      │ lib/tenancy guard │  │ Supabase (Auth, │   │ External services   │
      │ (fail-closed org  │  │ Postgres, File  │   │ Stripe · Mistral AI │
      │  scoping on every │  │ Storage)        │   │ SMTP (nodemailer)   │
      │  Prisma call)     │  └─────────────────┘   └─────────────────────┘
      └─────────┬─────────┘
                │
     ┌──────────▼──────────────┐      ┌──────────────────────────┐
     │ Main DB (prisma/)       │      │ Payroll DB               │
     │ ledger, sales, banking, │      │ (prisma-payroll/)        │
     │ POS, admin, auth mirror │      │ separate Postgres client │
     └─────────────────────────┘      └──────────────────────────┘
```

### Application Layers

1. **Pages (Server Components)** — fetch data through DAL functions, enforce auth/permission guards, and pass plain serializable props down.
2. **Client components** (`components/*`) — interactive workspaces (tables, dialogs, filters) that call server actions for mutations and re-render via `router.refresh()` / React Query.
3. **Server actions** (`app/**/actions.ts`) — thin authenticated entry points. They validate input, check the caller's role, and delegate to the DAL.
4. **DAL / domain layer** (`lib/**`) — the real business logic: workspace resolution, ledger posting, money math, reconciliation, template management. Pure logic lives here so it is testable with vitest.
5. **Persistence** — Prisma 7 (with `@prisma/adapter-pg`) over Supabase Postgres, wrapped by the tenancy extension below.

### Route Groups

| Group | Contents |
|---|---|
| `app/(public)` | Marketing site, about, waitlist, login (incl. forgot/update password) |
| `app/signup`, `app/onboarding` | Account creation → plan selection → Stripe Checkout → workspace bootstrap |
| `app/(dashboard)` | The customer workspace: `dashboard`, `sales`, `purchases`, `banking`, `accounting`, `reports`, `taxes`, `payroll`, `pos`, `settings`, `help` |
| `app/(admin)` | `/admin/login` plus the `(protected)` Master Control modules |
| `app/invite` | Workspace team-invitation acceptance flow |
| `app/print` | Print-friendly document rendering (invoices, statements) |
| `app/api` | Route handlers: `webhooks/stripe`, `cron/cleanup-statements` |
| `proxy.ts` | Request middleware — refreshes the Supabase session on every request; the Stripe webhook path bypasses it |

### Multi-Tenancy & Data Isolation

Tenant isolation is enforced **at the data layer**, not just in queries (`lib/tenancy/`):

- **`context.ts`** — an `AsyncLocalStorage`-based tenant context. `enterScopedContext(orgId)` is entered per request by `requireAccountingWorkspace`; `runAsSystem` explicitly opts out for bootstrap/admin paths (greppable by design).
- **`scoped-models.ts`** — a registry of org-scoped Prisma models, kept complete by a DMMF reflection test (adding a model with `organizationId` and forgetting to register it fails CI).
- **`scope.ts`** — pure `applyTenantScope` logic: injects `organizationId` into filters and creates, and **fails closed** — a query on a scoped model with no tenant context and no explicit org filter throws rather than leaking.
- **`extension.ts`** — wires the guard onto every Prisma call via a client extension in `lib/prisma.ts`.
- Raw SQL is policed by a tenancy lint (annotate intentional exceptions with `// tenancy:safe: <reason>`).
- The snake_case `pos_*` tables predate the guard and are excluded from it; `lib/pos/dal.ts` centralizes their auth + manual org scoping instead.

### The Accounting Core

All money movements converge on the ledger (`lib/accounting/`):

- **Chart of accounts** (`ChartAccount`, `AccountTemplate`) — per-org, seeded from templates, with system accounts (Bank 1000, Sales 4000, VAT Payable 2100, Payroll Expenses 7000, PAYE & NI 2200, Pension 2210…) resolved — and lazily created where needed — by `resolveSystemAccount` / `resolveOrCreateSystemAccount`.
- **Journals** (`Journal` + `JournalLine`) — DRAFT → POSTED lifecycle with DB-level immutability triggers on posted journals. `assertJournalBalances` rejects any posting where debits ≠ credits.
- **Money** (`money.ts`) — all amounts are stored as **integer minor units** (pence); VAT rounds half-up; parsing rejects >2 decimals.
- **Document engine** (`documents.ts`) — invoices, bills, sales receipts, refund receipts, credit notes: draft/approve/post flows, collision-safe numbering under concurrency, editable per-document billing-address snapshots, reusable document templates.
- **Sub-ledger posting** — POS sales (`lib/pos/posting.ts`) and payroll runs (`lib/payroll/posting.ts`) post balanced journals linked back via `sourceType`/`sourceId`, with reversal journals for refunds/voids that are dated *today* so they never land in a closed period.
- **Period close** (`period-close.ts`) — postings on or before a closed date are blocked (`gte` boundary, inclusive close sweep).
- **Reports** (`reports.ts`, `dashboard.ts`) — P&L, balance sheet, trial balance, AR/AP aging (aged from today, net of ledger payments), customer statements, audit trail.
- **Audit** — `AuditEvent` rows are written for document and sub-ledger activity.

### Databases

Two Prisma schemas, two Postgres databases:

| Schema | Client | Purpose |
|---|---|---|
| `prisma/schema.prisma` | `lib/prisma.ts` (`DATABASE_URL`) | Main app: organizations, ledger, sales/purchase documents, contacts, tax rates, banking, POS, internal payroll, admin profiles, subscription plans, plus a mirror of Supabase `auth.*` tables |
| `prisma-payroll/schema.prisma` | `lib/payroll-db.ts` (`PAYROLL_DATABASE_URL`) | The standalone WAW Payroll product's database (employees, payroll runs, RTI submissions, P45/P60, HMRC credentials) — surfaced read-mostly in the admin Clients view |

> ⚠️ **Migrations:** the deployed database's migration history has diverged from local. Use `prisma migrate deploy` (never `migrate dev`) against it; recent migrations follow the "direct SQL + recorded migration folder" pattern.

### Authentication & Authorization

- **Customer auth** — Supabase Auth (SSR cookies via `@supabase/ssr`); `proxy.ts` refreshes the session on every request.
- **Workspace roles** — `UserRole` links a user to an organization with a `MemberRole` (owner / accountant / member). Sensitive flows (banking import, POS management, approvals) require the accountant/owner tier. Team invitations flow through `WorkspaceInvitation` + `/invite`.
- **Admin RBAC** — `lib/admin/permissions.ts` is the single registry of grantable admin modules. The sidebar, the admin search, the team permission matrix, and the server-side page guards (`requireAdminPermission`) all derive from it — adding one entry lights up all four. Roles: `SUPER_ADMIN` (implicitly everything), `SUPPORT`, `CUSTOM` (per-module checkboxes stored on `AdminProfile.permissions[]`). Hiding a nav link is cosmetic only; every admin page re-checks its grant server-side.
- **Impersonation** — admins with the `impersonate` grant can "View as" a client. A signed, HMAC'd pass cookie (`IMPERSONATION_SECRET`) scopes the session; a persistent banner shows impersonation is active.

---

## Feature Modules

### Customer Portal

| Module | Highlights |
|---|---|
| **Dashboard** | KPI cards (receivables/payables net of payments), AR/AP aging, activity |
| **Sales** | Invoices, quotes, sales receipts, refund receipts, credit notes, adjustments, customers, customer statements, document templates (modular, per-type), bulk mark-paid with deposit-account selection |
| **Purchases** | Bills, suppliers, expense claims, supplier statements, purchase settings |
| **Banking** | Bank accounts & transactions; **PDF/CSV statement import** — Mistral OCR + LLM layout analysis produces a parsing plan, *code* does the arithmetic, and a running-balance gate blocks unverified imports; AI-assisted transaction matching and reconciliation against the ledger |
| **Accounting** | Chart of accounts (templates, system accounts), journal workspace with server-side pagination, manual journals, period close |
| **Reports** | P&L, balance sheet, trial balance, AR aging, AP aging, org-scoped audit trail |
| **Taxes** | Workspaces for VAT, corporation tax, self-employed, CIS, capital gains, EC sales, forex |
| **POS** | Terminal, inventory/stock with server-side oversell guard, transactions, refunds, reconciliation, reports; sales/refunds post to the ledger; server re-derives all money from DB prices (client totals untrusted) |
| **Payroll** *(internal use)* | Employees, schedules, run payroll (approve posts the ledger journal; reverse voids it), payslips, timesheets, time-off, benefits. UK statutory PAYE/NI engine is designed but shelved — see roadmap in `docs/PROJECT-STATUS.md` §H |
| **Settings** | Organization profile & team access (invite/roles), billing (Stripe customer portal), security |
| **Help & Feedback** | Knowledge base, contact, in-app feedback reporter feeding the admin Feedback Center |

### Admin Portal (Master Control)

| Module | Highlights |
|---|---|
| **Overview** | Platform KPIs, recent signups/conversions (header notification bell) |
| **Clients** | Directory + onboarding tracker across **both databases** (Waw-Profi + Payroll tabs): search/filter, pagination, bulk delete, provision new client (emailed invitation via SMTP), impersonate, wipe workspace data |
| **Subscriptions / Plans / Billing Controls** | Stripe subscription oversight, plan catalog (DB-driven `SubscriptionPlan`), billing extras |
| **Support & Chat, Feedback Center, Feature Requests** | Support inbox, triaged in-app feedback, roadmap voting |
| **System Health / Analytics** | Operational status and support analytics |
| **Accountant** | Client workbench for the accounting practice (UI scaffold; directory clone without the Issues column, actions not yet wired) |
| **Security** | Audit log, RBAC view, IP allow-listing & 2FA controls |
| **Team** | Real admin-user management: create/edit admins, role presets, per-module permission matrix |
| **Settings** | Each admin's own account (always reachable, never permission-gated) |

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Server Components, Server Actions) — ⚠️ this version has breaking changes; consult `node_modules/next/dist/docs/` before assuming older conventions |
| Language / runtime | TypeScript 5, React 19, Node 20 |
| Styling / UI | Tailwind CSS 4, shadcn/Radix UI, lucide-react icons, sonner toasts, Recharts, framer-motion + GSAP (marketing), canvas-confetti (settlement celebration) |
| Data | Prisma 7 (`@prisma/adapter-pg`) over Supabase Postgres ×2 |
| Auth / storage | Supabase Auth (SSR) + Supabase Storage (private `bank_statements` bucket) |
| Payments | Stripe (Checkout, Billing portal, webhooks) |
| AI | Mistral (OCR + analysis/extraction models) for bank-statement scanning |
| Email | nodemailer over SMTP |
| State/query | @tanstack/react-query (client), server components (default) |
| Testing | Vitest |
| Package manager | **pnpm** |
| Hosting | Vercel (incl. Vercel Cron) |

---

## Project Structure

```
waw-profi/
├── app/
│   ├── (public)/          # Marketing, login, waitlist
│   ├── (dashboard)/       # Customer workspace (sales, purchases, banking, …)
│   ├── (admin)/admin/     # Master Control portal (login + (protected) modules)
│   ├── api/               # Stripe webhook, cron route handlers
│   ├── onboarding/        # Plan selection → Stripe checkout → bootstrap
│   ├── signup/ invite/ print/ auth/
├── components/            # Feature-foldered client components
│   ├── accounting/ sales/ purchases/ banking/ reports/ taxes/
│   ├── pos/ payroll/ settings/ onboarding/ marketing/ help/ feedback/
│   ├── admin/             # Master Control UI (shell, clients, team, …)
│   ├── shared/ providers/ ui/  # shadcn primitives & cross-cutting pieces
├── lib/
│   ├── accounting/        # Ledger core: documents, money, reports, period close
│   ├── banking/           # Statement OCR pipeline, matching, posting, DAL
│   ├── pos/ payroll/      # Sub-ledger DALs + journal posting
│   ├── tenancy/           # Fail-closed org-scoping Prisma extension
│   ├── admin/             # Admin auth, permission registry, impersonation
│   ├── supabase/          # Browser/server/proxy Supabase clients
│   ├── onboarding/ feedback/
│   └── prisma.ts stripe.ts payroll-db.ts utils.ts
├── prisma/                # Main schema + migrations + seed
├── prisma-payroll/        # Payroll product schema (second client)
├── tests/                 # Vitest suites (accounting, tenancy, pos, payroll, …)
├── docs/                  # Audits, status ledger, specs/plans, gap analysis
├── proxy.ts               # Request middleware (Supabase session refresh)
└── vercel.json            # Cron: nightly stale-statement cleanup
```

---

## Getting Started

### Prerequisites

- Node.js 20+, **pnpm** (`corepack enable`)
- A Supabase project (Postgres + Auth + Storage)
- Stripe account (test mode is fine)
- Optional: Mistral API key (PDF statement scanning), SMTP credentials (invitation emails), a second Postgres for the payroll DB

### Setup

```bash
pnpm install                 # runs prisma generate for BOTH schemas via postinstall
cp .env.example .env.local   # then fill in the values (see below)

# Apply migrations to your database
pnpm prisma migrate deploy   # ⚠️ use deploy, not migrate dev (history divergence)

# Seed (optional)
pnpm db:seed

pnpm dev                     # http://localhost:3000
```

For statement uploads to work you must also create a **private** `bank_statements` bucket in Supabase Storage.

Admin access: platform admins are marked via the `platform_admin` claim (`scripts/grant-admin.cjs` with the service-role key) and managed thereafter in `/admin` → Team.

---

## Environment Variables

See [.env.example](.env.example) for the annotated list. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only: admin user management, invitations, storage cleanup |
| `DATABASE_URL` / `DIRECT_URL` | ✅ | Main Postgres (Prisma) |
| `PAYROLL_DATABASE_URL` | for payroll views | Second Postgres (payroll product) |
| `NEXT_PUBLIC_BASE_URL` | ✅ | Absolute URLs in emails/redirects |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` | ✅ | Checkout + billing |
| `STRIPE_WEBHOOK_SECRET` | ✅ (deploy) | Verifies `/api/webhooks/stripe` |
| `IMPERSONATION_SECRET` | ✅ | Signs the admin impersonation pass cookie |
| `ADMIN_OTP_SECRET` | ✅ | Signs admin login email-OTP codes and the `admin_otp` verification cookie; admin login fails closed without it |
| `MISTRAL_API_KEY` (+ optional `MISTRAL_OCR_MODEL`, `MISTRAL_ANALYSIS_MODEL`, `MISTRAL_EXTRACTION_MODEL`) | for PDF import | Statement scanning; CSV import works without it |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | for emails | Client/team invitation emails |
| `CRON_SECRET` | ✅ (deploy) | Authorizes Vercel Cron calls to the cleanup route |

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | `prisma generate` (both schemas) + `next build` |
| `pnpm start` | Production server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `lint:fix` | ESLint |
| `pnpm format` / `format:check` | Prettier |
| `pnpm test` / `test:watch` | Vitest (full run takes ~20 min) |
| `pnpm db:seed` | Seed the main database |

---

## Testing

Vitest suites live in `tests/`, mirroring the domain layer: accounting correctness (balancing, VAT rounding, numbering, period close), tenancy (fail-closed scoping + the DMMF completeness guard), POS (isolation, role gating, oversell/amount validation, ledger posting), payroll posting, onboarding checkout (asserts no password ever reaches Stripe metadata), templates and statements.

Conventions worth knowing:

- The tenancy registry test fails if a new org-scoped model isn't registered in `lib/tenancy/scoped-models.ts`.
- Intentional raw SQL must carry `// tenancy:safe: <reason>` to pass the tenancy lint.
- New ledger-touching features should assert **balanced journals** and **idempotency** (see `tests/pos/ledger-posting.test.ts` as a model).

---

## Deployment

Deployed on **Vercel**:

- `vercel.json` schedules `/api/cron/cleanup-statements` nightly at 03:00 (purges stale bank-statement uploads; authorized via `CRON_SECRET`).
- Point a Stripe webhook at `/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET`.
- `proxy.ts` excludes the Stripe webhook and static assets from the Supabase session middleware.
- **Known limit:** Vercel's 4.5 MB request-body cap constrains large PDF statement uploads — see `docs/` (statement upload deploy requirements) before raising upload limits.

See [docs/deployment/vercel.md](docs/deployment/vercel.md) for the full runbook.

---

## Further Documentation

The `docs/` folder is the deep-dive companion to this README:

| Doc | Contents |
|---|---|
| [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md) | **The master ledger** of completed and pending work, decisions, and the feature roadmap |
| [docs/AUDIT-REPORT.md](docs/AUDIT-REPORT.md) / [AUDIT-REPORT-SCOPED.md](docs/AUDIT-REPORT-SCOPED.md) | Full 20-section platform audit (accounting accuracy, security, performance, …) |
| [docs/REMEDIATION-CHECKLIST.md](docs/REMEDIATION-CHECKLIST.md) | Prioritized findings and their status |
| [docs/reference/accounting-system.md](docs/reference/accounting-system.md) | Reference for the accounting engine |
| [docs/guides/accounting-user-guide.md](docs/guides/accounting-user-guide.md) | End-user guide |
| [docs/superpowers/specs](docs/superpowers/specs) & [plans](docs/superpowers/plans) | Design specs + implementation plans for every major feature (tenancy, POS hardening, ledger posting, statement OCR, …) |
| [docs/missing/](docs/missing/README.md) | Gap analysis: architecture, compliance (HMRC MTD/RTI), data models, DevOps, frontend |
| [docs/priority/](docs/priority/README.md) | Prioritized fix-lists (CoA structure/UI, ledger correctness, module integration) |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents working in this repo |

---

*Private, proprietary software of WAW Group Global. Not licensed for redistribution.*
