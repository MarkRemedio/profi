"use server";

import { requireAdminPermission } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import {
  computeSupportAnalytics,
  OPEN_STATUSES,
  type AnalyticsMessage,
  type AnalyticsTicket,
  type SupportAnalyticsData,
} from "@/lib/support/analytics";
import { displayName } from "@/lib/support/support";
import { runAsSystem } from "@/lib/tenancy/context";

/** How far back the dashboard looks by default. */
const WINDOW_DAYS = 7;
/** Ceiling on rows pulled per read, so one enormous workspace cannot stall the page. */
const TICKET_LIMIT = 1000;
const MESSAGE_LIMIT = 20_000;

/**
 * Support figures for the platform admin dashboard.
 *
 * Cross-organization by design — platform support spans every workspace — so
 * the reads run inside runAsSystem, which is the only way past the tenancy
 * firewall. The permission check happens first, and is the thing that actually
 * guards the data.
 *
 * Two windows are loaded, not one: every trend on the page compares this period
 * against the one before it, so the previous window has to be in hand as well.
 * Tickets still open are always included however old they are, because an
 * eighteen-month-old ticket nobody answered is precisely what the page is for.
 */
export async function getSupportAnalytics(): Promise<SupportAnalyticsData> {
  await requireAdminPermission("analytics");

  const now = new Date();
  const historyStart = new Date(now.getTime() - 2 * WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return runAsSystem(async () => {
    const ticketRows = await prisma.supportTicket.findMany({
      where: {
        OR: [
          { createdAt: { gte: historyStart } },
          { resolvedAt: { gte: historyStart } },
          { status: { in: OPEN_STATUSES } },
        ],
      },
      select: {
        id: true,
        subject: true,
        category: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        organization: { select: { name: true } },
        assignee: {
          select: { id: true, users: { select: { email: true, raw_user_meta_data: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: TICKET_LIMIT,
    });

    const tickets: AnalyticsTicket[] = ticketRows.map((ticket) => ({
      id: ticket.id,
      organizationName: ticket.organization.name,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      assigneeId: ticket.assignee?.id ?? null,
      assigneeName: ticket.assignee
        ? displayName(ticket.assignee.users.raw_user_meta_data, ticket.assignee.users.email)
        : null,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    }));

    // Only messages belonging to the tickets above, and only the columns the
    // maths needs — bodies and attachments would be a large read for figures
    // that never look at them.
    const messageRows = tickets.length
      ? await prisma.supportMessage.findMany({
          where: { ticketId: { in: tickets.map((ticket) => ticket.id) } },
          select: {
            ticketId: true,
            authorType: true,
            authorAdminProfileId: true,
            authorName: true,
            isInternal: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: MESSAGE_LIMIT,
        })
      : [];

    const messages: AnalyticsMessage[] = messageRows.map((message) => ({
      ticketId: message.ticketId,
      authorType: message.authorType,
      authorAdminProfileId: message.authorAdminProfileId,
      authorName: message.authorName,
      isInternal: message.isInternal,
      createdAt: message.createdAt,
    }));

    return computeSupportAnalytics({ tickets, messages, now, windowDays: WINDOW_DAYS });
  });
}
