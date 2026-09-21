"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAdminContext, requireAdminPermission } from "@/lib/admin/auth";
import { auditActorFrom, logAdminAction } from "@/lib/admin/audit";

/** Mirrors the pipeline ladder rendered by components/admin/accountant.tsx. */
export type AccountStatus =
  | "invited"
  | "verified"
  | "awaiting_payment"
  | "payment_received"
  | "established";

export type AccountantClient = {
  id: string;
  /** Company / organization name of the client being onboarded. */
  name: string;
  email: string;
  /** Which of our products this client sits under. */
  company: string;
  plan: string;
  /** Internal accountant handling this client, or "Unassigned". */
  accountant: string;
  accountantProfileId: string | null;
  status: AccountStatus;
  created: string;
  lastActive: string;
  initials: string;
  /** True for a pending ClientInvitation, false for a live organization. */
  isInvitation: boolean;
};

export type AccountantSummary = {
  profileId: string;
  name: string;
  email: string;
  role: string;
  /** Live client organizations assigned to them. */
  liveClients: number;
  /** Invitations they sent that have not been provisioned yet. */
  pendingInvites: number;
};

export type PlanOption = {
  planCode: string;
  name: string;
  price: number;
  interval: string;
  trialDays: number;
  isFree: boolean;
  /** A paid plan with no Stripe price cannot be checked out. */
  checkoutReady: boolean;
};

export type AccountantDirectory = {
  clients: AccountantClient[];
  accountants: AccountantSummary[];
  plans: PlanOption[];
};

function initialsFrom(value: string) {
  return (
    value
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

function displayName(meta: unknown, email: string | null) {
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    if (typeof record.name === "string" && record.name) return record.name;
    if (typeof record.full_name === "string" && record.full_name) return record.full_name;
  }
  return email?.split("@")[0] || "Admin User";
}

function relativeTime(value: Date | null) {
  if (!value) return "—";
  const minutes = Math.floor((Date.now() - value.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Everything the accountant page renders, in one round trip.
 *
 * Deliberately cross-accountant: every accountant sees the full client book and
 * can act on any row. The per-accountant summary at the top is who *handles*
 * what, not a visibility boundary.
 *
 * Organization and AdminProfile are not org-scoped, so these cross-tenant reads
 * need no runAsSystem wrapper — see the note in lib/accounting/dal.ts.
 */
export async function getAccountantDirectory(): Promise<AccountantDirectory> {
  await requireAdminPermission("accountant");

  const [orgs, invitations, admins, plans] = await Promise.all([
    prisma.organization.findMany({
      where: { deleted_at: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        planCode: true,
        subscription_status: true,
        createdAt: true,
        updatedAt: true,
        managedByAdminProfileId: true,
        managedByAdmin: {
          select: { id: true, users: { select: { email: true, raw_user_meta_data: true } } },
        },
        members: {
          where: { role: "OWNER" },
          take: 1,
          select: { users: { select: { email: true } } },
        },
      },
    }),
    // Not yet provisioned: an established invitation is represented by its org.
    prisma.clientInvitation.findMany({
      where: { status: { not: "established" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        companyName: true,
        planCode: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        invitedByAdminId: true,
        invitedBy: {
          select: { id: true, users: { select: { email: true, raw_user_meta_data: true } } },
        },
      },
    }),
    prisma.adminProfile.findMany({
      // Effective access: Super Admins implicitly hold every module.
      where: {
        status: "Active",
        OR: [{ role: "SUPER_ADMIN" }, { permissions: { has: "accountant" } }],
      },
      select: {
        id: true,
        role: true,
        users: { select: { email: true, raw_user_meta_data: true } },
      },
    }),
    prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      select: {
        planCode: true,
        name: true,
        price: true,
        interval: true,
        trialDays: true,
        stripePriceId: true,
      },
    }),
  ]);

  const liveClients: AccountantClient[] = orgs.map((org) => {
    const accountantName = org.managedByAdmin
      ? displayName(
          org.managedByAdmin.users.raw_user_meta_data,
          org.managedByAdmin.users.email
        )
      : "Unassigned";

    return {
      id: org.id,
      name: org.name,
      email: org.members[0]?.users.email || "—",
      company: "Waw Profi",
      plan: org.planCode || "—",
      accountant: accountantName,
      accountantProfileId: org.managedByAdminProfileId,
      status: "established",
      created: isoDate(org.createdAt),
      lastActive: relativeTime(org.updatedAt),
      initials: initialsFrom(org.name),
      isInvitation: false,
    };
  });

  const pending: AccountantClient[] = invitations.map((invite) => ({
    id: invite.id,
    name: invite.companyName,
    email: invite.email,
    company: "Waw Profi",
    plan: invite.planCode,
    accountant: invite.invitedBy
      ? displayName(invite.invitedBy.users.raw_user_meta_data, invite.invitedBy.users.email)
      : "Unassigned",
    accountantProfileId: invite.invitedByAdminId,
    status: (invite.status as AccountStatus) ?? "invited",
    created: isoDate(invite.createdAt),
    lastActive: relativeTime(invite.updatedAt),
    initials: initialsFrom(invite.companyName),
    isInvitation: true,
  }));

  const accountants: AccountantSummary[] = admins
    .map((admin) => ({
      profileId: admin.id,
      name: displayName(admin.users.raw_user_meta_data, admin.users.email),
      email: admin.users.email || "",
      role: admin.role,
      liveClients: liveClients.filter((c) => c.accountantProfileId === admin.id).length,
      pendingInvites: pending.filter((c) => c.accountantProfileId === admin.id).length,
    }))
    .sort((a, b) => b.liveClients + b.pendingInvites - (a.liveClients + a.pendingInvites));

  return {
    // Pending invitations first: they are the rows that need chasing.
    clients: [...pending, ...liveClients],
    accountants,
    plans: plans.map((plan) => {
      const price = Number(plan.price);
      return {
        planCode: plan.planCode,
        name: plan.name,
        price,
        interval: plan.interval,
        trialDays: plan.trialDays,
        isFree: price === 0,
        checkoutReady: price === 0 || Boolean(plan.stripePriceId),
      };
    }),
  };
}

/** Reassign a client organization to a different accountant (or unassign). */
export async function assignAccountantAction(
  organizationId: string,
  adminProfileId: string | null
) {
  const context = await getAdminContext();
  if (!context.permissions.includes("accountant")) {
    return { success: false, error: "You do not have access to the accountant module." };
  }

  try {
    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: { managedByAdminProfileId: adminProfileId },
      select: { name: true },
    });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "client.assign_accountant",
      targetType: "organization",
      targetId: organizationId,
      targetLabel: org.name,
      metadata: { adminProfileId },
    });

    revalidatePath("/admin/accountant");
    return { success: true };
  } catch (error) {
    console.error("Failed to reassign accountant:", error);
    return { success: false, error: "Failed to reassign this client." };
  }
}
