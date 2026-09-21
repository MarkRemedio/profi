"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CirclePlus,
  FileText,
  Inbox,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  X,
} from "lucide-react";
import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  assignSupportTicketAction,
  changeSupportPriorityAction,
  changeSupportStatusAction,
  createSupportTicketAction,
  getSupportSnapshotAction,
  getSupportTicketsAction,
  getSupportThreadAction,
  sendSupportMessageAction,
} from "@/app/(admin)/admin/(protected)/support-new/actions";
import { Button } from "@/components/ui/button";
import { uploadSupportAttachments } from "@/components/admin/upload-support-attachments";
import type { SupportSnapshot, SupportThread, SupportTicketListItem } from "@/lib/support/types";
import { cn } from "@/lib/utils";

type InboxFilter = "all" | "mine" | "unassigned";
type PendingAttachment = {
  id: string;
  name: string;
  url: string | null;
  status: "uploading" | "ready" | "error";
  error?: string;
};

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  PENDING: "Pending",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const PRIORITY_STYLES: Record<SupportTicketPriority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-50 text-red-700",
};

function readableTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function TicketRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: SupportTicketListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition",
        selected
          ? "border-teal-300 bg-teal-50"
          : "border-transparent hover:border-slate-200 hover:bg-slate-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">{ticket.organizationName}</p>
          <p className="mt-0.5 truncate text-xs text-slate-600">{ticket.subject}</p>
        </div>
        {ticket.unreadCount > 0 && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
            {ticket.unreadCount}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-[10px] text-slate-400">{ticket.lastMessage}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-bold",
            PRIORITY_STYLES[ticket.priority],
          )}
        >
          {ticket.priority.toLowerCase()}
        </span>
        <span className="text-[9px] text-slate-400">{readableTime(ticket.updatedAt)}</span>
      </div>
    </button>
  );
}

