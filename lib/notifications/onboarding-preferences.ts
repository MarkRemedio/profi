import { isAlertKey } from "@/lib/notifications/alert-types";
import { isNotificationSound } from "@/lib/notifications/sounds";

/**
 * The notification row to write for the person who signed up.
 *
 * Normalised in one place because both provisioning paths create it — the free
 * path in the onboarding action, the paid path on the success page — and a
 * preference that differed between them would be very hard to notice.
 *
 * In its own module rather than beside either caller: the onboarding actions
 * file is a "use server" module, and those may only export async functions.
 *
 * Unknown alert keys and sound names are dropped rather than trusted. They
 * arrive from a form, and a bad sound name leaves the bell silently failing to
 * play anything.
 */
export function notificationPreferenceInput(formData: unknown): {
  mutedKeys: string[];
  soundEnabled: boolean;
  sound: string;
} {
  const source = (formData ?? {}) as Record<string, unknown>;
  const muted = Array.isArray(source.mutedAlerts) ? source.mutedAlerts : [];

  return {
    mutedKeys: muted.filter((key) => isAlertKey(key)).slice(0, 24),
    soundEnabled: source.soundEnabled !== false,
    sound: isNotificationSound(source.notificationSound)
      ? (source.notificationSound as string)
      : "chime",
  };
}

/**
 * Whether the choices differ from what an absent row already means.
 *
 * An untouched row of "everything on" says nothing the default does not, and
 * seeding one for every signup would fill the table with rows nobody wrote.
 */
export function hasNotificationChanges(input: ReturnType<typeof notificationPreferenceInput>) {
  return input.mutedKeys.length > 0 || !input.soundEnabled || input.sound !== "chime";
}
