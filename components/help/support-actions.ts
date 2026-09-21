"use server";

import type { SupportTicketStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

const MAX_MESSAGE_LENGTH = 10_000;

function ticketDto(ticket: {
  id: string; subject: string; category: string; status: SupportTicketStatus;
  priority: string; updatedAt: Date; createdAt: Date; messages: { body: string; createdAt: Date }[];
}) {
  return {
    id: ticket.id, subject: ticket.subject, category: ticket.category, status: ticket.status,
    priority: ticket.priority, updatedAt: ticket.updatedAt.toISOString(), createdAt: ticket.createdAt.toISOString(),
    lastMessage: ticket.messages[0]?.body ?? "No updates yet.",
  };
}

export async function getMySupportTicketsAction() {
  const workspace = await requireAccountingWorkspace();
  const tickets = await prisma.supportTicket.findMany({
    where: { organizationId: workspace.organizationId, requesterUserId: workspace.userId },
    orderBy: { updatedAt: "desc" }, take: 100,
    select: { id: true, subject: true, category: true, status: true, priority: true, updatedAt: true, createdAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } } },
  });
  return tickets.map(ticketDto);
}

export async function getMySupportThreadAction(ticketId: string) {
  const workspace = await requireAccountingWorkspace();
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, organizationId: workspace.organizationId, requesterUserId: workspace.userId },
    select: {
      id: true, subject: true, category: true, status: true, priority: true, updatedAt: true, createdAt: true,
      messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, authorType: true, authorName: true, body: true, attachments: true, createdAt: true } },
    },
  });
  if (!ticket) throw new Error("Support request not found.");
  await prisma.supportMessage.updateMany({
    where: {
      organizationId: workspace.organizationId,
      ticketId: ticket.id,
      authorType: "ADMIN",
      isInternal: false,
      readByCustomerAt: null,
    },
    data: { readByCustomerAt: new Date() },
  });
  return {
    ticket: { ...ticketDto({ ...ticket, messages: ticket.messages.slice(-1).map((message) => ({ body: message.body, createdAt: message.createdAt })) }), messages: undefined },
    messages: ticket.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
  };
}

export async function sendCustomerSupportMessageAction(ticketId: string, body: string) {
  const workspace = await requireAccountingWorkspace();
  const message = body.trim();
  if (!message) throw new Error("Write a reply first.");
  if (message.length > MAX_MESSAGE_LENGTH) throw new Error("Reply must be 10,000 characters or less.");
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, organizationId: workspace.organizationId, requesterUserId: workspace.userId }, select: { id: true, status: true } });
  if (!ticket) throw new Error("Support request not found.");
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    throw new Error("This support request is closed. Only support can reopen it.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({ data: { organizationId: workspace.organizationId, ticketId: ticket.id, authorType: "CUSTOMER", authorUserId: workspace.userId, authorName: "Customer", body: message, readByCustomerAt: new Date() } });
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
  });
  revalidatePath("/help/contact");
}
