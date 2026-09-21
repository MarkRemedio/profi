"use server";

import { Prisma } from "@prisma/client";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { answerWorkspaceQuestion } from "@/lib/ai-assistant/openai";
import { safePageContext } from "@/lib/ai-assistant/context";
import { AiRateLimitError, createRateLimitedConversation, createRateLimitedUserMessage, logAiSecurityEvent, recordAiOperationalEvent, resolveAiAccessContext, validateAiCitation } from "@/lib/ai-assistant/security";
import { assessAiRequestPolicy } from "@/lib/ai-assistant/policy";
import { getCachedWorkspaceReviewInsights, type AiReviewInsight } from "@/lib/ai-assistant/tools";
import { tryFastWorkspaceAnswer } from "@/lib/ai-assistant/fast-path";
import type { AiChatMessage, AiCitation, AiConversationDetail, AiConversationSummary } from "@/lib/ai-assistant/types";
import { prisma } from "@/lib/prisma";

const MAX_MESSAGE_LENGTH = 4_000;

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type SendAiMessageResult = ActionResult<{ conversation: AiConversationSummary; userMessage: AiChatMessage; assistantMessage: AiChatMessage }>;

function citationsFromJson(value: Prisma.JsonValue): AiCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => validateAiCitation(entry) ?? []);
}

function messageDto(message: { id: string; role: "USER" | "ASSISTANT"; content: string; citations: Prisma.JsonValue; createdAt: Date }): AiChatMessage {
  return { id: message.id, role: message.role, content: message.content, citations: citationsFromJson(message.citations), createdAt: message.createdAt.toISOString() };
}

function conversationSummary(conversation: { id: string; title: string; createdAt: Date; updatedAt: Date }): AiConversationSummary {
  return { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt.toISOString(), updatedAt: conversation.updatedAt.toISOString() };
}

function safeError(error: unknown) {
  if (error instanceof AiRateLimitError) return `You’ve reached the AI request limit. Try again in ${error.retryAfterSeconds} seconds.`;
  if (error instanceof Error && error.message === "AI_CONVERSATION_LIMIT") return "You’ve reached the saved conversation limit. Reuse an existing conversation.";
  console.error("AI Assistant request failed", error);
  if (error instanceof Error && error.message === "OPENAI_API_KEY is not configured.") {
    return "The AI Assistant is not configured yet.";
  }
  return "The AI Assistant could not answer right now. Please try again.";
}

