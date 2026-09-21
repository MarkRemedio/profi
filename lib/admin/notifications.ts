import "server-only";

import { prisma } from "@/lib/prisma";
import type { AdminPermissionKey } from "./permissions";

export type AdminNotificationItem = {
  /** Stable dismissal key: "org:<id>" or "admin:<id>". */
  id: string;
  kind: "client" | "subscriber" | "admin";
  title: string;
  detail: string;
  href: string;
  createdAt: string;
};

export type AdminNotifications = {
  newClients: number;
  newSubscribers: number;
  newAdmins: number;
  total: number;
  /** Capped for display. */
  items: AdminNotificationItem[];
  /** Every visible key, uncapped — so "Clear all" really clears all. */
  allIds: string[];
};

/** How far back a signup still counts as "new" in the bell. */
export const NOTIFICATION_WINDOW_DAYS = 7;
const MAX_ITEMS = 12;

export function notificationWindowStart(): Date {
  return new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Recent activity for the header bell, scoped to one admin.
 *
 * Each source is gated by the permission that owns it, so an admin only ever
 * sees notifications for areas they can actually open:
 *   clients / subscribers → `clients`
 *   new administrators    → `team`
 *
 * Dismissals are per-admin (AdminProfile.dismissedNotifications), so one admin
 * clearing their bell leaves everyone else's untouched.
 *
 * Organization and AdminProfile are not org-scoped, so these cross-tenant reads
 * need no runAsSystem wrapper — see the note in lib/accounting/dal.ts.
 *
 * Caveat: there is no "subscription started" timestamp on Organization, so a
 * new subscriber is approximated as a recently-created org that already holds
 * an active subscription. A client who signed up months ago and upgraded today
 * will not appear. Adding a `subscribedAt` column would make this exact.
 */
export async function getAdminNotifications({
  permissions,
  dismissed = [],
}: {
  permissions: readonly string[];
  dismissed?: readonly string[];
}): Promise<AdminNotifications> {
  const since = notificationWindowStart();
  const can = (key: AdminPermissionKey) => permissions.includes(key);
  const isDismissed = new Set(dismissed);

  const [orgs, admins] = await Promise.all([
    can("clients")
      ? prisma.organization.findMany({
          where: { createdAt: { gte: since }, deleted_at: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, subscription_status: true, createdAt: true },
        })
      : Promise.resolve([]),
    can("team")
      ? prisma.adminProfile.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            role: true,
            createdAt: true,
            users: { select: { email: true, raw_user_meta_data: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const isSubscriber = (status: string | null) => status === "active";

  const orgItems: AdminNotificationItem[] = orgs.map((org) => ({
    id: `org:${org.id}`,
    kind: isSubscriber(org.subscription_status) ? "subscriber" : "client",
    title: org.name,
    detail: isSubscriber(org.subscription_status)
      ? "New subscriber"
      : `New client · ${org.subscription_status || "trial"}`,
    href: "/admin/clients",
    createdAt: org.createdAt.toISOString(),
  }));

  /*
   * An admin profile whose auth user has gone.
   *
   * The relation is declared as a cascade, so this should not arise — but a
   * cascade is only enforced while foreign keys are, and anything deleting the
   * user with session_replication_role set to replica leaves the profile behind
   * silently. It also happens to a half-finished signup.
   *
   * The cost of not handling it was the whole admin area: this runs in the
   * protected layout, so one orphaned row threw before any page beneath it
   * rendered. A notification nobody can act on is worth losing; the console is
   * not.
   */
  const adminItems: AdminNotificationItem[] = admins.flatMap((profile) => {
    if (!profile.users) return [];

    const meta = profile.users.raw_user_meta_data as Record<string, unknown> | null;
    const name =
      (typeof meta?.name === "string" && meta.name) ||
      profile.users.email?.split("@")[0] ||
      "Admin User";

    return {
      id: `admin:${profile.id}`,
      kind: "admin" as const,
      title: name,
      detail: `New administrator · ${profile.role.replace(/_/g, " ").toLowerCase()}`,
      href: "/admin/team",
      createdAt: profile.createdAt.toISOString(),
    };
  });

  const visible = [...orgItems, ...adminItems]
    .filter((item) => !isDismissed.has(item.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    newClients: visible.filter((i) => i.kind === "client").length,
    newSubscribers: visible.filter((i) => i.kind === "subscriber").length,
    newAdmins: visible.filter((i) => i.kind === "admin").length,
    total: visible.length,
    items: visible.slice(0, MAX_ITEMS),
    allIds: visible.map((i) => i.id),
  };
}
