import { notFound } from "next/navigation";
import { contactDisplayName } from "@/lib/accounting/contact-name";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { PrintLayoutClient } from "./print-client";

type PrintDocumentType = "invoice" | "quote" | "credit_note";

function readDocumentType(value: string | undefined): PrintDocumentType {
  if (value === "quote" || value === "credit_note") return value;
  return "invoice";
}

/**
 * Internal printable sales document. Every read is scoped to the signed-in
 * workspace. Customer-facing invoices use their separately minted share URL.
 */
export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const workspace = await requireAccountingWorkspace();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const docType = readDocumentType(query.type);

  let documentData: Record<string, unknown> | null = null;

  if (docType === "credit_note") {
    documentData = await runAsSystem(async () => {
      const creditNote = await prisma.creditNote.findFirst({
        where: { id, organizationId: workspace.organizationId },
        include: { contact: true, organization: true },
      });
      if (!creditNote) return null;

      /*
       * The VAT actually credited, not zero.
       *
       * This was written when a credit note had no tax breakdown, so it printed
       * the whole amount as net with "VAT 0.00" underneath. Now that the split
       * is stored — and reversed in the ledger — printing zero would put a
       * figure on a VAT document that contradicts the journal behind it, on the
       * one piece of paper the customer and HMRC actually see.
       *
       * Rows written before the split have a zero subtotal against a real
       * total; read as all net, which is what they were.
       */
      const netMinor =
        creditNote.subtotalMinor > BigInt(0) ? creditNote.subtotalMinor : creditNote.totalMinor;
      const taxMinor = creditNote.taxMinor;

      // For the rate shown on the line. Derived from the amounts rather than
      // looked up, so it always agrees with the figures printed beside it.
      const taxRate = netMinor > BigInt(0) ? (Number(taxMinor) / Number(netMinor)) * 100 : 0;

      return {
        ...creditNote,
        invoiceNo: creditNote.cnNo,
        issueDate: creditNote.date,
        dueDate: null,
        contactName: creditNote.contact ? contactDisplayName(creditNote.contact) : "Customer",
        contactRegistrationNumber: creditNote.contact?.registration_number ?? null,
        subtotalMinor: netMinor,
        discountMinor: 0,
        taxMinor,
        amountPaidMinor: 0,
        payments: [],
        attachments: [],
        lines: [
          {
            description: "Account adjustment / credit applied",
            accountName: "Sales returns and write-offs",
            quantity: 1,
            unitPriceMinor: netMinor,
            taxRate,
            totalMinor: netMinor,
          },
        ],
      };
    });
  } else {
    documentData = await runAsSystem(async () => {
      const [invoices, organization] = await Promise.all([
        listInvoices(prisma, workspace.organizationId),
        prisma.organization.findUnique({
          where: { id: workspace.organizationId },
          select: {
            name: true,
            dateFormat: true,
            vatRegistrationNo: true,
            companyNumber: true,
          },
        }),
      ]);
      const invoice = (invoices as InvoiceWithLines[]).find((candidate) => candidate.id === id);
      return invoice ? { ...invoice, organization } : null;
    });
  }

  if (!documentData) notFound();

  const brandingProfile = await runAsSystem(async () =>
    prisma.documentTemplate.findFirst({
      where: {
        organizationId: workspace.organizationId,
        kind: docType,
        name: `${docType}_default_branding`,
      },
    }),
  );

  const safeDocument = JSON.parse(
    JSON.stringify(documentData, (_key, value) =>
      typeof value === "bigint" ? Number(value) : value,
    ),
  );
  const safeBranding = brandingProfile ? JSON.parse(JSON.stringify(brandingProfile.lines)) : null;

  return <PrintLayoutClient invoice={safeDocument} dbBranding={safeBranding} docType={docType} />;
}
