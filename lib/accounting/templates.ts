import { CurrencyCode } from "@prisma/client";
import type { ExtendedPrismaClient } from "@/lib/prisma";

/** A template belongs to one workspace, so it inherits that workspace's currency. */
async function workspaceCurrency(
  client: ExtendedPrismaClient,
  organizationId: string
): Promise<CurrencyCode> {
  const org = await client.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  const base = org?.baseCurrency;
  return base && base in CurrencyCode ? (base as CurrencyCode) : CurrencyCode.GBP;
}

export type LineTemplateKind = "invoice" | "bill";

export type TemplateLineInput = {
  accountId: string;
  description: string;
  location?: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxCode: string;
};

export type SaveTemplateInput = {
  kind: LineTemplateKind;
  name: string;
  contactId?: string | null;
  currency?: CurrencyCode;
  dueDateOffsetDays?: number | null;
  lines: TemplateLineInput[];
};

export type FullTemplate = {
  id: string;
  kind: LineTemplateKind;
  name: string;
  contactId: string | null;
  currency: CurrencyCode;
  dueDateOffsetDays: number | null;
  lines: TemplateLineInput[];
  updatedAt: string;
};

export class TemplateValidationError extends Error { code = "VALIDATION" as const; }
export class TemplateNotFoundError extends Error { code = "NOT_FOUND" as const; }

function sanitizeLines(lines: TemplateLineInput[]): TemplateLineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    description: l.description ?? "",
    location: l.location?.trim() || "",
    quantity: String(l.quantity ?? ""),
    unitPrice: String(l.unitPrice ?? ""),
    discount: String(l.discount ?? "0"),
    taxCode: l.taxCode,
  }));
}

export async function saveDocumentTemplate(
  client: ExtendedPrismaClient,
  orgId: string,
  actorUserId: string,
  input: SaveTemplateInput
): Promise<{ id: string }> {
  const name = (input.name ?? "").trim();
  if (!name) throw new TemplateValidationError("Template name is required.");
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new TemplateValidationError("A template needs at least one line.");
  }
  if (input.kind !== "invoice" && input.kind !== "bill") {
    throw new TemplateValidationError("Invalid template kind.");
  }

  const data = {
    contactId: input.contactId ?? null,
    currency: input.currency ?? (await workspaceCurrency(client, orgId)),
    dueDateOffsetDays: input.dueDateOffsetDays ?? null,
    lines: sanitizeLines(input.lines) as unknown as object,
  };

  const existing = await client.documentTemplate.findFirst({
    where: { organizationId: orgId, kind: input.kind, name },
    select: { id: true },
  });

  if (existing) {
    await client.documentTemplate.updateMany({
      where: { id: existing.id, organizationId: orgId },
      data,
    });
    return { id: existing.id };
  }

  const created = await client.documentTemplate.create({
    data: { organizationId: orgId, kind: input.kind, name, createdByUserId: actorUserId, ...data },
    select: { id: true },
  });
  return { id: created.id };
}

/**
 * The reserved name a document's branding profile is stored under — logo,
 * company address, registration numbers. It shares this table with line-item
 * templates but is a different kind of thing, and onboarding writes one for
 * every document kind. See app/(dashboard)/sales/document-templates/actions.ts.
 */
export function brandingTemplateName(kind: string) {
  return `${kind}_default_branding`;
}

export async function listDocumentTemplates(
  client: ExtendedPrismaClient,
  orgId: string,
  kind: LineTemplateKind
) {
  const rows = await client.documentTemplate.findMany({
    // Branding is excluded: it holds no line items, so "loading" it as a
    // template does nothing useful. Onboarding creates one per document kind,
    // which is why every new workspace opened the picker to find a template it
    // never saved sitting there as the only option.
    where: { organizationId: orgId, kind, name: { not: brandingTemplateName(kind) } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, contactId: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, contactId: r.contactId,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getDocumentTemplate(
  client: ExtendedPrismaClient,
  orgId: string,
  id: string
): Promise<FullTemplate> {
  const row = await client.documentTemplate.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!row) throw new TemplateNotFoundError("Template not found.");
  return {
    id: row.id,
    kind: row.kind as LineTemplateKind,
    name: row.name,
    contactId: row.contactId,
    currency: row.currency,
    dueDateOffsetDays: row.dueDateOffsetDays,
    lines: (row.lines as unknown as TemplateLineInput[]) ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteDocumentTemplate(
  client: ExtendedPrismaClient,
  orgId: string,
  id: string
): Promise<void> {
  const res = await client.documentTemplate.deleteMany({ where: { id, organizationId: orgId } });
  if (res.count === 0) throw new TemplateNotFoundError("Template not found.");
}
