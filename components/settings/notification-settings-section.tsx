"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { Bell, Check, Loader2, Volume2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALERT_TYPES, type AlertKey } from "@/lib/notifications/alert-types";
import {
  NOTIFICATION_SOUNDS,
  playNotificationSound,
  type NotificationSound,
} from "@/lib/notifications/sounds";
import {
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/app/(dashboard)/notification-preference-actions";

/**
 * What this person is told about, and whether it makes a noise.
 *
 * Sits on the workspace settings page but is not part of it: these are the
 * signed-in user's own preferences, so unlike the cards around it there is no
 * canManage gate. Muting your own bell is not an administrative act, and an
 * employee who cannot turn off a sound closes the tab instead.
 */
export function NotificationSettingsSection({
  initial,
}: {
  initial: NotificationPreferences;
}) {
  const queryClient = useQueryClient();
  const [saving, startSaving] = useTransition();
  const [muted, setMuted] = useState<Set<AlertKey>>(new Set(initial.mutedKeys));
  const [soundEnabled, setSoundEnabled] = useState(initial.soundEnabled);
  const [sound, setSound] = useState<NotificationSound>(initial.sound);

  const initialMuted = new Set(initial.mutedKeys);
  const dirty =
    soundEnabled !== initial.soundEnabled ||
    sound !== initial.sound ||
    muted.size !== initialMuted.size ||
    [...muted].some((key) => !initialMuted.has(key));

  function toggle(key: AlertKey, wanted: boolean) {
    setMuted((current) => {
      const next = new Set(current);
      // The checkbox reads "tell me about this", the column stores what is
      // switched off — so ticked means remove from the muted set.
      if (wanted) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function preview(next: NotificationSound) {
    setSound(next);
    // Played on selection rather than only via the button: choosing from a
    // list of names you cannot hear is guesswork.
    void playNotificationSound(next);
  }

  function save() {
    startSaving(async () => {
      const result = await saveNotificationPreferences({
        mutedKeys: [...muted],
        soundEnabled,
        sound,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // The bell caches both of these. Without invalidating, muting an alert
      // leaves it in the badge and a changed sound keeps playing the old one
      // until the page is reloaded — the setting appears to save and do
      // nothing, which is the same complaint VAT registration had.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
      ]);

      toast.success("Notification settings saved");
    });
  }

  return (
    <Card id="notifications">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-blue-600" />
          <CardTitle className="text-base">Notifications</CardTitle>
        </div>
        <CardDescription>
          What the bell tells you about, and whether it makes a sound. These are your own
          settings — colleagues on this workspace keep theirs.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {ALERT_TYPES.map((type) => {
            const on = !muted.has(type.key);
            return (
              <label
                key={type.key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50"
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(checked) => toggle(type.key, checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="block font-medium text-slate-800">{type.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                    {type.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={soundEnabled}
              onCheckedChange={(checked) => setSoundEnabled(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="block font-medium text-slate-800">Play a sound</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                Only when something new appears — reopening the bell on alerts you have already
                seen stays silent.
              </span>
            </span>
          </label>

          {soundEnabled && (
            <div className="mt-4 flex flex-wrap items-end gap-2 pl-7">
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Sound</label>
                <Select value={sound} onValueChange={(value) => preview(value as NotificationSound)}>
                  <SelectTrigger className="h-10 w-full min-w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_SOUNDS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10"
                onClick={() => void playNotificationSound(sound)}
              >
                <Volume2 className="mr-1.5 size-4" />
                Test
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {!saving && !dirty && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Check className="size-3.5" />
              Saved
            </span>
          )}
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
