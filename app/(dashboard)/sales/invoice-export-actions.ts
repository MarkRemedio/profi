"use server";

import { createClient as createSupabaseAdmin, type SupabaseClient } from "@supabase/supabase-js";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";
import { prisma } from "@/lib/prisma";
import { MAX_INVOICE_ATTACHMENTS } from "@/lib/sales/invoice-attachments";
import {
  composeCombinedInvoicePdf,
  type CombinedPdfAttachment,
  type CombinedPdfLogo,
  type CombinedPdfTemplate,
} from "@/lib/sales/invoice-combined-pdf";

type ExportResult =
  | { success: true; filename: string; pdfBase64: string }
  | { success: false; error: string };

function storageAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Invoice attachment storage is not configured on this deployment.");
  }
  // This privileged client never crosses the Server Action boundary. The
  // caller is authenticated and the invoice is org-scoped before it is used.
  return createSupabaseAdmin(url, serviceRoleKey);
}

function templateStrings(value: unknown): CombinedPdfTemplate & { logo?: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const read = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : null);
  return {
    brandColor: read("brandColor"),
    companyAddress: read("companyAddress"),
    bankName: read("bankName"),
    sortCode: read("sortCode"),
    accountNumber: read("accountNumber"),
    iban: read("iban"),
    bic: read("bic"),
    notes: read("notes"),
    logo: read("logo"),
  };
}

async function loadLogo(
  admin: SupabaseClient,
  logoUrl: string | null | undefined,
): Promise<CombinedPdfLogo | null> {
  if (!logoUrl) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const source = new URL(logoUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    const marker = "/storage/v1/object/public/workspace_assets/";
    if (source.origin !== expectedOrigin || !source.pathname.startsWith(marker)) return null;

    const storagePath = decodeURIComponent(source.pathname.slice(marker.length));
    // pdf-lib does not embed SVG. The standardized export deliberately falls
    // back to the text-only header rather than rasterizing it differently from
    // the browser-print layout.
    if (storagePath.toLowerCase().endsWith(".svg")) return null;

    const { data, error } = await admin.storage.from("workspace_assets").download(storagePath);
    if (error || !data) return null;
    const contentType = data.type.toLowerCase();
    if (contentType !== "image/png" && contentType !== "image/jpeg") return null;
    return {
      bytes: new Uint8Array(await data.arrayBuffer()),
      contentType,
    };
  } catch {
    return null;
  }
}

async function loadAttachments(
  admin: SupabaseClient,
  invoice: InvoiceWithLines,
): Promise<CombinedPdfAttachment[]> {
  return Promise.all(
    invoice.attachments.map(async (attachment) => {
      const { data, error } = await admin.storage
        .from("invoice_attachments")
        .download(attachment.storagePath);

      // Preserve the attachment in the composition plan even when storage fails.
      // The composer will append an explicit failure page instead of silently
      // dropping a file the user expected to receive.
      return {
        filename: attachment.filename,
        contentType: attachment.contentType,
        bytes: error || !data ? new Uint8Array() : new Uint8Array(await data.arrayBuffer()),
      };
    }),
  );
}

/** Long enough to open the preview, look, and print; short enough that a
    leaked URL goes stale within minutes. */
const PREVIEW_URL_TTL_SECONDS = 600;

/**
 * Short-lived signed URLs so the print preview can display attachments from
 * the private bucket. A path is readable only when it is one of the caller's
 * own draft uploads (files land under `invoices/{userId}/` before any invoice
 * row exists) or belongs to an attachment of an invoice in the caller's
 * organisation — anything else is refused outright.
 */
export async function getInvoiceAttachmentPreviewUrls(
  storagePaths: string[]
): Promise<{ success: true; urls: Record<string, string> } | { success: false; error: string }> {
  try {
    const workspace = await requireAccountingWorkspace();
    const unique = [...new Set(storagePaths.filter((path) => typeof path === "string" && path.length > 0))];
    if (unique.length === 0) return { success: true, urls: {} };
    if (unique.length > MAX_INVOICE_ATTACHMENTS) {
      return { success: false, error: "Too many attachments requested." };
    }

    const ownPrefix = `invoices/${workspace.userId}/`;
    const needLookup = unique.filter((path) => !path.startsWith(ownPrefix));
    const rows = needLookup.length
      ? await prisma.invoiceAttachment.findMany({
          where: { organizationId: workspace.organizationId, storagePath: { in: needLookup } },
          select: { storagePath: true },
        })
      : [];
    const known = new Set(rows.map((row) => row.storagePath));
    if (needLookup.some((path) => !known.has(path))) {
      return { success: false, error: "One of the attachments is not on your records." };
    }

    const admin = storageAdmin();
    const urls: Record<string, string> = {};
    await Promise.all(
      unique.map(async (path) => {
        const { data, error } = await admin.storage
          .from("invoice_attachments")
          .createSignedUrl(path, PREVIEW_URL_TTL_SECONDS);
        if (!error && data?.signedUrl) urls[path] = data.signedUrl;
      })
    );
    return { success: true, urls };
  } catch (error) {
    console.error("Failed to prepare attachment previews", error);
    return { success: false, error: "Attachment previews could not be prepared." };
  }
}

export async function exportInvoiceWithAttachments(invoiceId: string): Promise<ExportResult> {
  try {
    if (!invoiceId) return { success: false, error: "That invoice could not be identified." };

    const workspace = await requireAccountingWorkspace();
    const organizationId = workspace.organizationId;
    const invoices = (await listInvoices(prisma, organizationId)) as InvoiceWithLines[];
    const invoice = invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return { success: false, error: "That invoice is no longer on your records." };
    if (invoice.attachments.length === 0) {
      return { success: false, error: "This invoice has no attachments to combine." };
    }

    const [organization, templateRow, contact] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      prisma.documentTemplate.findFirst({
        where: {
          organizationId,
          kind: "invoice",
          name: "invoice_default_branding",
        },
        select: { lines: true },
      }),
      invoice.contactId
        ? prisma.contact.findFirst({
            where: { id: invoice.contactId, organizationId },
            select: { registration_number: true },
          })
        : null,
    ]);

    const admin = storageAdmin();
    const template = templateStrings(templateRow?.lines);
    const [attachments, logo] = await Promise.all([
      loadAttachments(admin, invoice),
      loadLogo(admin, template.logo),
    ]);

    const optionalPeriod = invoice as InvoiceWithLines & {
      servicePeriodStart?: string | null;
      servicePeriodEnd?: string | null;
    };
    const pdf = await composeCombinedInvoicePdf({
      organizationName: organization?.name || "Your company",
      invoice: {
        ...invoice,
        contactRegistrationNumber: contact?.registration_number ?? null,
        servicePeriodStart: optionalPeriod.servicePeriodStart,
        servicePeriodEnd: optionalPeriod.servicePeriodEnd,
      },
      template,
      logo,
      attachments,
    });

    const safeNumber = (invoice.invoiceNo || invoice.id).replace(/[^a-z0-9_-]+/gi, "-");
    return {
      success: true,
      filename: `${safeNumber}-with-attachments.pdf`,
      pdfBase64: Buffer.from(pdf).toString("base64"),
    };
  } catch (error) {
    console.error("Failed to export invoice with attachments", error);
    return {
      success: false,
      error: "Could not build the combined PDF. Check attachment storage and try again.",
    };
  }
}
