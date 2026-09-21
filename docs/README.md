# WAWPROFI documentation

Top-level index. Documentation is organised into four sections.

## [priority/](priority/) — Audit-driven priority work

Items from the **WAWPROFI Audit (May 15 2026)**. These are real bugs and gaps the auditor reproduced in the running app, with the bank-account sync flagged as top priority. Address before tackling the broader gap analysis in `missing/`.

- [Chart of Accounts — UI issues](priority/coa-ui/)
- [Chart of Accounts — code structure](priority/coa-structure/)
- [Module integration with the COA](priority/module-integration/)
- [Ledger correctness / posting](priority/ledger-correctness/)

## [missing/](missing/) — Gap analysis vs. accounting-grade target

A broader catalogue of layers and integrations not yet present, derived from [context/accounting_software_overview.md](../context/accounting_software_overview.md) and [analysis.md](../analysis.md). Use after the priority items are cleared.

- [Architecture / backend layers](missing/architecture/)
- [Data-model gaps](missing/data-models/)
- [Compliance / integrations](missing/compliance/)
- [Cross-cutting concerns](missing/cross-cutting/)
- [DevOps / quality](missing/devops/)
- [Frontend layers](missing/frontend/)
- [UI-only stubs awaiting backends](missing/ui-stubs/)

## [reference/](reference/) — Current-state technical reference

How the app is built today — schema, layers, posting logic. The source of truth for what *is*, not what *will be*.

- [Accounting system overview](reference/accounting-system.md)

## [guides/](guides/) — User-facing guides

Plain-language documentation for accountants, bookkeepers, and business owners.

- [Accounting user guide](guides/accounting-user-guide.md)
