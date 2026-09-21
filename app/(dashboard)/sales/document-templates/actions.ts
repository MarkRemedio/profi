"use server";

import { prisma } from "@/lib/prisma";
import type { DocumentTemplateKind } from "@/components/sales/document-templates/types";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";

export type DocumentWorkspaceIdentity = {
  name: string;
  baseCurrency: string;
  dateFormat: string;
  vatRegistrationNo: string | null;
  companyNumber: string | null;
};

// Universal multi-tenant branding storage. One row per (org, kind) using the
// reserved name `${kind}_default_branding`; the whole profile blob lives in the
// JSON `lines` column of DocumentTemplate.
export async function saveDocumentBrandingDB(
  orgId: string,
  docKind: DocumentTemplateKind,
  profileData: unknown,
) {
  if (!orgId) throw new Error("Missing organization context ID");
  const workspace = await requireAccountingWorkspace();
  if (workspace.organizationId !== orgId) throw new Error("Organization access denied");

  return await prisma.documentTemplate.upsert({
    where: {
      organizationId_kind_name: {
        organizationId: orgId,
        kind: docKind,
        name: `${docKind}_default_branding`,
      },
    },
    update: { lines: profileData as object },
    create: {
      organizationId: orgId,
      kind: docKind,
      name: `${docKind}_default_branding`,
      lines: profileData as object,
    },
  });
}

export async function fetchDocumentBrandingDB(
  orgId: string,
  docKind: DocumentTemplateKind,
): Promise<unknown> {
  if (!orgId) return null;
  const workspace = await requireAccountingWorkspace();
  if (workspace.organizationId !== orgId) throw new Error("Organization access denied");

  const template = await prisma.documentTemplate.findFirst({
    where: {
      organizationId: orgId,
      kind: docKind,
      name: `${docKind}_default_branding`,
    },
  });

  return template ? JSON.parse(JSON.stringify(template.lines)) : null;
}

export async function fetchDocumentWorkspaceIdentity(
  orgId: string,
): Promise<DocumentWorkspaceIdentity | null> {
  if (!orgId) return null;
  const workspace = await requireAccountingWorkspace();
  if (workspace.organizationId !== orgId) throw new Error("Organization access denied");

  return prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      baseCurrency: true,
      dateFormat: true,
      vatRegistrationNo: true,
      companyNumber: true,
    },
  });
}
