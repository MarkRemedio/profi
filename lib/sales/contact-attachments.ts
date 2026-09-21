/** Documents kept on a customer/supplier record. Mirrors the invoice attachment limits. */
export const MAX_CONTACT_ATTACHMENTS = 5;
export const MAX_CONTACT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CONTACT_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_CONTACT_ATTACHMENT_NOTE_LENGTH = 500;

const EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "webp", "gif",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt",
]);

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
};

export type ContactAttachmentInput = {
  storagePath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

function extension(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

export function validateContactAttachmentInput(
  attachments: ContactAttachmentInput[],
  userId: string,
): ContactAttachmentInput[] {
  if (attachments.length > MAX_CONTACT_ATTACHMENTS) {
    throw new Error(`Attach no more than ${MAX_CONTACT_ATTACHMENTS} files at a time.`);
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") throw new Error("Invalid customer document.");
    const filename = attachment.filename?.trim();
    const ext = filename ? extension(filename) : "";
    if (!filename || filename.length > 255 || !EXTENSIONS.has(ext)) {
      throw new Error("Documents must be a PDF, image, Office document, CSV, or text file.");
    }
    if (!Number.isInteger(attachment.sizeBytes) || attachment.sizeBytes <= 0 || attachment.sizeBytes > MAX_CONTACT_ATTACHMENT_BYTES) {
      throw new Error(`${filename} must be 10 MB or smaller.`);
    }
    const expectedPrefix = `contacts/${userId}/`;
    if (!attachment.storagePath?.startsWith(expectedPrefix) || seenPaths.has(attachment.storagePath)) {
      throw new Error("Invalid customer document upload.");
    }
    seenPaths.add(attachment.storagePath);
    totalBytes += attachment.sizeBytes;
  }
  if (totalBytes > MAX_CONTACT_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Customer documents must total 20 MB or less per upload.");
  }
  return attachments.map((attachment) => {
    const filename = attachment.filename.trim();
    return {
      storagePath: attachment.storagePath,
      filename,
      contentType: CONTENT_TYPES[extension(filename)] ?? "application/octet-stream",
      sizeBytes: attachment.sizeBytes,
    };
  });
}

export function canAttachContactFile(file: File): string | null {
  const ext = extension(file.name);
  if (!EXTENSIONS.has(ext)) return "Choose a PDF, image, Office document, CSV, or text file.";
  if (file.size > MAX_CONTACT_ATTACHMENT_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}

/** Empty string clears the date; anything else must be a real yyyy-mm-dd. */
export function normalizeDocumentDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error("Document date must be a valid date.");
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error("Document date must be a valid date.");
  }
  return trimmed;
}

/** Empty string clears the note. */
export function normalizeDocumentNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CONTACT_ATTACHMENT_NOTE_LENGTH) {
    throw new Error(`Notes must be ${MAX_CONTACT_ATTACHMENT_NOTE_LENGTH} characters or fewer.`);
  }
  return trimmed;
}
