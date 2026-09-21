import { requireAdminPermission } from "@/lib/admin/auth";
import { listFeatureRequests } from "@/lib/admin/roadmap";
import { MasterRoadmap } from "@/components/admin/roadmap";

export const metadata = { title: "Feature Roadmap | Admin" };

export default async function AdminRoadmapPage() {
  const context = await requireAdminPermission("roadmap");

  // A platform admin without a profile row (CLI-provisioned, first request)
  // has no id to vote as yet — render an empty first page rather than crash;
  // getAdminContext backfills the profile on the very next request.
  const initialData = context.profileId
    ? await listFeatureRequests(context.profileId, { page: 1 })
    : { items: [], total: 0, page: 1, pageSize: 20 };

  return <MasterRoadmap initialData={initialData} />;
}
