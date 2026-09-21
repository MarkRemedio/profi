"use client";

import { useCurrency } from "@/components/currency-provider";
import { cn } from "@/lib/utils";
import {
  computeCustomerStatement,
  type StatementInvoice,
  type StatementDoc,
} from "@/lib/accounting/customer-statement";
import type { StatementTemplateConfig } from "./statement-config";
import { StatementDocument, type StatementDocumentData } from "./statement-document";

// Fixed sample data so the preview is a real, internally-consistent statement
// (running balance + aging computed by the same engine as production).
const sampleInvoices = (currency: string): StatementInvoice[] => [
  {
    id: "sample-1",
    invoiceNo: "INV-004381",
    issueDate: "2026-05-02",
    dueDate: "2026-06-01",
    status: "sent",
    currency: currency as StatementInvoice["currency"],
    subtotalMinor: 120000,
    taxMinor: 24000,
    discountMinor: 0,
    totalMinor: 144000,
    amountsAre: "exclusive",
    payments: [{ amountMinor: 144000, paidAt: "2026-05-28", accountName: "Bank" }],
    lines: [
      {
        description: "Premium SaaS Development Service",
        quantity: "1",
        unitPriceMinor: 120000,
        discountMinor: 0,
        subtotalMinor: 120000,
        taxCode: "STD",
        taxRate: 20,
        taxMinor: 24000,
        totalMinor: 144000,
      },
    ],
  },
  {
    id: "sample-2",
    invoiceNo: "INV-004392",
    issueDate: "2026-06-14",
    dueDate: "2026-07-14",
    status: "sent",
    currency: currency as StatementInvoice["currency"],
    subtotalMinor: 80000,
    taxMinor: 16000,
    discountMinor: 0,
    totalMinor: 96000,
    amountsAre: "exclusive",
    payments: [],
    lines: [
      {
        description: "Strategic Integration Architecture Scope",
        quantity: "2",
        unitPriceMinor: 40000,
        discountMinor: 0,
        subtotalMinor: 80000,
        taxCode: "STD",
        taxRate: 20,
        taxMinor: 16000,
        totalMinor: 96000,
      },
    ],
  },
];

const sampleDocs = (currency: string): StatementDoc[] => [
  { id: "cn-1", kind: "credit_note", docNo: "CN-001092", date: "2026-06-20", totalMinor: 12000, currency: currency as StatementDoc["currency"] },
];

export function StatementPreview({ config }: { config: StatementTemplateConfig }) {
  const { currency: workspaceCurrency } = useCurrency();
  const statement = computeCustomerStatement({
    invoices: sampleInvoices(workspaceCurrency),
    documents: sampleDocs(workspaceCurrency),
    params: { fromDate: null, toDate: null, asOfDate: "2026-07-16", currency: workspaceCurrency },
  });

  const data: StatementDocumentData = {
    customer: {
      id: "sample-customer",
      name: "Acme Corporation",
      email: "accounts@acme.example",
      billingAddress: "123 Client Street\nTech District, London",
    },
    statement,
    period: { from: null, to: null, asOf: "2026-07-16" },
  };

  return (
    <div
      /*
       * Grows to the statement, rather than scrolling inside one page.
       *
       * It was locked to a sheet's aspect ratio with its own scrollbar, so a
       * statement longer than a page could only be read a third at a time — and
       * unlike an invoice a statement has no fixed length: it is however many
       * transactions the period contained.
       */
      className={cn(
        "mx-auto w-full rounded-xl border border-slate-200 bg-white p-6 shadow-md",
      )}
    >
      <StatementDocument config={config} data={data} />
    </div>
  );
}
