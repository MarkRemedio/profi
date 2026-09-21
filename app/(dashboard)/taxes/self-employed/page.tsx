import { SelfEmployedView } from "@/components/taxes/self-employed-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getSelfEmployed } from "@/lib/accounting/self-employed";

export const dynamic = "force-dynamic";

type SelfEmployedPageProps = {
  searchParams?: Promise<{ year?: string }>;
};

export default async function SelfEmployedPage({ searchParams }: SelfEmployedPageProps) {
  const workspace = await requireAccountingWorkspace();
  const params = await searchParams;

  const data = await getSelfEmployed(workspace.organizationId, {
    taxYear: params?.year,
  });

  return <SelfEmployedView data={data} />;
}
