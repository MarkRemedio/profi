"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, ExternalLink, Loader2, MessageSquarePlus, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AiChatMessage, AiConversationSummary } from "@/lib/ai-assistant/types";
import type { AiReviewInsight } from "@/lib/ai-assistant/tools";
import type { SendAiMessageResult } from "./actions";

import { createAiConversationAction, getAiConversationAction, getAiInitialStateAction, getAiReviewInsightsAction, submitAiMessageFeedbackAction } from "./actions";
import { MarkdownMessage } from "./markdown-message";

const STARTERS = [
  "Why is my profit negative this month?",
  "Who owes me the most?",
  "Which invoices are overdue?",
  "What makes up my current VAT figure?",
];

/* Uneven widths, because three identical bars read as a table rather than as
   a conversation that has not arrived yet. */
const SKELETON_BARS = [
  { width: "92%", delay: "0s" },
  { width: "78%", delay: "0.12s" },
  { width: "85%", delay: "0.24s" },
];

/**
 * The "things worth a look" card.
 *
 * One component rather than the two near-identical copies this replaces,
 * which had already drifted by a margin. Both places render the same card;
 * only the spacing around it differs.
 *
 * It expands rather than appears. The insights are fetched separately from
 * the conversation, so they land after the panel has painted and settled —
 * a card that simply materialises there shunts everything below it down and
 * reads as the layout glitching rather than as the panel finding something.
 */
