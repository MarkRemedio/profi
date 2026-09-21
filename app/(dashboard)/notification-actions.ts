"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { deriveAlerts, type AlertLevel } from "@/lib/notifications/derive";

export type Notification = {
  key: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href: string;
  read: boolean;
};

export type NotificationFeed = {
  items: Notification[];
  /** Unread and not dismissed — what the badge shows. */
  unreadCount: number;
};

/**
 * What needs this user's attention, merged with what they have already seen.
 *
 * Read and dismissed state is per user, so one person clearing their bell does
 * not clear a colleague's. The alerts themselves are workspace-wide facts —
 * everyone with the right role sees the same overdue invoices — but whether
 * you have looked at them is yours.
 */
export async function getNotifications(): Promise<NotificationFeed> {
  const workspace = await requireAccountingWorkspace();

  const derived = await deriveAlerts(workspace.organizationId, workspace.role);
  if (derived.length === 0) return { items: [], unreadCount: 0 };

  // Muted alerts are dropped here rather than hidden in the panel, so a muted
  // type cannot contribute to the badge either. A bell showing "3" that opens
  // onto two items is worse than not having the setting at all.
  const preferences = await prisma.notificationPreference.findFirst({
    where: { userId: workspace.userId, organizationId: workspace.organizationId },
    select: { mutedKeys: true },
  });
  const muted = new Set(preferences?.mutedKeys ?? []);
  const alerts = muted.size > 0 ? derived.filter((alert) => !muted.has(alert.key)) : derived;
  if (alerts.length === 0) return { items: [], unreadCount: 0 };

  const states = await prisma.notificationState.findMany({
    where: {
      organizationId: workspace.organizationId,
      userId: workspace.userId,
      alertKey: { in: alerts.map((alert) => alert.key) },
    },
    select: { alertKey: true, fingerprint: true, readAt: true, dismissedAt: true },
  });
  const byKey = new Map(states.map((state) => [state.alertKey, state]));

  const items: Notification[] = [];
  for (const alert of alerts) {
    const state = byKey.get(alert.key);
    // A state recorded against a different fingerprint describes a situation
    // that has since changed, so it no longer applies — the alert is raised
    // again as if new.
    const current = state && state.fingerprint === alert.fingerprint ? state : null;

    if (current?.dismissedAt) continue;

    items.push({
      key: alert.key,
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
      href: alert.href,
      read: Boolean(current?.readAt),
    });
  }

  return { items, unreadCount: items.filter((item) => !item.read).length };
}

/**
 * Mark alerts as read for this user.
 *
 * Called when the panel opens, which is what clears the badge — the count
 * reflects "things you have not looked at", so opening it is the act that
 * makes them looked at.
 */
export async function markNotificationsRead(keys?: string[]): Promise<{ ok: true }> {
  const workspace = await requireAccountingWorkspace();
  const alerts = await deriveAlerts(workspace.organizationId, workspace.role);
  const target = keys?.length ? alerts.filter((a) => keys.includes(a.key)) : alerts;

  await Promise.all(
    target.map((alert) =>
      prisma.notificationState.upsert({
        where: {
          userId_organizationId_alertKey: {
            userId: workspace.userId,
            organizationId: workspace.organizationId,
            alertKey: alert.key,
          },
        },
        create: {
          userId: workspace.userId,
          organizationId: workspace.organizationId,
          alertKey: alert.key,
          fingerprint: alert.fingerprint,
          readAt: new Date(),
        },
        // The fingerprint is rewritten so this row describes the situation that
        // was actually read, not an older one.
        update: { fingerprint: alert.fingerprint, readAt: new Date(), dismissedAt: null },
      })
    )
  );

  return { ok: true };
}

/**
 * Dismiss a single alert for this user.
 *
 * It stays hidden while the situation is unchanged. Two more invoices falling
 * overdue changes the fingerprint and the alert returns — dismissing is
 * "I have dealt with this", not "never tell me again".
 */
export async function dismissNotification(key: string): Promise<{ ok: true }> {
  const workspace = await requireAccountingWorkspace();
  const alerts = await deriveAlerts(workspace.organizationId, workspace.role);
  const alert = alerts.find((candidate) => candidate.key === key);
  if (!alert) return { ok: true };

  await prisma.notificationState.upsert({
    where: {
      userId_organizationId_alertKey: {
        userId: workspace.userId,
        organizationId: workspace.organizationId,
        alertKey: alert.key,
      },
    },
    create: {
      userId: workspace.userId,
      organizationId: workspace.organizationId,
      alertKey: alert.key,
      fingerprint: alert.fingerprint,
      readAt: new Date(),
      dismissedAt: new Date(),
    },
    update: { fingerprint: alert.fingerprint, readAt: new Date(), dismissedAt: new Date() },
  });

  return { ok: true };
}

/** Dismiss everything currently showing. */
export async function dismissAllNotifications(): Promise<{ ok: true }> {
  const workspace = await requireAccountingWorkspace();
  const alerts = await deriveAlerts(workspace.organizationId, workspace.role);

  await Promise.all(
    alerts.map((alert) =>
      prisma.notificationState.upsert({
        where: {
          userId_organizationId_alertKey: {
            userId: workspace.userId,
            organizationId: workspace.organizationId,
            alertKey: alert.key,
          },
        },
        create: {
          userId: workspace.userId,
          organizationId: workspace.organizationId,
          alertKey: alert.key,
          fingerprint: alert.fingerprint,
          readAt: new Date(),
          dismissedAt: new Date(),
        },
        update: { fingerprint: alert.fingerprint, readAt: new Date(), dismissedAt: new Date() },
      })
    )
  );

  return { ok: true };
}