export async function getAiInitialStateAction(): Promise<ActionResult<{ conversations: AiConversationSummary[]; active: AiConversationDetail | null }>> {
  const workspace = await requireAccountingWorkspace();
  const conversations = await prisma.aiConversation.findMany({
    where: { organizationId: workspace.organizationId, userId: workspace.userId },
    orderBy: { updatedAt: "desc" }, take: 30,
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  const latest = conversations[0];
  if (!latest) return { ok: true, data: { conversations: [], active: null } };
  const messages = await prisma.aiMessage.findMany({
    where: { organizationId: workspace.organizationId, conversationId: latest.id },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, role: true, content: true, citations: true, createdAt: true },
  });
  return {
    ok: true,
    data: {
      conversations: conversations.map(conversationSummary),
      active: { ...conversationSummary(latest), messages: messages.reverse().map(messageDto) },
    },
  };
}

export async function createAiConversationAction(): Promise<ActionResult<AiConversationDetail>> {
  const workspace = await requireAccountingWorkspace();
  try {
    const row = await createRateLimitedConversation(workspace);
    return { ok: true, data: { ...conversationSummary(row), messages: [] } };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function getAiReviewInsightsAction(): Promise<ActionResult<AiReviewInsight[]>> {
  const workspace = await requireAccountingWorkspace();
  const access = await resolveAiAccessContext(workspace);
  return { ok: true, data: await getCachedWorkspaceReviewInsights(workspace.organizationId, access.allowedAreas) };
}

export async function getAiConversationAction(conversationId: string): Promise<ActionResult<AiConversationDetail>> {
  const workspace = await requireAccountingWorkspace();
  const row = await prisma.aiConversation.findFirst({
    where: { id: conversationId, organizationId: workspace.organizationId, userId: workspace.userId },
    select: { id: true, title: true, createdAt: true, updatedAt: true, messages: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, role: true, content: true, citations: true, createdAt: true } } },
  });
  if (!row) return { ok: false, error: "Conversation not found." };
  return { ok: true, data: { ...conversationSummary(row), messages: row.messages.reverse().map(messageDto) } };
}

export async function submitAiMessageFeedbackAction(
  messageId: string,
  rating: "HELPFUL" | "NOT_HELPFUL"
): Promise<ActionResult<{ messageId: string; rating: "HELPFUL" | "NOT_HELPFUL" }>> {
  const workspace = await requireAccountingWorkspace();
  const message = await prisma.aiMessage.findFirst({
    where: {
      id: messageId,
      organizationId: workspace.organizationId,
      role: "ASSISTANT",
      conversation: { userId: workspace.userId },
    },
    select: { id: true },
  });
  if (!message) return { ok: false, error: "That AI answer is not available for feedback." };
  try {
    await prisma.aiMessageFeedback.upsert({
      where: { organizationId_userId_messageId: { organizationId: workspace.organizationId, userId: workspace.userId, messageId: message.id } },
      create: { organizationId: workspace.organizationId, userId: workspace.userId, messageId: message.id, rating },
      update: { rating },
    });
  } catch (error) {
    console.error("Could not save AI message feedback", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return {
        ok: false,
        error: "AI feedback is temporarily unavailable while the latest database update is applied.",
      };
    }

    return { ok: false, error: "Could not save your feedback. Please try again." };
  }
  return { ok: true, data: { messageId: message.id, rating } };
}

export async function sendAiMessageAction(input: { conversationId: string | null; message: string; pagePath?: string }): Promise<SendAiMessageResult> {
  const workspace = await requireAccountingWorkspace();
  const question = input.message.trim();
  if (!question) return { ok: false, error: "Enter a question first." };
  if (question.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Questions can be up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.` };
  const policy = assessAiRequestPolicy(question);
  if (!policy.allowed) {
    logAiSecurityEvent({ event: "request_limited", organizationId: workspace.organizationId, userId: workspace.userId, metadata: { reason: policy.reason } });
    recordAiOperationalEvent({ type: "REQUEST_BLOCKED", organizationId: workspace.organizationId, userId: workspace.userId, metadata: { reason: policy.reason } });
    return { ok: false, error: policy.message };
  }

  let conversation = input.conversationId
    ? await prisma.aiConversation.findFirst({ where: { id: input.conversationId, organizationId: workspace.organizationId, userId: workspace.userId }, select: { id: true, title: true, lastOpenAiResponseId: true, createdAt: true, updatedAt: true } })
    : null;
  if (input.conversationId && !conversation) return { ok: false, error: "Conversation not found." };
  if (!conversation) {
    try {
      conversation = await createRateLimitedConversation(workspace);
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  }

  let userRow;
  try {
    userRow = await createRateLimitedUserMessage({ workspace, conversationId: conversation.id, content: question });
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }

  const startedAt = performance.now();
  const [historyDescending, access] = await Promise.all([
    prisma.aiMessage.findMany({
      where: { organizationId: workspace.organizationId, conversationId: conversation.id },
      orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, role: true, content: true, citations: true, createdAt: true },
    }),
    resolveAiAccessContext(workspace),
  ]);
  const historyRows = historyDescending.reverse();

  try {
    const fastAnswer = await tryFastWorkspaceAnswer({ workspace, allowedAreas: access.allowedAreas, baseCurrency: access.organization.baseCurrency, question });
    const answer = fastAnswer ?? await answerWorkspaceQuestion({ workspace, organizationName: access.organization.name, baseCurrency: access.organization.baseCurrency, organizationFeatures: access.organization.features, pageContext: safePageContext(input.pagePath), question, history: historyRows.map(messageDto) });
    console.info(JSON.stringify({ category: "ai_performance", organizationId: workspace.organizationId, route: fastAnswer?.route ?? "model", durationMs: Math.round(performance.now() - startedAt), at: new Date().toISOString() }));
    logAiSecurityEvent({ event: "request_allowed", organizationId: workspace.organizationId, userId: workspace.userId, metadata: { role: workspace.role } });
    recordAiOperationalEvent({ type: "REQUEST_COMPLETED", organizationId: workspace.organizationId, userId: workspace.userId, durationMs: Math.round(performance.now() - startedAt), metadata: { route: fastAnswer?.route ?? "model", role: workspace.role } });
    const title = conversation.title === "New conversation" ? question.replace(/\s+/g, " ").slice(0, 80) : conversation.title;
    const [assistantRow, updatedConversation] = await prisma.$transaction(async (tx) => {
      const message = await tx.aiMessage.create({ data: { organizationId: workspace.organizationId, conversationId: conversation!.id, role: "ASSISTANT", content: answer.content, citations: answer.citations as unknown as Prisma.InputJsonValue }, select: { id: true, role: true, content: true, citations: true, createdAt: true } });
      const updated = await tx.aiConversation.update({ where: { id: conversation!.id }, data: { title, lastOpenAiResponseId: null, updatedAt: new Date() }, select: { id: true, title: true, createdAt: true, updatedAt: true } });
      return [message, updated] as const;
    });
    return { ok: true, data: { conversation: conversationSummary(updatedConversation), userMessage: messageDto(userRow), assistantMessage: messageDto(assistantRow) } };
  } catch (error) {
    logAiSecurityEvent({ event: "request_failed", organizationId: workspace.organizationId, userId: workspace.userId, metadata: { errorType: error instanceof Error ? error.name : "unknown" } });
    recordAiOperationalEvent({ type: "REQUEST_FAILED", organizationId: workspace.organizationId, userId: workspace.userId, durationMs: Math.round(performance.now() - startedAt), metadata: { errorType: error instanceof Error ? error.name : "unknown" } });
    return { ok: false, error: safeError(error) };
  }
}
