import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

export const SUPPORT_STATUSES: SupportTicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING",
  "ON_HOLD",
  "RESOLVED",
  "CLOSED",
];

export const SUPPORT_PRIORITIES: SupportTicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const MAX_SUPPORT_ATTACHMENTS = 5;
export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const SUPPORT_ATTACHMENT_URL_RE =
  /^https?:\/\/.+\/storage\/v1\/object\/public\/workspace_assets\/(support|feedback)\//;

export function cleanSupportText(value: string, label: string, maxLength: number): string {
  const clean = value?.trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (clean.length > maxLength)
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  return clean;
}

export function validateSupportAttachments(attachments: string[]): string[] {
  if (attachments.length > MAX_SUPPORT_ATTACHMENTS) {
    throw new Error(`At most ${MAX_SUPPORT_ATTACHMENTS} attachments are allowed.`);
  }
  for (const url of attachments) {
    if (!SUPPORT_ATTACHMENT_URL_RE.test(url)) throw new Error("Invalid support attachment URL.");
  }
  return attachments;
}

export function supportReference(id: string): string {
  return `TKT-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export function displayName(meta: unknown, email: string | null | undefined): string {
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    for (const key of ["name", "full_name", "display_name"]) {
      if (typeof record[key] === "string" && record[key]) return record[key];
    }
  }
  return email?.split("@")[0] || "Unknown user";
}
