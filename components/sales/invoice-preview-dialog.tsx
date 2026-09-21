"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InvoicePrintDocument,
  type PrintableInvoice,
} from "./document-templates/invoice-print-document";
import { parseInvoiceTemplateConfig } from "./document-templates/invoice-template-config";
import {
  fetchDocumentBrandingDB,
  fetchDocumentWorkspaceIdentity,
  type DocumentWorkspaceIdentity,
} from "@/app/(dashboard)/sales/document-templates/actions";
import { getInvoiceAttachmentPreviewUrls } from "@/app/(dashboard)/sales/invoice-export-actions";

/**
 * Print/PDF preview of an invoice that hasn't been saved yet.
 *
 * The saved-invoice flow prints through /print/invoice/[id], which needs a
 * database row. A working draft has none, so this renders the same
 * InvoicePrintDocument with the same workspace branding, client-side, from
 * whatever is currently on the form.
 */
export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoice,
  orgId,
  branding: brandingProp,
  docType = "invoice",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: PrintableInvoice | null;
  orgId: string;
  /**
   * Which branding record to preview against. Bills carry their own template
   * and colours, so previewing one through the invoice branding would show the
   * wrong document. Defaults to invoice, which is every existing caller.
   */
  docType?: "invoice" | "bill";
  /**
   * The workspace's invoice branding record, when the caller already holds it.
   * The invoice form fetches it for its own line-column layout, so passing it
   * here saves this dialog refetching the same row. Null or absent, the dialog
   * fetches for itself as it always has.
   */
  branding?: unknown;
}) {
  /* The print document keys every bill-specific label off this — the heading,
     "Supplier" in place of "Bill to", "Internal notes" in place of "Terms and
     conditions". Passing only the branding left a bill printing as an invoice. */
  const documentLabel = docType === "bill" ? "Bill" : "Invoice";

  const [fetchedBranding, setFetchedBranding] = useState<unknown>(null);
  const [identity, setIdentity] = useState<DocumentWorkspaceIdentity | null>(null);
  const [loading, setLoading] = useState(false);
  // Branding and workspace identity change in settings, not mid-invoice, so
  // one fetch on the first open serves every preview of this form session.
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    Promise.all([
      brandingProp != null
        ? Promise.resolve(null)
        : fetchDocumentBrandingDB(orgId, docType).catch(() => null),
      fetchDocumentWorkspaceIdentity(orgId).catch(() => null),
    ])
      .then(([brandingData, identityData]) => {
        setFetchedBranding(brandingData);
        setIdentity(identityData);
      })
      .finally(() => setLoading(false));
  }, [open, orgId, brandingProp]);

  const branding = brandingProp ?? fetchedBranding;
  const config = useMemo(() => parseInvoiceTemplateConfig(branding), [branding]);

  // Attachments split by what a browser print flow can actually show: images
  // become extra pages after the document; PDFs and Office files cannot be
  // inlined into window.print(), so they are named in a note instead — the
  // server-side combined export is the path that renders those.
  const imageAttachments = useMemo(
    () =>
      (invoice?.attachments ?? []).filter(
        (attachment) =>
          attachment.storagePath && (attachment.contentType ?? "").toLowerCase().startsWith("image/")
      ),
    [invoice?.attachments]
  );
  const otherAttachments = useMemo(
    () =>
      (invoice?.attachments ?? []).filter(
        (attachment) => !(attachment.contentType ?? "").toLowerCase().startsWith("image/")
      ),
    [invoice?.attachments]
  );

  // Signed URLs for the private bucket, refreshed whenever the preview opens —
  // they expire in minutes and the form's attachment list can change between
  // opens, so the branding-style fetch-once pattern would go stale here.
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const imagePaths = imageAttachments.map((attachment) => attachment.storagePath as string).join("\n");
  useEffect(() => {
    if (!open || !imagePaths) return;
    let cancelled = false;
    getInvoiceAttachmentPreviewUrls(imagePaths.split("\n"))
      .then((result) => {
        if (!cancelled && result.success) setAttachmentUrls(result.urls);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, imagePaths]);

  const printableImages = imageAttachments.flatMap((attachment) => {
    const url = attachmentUrls[attachment.storagePath as string];
    return url ? [{ filename: attachment.filename, url }] : [];
  });

  const printable: PrintableInvoice | null = useMemo(() => {
    if (!invoice) return null;
    return {
      ...invoice,
      organization: identity
        ? {
            name: identity.name,
            dateFormat: identity.dateFormat,
            vatRegistrationNo: identity.vatRegistrationNo,
            companyNumber: identity.companyNumber,
          }
        : null,
    };
  }, [invoice, identity]);

  const ready = open && !loading && printable !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[680px] print:hidden">
          <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between gap-3 space-y-0 border-b border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold text-slate-900">
                Print preview
              </DialogTitle>
              <p className="mt-0.5 text-[11px] text-slate-500">
                How this {documentLabel.toLowerCase()} will look when printed or saved as a PDF, using
                your workspace branding.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="mr-8 shrink-0"
              disabled={!ready}
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" />
              Print / Save PDF
            </Button>
          </DialogHeader>

          <div className="bg-slate-100 p-4">
            {loading || !printable ? (
              <div className="flex h-64 items-center justify-center text-slate-400">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <>
                <InvoicePrintDocument
                  invoice={printable}
                  config={config}
                  documentLabel={documentLabel}
                  displayMode="preview-large"
                />

                {/* Image attachments print as their own pages, so the preview
                    shows them the same way: one sheet per image. */}
                {printableImages.map((image) => (
                  <div key={image.url} className="mt-4 rounded-sm bg-white p-6 shadow-sm">
                    <p className="mb-3 text-[11px] font-semibold text-slate-500">
                      Attachment — {image.filename}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, next/image cannot optimise it */}
                    <img src={image.url} alt={image.filename} className="mx-auto max-w-full" />
                  </div>
                ))}

                {otherAttachments.length > 0 ? (
                  <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
                    {otherAttachments.length === 1
                      ? `“${otherAttachments[0].filename}” is attached but can't be shown in a browser print preview.`
                      : `${otherAttachments.length} attached documents can't be shown in a browser print preview.`}{" "}
                    They are included when the invoice is emailed; for one combined PDF, save the
                    invoice and use “Download invoice + attachments”.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-only copy at body level. window.print() prints the whole page,
          so these rules blank everything else out and promote this copy —
          portalled to <body> so no positioned ancestor can offset it — to the
          top of the sheet. Screen never sees it. */}
      {ready &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="invoice-preview-print-root" className="hidden">
            <style>{`
              @page { size: ${config.paperSize === "letter" ? "Letter" : "A4"}; margin: 0; }
              @media print {
                body * { visibility: hidden !important; }
                #invoice-preview-print-root { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
                #invoice-preview-print-root, #invoice-preview-print-root * { visibility: visible !important; }
                /* The open dialog locks body scroll; hidden overflow inside a
                   print query makes Chromium repeat the sheet, so undo it. */
                html, body { overflow: visible !important; height: auto !important; background: #fff !important; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              }
            `}</style>
            <InvoicePrintDocument
              invoice={printable!}
              config={config}
              documentLabel={documentLabel}
            />
            {/* Each image attachment on its own sheet after the invoice, the
                same order the combined PDF export appends them. */}
            {printableImages.map((image) => (
              <div key={image.url} style={{ breakBefore: "page", padding: "24px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, next/image cannot optimise it */}
                <img
                  src={image.url}
                  alt={image.filename}
                  style={{ display: "block", margin: "0 auto", maxWidth: "100%", maxHeight: "92vh" }}
                />
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
