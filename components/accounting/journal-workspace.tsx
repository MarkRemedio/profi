"use client";

import { useCurrency } from "@/components/currency-provider";
import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreVertical,
  Check,
  Plus,
  RotateCcw,
  Scale,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DOC_CELL_INPUT_CLS,
  DOC_INPUT_CLS,
  DOC_LABEL_CLS,
  DOC_TH_CLS,
  SectionCard,
  SectionHead,
} from "@/components/documents/document-form-chrome";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { poundsToMinor } from "@/lib/accounting/money";
import type { AccountOption, JournalListItem } from "@/lib/accounting/dal";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  createDraftJournal,
  deleteDraftJournal,
  postJournal,
  reversePostedJournal,
  type JournalInput,
} from "@/app/(dashboard)/accounting/journals/actions";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
};

type JournalWorkspaceProps = {
  accounts: AccountOption[];
  journals: JournalListItem[];
  pagination: Pagination;
  canManage: boolean;
  dateFormat: string;
};

type DraftLine = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
};

// The workspace keeps UK books, so a document is dated by the business's own
// calendar rather than whatever clock the browser happens to be on. Someone
// working from a timezone ahead of London would otherwise raise invoices dated
// into the future, which then fall outside every "as at today" report.
function today() {
  return accountingToday();
}

