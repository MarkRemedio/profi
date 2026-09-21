"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Receipt,
  Plus,
  Loader2,
  CheckCircle2,
  UserPlus,
  Wallet,
  Clock,
  Users,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/currency-provider";
import { currencyInputInset, currencySymbol, formatMoney as formatInCurrency } from "@/lib/currency";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PosTableSkeleton } from "@/components/pos/skeletons";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getExpenseClaimWorkspace,
  createExpenseClaim,
  createClaimant,
  updateClaimant,
  deleteClaimant,
  approveExpenseClaim,
  updateExpenseClaim,
  deleteExpenseClaim,
  type ExpenseClaimRow,
} from "@/app/(dashboard)/purchases/expense-claims/actions";
import { uploadExpenseClaimAttachment } from "./upload-expense-claim-attachment";

type Claimant = { id: string; name: string; email: string | null };
type Account = { id: string; code: string; name: string };

function todayIso() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/** Matches the Suppliers table. */
const CLAIMS_PER_PAGE = 20;
/** The People dialog is a small panel, so it pages in shorter runs. */
const PEOPLE_PER_PAGE = 5;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
  void: "bg-red-50 text-red-600",
};

/**
 * Expense claims.
 *
 * A claim is a bill owed to whoever paid out of pocket, so everything here runs
 * through the bill path: approving posts the journal (debit the expense, credit
 * accounts payable to the claimant) and reimbursing is an ordinary bill payment
 * from Purchases → Bills.
 *
 * This replaces a version that kept claims in browser localStorage, posted
 * nothing to the ledger, and searched the customer list for "employees" — a
 * contact type that did not exist, which is why its picker was always empty.
 */
