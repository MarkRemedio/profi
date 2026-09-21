"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMySupportThreadAction, getMySupportTicketsAction, sendCustomerSupportMessageAction } from "./support-actions";

type Ticket = Awaited<ReturnType<typeof getMySupportTicketsAction>>[number];
type Thread = Awaited<ReturnType<typeof getMySupportThreadAction>>;
const labels: Record<Ticket["status"], string> = {
  OPEN: "Received",
  IN_PROGRESS: "In progress",
  PENDING: "Pending",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function SupportRequestsView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (options: { showLoading?: boolean; silent?: boolean } = {}) => {
    const { showLoading = true, silent = false } = options;
    if (showLoading) setLoading(true);
    try {
      setTickets(await getMySupportTicketsAction());
    } catch {
      if (!silent) toast.error("Could not load your support requests.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);
  const open = useCallback(async (id: string, options: { refreshList?: boolean; silent?: boolean } = {}) => {
    const { refreshList = true, silent = false } = options;
    try {
      setThread(await getMySupportThreadAction(id));
      if (refreshList) await load({ showLoading: false, silent });
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not open this request.");
    }
  }, [load]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load({ showLoading: false, silent: true });
      }
    }, 10_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [load]);
  useEffect(() => {
    const ticketId = thread?.ticket.id;
    if (!ticketId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void open(ticketId, { refreshList: false, silent: true });
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [open, thread?.ticket.id]);
  const send = async () => { if (!thread || !reply.trim()) return; try { await sendCustomerSupportMessageAction(thread.ticket.id, reply); setReply(""); await open(thread.ticket.id); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send your reply."); } };

  return <div className="w-full space-y-6 pb-10">
    <div><h1 className="text-2xl font-extrabold text-slate-950">My Support Requests</h1><p className="mt-1 text-sm text-slate-500">Track reports you have sent and reply when our team needs more information.</p></div>
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <section className="rounded-xl border bg-white"><div className="flex items-center justify-between border-b p-3"><p className="text-sm font-bold">Requests</p><Button variant="ghost" size="icon" className="size-8" onClick={() => void load()} aria-label="Refresh requests"><RefreshCw className="size-4" /></Button></div>
        {loading ? <p className="p-4 text-sm text-slate-500">Loading…</p> : tickets.length === 0 ? <p className="p-4 text-sm text-slate-500">No support requests yet. Use the feedback button to report an issue.</p> : <div className="divide-y">{tickets.map((ticket) => <button key={ticket.id} onClick={() => void open(ticket.id)} className="w-full p-3 text-left hover:bg-slate-50"><div className="flex justify-between gap-2"><span className="truncate text-sm font-semibold">{ticket.subject}</span><span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{labels[ticket.status]}</span></div><p className="mt-1 line-clamp-1 text-xs text-slate-500">{ticket.lastMessage}</p><p className="mt-1 text-[11px] text-slate-400">Updated {new Date(ticket.updatedAt).toLocaleDateString()}</p></button>)}</div>}</section>
      <section className="min-h-[28rem] rounded-xl border bg-white">{!thread ? <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500"><MessageCircle className="size-9 text-slate-300" /><p className="mt-3 text-sm font-semibold">Select a request to view its updates</p></div> : <><div className="border-b p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-bold">{thread.ticket.subject}</h2><span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{labels[thread.ticket.status]}</span></div><p className="mt-1 text-xs text-slate-500">Status updates and replies from support appear here. Internal staff notes are never shown.</p></div><div className="max-h-[26rem] space-y-3 overflow-y-auto p-4">{thread.messages.map((message) => <div key={message.id} className={message.authorType === "CUSTOMER" ? "ml-auto max-w-[80%] rounded-2xl bg-blue-600 p-3 text-sm text-white" : "max-w-[80%] rounded-2xl bg-slate-100 p-3 text-sm text-slate-800"}><p className="mb-1 text-[11px] font-bold opacity-75">{message.authorType === "CUSTOMER" ? "You" : "Support"}</p><p className="whitespace-pre-wrap">{message.body}</p>{message.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.attachments.map((attachment) => <a key={attachment} href={attachment} target="_blank" rel="noreferrer" className="rounded border border-current/20 px-2 py-1 text-[11px] underline">View attachment</a>)}</div>}<p className="mt-1 text-[10px] opacity-65">{new Date(message.createdAt).toLocaleString()}</p></div>)}</div>{["RESOLVED", "CLOSED"].includes(thread.ticket.status) ? <div className="border-t p-4"><p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600"><CheckCircle2 className="size-4 shrink-0 text-green-600" /> This request has been {thread.ticket.status === "RESOLVED" ? "resolved" : "closed"} by support. Replies are disabled; only support can reopen it.</p></div> : <div className="border-t p-4"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to support…" maxLength={10000} rows={3}/><div className="mt-2 flex justify-end"><Button onClick={() => void send()} disabled={!reply.trim()}><Send className="size-4" /> Send reply</Button></div></div>}</>}</section>
    </div><p className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="size-4 text-green-600" /> Your support conversations are private to your workspace.</p>
  </div>;
}
