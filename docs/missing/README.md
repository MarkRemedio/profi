# Missing Technology / Layers — Index

Each file describes one gap between WAWPROFI's current state and the "accounting-grade" target laid out in [context/accounting_software_overview.md](../../context/accounting_software_overview.md) and [analysis.md](../../analysis.md).

Status legend: **Missing** = not started, **Partial** = some scaffolding exists, **Stub** = UI only / mocked.

## Architecture / Backend layers

- [HTTP API layer](architecture/http-api-layer.md)
- [Service / domain layer](architecture/service-domain-layer.md)
- [Background jobs / queues](architecture/background-jobs.md)
- [Webhook infrastructure](architecture/webhooks.md)
- [Caching layer](architecture/caching-layer.md)
- [Rate limiting / WAF](architecture/rate-limiting.md)
- [Email service](architecture/email-service.md)
- [File storage / attachments](architecture/file-storage.md)
- [PDF generation](architecture/pdf-generation.md)

## Data model gaps

- [Payments & allocations](data-models/payments.md)
- [Bank accounts / transactions / reconciliation](data-models/bank-models.md)
- [Credit notes & refunds](data-models/credit-notes.md)
- [Attachments](data-models/attachments.md)
- [Tracking categories / departments / projects](data-models/tracking-categories.md)
- [Reporting periods & locks](data-models/reporting-periods.md)
- [Tax returns (VAT/MTD persistence)](data-models/tax-returns.md)
- [Fixed assets & depreciation](data-models/fixed-assets.md)
- [Budgets](data-models/budgets.md)
- [Recurring invoices / journals](data-models/recurring-transactions.md)
- [Exchange rates / FX revaluation](data-models/exchange-rates.md)
- [Inventory / products / stock movements](data-models/inventory.md)
- [POS sales / tills / shifts](data-models/pos-models.md)

## Compliance / Integrations

- [HMRC MTD VAT](compliance/hmrc-mtd-vat.md)
- [HMRC PAYE RTI / FPS](compliance/hmrc-paye-rti.md)
- [CIS filing](compliance/cis-filing.md)
- [Corporation tax / iXBRL](compliance/corporation-tax.md)
- [Bank feeds (Plaid/TrueLayer/GoCardless)](compliance/bank-feeds.md)
- [Payment processors (Stripe, etc.)](compliance/payment-processors.md)
- [Companies House / VIES lookups](compliance/companies-house-vies.md)
- [eInvoicing (Peppol)](compliance/e-invoicing.md)

## Cross-cutting

- [Observability (logs/metrics/traces)](cross-cutting/observability.md)
- [Product analytics](cross-cutting/analytics.md)
- [Feature flags](cross-cutting/feature-flags.md)
- [Notifications](cross-cutting/notifications.md)
- [Internationalisation / localisation](cross-cutting/i18n.md)
- [MFA / SSO](cross-cutting/mfa-sso.md)
- [RBAC enforcement](cross-cutting/rbac.md)
- [Tenant isolation (RLS)](cross-cutting/tenant-isolation.md)
- [Audit-trail UI](cross-cutting/audit-trail-ui.md)
- [GDPR data export / erasure](cross-cutting/gdpr.md)

## DevOps / Quality

- [Test coverage](devops/tests.md)
- [E2E test framework](devops/e2e.md)
- [CI/CD pipelines](devops/ci-cd.md)
- [Containerization](devops/docker.md)
- [Env management](devops/env-management.md)
- [Data migrations strategy](devops/data-migrations.md)
- [Backups & PITR](devops/backups.md)
- [API versioning](devops/api-versioning.md)

## Frontend

- [Form layer (react-hook-form)](frontend/form-layer.md)
- [Shared client+server validation (zod)](frontend/shared-validation.md)
- [Error boundaries / error pages](frontend/error-boundaries.md)
- [Storybook / design-system docs](frontend/storybook.md)
- [Accessibility testing](frontend/accessibility.md)
- [PWA / offline mode](frontend/pwa-offline.md)
- [Data-fetching consistency](frontend/data-fetching.md)

## UI-only modules awaiting backends

- [POS module](ui-stubs/pos.md)
- [Tax module screens](ui-stubs/taxes.md)
- [`quotes/` vs `qoutes/` typo duplicate](ui-stubs/quotes-typo.md)
