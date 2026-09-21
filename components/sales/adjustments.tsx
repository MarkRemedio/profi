"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { 
  FileText, Loader2, Plus, Search, ChevronLeft, ChevronRight, 
  RotateCcw, ShieldAlert, ArrowUpRight, Scale, MoreVertical,
  Printer, Layers, ExternalLink, X, Trash2, Pencil, Ban, Eye // ✅ Added Pencil icon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";
import { CreditNoteDialog } from "./credit-note-dialog";
import { useCreditNotes } from "./use-credit-notes";
import { useInvoices } from "./use-invoices";
import { AdjustmentsSkeleton } from "./skeletons";

const statusStyles: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 border-blue-200",
  allocated: "bg-green-100 text-green-700 border-green-200",
  partially_allocated: "bg-yellow-100 text-yellow-700 border-yellow-200",
  refunded: "bg-purple-100 text-purple-700 border-purple-200",
  // Muted rather than red: a void credit note is not an error, it is a
  // decision that has been recorded and reversed.
  void: "bg-slate-100 text-slate-500 border-slate-200",
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function titleStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// 🚀 Make sure your Adjustments component function accepts the active organization id prop!
export function Adjustments({
  activeOrgId,
  vatRegistered = false,
  taxRates = [],
}: {
  activeOrgId: string;
  /** False hides the VAT question entirely — there is nothing to reverse. */
  vatRegistered?: boolean;
  taxRates?: Array<{ code: string; name: string; rate: number }>;
}) {
  const { format: formatMinor } = useCurrency();
  const { creditNotes, loading: notesLoading, initialLoading, error, stats, addCreditNote, editCreditNote, deleteNotes, voidNote, voidNotes } = useCreditNotes(activeOrgId);
  const { contacts, invoices } = useInvoices(); 
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "allocated" | "refunded">("all");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any | null>(null); // ✅ Tracks if we are editing
  const [allocationNote, setAllocationNote] = useState<any | null>(null); 
  
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const filteredNotes = useMemo(() => {
    return creditNotes.filter((cnItem) => {
      const matchesSearch = !searchQuery || (
        cnItem.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cnItem.cnNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cnItem.invoiceRef.toLowerCase().includes(searchQuery.toLowerCase())
      );

      const matchesStatus = statusFilter === "all" || 
        cnItem.status === statusFilter || 
        (statusFilter === "allocated" && cnItem.status === "partially_allocated");

      return matchesSearch && matchesStatus;
    });
  }, [creditNotes, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredNotes.length / itemsPerPage) || 1;

  const paginatedNotes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNotes.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNotes, currentPage]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedNotes(paginatedNotes.map(n => n.id));
    } else {
      setSelectedNotes([]);
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedNotes.includes(id)) {
      setSelectedNotes(selectedNotes.filter(noteId => noteId !== id));
    } else {
      setSelectedNotes([...selectedNotes, id]);
    }
  };

  /* Which of the selected notes are already in the ledger. Deleting one would
     leave its journal behind, so the button below is offered only when none of
     them are. */
  const postedSelection = useMemo(
    () => creditNotes.filter((note) => selectedNotes.includes(note.id) && note.posted),
    [creditNotes, selectedNotes]
  );
  const deletableSelection = selectedNotes.length > 0 && postedSelection.length === 0;

  /* Anything not already void can be voided, posted or not — an unposted one
     simply has no journal to reverse. That makes the checkbox useful whatever
     is selected, which it was not while Delete was the only bulk action. */
  const voidableSelection = useMemo(
    () => creditNotes.filter((note) => selectedNotes.includes(note.id) && note.status !== "void"),
    [creditNotes, selectedNotes]
  );

  const handleBulkVoid = async () => {
    const ids = voidableSelection.map((note) => note.id);
    if (
      !confirm(
        `Void ${ids.length} credit note${ids.length === 1 ? "" : "s"}? Each posts its opposite ` +
          `journal, so those customers owe the amounts again. Every note and its reversal stays ` +
          `on the record.`
      )
    ) {
      return;
    }
    if (await voidNotes(ids)) setSelectedNotes([]);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedNotes.length} credit notes?`)) return;
    // Only clear the selection when the delete actually happened. A refusal —
    // a posted note cannot be deleted — leaves the rows selected so the reason
    // in the toast still points at something.
    if (await deleteNotes(selectedNotes)) setSelectedNotes([]);
  };

  // ✅ Opens the dialog as a totally blank new form
  const handleCreateNew = () => {
    setEditingNote(null);
    setDialogOpen(true);
  };

  // ✅ Opens the dialog filled with the old info
  const handleEdit = (note: any) => {
    setEditingNote(note);
    setDialogOpen(true);
  };

  const handleVoid = async (note: any) => {
    if (
      !confirm(
        `Void ${note.cnNo}? This posts the opposite journal, so the customer owes the amount ` +
          `again. Both the credit note and its reversal stay on the record.`
      )
    ) {
      return;
    }
    await voidNote(note.id);
  };

  // ✅ Routes the form submission to the correct hook function
  const handleSaveNote = (noteData: any, id?: string) => {
    if (id) {
      editCreditNote(id, noteData);
    } else {
      addCreditNote(noteData);
    }
  };

  // ✅ DEDICATED CREDIT NOTE PRINT ENGINE
  const handlePrint = (cnItem: any) => {
    if (!cnItem.id) return;
    // 🚀 We now use the dedicated, perfectly styled Print App Route!
    // Appending ?type=credit_note tells the print page to fetch the Credit Note settings!
    window.open(`/print/invoice/${cnItem.id}?type=credit_note`, "_blank");
  };

  // Placed after every hook so the hook order stays stable across renders.
  if (initialLoading) return <AdjustmentsSkeleton />;

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Credit Notes & Adjustments</h1>
          <p className="mt-1 text-sm text-slate-500">Issue reduction credits, manage cash refunds, and track chart-of-accounts write-offs.</p>
        </div>
        <Button onClick={handleCreateNew} className="h-9 gap-1.5 bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 shadow-sm shrink-0 transition-colors">
          <Plus className="size-4 stroke-[2.5]" />
          <span>Issue Credit Note</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Credits Issued</p><Scale className="size-4 text-slate-400" /></div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{formatMinor(stats.totalIssued)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Allocated Value</p><ArrowUpRight className="size-4 text-emerald-500" /></div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600">{formatMinor(stats.totalAllocated)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Unallocated Remaining</p><RotateCcw className="size-4 text-blue-500" /></div>
          <p className="mt-2 text-2xl font-extrabold text-blue-600">{formatMinor(stats.totalRemaining)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
        {selectedNotes.length > 0 ? (
          <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {selectedNotes.length}
              </span>
              <span className="text-sm font-semibold text-blue-900">Credit Notes Selected</span>
            </div>

            {/* Offered only when the selection can actually be deleted.
                Anything posted is in the ledger and has to be voided instead,
                and a red button that always refuses is worse than no button —
                it invites the action, then explains why it was never possible.
                The line beside it says which ones are in the way. */}
            <div className="flex items-center gap-2">
              {voidableSelection.length > 0 && (
                <Button
                  onClick={handleBulkVoid}
                  variant="outline"
                  className="flex h-8 items-center justify-center gap-1.5 border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Ban className="size-3.5" />
                  Void Selected
                </Button>
              )}
              {deletableSelection ? (
                <Button
                  onClick={handleBulkDelete}
                  className="flex items-center justify-center h-8 px-3 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="size-3.5" />
                  Delete Selected
                </Button>
              ) : (
                <span className="text-xs font-medium text-blue-900/70">
                  {/* A voided note is finished, not stuck. Saying only that
                      delete is unavailable reads as an obstacle; it is the end
                      state, and the reason is worth one line. */}
                  {voidableSelection.length === 0
                    ? "Already voided — reversed in the ledger and kept on the record"
                    : postedSelection.length === selectedNotes.length
                      ? "Posted — void to reverse, deleting would orphan the journal"
                      : `${postedSelection.length} of ${selectedNotes.length} are posted`}
                </span>
              )}
            </div>

          </div>
        ) : (
          <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 bg-slate-50/40 gap-3">
            <div className="flex items-center justify-between w-full xl:w-auto gap-4"><h2 className="text-sm font-bold text-slate-900 sm:text-base whitespace-nowrap">Adjustment Ledger</h2></div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-end w-full xl:w-auto">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-none">
                {(["all", "open", "allocated", "refunded"] as const).map((status) => (
                  <button key={status} onClick={() => setStatusFilter(status)} className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider text-[10px]", statusFilter === status ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}>{status}</button>
                ))}
              </div>
              <div className="flex items-center gap-2.5 relative w-full sm:w-64">
                <Search className="size-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input type="text" placeholder="Search credits or invoices..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50/20">
                <th className="px-4 py-3 w-10"><input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={paginatedNotes.length > 0 && selectedNotes.length === paginatedNotes.length} onChange={handleSelectAll} /></th>
                <th className="px-2 py-3">Document Ref</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Issue Date</th><th className="px-3 py-3">Invoice Ref</th><th className="px-3 py-3 text-right">Net</th><th className="px-3 py-3 text-right">VAT</th><th className="px-3 py-3 text-right">Amount Issued</th><th className="px-3 py-3 text-right">Remaining Credit</th><th className="px-3 py-3 text-center">Status</th><th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {notesLoading ? (<tr><td colSpan={11} className="py-24 text-center text-slate-500"><div className="flex items-center justify-center gap-2 font-medium"><Loader2 className="animate-spin h-5 w-5 text-blue-600" />Loading...</div></td></tr>) 
              : filteredNotes.length === 0 ? (<tr><td colSpan={11} className="py-24 text-center align-middle px-4"><ShieldAlert className="size-10 text-slate-300 mx-auto mb-2" /><p className="text-[13px] font-bold text-slate-800">No adjustment entries found</p></td></tr>) 
              : (
                paginatedNotes.map((cnItem) => (
                  <tr key={cnItem.id} className={cn("transition-colors hover:bg-slate-50/60", selectedNotes.includes(cnItem.id) && "bg-blue-50/50 hover:bg-blue-50/80")}>
                    <td className="px-4 py-3"><input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={selectedNotes.includes(cnItem.id)} onChange={() => handleSelectOne(cnItem.id)} /></td>
                    <td className="px-2 py-3 font-bold text-slate-900">{cnItem.cnNo}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{cnItem.contactName}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDate(cnItem.date)}</td>
                    <td className="px-3 py-3 font-mono">
                      {cnItem.invoiceRef !== "N/A" ? (
                        <Link href={`/sales/invoices?search=${cnItem.invoiceRef}`} className="text-blue-600 hover:text-blue-800 hover:underline font-bold transition flex items-center gap-1.5">{cnItem.invoiceRef}<ExternalLink className="size-3" /></Link>
                      ) : (<span className="text-slate-400">N/A</span>)}
                    </td>
                    {/* Net and VAT before the total they make up, so the row
                        reads the way the credit note itself does. The VAT is
                        muted at zero rather than hidden: a column that comes
                        and goes is harder to scan than one that is quiet. */}
                    <td className="px-3 py-3 text-right text-slate-600">{formatMinor(cnItem.subtotalMinor)}</td>
                    <td className={cn("px-3 py-3 text-right", cnItem.taxMinor > 0 ? "text-slate-600" : "text-slate-300")}>
                      {formatMinor(cnItem.taxMinor)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">{formatMinor(cnItem.totalMinor)}</td>
                    <td className="px-3 py-3 text-right font-bold text-blue-600">{formatMinor(cnItem.remainingMinor)}</td>
                    <td className="px-3 py-3 text-center"><span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", statusStyles[cnItem.status])}>{cnItem.status === "partially_allocated" ? "Partial Allocation" : titleStatus(cnItem.status)}</span></td>
                    <td className="px-3 py-3 text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 p-1.5 shadow-lg border-slate-200">
                          
                          {/* ✅ ADDED THE EDIT BUTTON */}
                          {/* A posted note opens to be read. Offering "Edit"
                              and refusing on save asks somebody to fill in a
                              form that was never going to be accepted. */}
                          <DropdownMenuItem onClick={() => handleEdit(cnItem)} className="cursor-pointer font-bold text-blue-600 bg-blue-50/50 mb-1">
                            {cnItem.posted ? (
                              <><Eye className="size-4 mr-2" /> View Credit Note</>
                            ) : (
                              <><Pencil className="size-4 mr-2" /> Edit Credit Note</>
                            )}
                          </DropdownMenuItem>

                          <DropdownMenuItem onClick={() => setAllocationNote(cnItem)} className="cursor-pointer font-medium text-slate-700"><Layers className="size-4 mr-2 text-slate-400" /> View Allocation</DropdownMenuItem>
                          {cnItem.invoiceRef !== "N/A" && (<Link href={`/sales/invoices?search=${cnItem.invoiceRef}`}><DropdownMenuItem className="cursor-pointer font-medium text-slate-700"><FileText className="size-4 mr-2 text-slate-400" /> View Invoice</DropdownMenuItem></Link>)}
                          <DropdownMenuItem onClick={() => handlePrint(cnItem)} className="cursor-pointer font-medium text-slate-700"><Printer className="size-4 mr-2 text-slate-400" /> Print Credit Note</DropdownMenuItem>

                          {/* The way out of a credit note that is already in
                              the ledger. Deleting one is refused, because the
                              journal would stay behind; voiding posts the
                              reversal and leaves both on the record. Hidden
                              once void so it cannot be done twice. */}
                          {cnItem.status !== "void" && (
                            <DropdownMenuItem
                              onClick={() => handleVoid(cnItem)}
                              className="cursor-pointer font-medium text-red-600 focus:text-red-700"
                            >
                              <Ban className="size-4 mr-2" /> Void Credit Note
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreditNoteDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        onSave={handleSaveNote} 
        contacts={contacts || []}
        invoices={invoices || []}
        vatRegistered={vatRegistered}
        taxRates={taxRates}
        readOnly={Boolean(editingNote?.posted)}
        initialData={editingNote} // ✅ Passes the selected note into the form!
      />

      {/* 🚀 TELEPORTED: Uses createPortal & bumped to z-[9999] */}
      {allocationNote && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setAllocationNote(null)} className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100 transition"><X className="size-4" /></button>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 border border-blue-100"><Layers className="size-4 text-blue-600" /></div>
              <div><h2 className="text-base font-bold text-slate-900">Allocation History</h2><p className="text-xs text-slate-400 font-mono">{allocationNote.cnNo}</p></div>
            </div>
            <div className="space-y-3 mt-6">
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2"><span className="font-medium text-slate-500">Original Amount:</span><span className="font-bold text-slate-900">{formatMinor(allocationNote.totalMinor)}</span></div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2"><span className="font-medium text-slate-500">Amount Applied:</span><span className="font-bold text-emerald-600">{formatMinor(allocationNote.totalMinor - allocationNote.remainingMinor)}</span></div>
              <div className="flex justify-between items-center text-sm pt-1"><span className="font-bold text-slate-700">Remaining Balance:</span><span className="font-bold text-blue-600 text-lg">{formatMinor(allocationNote.remainingMinor)}</span></div>
            </div>
            <Button onClick={() => setAllocationNote(null)} className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white font-bold h-9">Close</Button>
          </div>
        </div>,
        document.body // 🚀 Teleports directly to the body tag!
      )}
    </div>
  );
}