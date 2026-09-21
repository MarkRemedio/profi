/** Files that may safely accompany an expense claim receipt. */
export const MAX_BILL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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

export type BillAttachmentInput = {
  storagePath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

function extension(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

export function validateBillAttachmentInput(
  attachment: BillAttachmentInput | null | undefined,
  userId: string,
): BillAttachmentInput | null {
  if (!attachment) return null;
  if (typeof attachment !== "object") throw new Error("Invalid receipt attachment.");

  const filename = attachment.filename?.trim();
  const ext = filename ? extension(filename) : "";
  if (!filename || filename.length > 255 || !EXTENSIONS.has(ext)) {
    throw new Error("Receipt attachments must be a PDF, image, Office document, CSV, or text file.");
  }
  if (!Number.isInteger(attachment.sizeBytes) || attachment.sizeBytes <= 0 || attachment.sizeBytes > MAX_BILL_ATTACHMENT_BYTES) {
    throw new Error(`${filename} must be 10 MB or smaller.`);
  }
  const expectedPrefix = `expense-claims/${userId}/`;
  if (!attachment.storagePath?.startsWith(expectedPrefix)) {
    throw new Error("Invalid receipt attachment upload.");
  }

  return {
    storagePath: attachment.storagePath,
    filename,
    contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    sizeBytes: attachment.sizeBytes,
  };
}

export function canAttachBillFile(file: File): string | null {
  const ext = extension(file.name);
  if (!EXTENSIONS.has(ext)) return "Choose a PDF, image, Office document, CSV, or text file.";
  if (file.size > MAX_BILL_ATTACHMENT_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}
