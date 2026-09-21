# WAW-Profi — Remediation Checklist

> Living tracker for the audit remediation. Source findings: [`AUDIT-REPORT.md`](AUDIT-REPORT.md) (full) and [`AUDIT-REPORT-SCOPED.md`](AUDIT-REPORT-SCOPED.md) (scoped).
> **Legend:** ✅ done · 🔧 in progress · 🧭 needs design/decision · 🚫 deferred (out of scope) · ⬜ open
> **Last updated:** 2026-06-29

---

## Wave 1 — fixed (committed by user separately)

| ✓ | ID | Sev | Finding | File | Verification |
|---|----|-----|---------|------|--------------|
| ✅ | S2 | Critical | Invoice-status update scoped to caller's org (`updateMany` + count guard) | `app/sales/invoices/actions.ts` | typecheck + suite |
| ✅ | S3 | Critical | Audit-trail query + user fetch scoped to `organizationId` | `app/reports/audit-trail/page.tsx` | typecheck + suite |
| ✅ | S7 | Medium | `runAiMatch` / `importStatement` now require accountant role | `app/banking/actions.ts` | typecheck + suite |
| ✅ | A4 | High | `approveInvoice`/`approveBill` assert debits==credits before posting | `lib/accounting/documents.ts` | new test `invoice-balance-vat` |
| ✅ | A5 | High | VAT rounds half-up instead of truncating | `lib/accounting/documents.ts` | new test |
| ✅ | A6 | High | `toMinor` exact integer parsing (signed, rejects 3-dec) | `lib/banking/dal.ts` | new test cases |
| ✅ | A3 | Critical | Opening-balance reset = reversing journal, not trigger-bypass delete | `lib/banking/dal.ts` | rewrote `banking-dal` test |
| ✅ | S6 | High | `reconcileFeed` validates journal is in-org + POSTED | `lib/banking/dal.ts` | typecheck + suite |
| ✅ | — | Bug | Invoice/bill numbering numerically ordered (no INV-9999 break) | `lib/accounting/documents.ts` | typecheck |

**Wave 1 gate:** `pnpm typecheck` → exit 0 · `pnpm test` → 71/71 across 10 files. ✅
**Note:** A3 changes observable behavior — replacing an opening balance now leaves original + reversal in the ledger (history preserved) instead of erasing it.

---

## Needs design / decision (not mechanical)

| ✓ | ID | Sev | Item | Why it's not a quick fix |
|---|----|-----|------|--------------------------|
| ✅/🧭 | S4 | Critical | **Tenant isolation — Phase 1 DONE** (app-level guarantee: AsyncLocalStorage context + fail-closed Prisma extension + dmmf-completeness + raw-SQL lint). **Phase 2 (DB-enforced RLS) still open** — non-owner Prisma role + `FORCE ROW LEVEL SECURITY`. | Phase 1 landed via `lib/tenancy/*` + `tests/tenancy/*`; surfaced & fixed 9 latent missing-org-filter bugs. Phase 2 deferred: policies use `auth.uid()` which Prisma sessions don't set — needs session-GUC + policy rewrite. Spec/plan in `docs/superpowers/`. |
| 🧭 | S4 | Critical | **Rotate secrets** (service-role key, DB password, Stripe key, `IMPERSONATION_SECRET`) | Must be done by you in Supabase/Stripe dashboards; cannot be automated from here. |
| 🧭 | S8 | Medium | Tamper-evident audit log | Design choice: hash-chain vs append-only DB trigger + revoke UPDATE/DELETE. |
| 🧭 | A7 | Medium | Multi-currency + FX gain/loss | Real feature build; needs schema + posting design. Brainstorm first. |
| 🧭 | A8 | Medium | Period-close `gte` vs `gt` | Genuine accounting judgment — current `gte` may be correct (blocks post-close same-date entries that would escape the sweep). Decide policy. |

---

## Lower-priority bugs / performance (schedule after design items)

| ✓ | Item | File |
|---|------|------|
| ⬜ | Dashboard AR/AP aging uses full total (no payment subtraction) — disagrees with AR report; hardcoded anchor date `2026-05-18` | `lib/accounting/dashboard.ts`, `components/accounting/ar-aging-view.tsx` |
| ⬜ | Dashboard aggregates a full year of journal lines in JS (move to SQL) | `lib/accounting/dashboard.ts:43` |
| ⬜ | `getJournalList` / invoice list fetch all rows, no pagination | `lib/accounting/dal.ts`, documents |
| ⬜ | BigInt→Number downcast + inline `/100` float division inconsistency | dal / reports / dashboard |
| ⬜ | Invoice-numbering residual concurrency race (retry on P2002) | `lib/accounting/documents.ts` |
| ⬜ | `Invoice.organizationId` / `Bill.organizationId` are nullable — null-org rows are invisible to all tenants; add NOT NULL after backfill (surfaced during tenancy Phase 1 review) | `prisma/schema.prisma` |

---

## Deferred — out of scope (POS / Payroll / onboarding descoped)

| ✓ | ID | Sev | Finding | Note |
|---|----|-----|---------|------|
| 🚫 | A1 | Critical | Payroll posts no journal entries | Re-open if Payroll is brought back in scope |
| 🚫 | A2 | Critical | POS sales post nothing to the ledger | Re-open with POS |
| 🚫 | S1 | Critical | POS module unauthenticated + hardcoded org | Re-open with POS — **do not ship POS as-is** |
| 🚫 | S5 | High | Plaintext password → Stripe metadata | Re-open with onboarding |
| 🚫 | — | — | POS negative-inventory / oversell guards; POS/payroll audit-event coverage | Deferred with modules |

---

## Done-definition for each fix
A finding is ✅ only when: code changed · `pnpm typecheck` clean · relevant test added/updated and passing · behavior change (if any) noted here.
