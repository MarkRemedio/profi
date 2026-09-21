/** Files that may safely accompany an invoice email. */
export const MAX_INVOICE_ATTACHMENTS = 5;
export const MAX_INVOICE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_INVOICE_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

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

export type InvoiceAttachmentInput = {
  storagePath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

function extension(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

export function validateInvoiceAttachmentInput(
  attachments: InvoiceAttachmentInput[],
  userId: string,
): InvoiceAttachmentInput[] {
  if (attachments.length > MAX_INVOICE_ATTACHMENTS) {
    throw new Error(`Attach no more than ${MAX_INVOICE_ATTACHMENTS} files.`);
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") throw new Error("Invalid invoice attachment.");
    const filename = attachment.filename?.trim();
    const ext = filename ? extension(filename) : "";
    if (!filename || filename.length > 255 || !EXTENSIONS.has(ext)) {
      throw new Error("Attachments must be a PDF, image, Office document, CSV, or text file.");
    }
    if (!Number.isInteger(attachment.sizeBytes) || attachment.sizeBytes <= 0 || attachment.sizeBytes > MAX_INVOICE_ATTACHMENT_BYTES) {
      throw new Error(`${filename} must be 10 MB or smaller.`);
    }
    const expectedPrefix = `invoices/${userId}/`;
    if (!attachment.storagePath?.startsWith(expectedPrefix) || seenPaths.has(attachment.storagePath)) {
      throw new Error("Invalid invoice attachment upload.");
    }
    seenPaths.add(attachment.storagePath);
    totalBytes += attachment.sizeBytes;
  }
  if (totalBytes > MAX_INVOICE_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Invoice attachments must total 20 MB or less.");
  }
  return attachments.map((attachment) => ({
    storagePath: attachment.storagePath,
    filename: attachment.filename.trim(),
    contentType: CONTENT_TYPES[extension(attachment.filename)] ?? "application/octet-stream",
    sizeBytes: attachment.sizeBytes,
  }));
}

export function canAttachInvoiceFile(file: File): string | null {
  const ext = extension(file.name);
  if (!EXTENSIONS.has(ext)) return "Choose a PDF, image, Office document, CSV, or text file.";
  if (file.size > MAX_INVOICE_ATTACHMENT_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}
