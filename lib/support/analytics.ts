import type {
  SupportMessageAuthorType,
  SupportTicketPriority,
  SupportTicketStatus,
} from "@prisma/client";

import { supportReference } from "@/lib/support/support";

/** A ticket nobody has finished with yet. */
export const OPEN_STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING", "ON_HOLD"];
/** A ticket that has been dealt with, however it ended. */
export const SETTLED_STATUSES: SupportTicketStatus[] = ["RESOLVED", "CLOSED"];

const PRIORITY_RANK: Record<SupportTicketPriority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** How many categories get their own row before the tail is grouped. */
const CATEGORY_ROWS = 6;
/** How many tickets the attention list shows before it stops being a list. */
const ATTENTION_ROWS = 6;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type AnalyticsTicket = {
  id: string;
  organizationName: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type AnalyticsMessage = {
  ticketId: string;
  authorType: SupportMessageAuthorType;
  authorAdminProfileId: string | null;
  authorName: string;
  isInternal: boolean;
  createdAt: Date;
};

export type SupportAnalyticsData = {
  windowDays: number;
  /** Every ticket in the system, so the view can tell "no data yet" from "a quiet week". */
  ticketsAllTime: number;
  kpis: {
    firstResponseMinutes: number | null;
    /** Percent change against the previous window. Negative is an improvement. */
    firstResponseTrendPct: number | null;
    resolutionRatePct: number | null;
    /** Percentage-point change against the previous window. Positive is an improvement. */
    resolutionRateTrendPts: number | null;
    openCount: number;
    awaitingReplyCount: number;
    /** Opened minus settled across the window: how the backlog actually moved. */
    backlogNet: number;
    resolutionMinutes: number | null;
    resolutionTrendPct: number | null;
    createdInWindow: number;
    settledInWindow: number;
    respondedInWindow: number;
  };
  responseTrend: { day: string; avgMin: number | null }[];
  volumeTrend: { day: string; created: number; settled: number }[];
  priorityMix: { priority: SupportTicketPriority; label: string; value: number }[];
  categoryMix: { category: string; open: number; settled: number; total: number }[];
  agents: {
    id: string;
    name: string;
    initials: string;
    settled: number;
    open: number;
    replies: number;
    avgReplyMinutes: number | null;
  }[];
  attention: {
    id: string;
    reference: string;
    organizationName: string;
    subject: string;
    priority: SupportTicketPriority;
    status: SupportTicketStatus;
    awaitingReply: boolean;
    waitingMinutes: number;
  }[];
};

/** Whole minutes between two instants, never negative. */
function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MINUTE_MS));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Percent change from one average to the next.
 *
 * Null when there is nothing to compare against — showing "+100%" because last
 * week happened to have no tickets would be a lie dressed as a trend.
 */
