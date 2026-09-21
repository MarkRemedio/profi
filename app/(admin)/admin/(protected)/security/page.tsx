import { MasterSecurity } from "@/components/admin/security";
import { getSecurityOverview } from "./actions";

export const metadata = { title: "Security & Audits | Admin" };

export default async function AdminSecurityPage() {
  // getSecurityOverview asserts the `security` permission itself.
  const { auditLog, onboarding, multicurrency } = await getSecurityOverview();

  return (
    <MasterSecurity auditLog={auditLog} onboarding={onboarding} multicurrency={multicurrency} />
  );
}