function InsightsCard({ insights, className }: { insights: AiReviewInsight[]; className?: string }) {
  if (insights.length === 0) return null;

  return (
    <div className={cn("aurelius-reveal", className)}>
      {/* The row the grid opens from 0fr to 1fr. Its own overflow is what
          clips the card while the height is still on its way. */}
      <div className="min-h-0 overflow-hidden">
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <AlertTriangle className="size-3.5" /> Things worth a look
          </p>
          {insights.slice(0, 3).map((insight, index) => (
            <Link
              key={insight.key}
              href={insight.href}
              className="aurelius-rise block rounded-lg bg-background px-2.5 py-2 text-xs hover:bg-amber-100/60"
              style={{ "--rise-delay": `${0.12 + index * 0.07}s` } as CSSProperties}
            >
              <span className="font-semibold text-foreground">{insight.title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{insight.detail}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AiAssistantPanel({ active, pagePath }: { active: boolean; pagePath: string }) {
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [insights, setInsights] = useState<AiReviewInsight[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState("Checking your workspace…");
  const [feedback, setFeedback] = useState<Record<string, "HELPFUL" | "NOT_HELPFUL">>({});
  const loadedRef = useRef(false);
  const optimisticIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    const result = await getAiConversationAction(id);
    if (result.ok) {
      setConversationId(id);
      setMessages(result.data.messages);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const result = await getAiInitialStateAction();
    if (!result.ok) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    setConversations(result.data.conversations);
    if (result.data.active) {
      setConversationId(result.data.active.id);
      setMessages(result.data.active.messages);
    }
    setLoading(false);
  }, []);

  const loadInsights = useCallback(async () => {
    const result = await getAiReviewInsightsAction();
    if (result.ok) setInsights(result.data);
  }, []);

  useEffect(() => {
    if (!active || loadedRef.current) return;
    loadedRef.current = true;
    void loadInitial();
    void loadInsights();
  }, [active, loadInitial, loadInsights]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function newConversation() {
    const result = await createAiConversationAction();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConversations((current) => [result.data, ...current]);
    setConversationId(result.data.id);
    setMessages([]);
    setQuestion("");
  }

  async function sendQuestion(value = question) {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setQuestion("");
    setSending(true);
    setSendingStatus("Checking permissions…");
    optimisticIdRef.current += 1;
    const optimistic: AiChatMessage = {
      id: `pending-${optimisticIdRef.current}`,
      role: "USER",
      content: trimmed,
      citations: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    let result: SendAiMessageResult | null = null;
    try {
      const response = await fetch("/api/ai-assistant/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, message: trimmed, pagePath }) });
      if (!response.ok || !response.body) throw new Error("Aurelius could not be reached.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const payload = JSON.parse(line) as { type: "progress"; message: string } | { type: "result"; result: SendAiMessageResult };
          if (payload.type === "progress") setSendingStatus(payload.message);
          else result = payload.result;
        }
      }
    } catch {
      result = { ok: false, error: "Aurelius could not answer right now. Please try again." };
    }
    if (!result) result = { ok: false, error: "Aurelius returned an incomplete answer. Please try again." };
    if (!result.ok) {
      toast.error(result.error);
      if (conversationId) await loadConversation(conversationId);
      else setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setSending(false);
      return;
    }

    setConversationId(result.data.conversation.id);
    setConversations((current) => [
      result.data.conversation,
      ...current.filter((item) => item.id !== result.data.conversation.id),
    ]);
    setMessages((current) => [
      ...current.filter((message) => message.id !== optimistic.id),
      result.data.userMessage,
      result.data.assistantMessage,
    ]);
    setSending(false);
  }

  async function submitFeedback(messageId: string, rating: "HELPFUL" | "NOT_HELPFUL") {
    const result = await submitAiMessageFeedbackAction(messageId, rating);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setFeedback((current) => ({ ...current, [messageId]: rating }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Select value={conversationId ?? undefined} onValueChange={(id) => void loadConversation(id)}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label="AI conversation">
            <SelectValue placeholder="New conversation" />
          </SelectTrigger>
          <SelectContent>
            {conversations.map((conversation) => (
              <SelectItem key={conversation.id} value={conversation.id} className="max-w-72 text-xs">
                {conversation.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" onClick={() => void newConversation()} aria-label="Start a new AI conversation">
          <MessageSquarePlus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="space-y-4 py-4 text-center" role="status" aria-label="Loading conversation">
            {/* The mark sits where the empty state puts it, at the same size,
                so the panel settles into its content rather than swapping one
                layout for another. The rings are the waiting. */}
            <div className="relative mx-auto size-11">
              <span className="aurelius-ring absolute inset-0 rounded-2xl bg-blue-500/25" />
              <span
                className="aurelius-ring absolute inset-0 rounded-2xl bg-blue-500/20"
                style={{ animationDelay: "0.8s" }}
              />
              <span className="relative flex size-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950">
                <Sparkles className="size-5" />
              </span>
            </div>

            <p className="text-xs font-medium text-muted-foreground">Reading your workspace…</p>

            {/* Placeholders where the starter questions or the first replies
                will land, so the height the panel is about to need is already
                taken and nothing jumps when they arrive. */}
            <div className="grid gap-2">
              {SKELETON_BARS.map((bar) => (
                <div
                  key={bar.width}
                  className="aurelius-sweep h-9 rounded-xl bg-muted/60"
                  style={{ width: bar.width, "--sweep-delay": bar.delay } as CSSProperties}
                />
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Ask about your books</p>
              <p className="mt-1 text-xs text-muted-foreground">I can explain figures and link you to the records behind them.</p>
            </div>
            <div className="grid gap-2 text-left">
              <InsightsCard insights={insights} className="mb-1" />
              {STARTERS.map((starter) => (
                <button key={starter} type="button" onClick={() => void sendQuestion(starter)} className="rounded-xl border bg-muted/20 px-3 py-2 text-left text-xs font-medium transition-colors hover:border-blue-200 hover:bg-blue-50/60">
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
          <InsightsCard insights={insights} />
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "USER" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-xs", message.role === "USER" ? "bg-blue-600 text-white" : "border bg-muted/30 text-foreground")}>
                {message.role === "ASSISTANT" && (
                  <div className="mb-1.5 flex items-center gap-1 font-semibold text-blue-600"><Bot className="size-3.5" /> WAWPROFI AI</div>
                )}
                <MarkdownMessage content={message.content} inverted={message.role === "USER"} />
                {message.role === "ASSISTANT" && (
                  <div className="mt-2 flex items-center gap-1 border-t pt-2">
                    <span className="mr-1 text-[10px] text-muted-foreground">Was this useful?</span>
                    <Button type="button" variant="ghost" size="icon" className={cn("size-6", feedback[message.id] === "HELPFUL" && "bg-green-100 text-green-700")} onClick={() => void submitFeedback(message.id, "HELPFUL")} aria-label="Mark answer helpful" title="Helpful">
                      <ThumbsUp className="size-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className={cn("size-6", feedback[message.id] === "NOT_HELPFUL" && "bg-red-100 text-red-700")} onClick={() => void submitFeedback(message.id, "NOT_HELPFUL")} aria-label="Mark answer not helpful" title="Not helpful">
                      <ThumbsDown className="size-3" />
                    </Button>
                  </div>
                )}
                {message.citations.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</p>
                    <div className="flex flex-wrap gap-1.5">
                      {message.citations.map((citation) => (
                        <Link key={`${citation.type}-${citation.id}`} href={citation.href} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-50">
                          {citation.label}<ExternalLink className="size-2.5" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          </>
        )}
        {sending && (
          <div className="flex justify-start" role="status" aria-live="polite">
            <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {sendingStatus}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea aria-label="Ask Aurelius" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} placeholder="Ask about invoices, VAT, profit…" rows={2} maxLength={4000} disabled={sending} className="min-h-16 resize-none text-xs" />
          <Button type="button" size="icon" className="size-9 shrink-0" disabled={!question.trim() || sending} onClick={() => void sendQuestion()} aria-label="Send question"><Send className="size-4" /></Button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">This assistant provides general guidance based on your workspace data and is not tax or accounting advice.</p>
      </div>
    </div>
  );
}
