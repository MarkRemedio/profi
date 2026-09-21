"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileSpreadsheet,
  Loader2,
  LockKeyhole,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  type FeedTransaction,
  type ImportedStatement,
  useCategorizationAccounts,
  useImportedStatementPage,
  useImportedStatements,
  useUpdateImportedStatementRows,
} from "@/lib/banking/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = Pick<
  FeedTransaction,
  "transaction_date" | "description" | "debit_minor" | "credit_minor"
> & { category_account_id: string | null; category_touched?: boolean };
const EMPTY_CATEGORY = "__none__";
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T00:00:00`),
  );
const statementLabel = (statement: ImportedStatement) =>
  `${statement.bank_account_name} · ${statement.period_start === statement.period_end ? dateLabel(statement.period_start) : `${dateLabel(statement.period_start)} – ${dateLabel(statement.period_end)}`}`;

export function StatementSpreadsheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const statements = useImportedStatements(open);
  const [statement, setStatement] = useState<ImportedStatement | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const statementPage = useImportedStatementPage(statement?.id ?? null, page, search);
  const { data: accounts } = useCategorizationAccounts();
  const save = useUpdateImportedStatementRows();

  // A draft exists only after the user changes a cell, so it stays queued even
  // when they page away from the 50 rows currently on screen.
  const dirtyUpdates = useMemo(
    () => Object.entries(drafts).map(([id, draft]) => ({ id, ...draft })),
    [drafts],
  );
  const updateDraft = (tx: FeedTransaction, change: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [tx.id]: {
        ...(current[tx.id] ?? {
          transaction_date: tx.transaction_date,
          description: tx.description,
          debit_minor: tx.debit_minor,
          credit_minor: tx.credit_minor,
          category_account_id: tx.category_allocations[0]?.account_id ?? null,
        }),
        ...change,
      },
    }));
  };
  const copyVisible = async () => {
    const rows = statementPage.data?.transactions ?? [];
    const text = [
      "Date\tDescription\tSpent\tReceived\tCategory\tStatus",
      ...rows.map((tx) => {
        const draft = drafts[tx.id] ?? tx;
        const category = (accounts ?? []).find(
          (account) => account.id === draft.category_account_id,
        );
        return [
          draft.transaction_date,
          draft.description,
          draft.debit_minor ? (draft.debit_minor / 100).toFixed(2) : "",
          draft.credit_minor ? (draft.credit_minor / 100).toFixed(2) : "",
          category ? `${category.code} ${category.name}` : "",
          tx.reconcile_status,
        ].join("\t");
      }),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Visible rows copied to your clipboard.");
    } catch {
      toast.error("Your browser could not copy these rows.");
    }
  };
  const saveChanges = async () => {
    if (!statement || !dirtyUpdates.length) return;
    try {
      if (dirtyUpdates.length > 500) {
        toast.error("Save up to 500 changed rows at a time.");
        return;
      }
      const result = await save.mutateAsync({
        importedStatementId: statement.id,
        updates: dirtyUpdates.map(({ category_touched, ...update }) =>
          category_touched ? update : { ...update, category_account_id: undefined },
        ),
      });
      toast.success(`${result.updated} statement row${result.updated === 1 ? "" : "s"} saved.`);
      if (result.skipped)
        toast.warning(
          `${result.skipped} row${result.skipped === 1 ? " was" : "s were"} not saved. Reconciled rows are locked.`,
        );
      setDrafts({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save statement changes.");
    }
  };
  const totalPages = Math.max(1, Math.ceil((statementPage.data?.total ?? 0) / 50));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatement(null);
      setDrafts({});
      setPage(1);
      setSearch("");
      setSearchInput("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[min(90vh,52rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        showCloseButton={!save.isPending}
      >
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FileSpreadsheet className="size-5 text-emerald-600" /> Statement spreadsheet
          </DialogTitle>
          <DialogDescription>
            Review and correct imported rows before reconciliation. Posted rows remain locked.
          </DialogDescription>
        </DialogHeader>
        {!statement ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <p className="mb-3 text-sm font-semibold text-slate-700">
              Choose a previously imported statement
            </p>
            {statements.isLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" /> Loading statements…
              </div>
            ) : null}
            {statements.isError ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                Could not load your imported statements. Please try again.
              </p>
            ) : null}
            {!statements.isLoading && !statements.isError && !statements.data?.length ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                There are no imported statements yet.
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {(statements.data ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStatement(item);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <p className="truncate font-semibold text-slate-900">{statementLabel(item)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Imported {dateLabel(item.imported_at.slice(0, 10))} ·{" "}
                    {item.transaction_count.toLocaleString()} transactions ·{" "}
                    {item.reconciled_count.toLocaleString()} reconciled
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-3 border-b bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{statementLabel(statement)}</p>
                <p className="text-xs text-slate-500">
                  {statement.transaction_count.toLocaleString()} imported transactions
                </p>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-slate-400" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setSearch(searchInput);
                        setPage(1);
                      }
                    }}
                    placeholder="Filter description"
                    className="w-48 pl-8"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch(searchInput);
                    setPage(1);
                  }}
                >
                  Filter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyVisible()}
                  disabled={!statementPage.data?.transactions.length}
                >
                  <Clipboard /> Copy visible
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {statementPage.isLoading && !statementPage.data ? (
                <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" /> Loading statement rows…
                </div>
              ) : null}
              {statementPage.data ? (
                <table className="min-w-[1050px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-28 px-3 py-3">Date</th>
                      <th className="min-w-64 px-3 py-3">Description</th>
                      <th className="w-32 px-3 py-3 text-right">Spent</th>
                      <th className="w-32 px-3 py-3 text-right">Received</th>
                      <th className="w-64 px-3 py-3">Category</th>
                      <th className="w-28 px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementPage.data.transactions.map((tx) => {
                      const draft = drafts[tx.id] ?? {
                        transaction_date: tx.transaction_date,
                        description: tx.description,
                        debit_minor: tx.debit_minor,
                        credit_minor: tx.credit_minor,
                        category_account_id: tx.category_allocations[0]?.account_id ?? null,
                      };
                      const locked = tx.reconcile_status === "reconciled";
                      return (
                        <tr
                          key={tx.id}
                          className="border-t border-slate-100 bg-white hover:bg-slate-50/60"
                        >
                          <td className="p-2">
                            <Input
                              type="date"
                              value={draft.transaction_date}
                              onChange={(event) =>
                                updateDraft(tx, { transaction_date: event.target.value })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={draft.description}
                              onChange={(event) =>
                                updateDraft(tx, { description: event.target.value })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.debit_minor ? (draft.debit_minor / 100).toFixed(2) : ""}
                              className="text-right"
                              onChange={(event) => {
                                const minor = Math.round(Number(event.target.value || 0) * 100);
                                updateDraft(tx, {
                                  debit_minor: minor,
                                  credit_minor: minor > 0 ? 0 : draft.credit_minor,
                                });
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                draft.credit_minor ? (draft.credit_minor / 100).toFixed(2) : ""
                              }
                              className="text-right"
                              onChange={(event) => {
                                const minor = Math.round(Number(event.target.value || 0) * 100);
                                updateDraft(tx, {
                                  credit_minor: minor,
                                  debit_minor: minor > 0 ? 0 : draft.debit_minor,
                                });
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={draft.category_account_id ?? EMPTY_CATEGORY}
                              onValueChange={(value) =>
                                updateDraft(tx, {
                                  category_account_id: value === EMPTY_CATEGORY ? null : value,
                                  category_touched: true,
                                })
                              }
                            >
                              <SelectTrigger size="sm" className="w-full">
                                <SelectValue placeholder="Choose category" />
                              </SelectTrigger>
                              <SelectContent className="z-[100001]">
                                <SelectGroup>
                                  <SelectLabel>Chart of accounts</SelectLabel>
                                  <SelectItem value={EMPTY_CATEGORY}>Uncategorized</SelectItem>
                                  {(accounts ?? []).map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      <span className="font-mono text-xs text-slate-400">
                                        {account.code}
                                      </span>{" "}
                                      {account.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <span
                              className={
                                locked
                                  ? "inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                                  : "text-xs font-semibold text-slate-600"
                              }
                            >
                              {locked ? (
                                <>
                                  <LockKeyhole className="size-3" /> Reconciled
                                </>
                              ) : (
                                tx.reconcile_status.replace("_", " ")
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t bg-white px-5 py-3">
              <p className="text-xs text-slate-500">
                {statementPage.data?.total.toLocaleString() ?? 0} rows · edits are saved only when
                you choose Save changes
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-20 text-center text-xs text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <Button
            variant="outline"
            onClick={() => (statement ? setStatement(null) : handleOpenChange(false))}
            disabled={save.isPending}
          >
            {statement ? "Choose another" : "Close"}
          </Button>
          {statement ? (
            <Button
              onClick={() => void saveChanges()}
              disabled={!dirtyUpdates.length || save.isPending}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save changes
              {dirtyUpdates.length ? ` (${dirtyUpdates.length})` : ""}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
