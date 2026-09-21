import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { notFound } from "next/navigation";
import { PrintBillClient } from "./print-client";
import { fetchDocumentBrandingDB } from "@/app/(dashboard)/sales/document-templates/actions";

export const dynamic = 'force-dynamic';

export default async function PrintBillPage(props: { 
  params: Promise<{ id: string }> | { id: string }
}) {
  const workspace = await requireAccountantRole();

  // 🚀 Safely unwrap the Next.js URL parameters
  const resolvedParams = await props.params;

  const bill = await prisma.bill.findFirst({
    where: { id: resolvedParams.id, organizationId: workspace.organizationId },
    include: {
      lines: { include: { account: true } },
      contact: true,
      organization: true,
    },
  });

  if (!bill) notFound();

  // 🚀 Exclusively fetch the 'bill' template styling (PO logic removed)
  const dbBranding = await fetchDocumentBrandingDB(workspace.organizationId, "bill");

  const safeBill = JSON.parse(
    JSON.stringify(bill, (key, value) => typeof value === "bigint" ? value.toString() : value)
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <PrintBillClient bill={safeBill} dbBranding={dbBranding} />
    </div>
  );
}