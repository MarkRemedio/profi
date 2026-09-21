"use client";

import { AlertTriangle, CheckCircle2, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { type FeedTransaction, useAiDocumentProposal, useConfirmAiDocumentProposal } from "@/lib/banking/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const kindLabel = { sales_receipt: "Sales receipt", invoice: "Paid invoice", expense: "Paid expense bill", supplier_bill: "Paid supplier bill" } as const;

export function AiDocumentProposalDialog({ transaction, onClose }: { transaction: FeedTransaction; onClose: () => void }) {
  const proposal = useAiDocumentProposal(transaction.id);
  const confirm = useConfirmAiDocumentProposal();
  const value = proposal.data;
  const submit = async () => {
    if (!value?.kind || !value.contact_name || !value.account_id) return;
    try {
      await confirm.mutateAsync({ txId: transaction.id });
      toast.success(`${kindLabel[value.kind]} created and transaction reconciled.`);
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the accounting record."); }
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-violet-600" /> AI accounting proposal</DialogTitle><DialogDescription>Review this proposal. No document or journal is created until you confirm.</DialogDescription></DialogHeader>
    {proposal.isLoading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Checking the transaction, contacts, and accounts…</div> : null}
    {proposal.isError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">The proposal could not be prepared. Please review this transaction manually.</div> : null}
    {value?.requires_manual_intervention ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="size-4" /> Manual intervention required</div><p className="mt-2 text-sm leading-6 text-amber-800">{value.reason}</p></div> : null}
    {value && !value.requires_manual_intervention && value.kind ? <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Record</span><span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800"><FileText className="size-3" /> {kindLabel[value.kind]}</span></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer or supplier</p><p className="mt-1 font-semibold text-slate-900">{value.contact_name}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p><p className="mt-1 font-semibold text-slate-900">{value.account_label}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why</p><p className="mt-1 text-sm leading-5 text-slate-700">{value.reason}</p></div><p className="text-xs text-slate-500">Confidence: {value.confidence}%</p></div> : null}
    <DialogFooter><Button variant="outline" onClick={onClose} disabled={confirm.isPending}>Cancel</Button>{value && !value.requires_manual_intervention && value.kind && value.contact_name ? <Button onClick={() => void submit()} disabled={confirm.isPending}>{confirm.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm, create & reconcile</Button> : null}</DialogFooter>
  </DialogContent></Dialog>;
}
