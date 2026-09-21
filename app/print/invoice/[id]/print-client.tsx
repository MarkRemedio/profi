"use client";

import { useEffect, useMemo } from "react";
import {
  InvoicePrintDocument,
  type PrintableInvoice,
} from "@/components/sales/document-templates/invoice-print-document";
import { parseInvoiceTemplateConfig } from "@/components/sales/document-templates/invoice-template-config";

async function waitForPrintAssets() {
  if (document.fonts?.ready) await document.fonts.ready;

  const pendingImages = Array.from(document.images)
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    );

  await Promise.all(pendingImages);
}

export function PrintLayoutClient({
  invoice,
  dbBranding,
  docType,
}: {
  invoice: PrintableInvoice;
  dbBranding: unknown;
  /*
   * Passed in, not read from the URL here.
   *
   * This used to call useSearchParams(). The server resolves the same query
   * parameter to pick the branding record, so it already renders the document
   * with the right label — but the client read it again during hydration, and on
   * ?type=credit_note or ?type=quote the two disagreed about the heading. React
   * then re-rendered the subtree rather than adopting it, leaving the printed
   * output with the document twice and a second page.
   *
   * Only those two types were affected because "invoice" is the fallback both
   * sides use, so they happened to agree.
   */
  docType: string;
}) {
  const config = useMemo(() => parseInvoiceTemplateConfig(dbBranding), [dbBranding]);

  useEffect(() => {
    let cancelled = false;
    void waitForPrintAssets().then(() => {
      if (cancelled) return;
      window.setTimeout(() => window.print(), 150);
    });

    return () => {
      cancelled = true;
    };
  }, [config]);

  const documentLabel = useMemo(() => {
    if (docType === "quote") return "Quote";
    if (docType === "credit_note") return "Credit note";
    return "Invoice";
  }, [docType]);

  return (
    <>
      <style>{`
        @page { size: ${config.paperSize === "letter" ? "Letter" : "A4"}; margin: 0; }
        html, body { margin: 0; min-height: 100%; background: #e8edf3; }
        @media screen { body { padding: 28px; } }
        @media print {
          html, body { width: 100%; min-height: 0; background: white; }
          body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Nothing sets overflow or height on the body here.
             Both were added speculatively while chasing a second page, and
             hiding overflow on the body inside a print query makes Chromium lay
             the same content out on every sheet - which is what produced two
             identical copies. The page box comes from the at-page rule above;
             the body needs no help from us. */
        }
        @media screen and (max-width: 760px) { body { padding: 0; } }
      `}</style>
      <InvoicePrintDocument invoice={invoice} config={config} documentLabel={documentLabel} />
    </>
  );
}
