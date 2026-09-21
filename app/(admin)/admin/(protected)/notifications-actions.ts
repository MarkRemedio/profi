"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/admin/auth";
import {
  getAdminNotifications,
  notificationWindowStart,
} from "@/lib/admin/notifications";

/**
 * Drop dismissal keys whose subject is older than the notification window.
 *
 * Without this the array grows forever: once an item ages out of the 7-day
 * window it can never reappear, so remembering that it was dismissed is dead
 * weight. Keys are "<type>:<uuid>", so we re-check the surviving ids against
 * the current window.
 */
async function pruneStaleKeys(keys: string[]): Promise<string[]> {
  const since = notificationWindowStart();

  const orgIds = keys.filter((k) => k.startsWith("org:")).map((k) => k.slice(4));
  const adminIds = keys.filter((k) => k.startsWith("admin:")).map((k) => k.slice(6));

  const [orgs, admins] = await Promise.all([
    orgIds.length
      ? prisma.organization.findMany({
          where: { id: { in: orgIds }, createdAt: { gte: since } },
          select: { id: true },
        })
      : Promise.resolve([]),
    adminIds.length
      ? prisma.adminProfile.findMany({
          where: { id: { in: adminIds }, createdAt: { gte: since } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const live = new Set([
    ...orgs.map((o) => `org:${o.id}`),
    ...admins.map((a) => `admin:${a.id}`),
  ]);

  return keys.filter((k) => live.has(k));
}

async function saveDismissals(profileId: string, keys: string[]) {
  await prisma.adminProfile.update({
    where: { id: profileId },
    data: { dismissedNotifications: await pruneStaleKeys([...new Set(keys)]) },
  });

  revalidatePath("/admin", "layout");
}

/** Dismiss a single notification for the calling admin only. */
export async function dismissAdminNotificationAction(key: string) {
  const context = await getAdminContext();
  if (!context.profileId) return { success: false, error: "No admin profile." };
  if (!key) return { success: false, error: "Missing notification key." };

  const profile = await prisma.adminProfile.findUnique({
    where: { id: context.profileId },
    select: { dismissedNotifications: true },
  });

  await saveDismissals(context.profileId, [
    ...(profile?.dismissedNotifications ?? []),
    key,
  ]);

  return { success: true };
}

/**
 * Dismiss everything currently visible to this admin.
 *
 * Resolves the visible set server-side rather than trusting a list from the
 * client, so this can only ever clear what the caller is actually allowed to
 * see — and cannot be used to write arbitrary keys into their row.
 */
export async function clearAdminNotificationsAction() {
  const context = await getAdminContext();
  if (!context.profileId) return { success: false, error: "No admin profile." };

  const profile = await prisma.adminProfile.findUnique({
    where: { id: context.profileId },
    select: { dismissedNotifications: true },
  });

  const current = await getAdminNotifications({
    permissions: context.permissions,
    dismissed: profile?.dismissedNotifications ?? [],
  });

  // allIds, not items — items is capped for display, and "Clear all" must
  // clear everything visible, not just the first page of it.
  await saveDismissals(context.profileId, [
    ...(profile?.dismissedNotifications ?? []),
    ...current.allIds,
  ]);

  return { success: true };
}
