# Adaptive Bank Statement OCR — Design Spec

**Date:** 2026-07-26
**Status:** Approved
**Approach:** LLM decides structure, deterministic code does arithmetic, balance reconciliation gates every import

## Overview

Bank statement PDF import currently OCRs to markdown and then maps columns with fixed
header keywords. Live testing on 2026-07-26 against two real statements showed the OCR
call itself works well while the mapping layer fails completely: a cleanly OCR'd Barclays
statement (33 transaction rows) imported **0 rows**, and a utility bill imported **35
fabricated transactions**.

This redesign replaces the fixed keyword mapping with a per-document analysis step. A
language model inspects the OCR'd document and returns a **layout plan** — which table
holds the ledger, which column is which, what the date format and statement period are.
Deterministic code then executes that plan over the OCR'd cells, so on the primary path
**no amount is ever retyped by a model**. A secondary path (§4) does ask the model to
extract transactions directly, but only after the primary path has failed, and its output
faces the same verification. Every import is verified against the statement's own opening
and closing balances before it can touch the ledger.

## Problems being fixed

Confirmed by live test, all in `lib/banking/column-mapping.ts`:

1. **`parseDate` has no year-less branch.** Barclays emits `"07 Mar"`; the month-name
   regex requires a 4-digit year, so `applyMapping` drops every row. Verified:
   `parseDate("07 Mar") === null`.
2. **`findColumn` uses naked substring matching.** The `"in"` credit keyword matches
   `"Vending"` and `"Closing Balance"`. Verified:
   `suggestMapping(["Date","Description","Closing Balance"])` → `["date","description","credit"]`.
3. **Continuation rows are dropped.** Barclays leaves the date cell blank on
   multi-transaction days; those rows vanish even once (1) is fixed.
4. **Failures are silent.** OCR errors only `console.error` and fall through to a local
   regex parser, so a broken import looks like an empty one.
5. **The local fallback produces wrong data.** On the utility bill it regex-matched
   decimal usage figures as amounts, inventing dates spanning 2001→2031.

## Decisions made during brainstorming

- **Automation:** fully automatic. No column-picking UI for PDFs; the user reviews the
  final preview and imports.
- **Document scope:** bank and card statements only. Anything else is rejected with a
  stated reason rather than silently producing rows.
- **Verification:** hard gate. An extraction that does not reconcile against the
  statement's balances cannot be imported.
- **Local regex fallback:** deleted. A fallback that yields plausible-but-wrong money
  data is worse than no import.
- **Gate fallback:** when no opening/closing balance line exists, check the per-row
  running-balance column; if that is absent too, block with an explicit user override.
- **Loading progress:** timed stage advance, not streaming.

## 1. Module layout

Each module has one responsibility and is testable in isolation.

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/banking/mistral-ocr.ts` *(exists, trimmed)* | PDF → page markdown → pipe-tables | Mistral OCR API |
| `lib/banking/statement-analysis.ts` *(new)* | markdown + headers → `StatementPlan`; the only LLM-reasoning step | Mistral chat API |
| `lib/banking/statement-plan.ts` *(new)* | execute a `StatementPlan` over tables → transactions; pure, no I/O | `column-mapping` |
| `lib/banking/statement-reconcile.ts` *(new)* | balance gate; pure integer arithmetic | — |
| `lib/banking/statement-parser.ts` *(exists, rewritten)* | orchestration and failure modes only | all of the above |
| `lib/banking/column-mapping.ts` *(exists, fixed)* | column roles, date/amount parsing | — |

`transactionsFromMarkdown` moves out of `mistral-ocr.ts` into `statement-plan.ts`;
`mistral-ocr.ts` is left doing OCR only. `parsePdf` and the `unpdf` dependency are removed.

## 2. The StatementPlan

Returned by `analyzeStatement` via Mistral structured output. Fixed size regardless of
statement length, so cost and latency do not scale with page count.

```ts
export type StatementPlan = {
  isBankStatement: boolean;
  rejectReason: string | null;      // set when isBankStatement is false
  currency: string;                 // ISO code, e.g. "GBP"
  statementPeriod: { start: string; end: string } | null;  // YYYY-MM-DD
  openingBalance: string | null;    // raw text, parsed by parseAmount
  closingBalance: string | null;
  ledgerTableIndexes: number[];     // indexes into extractMarkdownTables() output
  columns: {
    date: number;
    description: number;
    debit: number | null;
    credit: number | null;
    amount: number | null;          // single signed column, when debit/credit absent
    balance: number | null;
  };
  dateHasYear: boolean;
  dateFillDown: boolean;
  signConvention: "separateColumns" | "signedAmount" | "negativeIsDebit";
};
```

**Model:** `mistral-small-latest`, overridable via `MISTRAL_ANALYSIS_MODEL`. The task is
structural classification, not heavy reasoning. Path B (§4) escalates to
`mistral-large-latest`.

The prompt supplies the full OCR markdown plus an enumerated list of extracted tables with
their headers and first two rows, and asks only structural questions. It is explicitly
instructed never to return transaction amounts.

## 3. Data flow

```
PDF
 > mistral-ocr:  OCR > page markdown > extractMarkdownTables()
 > statement-analysis:  analyzeStatement(markdown, tables) > StatementPlan
      > isBankStatement === false  -> reject (NotAStatement)
      > ledgerTableIndexes empty   -> reject (NoLedgerFound)
 > statement-plan:  applyPlan(tables, plan) > ParsedTransaction[]
 > statement-reconcile:  reconcile(plan, transactions)
      > pass  -> return
      > fail  -> path B retry (§4) -> reconcile again
                    > fail -> reject (ReconciliationFailed)
