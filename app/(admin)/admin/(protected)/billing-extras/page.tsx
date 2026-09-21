import { requireAdminPermission } from "@/lib/admin/auth";
import { MasterBillingExtras } from "@/components/admin/billing-extras";

export const metadata = {
  title: "Billing Controls | Admin",
};

export default async function AdminBillingExtrasPage() {
  await requireAdminPermission("billing_controls");

  return <MasterBillingExtras />;
}