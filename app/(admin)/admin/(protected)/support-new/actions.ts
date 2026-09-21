"use server";

import type { Prisma, SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

import { requireAdminPermission } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import {
  cleanSupportText,
  displayName,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportReference,
  validateSupportAttachments,
} from "@/lib/support/support";
import type {
  SupportDirectory,
  SupportSnapshot,
  SupportThread,
  SupportTicketListItem,
  SupportTicketSnapshot,
} from "@/lib/support/types";
import { runAsSystem } from "@/lib/tenancy/context";

const ticketInclude = {
  organization: { select: { name: true } },
  requester: { select: { email: true, raw_user_meta_data: true } },
  assignee: {
    select: { id: true, users: { select: { email: true, raw_user_meta_data: true } } },
  },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1, select: { body: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketInclude;

type TicketWithSummary = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;

function toListItem(ticket: TicketWithSummary, unreadCount = 0): SupportTicketListItem {
  const requesterEmail = ticket.requester?.email ?? "";
  const assigneeEmail = ticket.assignee?.users.email ?? null;
  return {
    id: ticket.id,
    reference: supportReference(ticket.id),
    organizationId: ticket.organizationId,
    organizationName: ticket.organization.name,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    requesterName: ticket.requester
      ? displayName(ticket.requester.raw_user_meta_data, requesterEmail)
      : "Admin-created",
    requesterEmail,
    assigneeId: ticket.assignee?.id ?? null,
    assigneeName: ticket.assignee
      ? displayName(ticket.assignee.users.raw_user_meta_data, assigneeEmail)
      : null,
    messageCount: ticket._count.messages,
    unreadCount,
    lastMessage: ticket.messages[0]?.body ?? "No messages yet",
    updatedAt: ticket.updatedAt.toISOString(),
    createdAt: ticket.createdAt.toISOString(),
  };
}

async function requireSupportAdmin() {
  return requireAdminPermission("support");
}

async function loadSupportTickets(profileId: string | null): Promise<SupportTicketSnapshot> {
  return runAsSystem(async () => {
    const [tickets, unreadGroups] = await Promise.all([
      prisma.supportTicket.findMany({
        include: ticketInclude,
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.supportMessage.groupBy({
        by: ["ticketId"],
        where: { authorType: "CUSTOMER", readByAdminAt: null },
        _count: { _all: true },
      }),
    ]);
    const unread = new Map(unreadGroups.map((row) => [row.ticketId, row._count._all]));
    return {
      tickets: tickets.map((ticket) => toListItem(ticket, unread.get(ticket.id) ?? 0)),
      currentAdminProfileId: profileId,
    };
  });
}

async function loadSupportDirectory(): Promise<SupportDirectory> {
  return runAsSystem(async () => {
    const [agents, organizations] = await Promise.all([
      prisma.adminProfile.findMany({
        where: { status: "Active" },
        include: { users: { select: { email: true, raw_user_meta_data: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.organization.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      agents: agents.map((agent) => ({
        id: agent.id,
        email: agent.users.email ?? "",
        name: displayName(agent.users.raw_user_meta_data, agent.users.email),
      })),
      organizations,
    };
  });
}

export async function getSupportTicketsAction(): Promise<SupportTicketSnapshot> {
  const admin = await requireSupportAdmin();
  return loadSupportTickets(admin.profileId);
}

export async function getSupportDirectoryAction(): Promise<SupportDirectory> {
  await requireSupportAdmin();
  return loadSupportDirectory();
}

export async function getSupportSnapshotAction(): Promise<SupportSnapshot> {
  const admin = await requireSupportAdmin();
  const [ticketSnapshot, directory] = await Promise.all([
    loadSupportTickets(admin.profileId),
    loadSupportDirectory(),
  ]);
  return { ...ticketSnapshot, ...directory };
}

export async function getSupportThreadAction(ticketId: string): Promise<SupportThread> {
  await requireSupportAdmin();
  return runAsSystem(async () => {
    const ticket = await prisma.supportTicket.findFirstOrThrow({
      where: { id: ticketId },
      include: {
        ...ticketInclude,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 200,
          include: {
            authorUser: { select: { email: true, raw_user_meta_data: true } },
            authorAdmin: {
              select: { users: { select: { email: true, raw_user_meta_data: true } } },
            },
          },
        },
      },
    });
    const hasUnreadCustomerMessage = ticket.messages.some(
      (message) => message.authorType === "CUSTOMER" && !message.readByAdminAt,
    );
    if (hasUnreadCustomerMessage) {
      await prisma.supportMessage.updateMany({
        where: { ticketId, authorType: "CUSTOMER", readByAdminAt: null },
        data: { readByAdminAt: new Date() },
      });
    }
    const orderedMessages = [...ticket.messages].reverse();
    return {
      ticket: toListItem({ ...ticket, messages: ticket.messages.slice(0, 1) }, 0),
      messages: orderedMessages.map((message) => {
        const user = message.authorUser;
        const admin = message.authorAdmin?.users;
        return {
          id: message.id,
          authorType: message.authorType,
          authorName:
            message.authorType === "SYSTEM"
              ? "System"
              : message.authorType === "ADMIN"
                ? admin
                  ? displayName(admin.raw_user_meta_data, admin.email)
                  : message.authorName
                : user
                  ? displayName(user.raw_user_meta_data, user.email)
                  : message.authorName,
          body: message.body,
          attachments: message.attachments,
          isInternal: message.isInternal,
          createdAt: message.createdAt.toISOString(),
        };
      }),
    };
  });
}

export async function createSupportTicketAction(input: {
  organizationId: string;
  subject: string;
  body: string;
  category?: string;
  priority?: SupportTicketPriority;
}): Promise<{ id: string }> {
  const admin = await requireSupportAdmin();
  if (!admin.profileId) throw new Error("Your admin profile is not ready. Refresh and try again.");
  const subject = cleanSupportText(input.subject, "Subject", 200);
  const body = cleanSupportText(input.body, "Message", 10_000);
  const category = input.category?.trim().slice(0, 80) || "General";
  const priority = SUPPORT_PRIORITIES.includes(input.priority as SupportTicketPriority)
    ? input.priority!
    : "MEDIUM";

  const ticket = await runAsSystem(async () => {
    const organization = await prisma.organization.findFirst({
      where: { id: input.organizationId, deleted_at: null },
      select: { id: true },
    });
    if (!organization) throw new Error("Client organization not found.");
    return prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: { organizationId: organization.id, subject, category, priority },
      });
      await tx.supportMessage.create({
        data: {
          organizationId: organization.id,
          ticketId: created.id,
          authorType: "ADMIN",
          authorAdminProfileId: admin.profileId,
          authorName: displayName(admin.user.user_metadata, admin.user.email),
          body,
          readByAdminAt: new Date(),
        },
      });
      return created;
    });
  });
  return { id: ticket.id };
}

export async function sendSupportMessageAction(input: {
  ticketId: string;
  body: string;
  attachments?: string[];
  internal?: boolean;
}): Promise<void> {
  const admin = await requireSupportAdmin();
  if (!admin.profileId) throw new Error("Your admin profile is not ready. Refresh and try again.");
  const attachments = validateSupportAttachments(input.attachments ?? []);
  const body = input.body.trim();
  if (!body && attachments.length === 0) throw new Error("Write a message or attach a file.");
  if (body.length > 10_000) throw new Error("Message must be 10,000 characters or less.");

  await runAsSystem(async () => {
    const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { id: input.ticketId } });
    const shouldReopen =
      !input.internal && (ticket.status === "RESOLVED" || ticket.status === "CLOSED");
    await prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          organizationId: ticket.organizationId,
          ticketId: ticket.id,
          authorType: "ADMIN",
          authorAdminProfileId: admin.profileId!,
          authorName: displayName(admin.user.user_metadata, admin.user.email),
          body,
          attachments,
          isInternal: Boolean(input.internal),
          readByAdminAt: new Date(),
        },
      });
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          updatedAt: new Date(),
          status: shouldReopen ? "OPEN" : undefined,
          resolvedAt: shouldReopen ? null : undefined,
          closedAt: shouldReopen ? null : undefined,
        },
      });
      if (ticket.feedbackReportId && shouldReopen) {
        await tx.feedbackReport.update({
          where: { id: ticket.feedbackReportId },
          data: { status: "NEW" },
        });
      }
    });
  });
}

