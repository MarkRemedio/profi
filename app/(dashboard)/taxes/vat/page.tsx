import { VatView, type HmrcObligationsPanel } from "@/components/taxes/vat-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getVatReturn } from "@/lib/accounting/vat-return";
import { getHmrcConnectionStatus } from "@/lib/tax/hmrc-connection";
import { getVatObligationsAction } from "@/app/(dashboard)/hmrc-actions";

export const dynamic = "force-dynamic";

type VatPageProps = {
  searchParams?: Promise<{ period?: string }>;
};

export default async function VatPage({ searchParams }: VatPageProps) {
  const workspace = await requireAccountingWorkspace();
  const params = await searchParams;

  // The period is in the URL rather than component state so a return can be
  // linked to and survives a refresh — an accountant checking last quarter
  // should not lose their place on every navigation.
  const [data, connection] = await Promise.all([
    getVatReturn(workspace.organizationId, { periodKey: params?.period }),
    getHmrcConnectionStatus(workspace.organizationId),
  ]);

  // Checked first so an unconnected workspace never pays for a round trip to
  // HMRC just to be told it is not authorised.
  let hmrc: HmrcObligationsPanel = { connected: false };
  if (connection.state === "connected") {
    const obligations = await getVatObligationsAction();
    hmrc = obligations.ok
      ? { connected: true, ok: true, obligations: obligations.obligations }
      : { connected: true, ok: false, error: obligations.error, reauthorise: obligations.reauthorise };
  }

  return <VatView data={data} hmrc={hmrc} />;
}
