import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

export type SupportTicketListItem = {
  id: string;
  reference: string;
  organizationId: string;
  organizationName: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  requesterName: string;
  requesterEmail: string;
  assigneeId: string | null;
  assigneeName: string | null;
  messageCount: number;
  unreadCount: number;
  lastMessage: string;
  updatedAt: string;
  createdAt: string;
};

export type SupportThreadMessage = {
  id: string;
  authorType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  authorName: string;
  body: string;
  attachments: string[];
  isInternal: boolean;
  createdAt: string;
};

export type SupportThread = {
  ticket: SupportTicketListItem;
  messages: SupportThreadMessage[];
};

export type SupportAgent = {
  id: string;
  name: string;
  email: string;
};

export type SupportOrganization = {
  id: string;
  name: string;
};

export type SupportSnapshot = {
  tickets: SupportTicketListItem[];
  agents: SupportAgent[];
  organizations: SupportOrganization[];
  currentAdminProfileId: string | null;
};

export type SupportTicketSnapshot = Pick<SupportSnapshot, "tickets" | "currentAdminProfileId">;
export type SupportDirectory = Pick<SupportSnapshot, "agents" | "organizations">;