export function ExpenseClaimsUI({ initialCreate = false }: { initialCreate?: boolean }) {
  const queryClient = useQueryClient();
  const { currency: workspaceCurrency, format: formatMoney } = useCurrency();

  const [claims, setClaims] = useState<ExpenseClaimRow[]>([]);
  const [claimants, setClaimants] = useState<Claimant[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSaving] = useTransition();

  const [showDialog, setShowDialog] = useState(initialCreate);
  /** Claim being amended, or null when the dialog is creating a new one. */
  const [editingClaim, setEditingClaim] = useState<ExpenseClaimRow | null>(null);
  const [claimantId, setClaimantId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [currency, setCurrency] = useState(workspaceCurrency);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptAttachment, setReceiptAttachment] = useState<File | null>(null);
  const [receiptAttachmentLabel, setReceiptAttachmentLabel] = useState("");
  const [existingReceiptAttachmentLabel, setExistingReceiptAttachmentLabel] = useState("");

  const [showAddClaimant, setShowAddClaimant] = useState(false);
  const [newClaimantName, setNewClaimantName] = useState("");
  const [newClaimantEmail, setNewClaimantEmail] = useState("");

  const [claimsPage, setClaimsPage] = useState(1);
  const [peoplePage, setPeoplePage] = useState(1);

  const [showManagePeople, setShowManagePeople] = useState(false);
  /** Claimant currently being renamed, or null when just listing. */
  const [editing, setEditing] = useState<Claimant | null>(null);

  // Deliberately does not flip isLoading back to true on refresh: it starts
  // true, and re-fetching after a save should update the table in place rather
  // than flashing the skeleton over data the user is already looking at.
  const load = useCallback(async () => {
    try {
      const data = await getExpenseClaimWorkspace();
      setClaims(data.claims);
      setClaimants(data.claimants as Claimant[]);
      setAccounts(data.accounts as unknown as Account[]);
    } catch {
      toast.error("Could not load expense claims.");
    }
    setIsLoading(false);

    // A claim is stored as a bill, so raising one changes the Bills list, the
    // purchases tiles and the draft count behind the notification bell. The
    // server action revalidates those routes, but those screens read from
    // react-query, which revalidatePath cannot reach — so without this a new
    // claim only appeared on Bills after a manual refresh.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    /*
     * Summed in the workspace's currency, not each claim's own.
     *
     * This used to add totalMinor directly, behind a comment reasoning that
     * createExpenseClaim never passes a currency so every claim must be in the
     * workspace's. That stopped being true once a claim could also be raised
     * against a person from the bill dialog, where an accountant picks the
     * currency — so a peso-based workspace holding a claim owed in pounds was
     * adding 12,345 to its peso total and labelling the result in pesos.
     *
     * baseTotalMinor is that same claim converted at the rate on the day it was
     * raised, which is what the ledger holds and what every other cross-
     * document total in the app uses.
     */
    const sum = (rows: ExpenseClaimRow[]) => rows.reduce((t, r) => t + r.baseTotalMinor, 0);
    const awaiting = claims.filter((c) => c.status === "draft");
    return {
      awaitingCount: awaiting.length,
      awaitingMinor: sum(awaiting),
      owedMinor: sum(claims.filter((c) => c.status === "approved")),
      paidMinor: sum(claims.filter((c) => c.status === "paid")),
    };
  }, [claims]);

  const claimsTotalPages = Math.max(1, Math.ceil(claims.length / CLAIMS_PER_PAGE));
  // Clamp rather than reset: deleting the last row on page 3 should land on
  // page 2, not throw the user back to the top of the list.
  const safeClaimsPage = Math.min(claimsPage, claimsTotalPages);
  const paginatedClaims = claims.slice(
    (safeClaimsPage - 1) * CLAIMS_PER_PAGE,
    safeClaimsPage * CLAIMS_PER_PAGE
  );

  const peopleTotalPages = Math.max(1, Math.ceil(claimants.length / PEOPLE_PER_PAGE));
  const safePeoplePage = Math.min(peoplePage, peopleTotalPages);
  const paginatedPeople = claimants.slice(
    (safePeoplePage - 1) * PEOPLE_PER_PAGE,
    safePeoplePage * PEOPLE_PER_PAGE
  );
  const amountSymbol = currencySymbol(currency);

  const resetForm = () => {
    setEditingClaim(null);
    setClaimantId("");
    setAccountId("");
    setDescription("");
    setAmount("");
    setDate(todayIso());
    setCurrency(workspaceCurrency);
    setPaymentMethod("");
    setLocation("");
    setNotes("");
    setReceiptAttachment(null);
    setReceiptAttachmentLabel("");
    setExistingReceiptAttachmentLabel("");
  };

  const handleCreate = () => {
    const claimant = claimants.find((c) => c.id === claimantId);
    if (!claimant) return toast.error("Select who is claiming.");
    if (!accountId) return toast.error("Choose which expense account this belongs to.");
    if (!description.trim()) return toast.error("Describe what the claim is for.");
    if (!Number(amount)) return toast.error("Enter an amount greater than zero.");

    startSaving(async () => {
      try {
        const uploadedAttachment = receiptAttachment
          ? await uploadExpenseClaimAttachment(receiptAttachment)
          : undefined;
        const payload = {
          claimantId: claimant.id,
          claimantName: claimant.name,
          description,
          date,
          accountId,
          amount,
          currency,
          paymentMethod: paymentMethod || undefined,
          location: location || undefined,
          notes: notes || undefined,
          receiptAttachment: uploadedAttachment,
        };
        if (editingClaim) {
          await updateExpenseClaim({ id: editingClaim.id, ...payload });
          toast.success(`${editingClaim.claimNo} updated.`);
        } else {
          await createExpenseClaim(payload);
          toast.success("Claim saved as a draft. Approve it to post to the ledger.");
        }
        setShowDialog(false);
        resetForm();
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the claim.");
      }
    });
  };

  const handleAddClaimant = () => {
    if (!newClaimantName.trim()) return toast.error("Enter a name.");
    startSaving(async () => {
      try {
        const created = await createClaimant({ name: newClaimantName, email: newClaimantEmail });
        setClaimants((current) =>
          [...current, created as Claimant].sort((a, b) => a.name.localeCompare(b.name))
        );
        setClaimantId(created.id);
        setShowAddClaimant(false);
        setNewClaimantName("");
        setNewClaimantEmail("");
        toast.success(`${created.name} can now claim expenses.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add the claimant.");
      }
    });
  };

  const handleSaveClaimant = () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Enter a name.");
    startSaving(async () => {
      try {
        await updateClaimant({ id: editing.id, name: editing.name, email: editing.email ?? undefined });
        toast.success("Claimant updated.");
        setEditing(null);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update the claimant.");
      }
    });
  };

  const handleDeleteClaimant = (claimant: Claimant) => {
    startSaving(async () => {
      try {
        const result = await deleteClaimant(claimant.id);
        toast.success(
          result.archived
            ? `${claimant.name} has ${result.claimCount} claim(s), so they were archived rather than deleted.`
            : `${claimant.name} removed.`
        );
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove the claimant.");
      }
    });
  };

  const handleDeleteClaim = (claim: ExpenseClaimRow) => {
    startSaving(async () => {
      try {
        await deleteExpenseClaim(claim.id);
        toast.success(`${claim.claimNo} deleted.`);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the claim.");
      }
    });
  };

  const openEditClaim = (claim: ExpenseClaimRow) => {
    setEditingClaim(claim);
    setClaimantId(claim.claimantId);
    setDescription(claim.description);
    setAmount((claim.totalMinor / 100).toFixed(2));
    setDate(claim.date);
    setCurrency(claim.currency as typeof workspaceCurrency);
    setPaymentMethod(claim.paymentMethod ?? "");
    setLocation(claim.location ?? "");
    setNotes(claim.notes ?? "");
    setExistingReceiptAttachmentLabel(claim.receiptAttachmentFilename ?? "");
    setReceiptAttachment(null);
    setReceiptAttachmentLabel("");
    // The account is not carried on the list row, so it must be chosen again.
    setAccountId("");
    setShowDialog(true);
  };

  const handleApprove = (claim: ExpenseClaimRow) => {
    startSaving(async () => {
      try {
        await approveExpenseClaim(claim.id);
        toast.success(`${claim.claimNo} approved and posted. Reimburse it from Bills.`);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not approve the claim.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Expense Claims</h2>
          <p className="mt-1 text-sm text-slate-500">
            Money your people paid out of pocket. Approving a claim records what you owe them;
            reimburse it from Bills.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => setShowManagePeople(true)} className="h-11 gap-2 rounded-xl font-bold">
            <Users className="h-4 w-4" /> People
          </Button>
          <Button onClick={() => setShowDialog(true)} className="h-11 gap-2 rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
            <Plus className="h-4 w-4" /> New Claim
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Awaiting approval", value: formatMoney(totals.awaitingMinor), sub: `${totals.awaitingCount} claims`, icon: Clock, tint: "text-amber-600 bg-amber-50" },
          { label: "Owed to claimants", value: formatMoney(totals.owedMinor), sub: "Approved, not yet paid", icon: Wallet, tint: "text-blue-600 bg-blue-50" },
          { label: "Reimbursed", value: formatMoney(totals.paidMinor), sub: "Settled in full", icon: CheckCircle2, tint: "text-emerald-600 bg-emerald-50" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
              <span className={cn("flex size-8 items-center justify-center rounded-lg", card.tint)}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <PosTableSkeleton columns={6} rows={5} minWidth="w-full" label="Loading expense claims" />
        ) : claims.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Receipt className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No claims yet</p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              Record what someone paid for personally — travel, a client lunch, materials.
              Approving the claim books the cost and records what you owe them.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {["Claim", "Date", "Claimant", "Description", "Amount", "Status"].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500",
                      h === "Amount" ? "text-right" : "text-left"
                    )}
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {paginatedClaims.map((claim) => (
                <tr key={claim.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-bold text-slate-900">{claim.claimNo}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{claim.date}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{claim.claimantName}</td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-sm text-slate-600">{claim.description}</td>
                  {/* One row is one document, so it reads in the currency that
                      document was raised in. The workspace-bound formatter
                      would print a GBP claim with the peso sign — the right
                      number wearing the wrong symbol. The summary cards above
                      are the opposite case: they add claims together, so they
                      convert. */}
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                    {formatInCurrency(claim.totalMinor, claim.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", STATUS_STYLES[claim.status] ?? "bg-slate-100 text-slate-600")}>
                      {claim.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Only drafts can be changed: an approved claim has posted
                        to the ledger, so it must be voided from Bills instead. */}
                    {claim.status === "draft" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            aria-label={`Actions for ${claim.claimNo}`}
                            className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border-slate-200 bg-white p-0 shadow-2xs hover:border-slate-300 hover:bg-slate-50 data-[state=open]:border-slate-300 data-[state=open]:bg-slate-100"
                          >
                            <MoreHorizontal className="h-4 w-4 text-slate-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                          <DropdownMenuItem disabled={isSaving} onClick={() => handleApprove(claim)} className="h-9 cursor-pointer gap-2 rounded-lg font-medium text-slate-700">
                            <CheckCircle2 className="h-4 w-4 text-slate-400" /> Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditClaim(claim)} className="h-9 cursor-pointer gap-2 rounded-lg font-medium text-slate-700">
                            <Pencil className="h-4 w-4 text-slate-400" /> Edit claim
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isSaving}
                            onClick={() => handleDeleteClaim(claim)}
                            className="h-9 cursor-pointer gap-2 rounded-lg font-medium text-red-600 focus:bg-red-50 focus:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {claimsTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
            <span className="text-xs font-medium text-slate-500">
              Showing <span className="font-bold text-slate-900">{(safeClaimsPage - 1) * CLAIMS_PER_PAGE + 1}</span> to{" "}
              <span className="font-bold text-slate-900">{Math.min(safeClaimsPage * CLAIMS_PER_PAGE, claims.length)}</span> of{" "}
              <span className="font-bold text-slate-900">{claims.length}</span> claims
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setClaimsPage((current) => Math.max(1, current - 1))}
                disabled={safeClaimsPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setClaimsPage((current) => Math.min(claimsTotalPages, current + 1))}
                disabled={safeClaimsPage === claimsTotalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* New claim */}
      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
      <DialogContent className="w-[94vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingClaim ? `Edit ${editingClaim.claimNo}` : "New expense claim"}</DialogTitle>
          <DialogDescription>
            Saved as a draft. Approving it books the cost and records what you owe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Claimant</label>
              <button type="button" onClick={() => setShowAddClaimant(true)} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                <UserPlus className="h-3.5 w-3.5" /> Add person
              </button>
            </div>
            <Select value={claimantId} onValueChange={setClaimantId} disabled={claimants.length === 0}>
              <SelectTrigger className="h-10 w-full justify-between rounded-lg">
                <SelectValue
                  placeholder={claimants.length === 0 ? "No one set up yet" : "Select who is claiming"}
                />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                {claimants.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {claimants.length === 0 && (
              <p className="text-[11px] text-slate-400">
                No one set up yet - use &ldquo;Add person&rdquo; above. Claimants are contacts,
                so no payroll record is needed.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Currency</label>
              {/* Searchable, matched on country name. availableOnly: a claim
                  can only be reimbursed in a currency the books can keep. */}
              <CurrencyPicker
                value={currency}
                onChange={(value) => setCurrency(value as typeof workspaceCurrency)}
                availableOnly
                size="field"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-10 w-full justify-between rounded-lg">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. London, UK" className="h-10 rounded-lg" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Expense account</label>
            <Select value={accountId} onValueChange={setAccountId} disabled={accounts.length === 0}>
              <SelectTrigger className="h-10 w-full justify-between rounded-lg">
                <SelectValue
                  placeholder={accounts.length === 0 ? "No accounts yet" : "Choose where this cost belongs"}
                />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Train fare to client meeting" className="h-10 rounded-lg" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details for the approver"
              className="min-h-[92px] rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{amountSymbol}</span>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-10 rounded-lg" style={{ paddingLeft: currencyInputInset(amountSymbol) }} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Receipt attachment</label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setReceiptAttachment(file);
                setReceiptAttachmentLabel(file?.name ?? "");
              }}
              className="h-10 rounded-lg"
            />
            {receiptAttachmentLabel ? (
              <p className="text-[11px] text-slate-500">Selected file: {receiptAttachmentLabel}</p>
            ) : existingReceiptAttachmentLabel ? (
              <p className="text-[11px] text-slate-500">Current file: {existingReceiptAttachmentLabel}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Upload a receipt or supporting file for this claim.</p>
            )}
          </div>
        </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="h-10 rounded-lg font-bold">Cancel</Button>
            <Button onClick={handleCreate} disabled={isSaving} className="h-10 rounded-lg bg-slate-900 font-bold hover:bg-slate-800">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save claim"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage claimants */}
      <Dialog open={showManagePeople} onOpenChange={(open) => { setShowManagePeople(open); if (!open) setEditing(null); }}>
        <DialogContent className="w-[94vw] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>People who can claim</DialogTitle>
            <DialogDescription>
              Rename someone if you typed it wrong, or remove them. Anyone who already has
              claims is archived rather than deleted, so their history stays intact.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[240px] space-y-2">
            {claimants.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">No one set up yet.</p>
            )}
            {paginatedPeople.map((person) =>
              editing?.id === person.id ? (
                <div key={person.id} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Full name"
                    className="h-9 rounded-lg bg-white"
                  />
                  <Input
                    value={editing.email ?? ""}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    placeholder="Email (optional)"
                    className="h-9 rounded-lg bg-white"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-8 rounded-lg font-bold">Cancel</Button>
                    <Button size="sm" disabled={isSaving} onClick={handleSaveClaimant} className="h-8 rounded-lg bg-slate-900 font-bold hover:bg-slate-800">
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={person.id} className="document-row flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{person.name}</p>
                    {person.email && <p className="truncate text-xs text-slate-400">{person.email}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${person.name}`}
                      onClick={() => setEditing(person)}
                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSaving}
                      aria-label={`Remove ${person.name}`}
                      onClick={() => handleDeleteClaimant(person)}
                      className="h-8 w-8 rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:text-slate-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>

          {peopleTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-[11px] font-medium text-slate-500">
                {(safePeoplePage - 1) * PEOPLE_PER_PAGE + 1}–
                {Math.min(safePeoplePage * PEOPLE_PER_PAGE, claimants.length)} of {claimants.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-semibold"
                  onClick={() => setPeoplePage((current) => Math.max(1, current - 1))}
                  disabled={safePeoplePage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-semibold"
                  onClick={() => setPeoplePage((current) => Math.min(peopleTotalPages, current + 1))}
                  disabled={safePeoplePage === peopleTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => { setShowManagePeople(false); setShowAddClaimant(true); }} className="h-10 gap-2 rounded-lg font-bold">
              <UserPlus className="h-4 w-4" /> Add person
            </Button>
            <Button onClick={() => setShowManagePeople(false)} className="h-10 rounded-lg bg-slate-900 font-bold hover:bg-slate-800">Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add claimant */}
      <Dialog open={showAddClaimant} onOpenChange={setShowAddClaimant}>
        <DialogContent className="w-[94vw] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a claimant</DialogTitle>
            <DialogDescription>
              Anyone who pays for things on the company&rsquo;s behalf. Stored as a contact, kept
              separate from your suppliers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={newClaimantName} onChange={(e) => setNewClaimantName(e.target.value)} placeholder="Full name" className="h-10 rounded-lg" />
            <Input value={newClaimantEmail} onChange={(e) => setNewClaimantEmail(e.target.value)} placeholder="Email (optional)" className="h-10 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAddClaimant(false)} className="h-10 rounded-lg font-bold">Cancel</Button>
            <Button onClick={handleAddClaimant} disabled={isSaving} className="h-10 rounded-lg bg-slate-900 font-bold hover:bg-slate-800">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
