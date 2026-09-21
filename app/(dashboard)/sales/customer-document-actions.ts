"use server";

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import {
  normalizeDocumentDate,
  normalizeDocumentNote,
  validateContactAttachmentInput,
  type ContactAttachmentInput,
} from "@/lib/sales/contact-attachments";

const BUCKET = "contact_attachments";
const INVOICE_BUCKET = "invoice_attachments";

export type CustomerDocument = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  documentDate: string | null;
  note: string | null;
  createdAt: string;
};

export type CustomerInvoiceDocument = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  invoiceId: string;
  invoiceNo: string;
  createdAt: string;
};

export type CustomerDocumentList = {
  documents: CustomerDocument[];
  invoiceDocuments: CustomerInvoiceDocument[];
};

function storageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Customer documents are not configured on this deployment.");
  return createSupabaseAdmin(url, serviceRoleKey);
}

async function requireContact(organizationId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true },
  });
  if (!contact) throw new Error("Customer not found.");
  return contact;
}

/**
 * Everything filed under this customer: their own document repository, plus a
 * read-only view of the files already attached to their invoices — queried
 * through the invoices, never copied.
 */
export async function listCustomerDocuments(contactId: string): Promise<CustomerDocumentList> {
  const workspace = await requireAccountingWorkspace();
  await requireContact(workspace.organizationId, contactId);

  const [documents, invoiceDocuments] = await Promise.all([
    prisma.contactAttachment.findMany({
      where: { organizationId: workspace.organizationId, contactId },
      orderBy: [{ documentDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    prisma.invoiceAttachment.findMany({
      where: {
        organizationId: workspace.organizationId,
        invoice: { contactId },
      },
      include: { invoice: { select: { id: true, invoiceNo: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    documents: documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      documentDate: doc.documentDate ? doc.documentDate.toISOString().slice(0, 10) : null,
      note: doc.note,
      createdAt: doc.createdAt.toISOString(),
    })),
    invoiceDocuments: invoiceDocuments.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      invoiceId: doc.invoice.id,
      invoiceNo: doc.invoice.invoiceNo,
      createdAt: doc.createdAt.toISOString(),
    })),
  };
}

/**
 * Persist metadata for files the browser already uploaded to storage. The
 * storage path is re-checked server-side against the uploader's own folder so
 * a forged path can never claim someone else's object.
 */
export async function addCustomerDocuments(
  contactId: string,
  attachments: ContactAttachmentInput[],
  documentDate?: string | null,
  note?: string | null,
): Promise<CustomerDocumentList> {
  const workspace = await requireAccountantRole();
  await requireContact(workspace.organizationId, contactId);

  const validated = validateContactAttachmentInput(attachments, workspace.userId);
  if (validated.length === 0) throw new Error("Choose at least one file.");
  const normalizedDate = normalizeDocumentDate(documentDate);
  const normalizedNote = normalizeDocumentNote(note);

  await prisma.contactAttachment.createMany({
    data: validated.map((attachment) => ({
      organizationId: workspace.organizationId,
      contactId,
      ...attachment,
      documentDate: normalizedDate ? new Date(`${normalizedDate}T00:00:00Z`) : null,
      note: normalizedNote,
    })),
  });

  return listCustomerDocuments(contactId);
}

export async function updateCustomerDocument(
  documentId: string,
  input: { documentDate?: string | null; note?: string | null },
): Promise<CustomerDocument> {
  const workspace = await requireAccountantRole();

  const existing = await prisma.contactAttachment.findFirst({
    where: { id: documentId, organizationId: workspace.organizationId },
    select: { id: true },
  });
  if (!existing) throw new Error("Document not found.");

  const normalizedDate = normalizeDocumentDate(input.documentDate);
  const normalizedNote = normalizeDocumentNote(input.note);

  const updated = await prisma.contactAttachment.update({
    where: { id: existing.id },
    data: {
      documentDate: normalizedDate ? new Date(`${normalizedDate}T00:00:00Z`) : null,
      note: normalizedNote,
    },
  });

  return {
    id: updated.id,
    filename: updated.filename,
    contentType: updated.contentType,
    sizeBytes: updated.sizeBytes,
    documentDate: updated.documentDate ? updated.documentDate.toISOString().slice(0, 10) : null,
    note: updated.note,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function deleteCustomerDocument(documentId: string): Promise<{ success: true }> {
  const workspace = await requireAccountantRole();

  const existing = await prisma.contactAttachment.findFirst({
    where: { id: documentId, organizationId: workspace.organizationId },
    select: { id: true, storagePath: true },
  });
  if (!existing) throw new Error("Document not found.");

  await prisma.contactAttachment.delete({ where: { id: existing.id } });

  // Best-effort storage cleanup — the record is already gone, an orphaned
  // object in a private bucket is a cost problem, not a correctness problem.
  try {
    await storageAdmin().storage.from(BUCKET).remove([existing.storagePath]);
  } catch (err) {
    console.warn("[customer-documents] could not delete stored file:", err);
  }

  return { success: true };
}

/** Short-lived signed URL so the browser can fetch from the private bucket. */
export async function getCustomerDocumentDownloadUrl(documentId: string): Promise<string> {
  const workspace = await requireAccountingWorkspace();

  const document = await prisma.contactAttachment.findFirst({
    where: { id: documentId, organizationId: workspace.organizationId },
    select: { storagePath: true, filename: true },
  });
  if (!document) throw new Error("Document not found.");

  const { data, error } = await storageAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(document.storagePath, 60, { download: document.filename });
  if (error || !data?.signedUrl) throw new Error("Could not prepare the download. Please try again.");
  return data.signedUrl;
}

/** Same as above, for a file attached to one of the customer's invoices. */
export async function getInvoiceAttachmentDownloadUrl(attachmentId: string): Promise<string> {
  const workspace = await requireAccountingWorkspace();

  const attachment = await prisma.invoiceAttachment.findFirst({
    where: { id: attachmentId, organizationId: workspace.organizationId },
    select: { storagePath: true, filename: true },
  });
  if (!attachment) throw new Error("Attachment not found.");

  const { data, error } = await storageAdmin()
    .storage.from(INVOICE_BUCKET)
    .createSignedUrl(attachment.storagePath, 60, { download: attachment.filename });
  if (error || !data?.signedUrl) throw new Error("Could not prepare the download. Please try again.");
  return data.signedUrl;
}
