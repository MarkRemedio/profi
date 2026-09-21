import { MasterOverview } from "@/components/admin/overview";
import { getAdminOverview } from "./overview/actions";

export default async function AdminRootDashboardPage() {
  const overview = await getAdminOverview();

  return <MasterOverview overview={overview} />;
}
