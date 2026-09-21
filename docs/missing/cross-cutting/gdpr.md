# GDPR data export / erasure

**Status:** Missing
**Category:** Cross-cutting

## What this is

The data-protection workflows: per-user data export (Article 15), erasure (Article 17), data processing records, consent log, and retention policy.

## Current state

- No data-export endpoint.
- No erasure workflow (a financial record cannot just be deleted for legal-retention reasons — needs an anonymisation path).
- No consent or processing log.

## Why it's needed

- Legal requirement in EU/UK.
- Erasure interacts awkwardly with statutory retention (HMRC: 6 years for VAT records). The product must distinguish "delete user account" from "delete financial history" — usually anonymise the user, retain the records.

## Recommended approach

- `/account/data-export` Server Action that bundles user's personal data and emails a download link.
- `/account/erasure` flow: anonymise user's personal fields, retain ledger rows (replace name with "Former user"), record the erasure event.
- Document the legal basis + retention policy in-app and accept consent on signup.

## Implementation notes

- Run export as a [background job](../architecture/background-jobs.md) — can be large.
- Anonymise rather than delete on contacts that have transactions; full delete only if no FK references exist.

## Related

- [Audit-trail UI](audit-trail-ui.md), [Attachments](../data-models/attachments.md), [Background jobs](../architecture/background-jobs.md)