export async function assignSupportTicketAction(ticketId: string, assigneeId: string | null) {
  await requireSupportAdmin();
  await runAsSystem(async () => {
    if (assigneeId) {
      const agent = await prisma.adminProfile.findFirst({
        where: { id: assigneeId, status: "Active" },
      });
      if (!agent) throw new Error("Support agent not found.");
    }
    await prisma.supportTicket.findFirstOrThrow({ where: { id: ticketId }, select: { id: true } });
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assigneeAdminProfileId: assigneeId },
    });
  });
}

export async function changeSupportPriorityAction(
  ticketId: string,
  priority: SupportTicketPriority,
) {
  await requireSupportAdmin();
  if (!SUPPORT_PRIORITIES.includes(priority)) throw new Error("Invalid priority.");
  await runAsSystem(async () => {
    await prisma.supportTicket.findFirstOrThrow({ where: { id: ticketId }, select: { id: true } });
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { priority } });
  });
}

export async function changeSupportStatusAction(ticketId: string, status: SupportTicketStatus) {
  await requireSupportAdmin();
  if (!SUPPORT_STATUSES.includes(status)) throw new Error("Invalid status.");
  const now = new Date();
  await runAsSystem(async () => {
    const ticket = await prisma.supportTicket.findFirstOrThrow({
      where: { id: ticketId },
      select: { feedbackReportId: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status,
          resolvedAt: status === "RESOLVED" ? now : null,
          closedAt: status === "CLOSED" ? now : null,
        },
      });
      if (ticket.feedbackReportId) {
        await tx.feedbackReport.update({
          where: { id: ticket.feedbackReportId },
          data: {
            status:
              status === "RESOLVED" || status === "CLOSED"
                ? "DONE"
                : status === "OPEN"
                  ? "NEW"
                  : "IN_PROGRESS",
          },
        });
      }
    });
  });
}
