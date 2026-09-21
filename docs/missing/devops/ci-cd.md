# CI/CD pipelines

**Status:** Missing
**Category:** DevOps / Quality

## What this is

Automated pipelines that lint, typecheck, test, build, and deploy on every PR and merge.

## Current state

- No `.github/workflows/` in repo.
- Husky + lint-staged exist for pre-commit ([package.json:21-29](../../../package.json#L21-L29)) — local-only.
- `commitlint.config.js` is present but unenforced server-side.

## Why it's needed

- Pre-commit hooks can be skipped; server-side enforcement is the only reliable gate.
- Multi-developer workflow needs PR previews and automated quality checks.

## Recommended approach

- GitHub Actions:
  - `pr.yml` — lint, typecheck, unit tests, build, smoke E2E.
  - `main.yml` — full E2E, deploy to staging, run migrations.
  - `release.yml` — manual deploy to production with approval.
- Add commitlint as a check job.
- Block merge on red.

## Implementation notes

- Cache `node_modules` and Prisma client between runs.
- Run Prisma `migrate deploy` in a separate job that can fail without holding back code build.
- Preview environments per PR (Vercel does this natively).

## Related

- [Tests](tests.md), [E2E](e2e.md), [Docker](docker.md), [Env management](env-management.md)
