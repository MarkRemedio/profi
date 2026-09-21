"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { StatementDocument, type StatementDocumentData } from "@/components/sales/document-templates/statement/statement-document";
import type { StatementTemplateConfig } from "@/components/sales/document-templates/statement/statement-config";

export function StatementPrintClient({
  config,
  data,
}: {
  config: StatementTemplateConfig;
  data: StatementDocumentData;
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page { size: ${config.paperSize === "letter" ? "letter" : "A4"}; margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
        }
        /* Keep each invoice with its own line breakdown; repeat ledger headers. */
        .statement-ledger thead { display: table-header-group; }
        .statement-row, .statement-lines { break-inside: avoid; page-break-inside: avoid; }
        .statement-row-keep { break-after: avoid; page-break-after: avoid; }
        h1, h2, h3 { break-after: avoid; }
      `,
        }}
      />
      <div
        className={cn(
          "mx-auto w-full max-w-[820px] bg-white p-10 print:p-0",
        )}
      >
        <StatementDocument config={config} data={data} />
      </div>
    </>
  );
}
