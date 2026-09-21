"use client";

import { createClient } from "@/lib/supabase/client";
import {
  canAttachInvoiceFile,
  MAX_INVOICE_ATTACHMENTS,
  MAX_INVOICE_ATTACHMENT_TOTAL_BYTES,
  type InvoiceAttachmentInput,
} from "@/lib/sales/invoice-attachments";

export async function uploadInvoiceAttachments(files: File[]): Promise<InvoiceAttachmentInput[]> {
  if (files.length > MAX_INVOICE_ATTACHMENTS) {
    throw new Error(`Choose no more than ${MAX_INVOICE_ATTACHMENTS} files.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_INVOICE_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Invoice attachments must total 20 MB or less.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  return Promise.all(files.map(async (file) => {
    const validationError = canAttachInvoiceFile(file);
    if (validationError) throw new Error(validationError);
    const ext = file.name.toLowerCase().split(".").pop() || "bin";
    const storagePath = `invoices/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("invoice_attachments").upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
    return {
      storagePath,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    };
  }));
}
