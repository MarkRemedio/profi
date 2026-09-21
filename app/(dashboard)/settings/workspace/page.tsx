import { Lock } from "lucide-react";

import { WorkspaceSettingsView } from "@/components/settings/workspace-settings-view";
import { NotificationSettingsSection } from "@/components/settings/notification-settings-section";
import { MenuLayoutCard } from "@/components/settings/menu-layout-card";
import { getNotificationPreferences } from "@/app/(dashboard)/notification-preference-actions";
import { getHmrcPanelState } from "@/app/(dashboard)/hmrc-actions";
import {
  canOpenWorkspaceSettings,
  getWorkspaceSettings,
} from "@/app/(dashboard)/workspace-settings-actions";

export const dynamic = "force-dynamic";

/**
 * Workspace settings — currency, date format, VAT registration and the tax profile.
 *
 * These lived in a dialog with no URL, which meant nothing could link to them:
 * a link to "/settings" was a 404, the tax pages had to raise a window event to
 * open the dialog, and the notification alert for a missing VAT number had to
 * point somewhere else entirely. A route fixes all three.
 *
 * Read on the server so the form arrives populated rather than filling in a
 * moment later — the dialog's own load was what let a checkbox be ticked and
 * then quietly reverted by the arriving data.
 *
 * Owners and accountants only. The menu item is hidden from everyone else, but
 * the check has to be here too: a hidden link is not a permission.
 */
export default async function WorkspaceSettingsPage() {
  // Read regardless of role: these are the signed-in user's own preferences,
  // not the workspace's, so they are shown on both branches below.
  const notificationPreferences = await getNotificationPreferences();

  if (!(await canOpenWorkspaceSettings())) {
    return (
      <div className="w-full space-y-6 pb-16">
        <div className="border-b border-slate-100 pb-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Workspace Settings
          </h1>
          {/* Describes what this particular viewer can do here. The full
              heading promises currency and VAT, which is misleading on a page
              that is about to tell them they cannot see either. */}
          <p className="mt-1 text-slate-600">
            Your menu layout and notification settings. The rest of this page is managed by the
            owner or the accountant.
          </p>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="shrink-0 rounded-lg bg-slate-100 p-3">
            <Lock className="size-5 text-slate-500" />
          </div>
          <div>
            <p className="m-0 text-sm font-semibold text-slate-900">
              You do not have access to these settings
            </p>
            <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">
              Currency, date format, VAT registration and the tax profile are managed by the owner
              or the accountant on this workspace. Ask one of them if something here needs
              changing.
            </p>
          </div>
        </div>

        {/* Both still shown to everyone. Muting your own bell is not an
            administrative act, and somebody who cannot turn off a sound will
            close the tab instead; the same goes for where their own menu sits,
            which is stored in their browser and affects nobody else. Leaving
            these out would mean a member could be handed the bottom menu during
            onboarding and then have no way at all to move it back. */}
        <MenuLayoutCard />

        <NotificationSettingsSection initial={notificationPreferences} />
      </div>
    );
  }

  const [settings, hmrc] = await Promise.all([getWorkspaceSettings(), getHmrcPanelState()]);

  return (
    <WorkspaceSettingsView
      settings={settings}
      notificationPreferences={notificationPreferences}
      hmrc={hmrc}
    />
  );
}
