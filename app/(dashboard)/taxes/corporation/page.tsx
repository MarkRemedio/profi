import { CorporationView } from "@/components/taxes/corporation-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getCorporationTax } from "@/lib/accounting/corporation-tax";

export const dynamic = "force-dynamic";

type CorporationPageProps = {
  searchParams?: Promise<{ year?: string }>;
};

export default async function CorporationPage({ searchParams }: CorporationPageProps) {
  const workspace = await requireAccountingWorkspace();
  const params = await searchParams;

  const data = await getCorporationTax(workspace.organizationId, {
    yearKey: params?.year,
  });

  return <CorporationView data={data} />;
}
