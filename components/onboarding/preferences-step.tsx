"use client";

import { useState } from "react";
import { Bell, Check, PanelLeft, Volume2 } from "lucide-react";

import { ALERT_TYPES } from "@/lib/notifications/alert-types";
import { NOTIFICATION_SOUNDS, playNotificationSound, type NotificationSound } from "@/lib/notifications/sounds";
import type { NavPosition } from "@/components/accounting/use-nav-position";
import { NavLayoutChooser } from "@/components/accounting/nav-layout-preview";

/**
 * How the workspace should feel before any of it is branded: where the menu
 * lives, and what the bell is allowed to interrupt them about.
 *
 * Placed ahead of the sales and purchases branding because it is the shorter,
 * cheaper pair of decisions, and because both are about the reader rather than
 * about the business — somebody who abandons the wizard here has still chosen
 * how the product behaves for them.
 *
 * Every answer here has a working default, and the card says so. Nothing on
 * this screen is a question somebody has to have an opinion about.
 */

export type PreferenceValues = {
  menuLayout: NavPosition;
  mutedAlerts: string[];
  soundEnabled: boolean;
  notificationSound: NotificationSound;
};

export function PreferencesStep({
  values,
  onChange,
  onFinish,
}: {
  values: PreferenceValues;
  onChange: (key: keyof PreferenceValues, value: unknown) => void;
  /** Moves on to the sales branding. */
  onFinish: () => void;
}) {
  /** Which preview is open full screen. Owned here so the card can be
   *  rendered more than once without two lightboxes fighting. */
  const [expanded, setExpanded] = useState<NavPosition | null>(null);

  const toggleAlert = (key: string) => {
    const muted = values.mutedAlerts.includes(key)
      ? values.mutedAlerts.filter((existing) => existing !== key)
      : [...values.mutedAlerts, key];
    onChange("mutedAlerts", muted);
  };

  return (
    <div className="flex w-full flex-col gap-6 p-6 md:p-10">
      <div>
        <p className="m-0 text-[11px] font-bold uppercase tracking-widest text-blue-600">
          Before we brand anything
        </p>
        <h2 className="m-0 mt-2 text-2xl font-black tracking-tight text-[#0B0F19] md:text-3xl">
          How should the workspace feel?
        </h2>
        <p className="m-0 mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
          Two quick choices, both changeable later in Settings. Skip them and we will use the
          side menu with every alert switched on.
        </p>
      </div>

      {/* Menu layout */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <PanelLeft className="size-4 text-blue-600" />
          <h3 className="m-0 text-sm font-extrabold text-[#0B0F19]">Menu layout</h3>
        </div>

        {/* Screenshots and video here, sketches in Workspace Settings.
            Somebody signing up has never seen either layout; somebody in
            Settings is looking at the real menu on the page behind the card. */}
        <NavLayoutChooser
          value={values.menuLayout}
          onChange={(next) => onChange("menuLayout", next)}
          expanded={expanded}
          onExpandedChange={setExpanded}
          showMedia
        />

        <p className="m-0 mt-2 text-xs leading-relaxed text-slate-400">
          Applies straight away and is remembered in this browser, so the workspace opens the way
          you chose.
        </p>
      </section>

      {/* Notifications */}
      <section>
        <div className="mb-1 flex items-center gap-2">
          <Bell className="size-4 text-blue-600" />
          <h3 className="m-0 text-sm font-extrabold text-[#0B0F19]">What the bell tells you</h3>
        </div>
        <p className="m-0 mb-3 text-xs leading-relaxed text-slate-500">
          All on to start with. Untick anything you would rather not hear about — these are your
          own settings, not the workspace&rsquo;s.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALERT_TYPES.map((type) => {
            const on = !values.mutedAlerts.includes(type.key);
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => toggleAlert(type.key)}
                aria-pressed={on}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                }`}
              >
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border-2 transition ${
                    on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-xs font-bold ${on ? "text-slate-900" : "text-slate-400"}`}
                  >
                    {type.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                    {type.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <button
            type="button"
            onClick={() => onChange("soundEnabled", !values.soundEnabled)}
            aria-pressed={values.soundEnabled}
            className="flex w-full items-start gap-2.5 text-left"
          >
            <span
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border-2 transition ${
                values.soundEnabled
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {values.soundEnabled && <Check className="size-3" />}
            </span>
            <span>
              <span className="block text-xs font-bold text-slate-900">Play a sound</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                Only when something new appears — reopening the bell on alerts you have already
                seen stays silent.
              </span>
            </span>
          </button>

          {values.soundEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={values.notificationSound}
                onChange={(event) =>
                  onChange("notificationSound", event.target.value as NotificationSound)
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
              >
                {NOTIFICATION_SOUNDS.map((sound) => (
                  <option key={sound.value} value={sound.value}>
                    {sound.label} — {sound.description}
                  </option>
                ))}
              </select>

              {/* Worth hearing before committing to it. Failures are swallowed
                  because a browser that has not had a user gesture yet will
                  refuse to play, and that is not an error worth reporting. */}
              <button
                type="button"
                onClick={() => {
                  void playNotificationSound(values.notificationSound).catch(() => {});
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <Volume2 className="size-3.5" /> Test
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-end border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={onFinish}
          className="flex h-11 items-center rounded-full bg-[#ED6A2C] px-7 text-sm font-bold text-white shadow-sm transition-transform hover:bg-[#d45d25] active:scale-95"
        >
          Next — brand your documents
        </button>
      </div>
    </div>
  );
}
