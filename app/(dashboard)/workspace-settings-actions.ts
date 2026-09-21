"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { deleteWorkspaceLogos } from "@/app/(dashboard)/workspace-asset-actions";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getCurrencyLock, type CurrencyLock } from "@/lib/accounting/currency-lock";
import { normaliseBusinessStructure } from "@/lib/accounting/financial-year";
import { canManageWorkspaceSettings } from "@/lib/accounting/workspace-permissions";
import { normaliseWorkspaceDateFormat } from "@/lib/workspace-date-format";
import type { TaxProfile } from "@/app/(dashboard)/tax-profile-actions";

/**
 * Everything the workspace settings dialog needs, in one call.
 *
 * The dialog used to open four separate server actions — the currency lock, the
 * VAT settings, the tax profile and an HMRC token prewarm. Next.js runs server
 * actions one at a time per client, so those queued behind each other and the
 * form took a couple of seconds to become usable. Worse, each section seeded
 * itself when its own fetch landed, so a checkbox ticked in the meantime was
 * overwritten by the arriving data and appeared to revert.
 *
 * One action, with the reads running concurrently on the server, is a single
 * round trip. The dialog then renders its form only once this has resolved, so
 * there is nothing on screen to clobber.
 */

export type WorkspaceSettingsBundle = {
  organization: {
    name: string;
    baseCurrency: string;
    multicurrencyEnabled: boolean;
    dateFormat: ReturnType<typeof normaliseWorkspaceDateFormat>;
    /** The customer's own logo, if uploaded. Null for most workspaces. */
    logoUrl: string | null;
  };
  /** Owners and accountants may change these; everyone else reads them. */
  canManage: boolean;
  vat: { vatRegistered: boolean; vatNumber: string | null };
  taxProfile: TaxProfile;
  currencyLock: CurrencyLock;
};

/** Whether the signed-in member may open workspace settings. */
export async function canOpenWorkspaceSettings(): Promise<boolean> {
  const workspace = await requireAccountingWorkspace();
  return canManageWorkspaceSettings(workspace.role, workspace.customFeatures);
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettingsBundle> {
  const workspace = await requireAccountingWorkspace();

  // Enforced here rather than only in the page: a server action is callable
  // directly by anyone who can reach the app, so hiding the menu item is
  // presentation, not access control.
  if (!canManageWorkspaceSettings(workspace.role, workspace.customFeatures)) {
    throw new Error(
      "You do not have permission to view workspace settings."
    );
  }

  const [org, currencyLock] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: {
        name: true,
        baseCurrency: true,
        multicurrencyEnabled: true,
        dateFormat: true,
        logoUrl: true,
        vatRegistered: true,
        vatRegistrationNo: true,
        businessStructure: true,
        accountingPeriodEnd: true,
        cisStatus: true,
        companyNumber: true,
        taxReference: true,
        payeReference: true,
        industry: true,
      },
    }),
    getCurrencyLock(workspace.organizationId),
  ]);

  const role = String(workspace.role ?? "").toLowerCase();

  return {
    organization: {
      name: org?.name ?? "",
      baseCurrency: org?.baseCurrency ?? "GBP", // currency:allow falls back to the column default
      multicurrencyEnabled: org?.multicurrencyEnabled ?? false,
      dateFormat: normaliseWorkspaceDateFormat(org?.dateFormat),
      logoUrl: org?.logoUrl ?? null,
    },
    canManage: role === "owner" || role === "accountant",
    vat: {
      vatRegistered: org?.vatRegistered ?? false,
      vatNumber: org?.vatRegistrationNo ?? null,
    },
    taxProfile: {
      structure: normaliseBusinessStructure(org?.businessStructure),
      financialYearEnd: org?.accountingPeriodEnd?.toISOString().slice(0, 10) ?? null,
      isCisContractor: org?.cisStatus === "contractor",
      companyNumber: org?.companyNumber ?? null,
      taxReference: org?.taxReference ?? null,
      payeReference: org?.payeReference ?? null,
      industry: org?.industry ?? null,
    },
    currencyLock,
  };
}

/**
 * Set or clear the workspace's own logo.
 *
 * The file itself is uploaded from the browser straight to the workspace_assets
 * bucket, the same path the document templates already use; only the resulting
 * URL comes back here. That keeps the image off the server action payload,
 * which has a body limit a 2 MB base64 string would sit uncomfortably close to.
 *
 * The URL is checked against the project's own storage host rather than merely
 * being required to be https. This value renders in the sidebar for every
 * member of the workspace, so an arbitrary URL here would be a tracking pixel
 * one member could point at all the others.
 *
 * Replacing or clearing a logo deletes the object it replaces. Every upload
 * writes a new timestamped file, so without this a workspace that fiddles with
 * its logo a dozen times leaves a dozen orphans nothing will ever reference
 * again. Nothing else reads these objects, so there is no older render to
 * break — unlike the document-template logos, which are baked into issued
 * paperwork and are deliberately never removed.
 */
export async function saveOrganizationLogo(logoUrl: string | null): Promise<void> {
  const workspace = await requireAccountingWorkspace();

  // Checked here as well as in the page: a server action is callable directly,
  // so a hidden card is presentation rather than permission.
  if (!canManageWorkspaceSettings(workspace.role, workspace.customFeatures)) {
    throw new Error("You do not have permission to change the workspace logo.");
  }

  let next: string | null = null;

  if (logoUrl) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) throw new Error("Storage is not configured on this deployment.");

    let protocol: string;
    let origin: string;
    try {
      const parsed = new URL(logoUrl);
      protocol = parsed.protocol;
      origin = parsed.origin;
    } catch {
      throw new Error("That does not look like a valid image address.");
    }

    if (protocol !== "https:" || origin !== new URL(base).origin) {
      throw new Error("Upload the logo rather than pasting an address.");
    }

    next = logoUrl.slice(0, 2048);
  }

  const previous = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { logoUrl: true },
  });

  await prisma.organization.update({
    where: { id: workspace.organizationId },
    data: { logoUrl: next },
  });

  // After the row is updated, not before: an orphaned object costs a few
  // kilobytes, while a deleted object still referenced by the row is a broken
  // image in everybody's sidebar.
  //
  // Delegated rather than reimplemented, and that matters here: onboarding
  // writes the first logo under logos/ while this card writes to org-logos/,
  // so a local path check that only knew its own prefix would silently leave
  // every wizard-uploaded logo behind on the first replacement.
  if (previous?.logoUrl && previous.logoUrl !== next) {
    await deleteWorkspaceLogos([previous.logoUrl]);
  }

  // The sidebar is rendered on every dashboard route, so there is no single
  // path worth revalidating over the layout that draws it.
  revalidatePath("/", "layout");
}