```

Amounts come verbatim from OCR'd cells at the `applyPlan` step. The model never handles a
number that reaches the ledger.

## 4. Path B fallback

Triggered when `applyPlan` yields zero transactions, or the reconciliation gate fails on
the path-A result. One retry only.

`extractTransactionsDirectly(markdown)` asks `mistral-large-latest` for the transaction
array itself via structured output. Its result faces the **same reconciliation gate** — a
path-B extraction that does not balance is rejected exactly like a path-A one. This bounds
the risk of model-transcribed amounts: they can only enter the ledger if they
independently reconcile against the statement's own balances.

## 5. column-mapping.ts fixes

**Year-less dates.** `parseDate(raw, ctx?)` gains an optional
`{ periodStart: string; periodEnd: string }` context. `"07 Mar"` with a period of
`2026-03-07 → 2026-04-08` resolves to `2026-03-07`. Year is inferred per row by rule:
take the candidate year that places the resulting date inside `[periodStart, periodEnd]`.
Exactly one of `periodStart.year` / `periodEnd.year` satisfies this for a statement
spanning a year boundary; when both satisfy it (a period inside one calendar year) they
are equal anyway. If neither places the date in range — meaning the row's date lies
outside the stated period — the row is treated as unparseable and skipped, and the
resulting count mismatch surfaces through the reconciliation gate. When the period is
absent entirely, year-less dates remain unparseable and the plan is rejected rather than
guessed.

**Date fill-down.** When `plan.dateFillDown` is set, a row with an empty date cell
inherits the previous row's resolved date. A row empty in both date and all amount columns
is still skipped, so trailing layout rows do not become transactions.

**Word-boundary column matching.** `findColumn` matches keywords on word boundaries
(`/\bin\b/`) instead of `String.includes`. This also fixes the CSV import path, which
carries the same latent bug today.

CSV import is otherwise unchanged. Its manual remap UI works and needs no LLM step.

## 6. Reconciliation gate

`reconcile(plan, transactions)` in pennies, integer arithmetic only:

```
openingBalance + sum(credits) - sum(debits) === closingBalance
```

Exact equality, zero tolerance — the inputs are integers and a real discrepancy of one
penny is a real error.

Resolution order when balances are unavailable:

1. **Both balances present** → run the check above.
2. **Balances absent, running-balance column present** → verify each row's balance equals
   the previous row's balance plus that row's movement; the check passes only if the whole
   chain is consistent.
3. **Neither available** → block with `Unverifiable`, and surface an explicit override
   checkbox in the import modal: *"I've checked these figures myself."* The import
   proceeds only when the user ticks it. The override is recorded on the resulting
   statement record for audit.

## 7. Failure modes

Typed errors from `statement-parser.ts`. All block the import; all explain themselves in
the modal.

| Error | User-facing message |
|---|---|
| `NotAStatement` | "This looks like a utility bill, not a bank statement — no transaction ledger found." |
| `NoLedgerFound` | "Couldn't find a transaction table in this document." |
| `ReconciliationFailed` | "Extracted 21 transactions, but they're £1,147.80 short of the statement's closing balance. Nothing was imported." |
| `Unverifiable` | "This statement has no balance totals, so the figures couldn't be checked automatically." + override checkbox |
| `OcrUnavailable` | "Statement scanning is unavailable — check MISTRAL_API_KEY." |

`ReconciliationFailed` always states the signed discrepancy; that number is what makes a
silent partial extraction diagnosable.

## 8. Loading experience

Replaces the single boolean spinner at `import-statement-modal.tsx:347`. Four stages
mirroring the real pipeline:

```
[x] Reading document          (OCR)
[o] Working out the layout    (analysis)
[ ] Extracting transactions
[ ] Checking the balances
```

Completed stages show a check, the active stage animates, later stages are dimmed. When
the path-B retry fires, stage 3 relabels to "Retrying extraction" rather than stalling
silently.

Beneath the stages, a **preview skeleton** replaces the transaction table: rows of
`Skeleton` bars matching the real column widths, following the existing
`components/ui/skeleton.tsx` convention. On failure the skeleton is replaced by the typed
error from §7.

**Advance mechanism:** timed, calibrated against measured stage durations (OCR ~2–3s,
analysis ~1–3s). The final stage holds until the server action returns, so no stage
falsely claims completion. Labels describe activity, not completion.

## 9. Testing

Mistral is mocked throughout CI — no live calls, no cost, deterministic runs.

**Fixtures.** OCR markdown captured from the two real statements, checked in **redacted**.
The source PDFs contain real personal data (full name, home address, account number, sort
code, IBAN) and must not be committed; `pdfs/` is added to `.gitignore` as part of this
work.

**Unit coverage:**

- `parseDate` — year-less resolution, year-boundary (Dec→Jan) inference, absent-period rejection
- date fill-down, including the both-empty skip case
- word-boundary `findColumn`, with `"Vending"` and `"Closing Balance"` as regression cases
- `applyPlan` over the Barclays fixture → expect 33 transactions
- `applyPlan` over the utility-bill fixture → expect rejection, not rows
- `reconcile` — passing case, failing case with correct signed discrepancy, running-balance
  chain fallback, and the unverifiable case
- orchestration — path-B triggered on path-A gate failure, and path-B result still gated

**Live test:** one opt-in test behind an env flag for manual verification against real
files, never run in CI.

## Out of scope

- Streaming progress events (rejected in favour of timed advance)
- CSV import changes beyond the shared `findColumn` fix
- Support for invoices, receipts, or utility bills as transaction sources
- Multi-currency conversion — `plan.currency` is captured and stored, but a statement whose
  currency differs from the bank account's is a separate concern
