import { Suspense } from "react";
import { SecuritySettingsView } from "@/components/settings/security-settings-view";
export const metadata = { title: "Security Settings | WAW PROFI", description: "Manage your 2FA and account recovery options." };
export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading...</div>}>
      <SecuritySettingsView />
    </Suspense>
  );
}