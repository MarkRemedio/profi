"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { ALERT_TYPES, type AlertKey } from "@/lib/notifications/alert-types";
import { isNotificationSound, type NotificationSound } from "@/lib/notifications/sounds";

export type NotificationPreferences = {
  /** Alert keys this person has switched off. */
  mutedKeys: AlertKey[];
  soundEnabled: boolean;
  sound: NotificationSound;
};

const DEFAULTS: NotificationPreferences = {
  mutedKeys: [],
  soundEnabled: true,
  sound: "chime",
};

/**
 * This person's notification preferences for this workspace.
 *
 * Absent row means defaults — nothing is written until somebody changes
 * something, so a workspace of twenty people does not carry twenty rows of
 * "everything on" just to say nothing was configured.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const workspace = await requireAccountingWorkspace();

  // findFirst, not findUnique: the compound key is (userId, organizationId) and
  // the tenancy extension refuses unique-only lookups it cannot scope.
  const row = await prisma.notificationPreference.findFirst({
    where: { userId: workspace.userId, organizationId: workspace.organizationId },
    select: { mutedKeys: true, soundEnabled: true, sound: true },
  });

  if (!row) return DEFAULTS;

  return {
    // Filtered against the known set, so an alert removed from the product
    // does not leave a dead key sitting in somebody's preferences forever.
    mutedKeys: row.mutedKeys.filter((key): key is AlertKey =>
      ALERT_TYPES.some((type) => type.key === key)
    ),
    soundEnabled: row.soundEnabled,
    sound: isNotificationSound(row.sound) ? row.sound : DEFAULTS.sound,
  };
}

/**
 * Saves this person's preferences.
 *
 * Deliberately not gated behind workspace-settings permission. Muting your own
 * bell is not an administrative act, and an employee who cannot turn off a
 * sound will turn off the browser tab instead.
 */
export async function saveNotificationPreferences(
  input: NotificationPreferences
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const workspace = await requireAccountingWorkspace();

    // Validated rather than trusted: these come from a form, and an unknown
    // sound name would leave the bell silently failing to play anything.
    const mutedKeys = input.mutedKeys.filter((key) =>
      ALERT_TYPES.some((type) => type.key === key)
    );
    const sound = isNotificationSound(input.sound) ? input.sound : DEFAULTS.sound;

    const existing = await prisma.notificationPreference.findFirst({
      where: { userId: workspace.userId, organizationId: workspace.organizationId },
      select: { id: true },
    });

    if (existing) {
      await prisma.notificationPreference.update({
        where: { id: existing.id },
        data: { mutedKeys, soundEnabled: input.soundEnabled, sound },
      });
    } else {
      await prisma.notificationPreference.create({
        data: {
          userId: workspace.userId,
          organizationId: workspace.organizationId,
          mutedKeys,
          soundEnabled: input.soundEnabled,
          sound,
        },
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("Failed to save notification preferences", error);
    return { ok: false, error: "Could not save your notification settings. Try again." };
  }
}