function formatJournalDate(value: string, dateFormat: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;

  if (dateFormat === "DD/MM/YYYY") return `${day}/${month}/${year}`;
  if (dateFormat === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  return `${year}-${month}-${day}`;
}

const emptyLine = (): DraftLine => ({
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
});

export function JournalWorkspace({
  accounts,
  journals,
  pagination,
  canManage,
  dateFormat,
}: JournalWorkspaceProps) {
  const { format: formatMinor } = useCurrency();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);
  const [journalDate, setJournalDate] = useState(today());
  const [autoReversalDate, setAutoReversalDate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  /* Whether saving has been tried. Errors wait for it, so an untouched form
     is empty rather than wrong. */
  const [touched, setTouched] = useState(false);
  /** The line on its way out, held so its exit can play before the data goes. */
  const [removingLineIndex, setRemovingLineIndex] = useState<number | null>(null);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        try {
          acc.debit += line.debit.trim() ? poundsToMinor(line.debit) : BigInt(0);
          acc.credit += line.credit.trim()
            ? poundsToMinor(line.credit)
            : BigInt(0);
        } catch {
          acc.invalid = true;
        }
        return acc;
      },
      { debit: BigInt(0), credit: BigInt(0), invalid: false }
    );
  }, [lines]);

  const difference = totals.debit - totals.credit;
  const hasAllAccounts = lines.every((line) => line.accountId !== "");
  const hasLineErrors = lines.some(
    (line) =>
      (line.debit.trim() && line.credit.trim()) ||
      (!line.debit.trim() && !line.credit.trim() && line.accountId)
  );
  const isBalanced =
    difference === BigInt(0) &&
    totals.debit > BigInt(0) &&
    !totals.invalid &&
    hasAllAccounts &&
    !hasLineErrors;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    );
  }

  function removeLine(index: number) {
    setLines((current) => {
      if (current.length <= 2) return current;
      return current.filter((_, lineIndex) => lineIndex !== index);
    });
  }

  function resetForm() {
    setJournalDate(today());
    setAutoReversalDate("");
    setMemo("");
    setLines([emptyLine(), emptyLine()]);
    setTouched(false);
  }

  function runAction(
    action: () => Promise<void>,
    success: string,
    onSuccess?: () => void
  ) {
    setStatus(null);
    startTransition(async () => {
      try {
        await action();
        setStatus({ kind: "success", text: success });
        onSuccess?.();
        router.refresh();
      } catch (error) {
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    });
  }

  function submitDraft() {
    const payload: JournalInput = {
      journalDate,
      status: "draft",
      autoReversalDate: autoReversalDate || null,
      memo,
      lines,
    };

    runAction(
      async () => createDraftJournal(payload),
      "Draft journal saved.",
      resetForm
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Manual Journals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Post balanced double-entry adjustments directly into the ledger.
          </p>
        </div>
      </div>

      {status ? (
        <div
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error"
              ? "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
          }
        >
          {status.text}
        </div>
      ) : null}

      <section className="space-y-4">
        <SectionCard>
          <SectionHead title="New journal entry" badge="Double entry">
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              disabled={!canManage}
            >
              <Plus className="size-3.5" />
              Add line
            </Button>
          </SectionHead>

          <div className="space-y-4 p-4">
            {/* Said once, in words somebody who is not an accountant can act
                on. The old copy — "post balanced double-entry adjustments
                directly into the ledger" — describes the mechanism to a reader
                who already knows it, and nothing at all to anyone else. */}
            <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs leading-relaxed text-blue-900">
              Every entry moves an amount between two accounts. What comes{" "}
              <span className="font-semibold">in</span> goes under{" "}
              <span className="font-semibold">Debit</span>, what goes{" "}
              <span className="font-semibold">out</span> under{" "}
              <span className="font-semibold">Credit</span>, and the two columns
              must reach the same total before this can be saved.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <label className={DOC_LABEL_CLS} htmlFor="journal-memo">
                  What is this for?
                </label>
                <input
                  id="journal-memo"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="Month-end adjustment"
                  className={DOC_INPUT_CLS}
                />
              </div>
              <div>
                <label className={DOC_LABEL_CLS} htmlFor="journal-date">
                  Date
                </label>
                <input
                  id="journal-date"
                  type="date"
                  value={journalDate}
                  onChange={(event) => setJournalDate(event.target.value)}
                  className={DOC_INPUT_CLS}
                />
              </div>
              <div>
                <label className={DOC_LABEL_CLS} htmlFor="journal-reversal">
                  Reverse automatically
                  <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <input
                  id="journal-reversal"
                  type="date"
                  value={autoReversalDate}
                  onChange={(event) => setAutoReversalDate(event.target.value)}
                  className={DOC_INPUT_CLS}
                />
              </div>
            </div>

            {/* A table rather than a stack of cards. Debits and credits are
                columns to be compared down the page, which is the one thing a
                column of boxes each holding both makes impossible.

                That argument runs out on a phone, where five columns do not
                fit and the comparison is lost either way. Below md the same
                rows re-lay out as labelled cards — see `doc-table-stack` in
                globals.css — rather than making the reader push a 720px table
                sideways through a 390px window. */}
            <div className="overflow-x-auto md:rounded-lg md:border md:border-slate-200">
              <table className="doc-table-stack w-full border-collapse text-sm md:min-w-[720px]">
                <thead>
                  <tr>
                    <th className={DOC_TH_CLS}>Account</th>
                    <th className={DOC_TH_CLS}>Description</th>
                    <th className={cn(DOC_TH_CLS, "text-right")}>Debit (in)</th>
                    <th className={cn(DOC_TH_CLS, "text-right")}>Credit (out)</th>
                    <th className={cn(DOC_TH_CLS, "w-10")}>
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const bothSides = Boolean(line.debit.trim() && line.credit.trim());
                    /* Nothing is wrong until somebody has had a go at it. This
                       opened with every account box outlined in red and an
                       error beneath, which reads as a broken screen rather than
                       an empty one. */
                    const showAccountError = touched && !line.accountId;

                    return (
                      <tr
                        key={index}
                        className={cn(
                          "document-row border-t border-slate-100 align-top transition-colors hover:bg-blue-50/40",
                          index === removingLineIndex && "document-row-leaving"
                        )}
                      >
                        <td className="px-2 py-2" data-label="Account">
                          <select
                            aria-label={`Line ${index + 1} account`}
                            value={line.accountId}
                            onChange={(event) =>
                              updateLine(index, { accountId: event.target.value })
                            }
                            className={cn(
                              DOC_CELL_INPUT_CLS,
                              "h-9 min-w-[190px]",
                              showAccountError && "border-red-300 bg-red-50"
                            )}
                          >
                            <option value="">Choose an account</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} - {account.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2" data-label="Description">
                          <input
                            aria-label={`Line ${index + 1} description`}
                            value={line.memo}
                            onChange={(event) => updateLine(index, { memo: event.target.value })}
                            placeholder="What this line covers"
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 min-w-[160px]")}
                          />
                        </td>
                        <td className="px-2 py-2" data-label="Debit (in)">
                          <input
                            aria-label={`Line ${index + 1} debit`}
                            value={line.debit}
                            onChange={(event) =>
                              updateLine(index, {
                                debit: event.target.value,
                                credit: event.target.value ? "" : line.credit,
                              })
                            }
                            placeholder="0.00"
                            inputMode="decimal"
                            className={cn(
                              DOC_CELL_INPUT_CLS,
                              "h-9 w-28 text-right font-mono",
                              bothSides && "border-red-300 bg-red-50"
                            )}
                          />
                        </td>
                        <td className="px-2 py-2" data-label="Credit (out)">
                          <input
                            aria-label={`Line ${index + 1} credit`}
                            value={line.credit}
                            onChange={(event) =>
                              updateLine(index, {
                                credit: event.target.value,
                                debit: event.target.value ? "" : line.debit,
                              })
                            }
                            placeholder="0.00"
                            inputMode="decimal"
                            className={cn(
                              DOC_CELL_INPUT_CLS,
                              "h-9 w-28 text-right font-mono",
                              bothSides && "border-red-300 bg-red-50"
                            )}
                          />
                        </td>
                        <td className="px-1 py-2 text-center" data-role="remove">
                          <button
                            type="button"
                            aria-label={`Remove line ${index + 1}`}
                            disabled={!canManage || lines.length <= 2 || removingLineIndex !== null}
                            onClick={() => {
                              setRemovingLineIndex(index);
                              window.setTimeout(() => {
                                removeLine(index);
                                setRemovingLineIndex(null);
                              }, 180);
                            }}
                            className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                          >
                            <X className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/70 text-sm">
                    <td className="px-2 py-2.5 font-semibold text-slate-600" colSpan={2}>
                      Totals
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-900" data-label="Debit (in)">
                      {formatMinor(totals.debit)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-900" data-label="Credit (out)">
                      {formatMinor(totals.credit)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* The one thing deciding whether this can be saved, given as a
                state rather than a number to be interpreted. A difference of
                zero used to print in red, which says "wrong" about the only
                figure that means it is right. */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-white",
                isBalanced
                  ? "bg-gradient-to-br from-emerald-700 to-emerald-600"
                  : "bg-gradient-to-br from-slate-900 to-blue-800"
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em]">
                {isBalanced ? <Check className="size-4" /> : <Scale className="size-4" />}
                {isBalanced ? "Balanced" : "Not balanced yet"}
              </span>
              <span className="text-right">
                {difference === BigInt(0) ? (
                  <span className="text-sm font-semibold text-white/80">
                    {totals.debit > BigInt(0)
                      ? "Debits and credits match."
                      : "Enter the amounts to balance."}
                  </span>
                ) : (
                  <>
                    <span className="mr-2 text-sm text-white/70">
                      {difference > BigInt(0) ? "Credits short by" : "Debits short by"}
                    </span>
                    <span className="text-xl font-extrabold tabular-nums">
                      {formatMinor(difference < BigInt(0) ? -difference : difference)}
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Only after an attempt, and only the first thing in the way. A
                stack of three simultaneous complaints tells somebody they are
                failing rather than what to do next. */}
            {touched && !hasAllAccounts ? (
              <p className="text-xs font-medium text-red-600">
                Every line needs an account. Pick one on the highlighted rows.
              </p>
            ) : touched && hasLineErrors ? (
              <p className="text-xs font-medium text-red-600">
                A line is either money in or money out — fill the debit or the
                credit, not both.
              </p>
            ) : null}

            <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row">
              <p className="text-xs text-slate-500">
                Saved as a draft first. Nothing reaches the ledger until you post it.
              </p>
              <Button
                className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                disabled={!canManage || isPending}
                onClick={() => {
                  setTouched(true);
                  if (isBalanced) submitDraft();
                }}
              >
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save draft journal
              </Button>
            </div>
          </div>
        </SectionCard>


        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6">
            <h2 className="text-sm font-bold text-slate-900 sm:text-base">
              Journal Register
            </h2>
            <span className="text-xs font-semibold text-slate-400">
              {pagination.total} entries
            </span>
          </div>

          {journals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="size-10 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-500">
                No journals yet
              </p>
              <p className="text-xs text-slate-400">
                Save a draft journal to begin building ledger history.
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="doc-table-stack w-full text-sm md:min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-3 py-3 text-left">Memo</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-right">Debits</th>
                    <th className="px-3 py-3 text-right">Credits</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {journals.map((journal) => (
                    <tr key={journal.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700" data-label="Date">
                        {formatJournalDate(journal.journalDate, dateFormat)}
                      </td>
                      <td className="px-3 py-3" data-label="Memo">
                        <p className="font-semibold text-slate-800">
                          {journal.memo || "Manual journal"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {journal.lineCount} lines
                          {journal.sourceType ? ` / ${journal.sourceType}` : ""}
                          {journal.autoReversalDate
                            ? ` / auto reverse ${formatJournalDate(journal.autoReversalDate, dateFormat)}`
                            : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3" data-label="Status">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold uppercase text-slate-600">
                          {journal.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold" data-label="Debits">
                        {formatMinor(journal.debitMinor)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold" data-label="Credits">
                        {formatMinor(journal.creditMinor)}
                      </td>
                      <td className="px-4 py-3" data-role="remove">
                        <div className="flex justify-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!canManage || isPending}
                                aria-label="Journal actions"
                              >
                                <MoreVertical className="size-4 text-slate-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {journal.status === "draft" ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      runAction(
                                        async () => postJournal(journal.id),
                                        "Journal posted."
                                      )
                                    }
                                  >
                                    <Send className="size-4" />
                                    Complete
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled>
                                    <BookOpen className="size-4" />
                                    Save as draft
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() =>
                                      runAction(
                                        async () => deleteDraftJournal(journal.id),
                                        "Draft journal deleted."
                                      )
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                    Delete draft
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  disabled={
                                    Boolean(journal.reversedJournalId) ||
                                    Boolean(journal.reversingJournalId)
                                  }
                                  onClick={() =>
                                    runAction(
                                      async () => reversePostedJournal(journal.id),
                                      "Journal reversed."
                                    )
                                  }
                                >
                                  <RotateCcw className="size-4" />
                                  Reverse
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination controls — navigates by setting ?page= on the current URL.
                Note: search/filter in the journal register operates on the current
                page only (the full dataset is not loaded client-side). */}
            {pagination.total > pagination.pageSize && (() => {
              const totalPages = Math.ceil(pagination.total / pagination.pageSize);
              const prevHref = `${pathname}?page=${pagination.page - 1}`;
              const nextHref = `${pathname}?page=${pagination.page + 1}`;
              return (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                  <Link
                    href={prevHref}
                    aria-disabled={pagination.page <= 1}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      pagination.page <= 1
                        ? "pointer-events-none text-slate-300"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <ChevronLeft className="size-3.5" />
                    Prev
                  </Link>
                  <span className="text-xs font-medium text-slate-500">
                    Page {pagination.page} of {totalPages}
                  </span>
                  <Link
                    href={nextHref}
                    aria-disabled={pagination.page >= totalPages}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      pagination.page >= totalPages
                        ? "pointer-events-none text-slate-300"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Next
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              );
            })()}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
