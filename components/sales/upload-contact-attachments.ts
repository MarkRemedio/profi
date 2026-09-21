"use client";

import { createClient } from "@/lib/supabase/client";
import {
  canAttachContactFile,
  MAX_CONTACT_ATTACHMENTS,
  MAX_CONTACT_ATTACHMENT_TOTAL_BYTES,
  type ContactAttachmentInput,
} from "@/lib/sales/contact-attachments";

export async function uploadContactAttachments(files: File[]): Promise<ContactAttachmentInput[]> {
  if (files.length > MAX_CONTACT_ATTACHMENTS) {
    throw new Error(`Choose no more than ${MAX_CONTACT_ATTACHMENTS} files at a time.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_CONTACT_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Customer documents must total 20 MB or less per upload.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  return Promise.all(files.map(async (file) => {
    const validationError = canAttachContactFile(file);
    if (validationError) throw new Error(validationError);
    const ext = file.name.toLowerCase().split(".").pop() || "bin";
    const storagePath = `contacts/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("contact_attachments").upload(storagePath, file, {
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
