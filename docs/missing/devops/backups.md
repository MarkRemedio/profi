# Backups & PITR

**Status:** Missing
**Category:** DevOps / Quality

## What this is

A documented, tested backup + point-in-time-recovery strategy for the production Postgres, plus retention for object-storage attachments.

## Current state

- Relying implicitly on Supabase's managed backups (assumed but not documented).
- No restore drill on record.
- No offsite / cross-region copy.
- Object storage retention policy: not defined.

## Why it's needed

- A finance product losing ledger data is existential. The acceptable RPO is small.
- HMRC retention is 6 years; backups must survive that long.

## Recommended approach

- Confirm Supabase plan provides PITR; if not, upgrade or add a logical-backup job (`pg_dump` to S3 daily, WAL archiving for PITR).
- Cross-region replica or daily off-platform copy.
- Quarterly restore drills into a scratch project — and document the runbook.
- Lifecycle the attachments bucket: soft-delete + 30-day grace + cold storage after 1 year.

## Implementation notes

- Test restore time, not just that backups exist.
- Encrypt at rest; rotate keys.

## Related

- [Data migrations](data-migrations.md), [GDPR](../cross-cutting/gdpr.md), [Attachments](../data-models/attachments.md)