function percentChange(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Local calendar day key, so buckets line up with the reader's idea of "today". */
function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** "8m", "2h 5m", "3d 4h" — the unit people actually quote response times in. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/**
 * Every support figure on the analytics page, derived from tickets and messages.
 *
 * Kept free of Prisma and of the current time so it can be tested: the caller
 * passes `now`, and every window is measured back from it.
 *
 * Two definitions worth stating, because support dashboards routinely disagree
 * about them:
 *
 *  - A *first response* is the first non-internal admin message on a ticket.
 *    Internal notes are colleagues talking to each other, and counting them
 *    would let a team post a private note and appear to have answered.
 *  - *Resolution rate* follows the cohort of tickets raised inside the window
 *    rather than whatever closed during it, so a purge of ancient tickets
 *    cannot push this week above 100%.
 */
export function computeSupportAnalytics({
  tickets,
  messages,
  now,
  windowDays = 7,
}: {
  tickets: AnalyticsTicket[];
  messages: AnalyticsMessage[];
  now: Date;
  windowDays?: number;
}): SupportAnalyticsData {
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const previousStart = new Date(now.getTime() - 2 * windowDays * DAY_MS);

  const openStatuses = new Set<SupportTicketStatus>(OPEN_STATUSES);
  const settledStatuses = new Set<SupportTicketStatus>(SETTLED_STATUSES);

  // One pass over messages, grouped by ticket and ordered, so first-response and
  // reply-time both read from the same prepared structure rather than each
  // re-scanning the whole list.
  const byTicket = new Map<string, AnalyticsMessage[]>();
  for (const message of messages) {
    const bucket = byTicket.get(message.ticketId);
    if (bucket) bucket.push(message);
    else byTicket.set(message.ticketId, [message]);
  }
  for (const bucket of byTicket.values()) {
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  const firstResponseMinutes = new Map<string, number>();
  const lastCustomerMessageAt = new Map<string, Date>();
  const awaitingReply = new Set<string>();

  for (const [ticketId, bucket] of byTicket) {
    const ticket = ticketById.get(ticketId);
    const publicMessages = bucket.filter((message) => !message.isInternal);

    const firstAdmin = publicMessages.find((message) => message.authorType === "ADMIN");
    if (ticket && firstAdmin) {
      firstResponseMinutes.set(ticketId, minutesBetween(ticket.createdAt, firstAdmin.createdAt));
    }

    const customerMessages = publicMessages.filter((message) => message.authorType === "CUSTOMER");
    const lastCustomer = customerMessages[customerMessages.length - 1];
    if (lastCustomer) lastCustomerMessageAt.set(ticketId, lastCustomer.createdAt);

    // The ball is in our court when the newest thing anyone said was said by
    // the customer. SYSTEM notes are ignored: an automated line is not a reply.
    const conversation = publicMessages.filter((message) => message.authorType !== "SYSTEM");
    const newest = conversation[conversation.length - 1];
    if (newest?.authorType === "CUSTOMER") awaitingReply.add(ticketId);
  }

  const inWindow = (date: Date) => date >= windowStart && date <= now;
  const inPreviousWindow = (date: Date) => date >= previousStart && date < windowStart;

  const createdInWindow = tickets.filter((ticket) => inWindow(ticket.createdAt));
  const createdPreviously = tickets.filter((ticket) => inPreviousWindow(ticket.createdAt));

  const responseMinutesIn = (cohort: AnalyticsTicket[]) =>
    cohort
      .map((ticket) => firstResponseMinutes.get(ticket.id))
      .filter((value): value is number => value !== undefined);

  const currentResponses = responseMinutesIn(createdInWindow);
  const previousResponses = responseMinutesIn(createdPreviously);

  const settledShare = (cohort: AnalyticsTicket[]) => {
    if (cohort.length === 0) return null;
    const settled = cohort.filter((ticket) => settledStatuses.has(ticket.status)).length;
    return Math.round((settled / cohort.length) * 100);
  };

  const resolutionMinutesIn = (from: Date, to: Date) =>
    tickets
      .filter((ticket) => ticket.resolvedAt && ticket.resolvedAt >= from && ticket.resolvedAt <= to)
      .map((ticket) => minutesBetween(ticket.createdAt, ticket.resolvedAt!));

  const currentResolutions = resolutionMinutesIn(windowStart, now);
  const previousResolutions = resolutionMinutesIn(previousStart, windowStart);

  const currentSettledShare = settledShare(createdInWindow);
  const previousSettledShare = settledShare(createdPreviously);

  const openTickets = tickets.filter((ticket) => openStatuses.has(ticket.status));
  const settledInWindow = tickets.filter(
    (ticket) => ticket.resolvedAt && inWindow(ticket.resolvedAt),
  ).length;

  // ── Daily series ──────────────────────────────────────────────────────────
  const days: { key: string; label: string }[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * DAY_MS);
    days.push({
      key: dayKey(date),
      label: offset === 0 ? "Today" : date.toLocaleDateString("en-GB", { weekday: "short" }),
    });
  }

  const responseTrend = days.map(({ key, label }) => {
    const sameDay = tickets.filter((ticket) => dayKey(ticket.createdAt) === key);
    return { day: label, avgMin: mean(responseMinutesIn(sameDay)) };
  });

  const volumeTrend = days.map(({ key, label }) => ({
    day: label,
    created: tickets.filter((ticket) => dayKey(ticket.createdAt) === key).length,
    settled: tickets.filter((ticket) => ticket.resolvedAt && dayKey(ticket.resolvedAt) === key)
      .length,
  }));

  // ── Priority mix, over what is still open ─────────────────────────────────
  const priorityMix = (Object.keys(PRIORITY_LABELS) as SupportTicketPriority[]).map((priority) => ({
    priority,
    label: PRIORITY_LABELS[priority],
    value: openTickets.filter((ticket) => ticket.priority === priority).length,
  }));

  // ── Category mix ──────────────────────────────────────────────────────────
  const categoryTotals = new Map<string, { open: number; settled: number }>();
  for (const ticket of tickets) {
    const name = ticket.category?.trim() || "Uncategorised";
    const row = categoryTotals.get(name) ?? { open: 0, settled: 0 };
    if (settledStatuses.has(ticket.status)) row.settled += 1;
    else row.open += 1;
    categoryTotals.set(name, row);
  }
  const rankedCategories = [...categoryTotals.entries()]
    .map(([category, row]) => ({ category, ...row, total: row.open + row.settled }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  const categoryMix = rankedCategories.slice(0, CATEGORY_ROWS);
  const tail = rankedCategories.slice(CATEGORY_ROWS);
  if (tail.length > 0) {
    categoryMix.push({
      category: `Other (${tail.length})`,
      open: tail.reduce((sum, row) => sum + row.open, 0),
      settled: tail.reduce((sum, row) => sum + row.settled, 0),
      total: tail.reduce((sum, row) => sum + row.total, 0),
    });
  }

  // ── Agents ────────────────────────────────────────────────────────────────
  type AgentAccumulator = {
    id: string;
    name: string;
    settled: number;
    open: number;
    replyMinutes: number[];
  };
  const agents = new Map<string, AgentAccumulator>();
  const agentFor = (id: string, name: string): AgentAccumulator => {
    const existing = agents.get(id);
    if (existing) {
      if (existing.name === "Unknown admin" && name !== "Unknown admin") existing.name = name;
      return existing;
    }
    const created = { id, name, settled: 0, open: 0, replyMinutes: [] as number[] };
    agents.set(id, created);
    return created;
  };

  for (const ticket of tickets) {
    if (!ticket.assigneeId) continue;
    const agent = agentFor(ticket.assigneeId, ticket.assigneeName ?? "Unknown admin");
    if (settledStatuses.has(ticket.status)) agent.settled += 1;
    else if (openStatuses.has(ticket.status)) agent.open += 1;
  }

  // Reply speed measured message by message: how long this admin left the
  // customer's most recent message unanswered. An average over the ticket's
  // whole life would flatter someone who answered once and went quiet.
  for (const bucket of byTicket.values()) {
    let pendingCustomerAt: Date | null = null;
    for (const message of bucket) {
      if (message.isInternal) continue;
      if (message.authorType === "CUSTOMER") {
        pendingCustomerAt = pendingCustomerAt ?? message.createdAt;
        continue;
      }
      if (message.authorType !== "ADMIN") continue;
      if (pendingCustomerAt && message.authorAdminProfileId && inWindow(message.createdAt)) {
        agentFor(message.authorAdminProfileId, message.authorName).replyMinutes.push(
          minutesBetween(pendingCustomerAt, message.createdAt),
        );
      }
      pendingCustomerAt = null;
    }
  }

  const agentRows = [...agents.values()]
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      initials: initialsOf(agent.name),
      settled: agent.settled,
      open: agent.open,
      replies: agent.replyMinutes.length,
      avgReplyMinutes: mean(agent.replyMinutes),
    }))
    .filter((agent) => agent.settled + agent.open + agent.replies > 0)
    .sort((a, b) => b.settled - a.settled || b.replies - a.replies || a.name.localeCompare(b.name));

  // ── Needs attention ───────────────────────────────────────────────────────
  const attention = openTickets
    .map((ticket) => {
      const waitingFrom = lastCustomerMessageAt.get(ticket.id) ?? ticket.createdAt;
      return {
        id: ticket.id,
        reference: supportReference(ticket.id),
        organizationName: ticket.organizationName,
        subject: ticket.subject,
        priority: ticket.priority,
        status: ticket.status,
        awaitingReply: awaitingReply.has(ticket.id),
        waitingMinutes: minutesBetween(waitingFrom, now),
      };
    })
    .filter((row) => row.awaitingReply || PRIORITY_RANK[row.priority] >= PRIORITY_RANK.HIGH)
    .sort(
      (a, b) =>
        Number(b.awaitingReply) - Number(a.awaitingReply) ||
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
        b.waitingMinutes - a.waitingMinutes,
    )
    .slice(0, ATTENTION_ROWS);

  return {
    windowDays,
    ticketsAllTime: tickets.length,
    kpis: {
      firstResponseMinutes: mean(currentResponses),
      firstResponseTrendPct: percentChange(mean(previousResponses), mean(currentResponses)),
      resolutionRatePct: currentSettledShare,
      resolutionRateTrendPts:
        currentSettledShare === null || previousSettledShare === null
          ? null
          : currentSettledShare - previousSettledShare,
      openCount: openTickets.length,
      awaitingReplyCount: openTickets.filter((ticket) => awaitingReply.has(ticket.id)).length,
      backlogNet: createdInWindow.length - settledInWindow,
      resolutionMinutes: mean(currentResolutions),
      resolutionTrendPct: percentChange(mean(previousResolutions), mean(currentResolutions)),
      createdInWindow: createdInWindow.length,
      settledInWindow,
      respondedInWindow: currentResponses.length,
    },
    responseTrend,
    volumeTrend,
    priorityMix,
    categoryMix,
    agents: agentRows,
    attention,
  };
}