function NewTicketDialog({
  snapshot,
  onClose,
  onCreated,
}: {
  snapshot: SupportSnapshot;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [organizationId, setOrganizationId] = useState(snapshot.organizations[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<SupportTicketPriority>("MEDIUM");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const result = await createSupportTicketAction({ organizationId, subject, body, priority });
      toast.success("Support ticket created.");
      onCreated(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">New support ticket</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Client
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            >
              {snapshot.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            >
              {Object.keys(PRIORITY_STYLES).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            First message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={10_000}
              className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !organizationId || !subject.trim() || !body.trim()}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />} Create ticket
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MasterChatInbox() {
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SupportTicketStatus | "ALL">("ALL");
  const [priority, setPriority] = useState<SupportTicketPriority | "ALL">("ALL");
  const [inbox, setInbox] = useState<InboxFilter>("all");
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshTickets = useCallback(async () => {
    try {
      const next = await getSupportTicketsAction();
      setSnapshot((current) => (current ? { ...current, ...next } : current));
      setSelectedId((current) => current ?? next.tickets[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load support tickets.");
    }
  }, []);

  const refreshThread = useCallback(async () => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    try {
      setThread(await getSupportThreadAction(selectedId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the conversation.");
    }
  }, [selectedId]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        const initial = await getSupportSnapshotAction();
        setSnapshot(initial);
        setSelectedId((current) => current ?? initial.tickets[0]?.id ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load support tickets.");
      }
    }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshTickets();
    }, 10_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [refreshTickets]);

  const filteredTickets = useMemo(() => {
    if (!snapshot) return [];
    const query = search.trim().toLowerCase();
    return snapshot.tickets.filter((ticket) => {
      if (inbox === "mine" && ticket.assigneeId !== snapshot.currentAdminProfileId) return false;
      if (inbox === "unassigned" && ticket.assigneeId !== null) return false;
      if (status !== "ALL" && ticket.status !== status) return false;
      if (priority !== "ALL" && ticket.priority !== priority) return false;
      if (!query) return true;
      return [
        ticket.reference,
        ticket.organizationName,
        ticket.subject,
        ticket.category,
        ticket.requesterName,
        ticket.requesterEmail,
        ticket.lastMessage,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [inbox, priority, search, snapshot, status]);

  useEffect(() => {
    const timeout = window.setTimeout(refreshThread, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshThread();
    }, 5_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [refreshThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      void refreshTickets();
      void refreshThread();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The update could not be saved.");
      void refreshTickets();
      void refreshThread();
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const readyAttachments = attachments.filter((item) => item.status === "ready");
    if (!selectedId || (!message.trim() && readyAttachments.length === 0)) return;
    setBusy(true);
    try {
      await sendSupportMessageAction({
        ticketId: selectedId,
        body: message,
        attachments: readyAttachments.map((item) => item.url!),
        internal,
      });
      const now = new Date().toISOString();
      setThread((current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: `pending-${Date.now()}`,
                  authorType: "ADMIN",
                  authorName: "You",
                  body: message.trim(),
                  attachments: readyAttachments.map((item) => item.url!),
                  isInternal: internal,
                  createdAt: now,
                },
              ],
            }
          : current,
      );
      setMessage("");
      setAttachments([]);
      setInternal(false);
      void refreshTickets();
      window.setTimeout(() => void refreshThread(), 500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function selectAttachments(files: File[]) {
    if (!selectedId || files.length === 0) return;
    const selected = files.slice(0, 5);
    const pending = selected.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: null,
      status: "uploading" as const,
    }));
    setAttachments(pending);
    try {
      const urls = await uploadSupportAttachments(selected, selectedId);
      setAttachments(
        pending.map((item, index) => ({ ...item, url: urls[index], status: "ready" as const })),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Upload failed.";
      setAttachments(pending.map((item) => ({ ...item, status: "error" as const, error: reason })));
      toast.error(reason);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateTicketLocally(patch: Partial<SupportTicketListItem>) {
    setThread((current) =>
      current ? { ...current, ticket: { ...current.ticket, ...patch } } : current,
    );
    setSnapshot((current) =>
      current
        ? {
            ...current,
            tickets: current.tickets.map((ticket) =>
              ticket.id === selectedId ? { ...ticket, ...patch } : ticket,
            ),
          }
        : current,
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            Support &amp; Chat
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Persistent customer tickets and conversations
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-1.5 bg-teal-600 hover:bg-teal-700">
          <CirclePlus className="size-4" />
          New ticket
        </Button>
      </div>

      <div className="grid h-[calc(100vh-12rem)] min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(["all", "mine", "unassigned"] as InboxFilter[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setInbox(value)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold capitalize",
                    inbox === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets and messages"
                className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SupportTicketStatus | "ALL")}
                className="h-8 rounded-lg border border-slate-200 px-2 text-[10px]"
              >
                <option value="ALL">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportTicketPriority | "ALL")}
                className="h-8 rounded-lg border border-slate-200 px-2 text-[10px]"
              >
                <option value="ALL">All priorities</option>
                {Object.keys(PRIORITY_STYLES).map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {filteredTickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                selected={ticket.id === selectedId}
                onSelect={() => {
                  setSelectedId(ticket.id);
                  setAttachments([]);
                  setMessage("");
                }}
              />
            ))}
            {filteredTickets.length === 0 && (
              <div className="py-16 text-center text-xs text-slate-400">
                <Inbox className="mx-auto mb-2 size-6" />
                No matching tickets
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col bg-slate-50">
          {!thread ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              <MessageSquare className="mr-2 size-5" />
              Select a ticket
            </div>
          ) : (
            <>
              <header className="border-b border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400">
                      {thread.ticket.reference} · {thread.ticket.organizationName}
                    </p>
                    <h2 className="mt-1 font-bold text-slate-900">{thread.ticket.subject}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Opened by {thread.ticket.requesterName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={thread.ticket.assigneeId ?? ""}
                      onChange={(e) => {
                        const assigneeId = e.target.value || null;
                        const assigneeName =
                          snapshot.agents.find((agent) => agent.id === assigneeId)?.name ?? null;
                        updateTicketLocally({ assigneeId, assigneeName });
                        void mutate(
                          () => assignSupportTicketAction(thread.ticket.id, assigneeId),
                          "Assignment updated.",
                        );
                      }}
                      disabled={busy}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px]"
                    >
                      <option value="">Unassigned</option>
                      {snapshot.agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={thread.ticket.priority}
                      onChange={(e) => {
                        const nextPriority = e.target.value as SupportTicketPriority;
                        updateTicketLocally({ priority: nextPriority });
                        void mutate(
                          () => changeSupportPriorityAction(thread.ticket.id, nextPriority),
                          "Priority updated.",
                        );
                      }}
                      disabled={busy}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px]"
                    >
                      {Object.keys(PRIORITY_STYLES).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    <select
                      value={thread.ticket.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as SupportTicketStatus;
                        updateTicketLocally({ status: nextStatus });
                        void mutate(
                          () => changeSupportStatusAction(thread.ticket.id, nextStatus),
                          "Status updated.",
                        );
                      }}
                      disabled={busy}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px]"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.messages.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex",
                      item.authorType === "ADMIN" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl border px-3 py-2",
                        item.isInternal
                          ? "border-amber-200 bg-amber-50"
                          : item.authorType === "ADMIN"
                            ? "border-teal-600 bg-teal-600 text-white"
                            : item.authorType === "SYSTEM"
                              ? "border-slate-200 bg-slate-100"
                              : "border-slate-200 bg-white",
                      )}
                    >
                      <p
                        className={cn(
                          "mb-1 flex items-center gap-1 text-[9px] font-bold",
                          item.authorType === "ADMIN" && !item.isInternal
                            ? "text-teal-100"
                            : "text-slate-500",
                        )}
                      >
                        {item.isInternal && <Lock className="size-2.5" />}
                        {item.authorName} · {readableTime(item.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">{item.body}</p>
                      {item.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.attachments.map((url, index) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-blue-700"
                            >
                              <FileText className="size-3" />
                              Uploaded attachment {index + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <footer
                className={cn("border-t border-slate-200 bg-white p-3", internal && "bg-amber-50")}
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    onClick={() => setInternal((value) => !value)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold",
                      internal ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    <Lock className="size-3" />
                    {internal ? "Internal note" : "Reply to customer"}
                  </button>
                  {attachments.length > 0 && (
                    <span className="text-[10px] font-medium text-slate-500">
                      {attachments.filter((item) => item.status === "ready").length} of{" "}
                      {attachments.length} uploaded
                    </span>
                  )}
                </div>
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "flex min-w-0 max-w-56 items-center gap-2 rounded-lg border bg-white px-2.5 py-2",
                          item.status === "ready"
                            ? "border-emerald-200"
                            : item.status === "error"
                              ? "border-red-200 bg-red-50"
                              : "border-blue-200 bg-blue-50",
                        )}
                      >
                        <FileText className="size-4 shrink-0 text-slate-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10px] font-semibold text-slate-700">
                            {item.name}
                          </p>
                          <p
                            className={cn(
                              "flex items-center gap-1 text-[9px] font-medium",
                              item.status === "ready"
                                ? "text-emerald-700"
                                : item.status === "error"
                                  ? "text-red-600"
                                  : "text-blue-600",
                            )}
                          >
                            {item.status === "uploading" && (
                              <Loader2 className="size-2.5 animate-spin" />
                            )}
                            {item.status === "ready" && <CheckCircle2 className="size-2.5" />}
                            {item.status === "uploading"
                              ? "Uploading…"
                              : item.status === "ready"
                                ? "Uploaded and ready"
                                : item.error || "Upload failed"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((current) =>
                              current.filter((entry) => entry.id !== item.id),
                            )
                          }
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Remove ${item.name}`}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={2}
                    maxLength={10_000}
                    placeholder={
                      internal ? "Write a note visible only to admins" : "Reply to the customer"
                    }
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv"
                    className="hidden"
                    onChange={(e) => void selectAttachments(Array.from(e.target.files ?? []))}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    title="Attach files"
                  >
                    <Paperclip className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    onClick={() => void sendMessage()}
                    disabled={
                      busy ||
                      attachments.some((item) => item.status === "uploading") ||
                      (!message.trim() && !attachments.some((item) => item.status === "ready"))
                    }
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>

      {showNew && (
        <NewTicketDialog
          snapshot={snapshot}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            setSelectedId(id);
            void refreshTickets();
          }}
        />
      )}
    </div>
  );
}
