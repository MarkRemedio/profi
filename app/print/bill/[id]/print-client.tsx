"use client";

import { useEffect, useMemo } from "react";
import { contactDisplayName } from "@/lib/accounting/contact-name";
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
        }),
    );

  await Promise.all(pendingImages);
}

/**
 * A bill, printed through the same themed document as an invoice.
 *
 * This used to hand-roll its own markup, which meant the six layouts, the
 * colour set and the sheet sizing all stopped at the sales documents — and any
 * fix made to one had to be made twice. A bill carries the same fields under
 * different names, so it is adapted rather than reimplemented.
 *
 * The one difference that matters is direction. An invoice is issued and asks
 * to be paid; a bill is received and is an internal record of what is owed. So
 * the party shown is the supplier, and the payment instructions are suppressed
 * — printing your own bank details on a bill you received would be wrong.
 */
export function PrintBillClient({ bill, dbBranding }: { bill: any; dbBranding: unknown }) {
  const config = useMemo(() => {
    const parsed = parseInvoiceTemplateConfig(dbBranding);
    return {
      ...parsed,
      // Nobody pays you from a bill, so there is nothing to instruct.
      bankName: "",
      sortCode: "",
      accountNumber: "",
      iban: "",
      bic: "",
      contactEmail: "",
      contactPhone: "",
      // The person who entered it, not a signatory.
      preparedBy: "",
    };
  }, [dbBranding]);

  /*
   * The supplier goes where the customer would.
   *
   * `vendor` is what the loader calls it; older records only carry `contact`,
   * so both are read before falling back to something that at least says what
   * is missing.
   */
  const printable: PrintableInvoice = useMemo(
    () => ({
      ...bill,
      contactName:
        bill?.vendor ||
        (bill?.contact ? contactDisplayName(bill.contact) : null) ||
        "Supplier",
    }),
    [bill],
  );

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

  return (
    <>
      <style>{`
        @page { size: ${config.paperSize === "letter" ? "Letter" : "A4"}; margin: 0; }
        html, body { margin: 0; min-height: 100%; background: #e8edf3; }
        @media screen { body { padding: 28px; } }
        @media print {
          html, body { width: 100%; min-height: 0; background: white; }
          body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen and (max-width: 760px) { body { padding: 0; } }
      `}</style>
      <InvoicePrintDocument invoice={printable} config={config} documentLabel="Bill" />
    </>
  );
}
