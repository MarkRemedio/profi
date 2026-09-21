"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  dismissAllNotifications,
  dismissNotification,
  getNotifications,
  markNotificationsRead,
  type Notification,
} from "@/app/(dashboard)/notification-actions";
import { getNotificationPreferences } from "@/app/(dashboard)/notification-preference-actions";
import { playNotificationSound } from "@/lib/notifications/sounds";

const LEVEL_STYLES: Record<Notification["level"], { dot: string; text: string }> = {
  danger: { dot: "bg-red-500", text: "text-red-700" },
  warning: { dot: "bg-amber-500", text: "text-amber-700" },
  info: { dot: "bg-blue-500", text: "text-blue-700" },
};

/**
 * Everything shown here is derived from the ledger when the panel opens —
 * overdue invoices, bills due, drafts awaiting approval. Nothing is stored but
 * each person's read and dismissed state, so the list can never disagree with
 * the books and one colleague clearing their bell leaves everyone else's alone.
 */
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Cleared locally the moment the panel opens, so the badge responds instantly
  // rather than waiting for the server round trip to come back.
  const [badgeCleared, setBadgeCleared] = useState(false);

  // react-query rather than an effect: the badge needs to be right on first
  // paint, and a fetch-in-effect would set state during mount on every page of
  // the app. Kept fresh for a minute so moving between pages does not re-query
  // the ledger each time.
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: getNotifications,
    staleTime: 60_000,
    // A failed read leaves the bell quiet rather than putting an error badge on
    // every page.
    retry: false,
  });

  // Held for much longer than the feed: somebody changes their sound once and
  // then never again, so re-reading it every minute is pure noise.
  const { data: preferences } = useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: getNotificationPreferences,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const soundEnabled = preferences?.soundEnabled ?? false;
  const sound = preferences?.sound ?? "chime";

  const items = data?.items ?? [];
  const unread = badgeCleared ? 0 : (data?.unreadCount ?? 0);

  /*
   * Ring only for an alert this session has not seen before.
   *
   * Keyed on the alert key, so an overdue count going from 3 to 4 does not
   * chime again — the situation was already raised. The first load is silent
   * too: arriving at the app to a noise about something that has been true all
   * week is startling, and it is exactly what a naive "unread > 0" check would
   * do on every page navigation.
   */
  const seenKeys = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;

    const keys = new Set(data.items.filter((item) => !item.read).map((item) => item.key));

    if (seenKeys.current === null) {
      seenKeys.current = keys;
      return;
    }

    const fresh = [...keys].some((key) => !seenKeys.current!.has(key));
    seenKeys.current = keys;

    if (fresh && soundEnabled) void playNotificationSound(sound);
  }, [data, soundEnabled, sound]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    // Opening is what clears the badge: the count means "things you have not
    // looked at", and you have now looked at them. The list itself stays until
    // dismissed, so nothing vanishes while being read.
    setBadgeCleared(true);
    await markNotificationsRead().catch(() => null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  }

  async function handleDismiss(key: string) {
    await dismissNotification(key).catch(() => null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  }

  async function handleDismissAll() {
    await dismissAllNotifications().catch(() => null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative size-8 sm:size-9 rounded-full hover:bg-slate-100"
        >
          <Bell className="size-4 sm:size-[18px] text-slate-500" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[340px] max-w-[calc(100vw-1rem)] rounded-2xl border-slate-100 p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="m-0 text-sm font-bold text-slate-900">Needs attention</p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleDismissAll}
              className="flex items-center gap-1 border-none bg-transparent text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              <Check className="size-3" />
              Clear all
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-slate-500">
            <Loader2 className="size-3.5 animate-spin" />
            Checking…
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="m-0 text-sm font-semibold text-slate-600">You&apos;re all caught up</p>
            <p className="m-0 mt-1 text-xs text-slate-400">
              Nothing needs your attention right now.
            </p>
          </div>
        )}

        {!isLoading &&
          items.map((item) => {
            const style = LEVEL_STYLES[item.level];
            return (
              <div
                key={item.key}
                className="group flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-b-0 hover:bg-slate-50/60"
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", style.dot)} />

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-left cursor-pointer"
                >
                  <p className={cn("m-0 text-xs font-bold", style.text)}>{item.title}</p>
                  <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {item.detail}
                  </p>
                </button>

                <button
                  type="button"
                  aria-label={`Dismiss: ${item.title}`}
                  onClick={() => handleDismiss(item.key)}
                  className="shrink-0 rounded-md border-none bg-transparent p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}

        {!isLoading && items.length > 0 && (
          <p className="m-0 border-t border-slate-100 px-4 py-2.5 text-[10px] leading-relaxed text-slate-400">
            Dismissing hides an item until the situation changes — two more invoices falling
            overdue will raise it again.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
