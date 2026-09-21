import { requireAdminPermission } from "@/lib/admin/auth";
import { MasterSupportAnalytics } from "@/components/admin/support-analytics";
import { getSupportAnalytics } from "./actions";

export const metadata = { title: "Support Analytics | Admin" };

/** Support figures move as tickets do, so nothing here may be served from cache. */
export const dynamic = "force-dynamic";

export default async function AdminSupportAnalyticsPage() {
  await requireAdminPermission("analytics");

  const analytics = await getSupportAnalytics();

  return <MasterSupportAnalytics analytics={analytics} />;
}
