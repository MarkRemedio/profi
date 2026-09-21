"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { canManageWorkspaceSettings } from "@/lib/accounting/workspace-permissions";
import {
  disconnectHmrc,
  getHmrcConnectionStatus,
  getValidAccessToken,
} from "@/lib/tax/hmrc-connection";
import { fetchVatObligations, mtdConfigured, type VatObligation } from "@/lib/tax/hmrc-mtd";
import { prisma } from "@/lib/prisma";
import { tokenEncryptionConfigured } from "@/lib/tax/token-crypto";

export type HmrcPanelState = {
  /** False when the server has no HMRC credentials or no token key. */
  available: boolean;
  unavailableReason: string | null;
  /**
   * The VAT number this workspace holds, or null.
   *
   * HMRC's VAT endpoints are addressed by VAT number, so there is nothing to
   * connect without one. Known here so the card can say so before the button
   * is pressed, rather than sending somebody out and bouncing them back.
   */
  vatNumber: string | null;
  status:
    | { state: "not_connected" }
    | { state: "needs_reauthorisation"; vrn: string }
    | { state: "vrn_changed"; vrn: string; currentVrn: string | null }
    | { state: "connected"; vrn: string; connectedAt: string };
  canManage: boolean;
};

export async function getHmrcPanelState(): Promise<HmrcPanelState> {
  const workspace = await requireAccountingWorkspace();
  const canManage = canManageWorkspaceSettings(workspace.role, workspace.customFeatures);

  let unavailableReason: string | null = null;
  if (!mtdConfigured()) unavailableReason = "HMRC credentials are not configured on this server.";
  else if (!tokenEncryptionConfigured()) {
    unavailableReason = "HMRC_TOKEN_KEY is not set, so an authorisation could not be stored safely.";
  }

  const [status, organization] = await Promise.all([
    getHmrcConnectionStatus(workspace.organizationId),
    prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: { vatRegistered: true, vatRegistrationNo: true },
    }),
  ]);

  return {
    available: unavailableReason === null,
    unavailableReason,
    vatNumber:
      organization?.vatRegistered && organization.vatRegistrationNo
        ? organization.vatRegistrationNo
        : null,
    status:
      status.state === "connected"
        ? { state: "connected", vrn: status.vrn, connectedAt: status.connectedAt.toISOString() }
        : status.state === "needs_reauthorisation"
          ? { state: "needs_reauthorisation", vrn: status.vrn }
          : status.state === "vrn_changed"
            ? { state: "vrn_changed", vrn: status.vrn, currentVrn: status.currentVrn }
            : { state: "not_connected" },
    canManage,
  };
}

export type DisconnectResult = { ok: true } | { ok: false; error: string };

/**
 * Forget this workspace's authorisation.
 *
 * Local only — HMRC keeps its own record of the grant, which the business
 * revokes from their own HMRC account. Said plainly in the UI, because
 * "disconnect" implying otherwise would be misleading about who holds what.
 */
export async function disconnectHmrcAction(): Promise<DisconnectResult> {
  const workspace = await requireAccountingWorkspace();
  if (!canManageWorkspaceSettings(workspace.role, workspace.customFeatures)) {
    return { ok: false, error: "You do not have permission to change this." };
  }

  await disconnectHmrc(workspace.organizationId);
  revalidatePath("/settings/workspace");
  revalidatePath("/taxes/vat");
  return { ok: true };
}

export type ObligationsPanel =
  | { ok: true; obligations: VatObligation[] }
  | { ok: false; error: string; reauthorise: boolean };

/**
 * The VAT periods HMRC holds for this business.
 *
 * A year back and a year forward: HMRC rejects a range much wider, and that
 * window covers the return being worked on plus the ones just filed.
 */
export async function getVatObligationsAction(): Promise<ObligationsPanel> {
  const workspace = await requireAccountingWorkspace();

  const token = await getValidAccessToken(workspace.organizationId);
  if (!token.ok) return { ok: false, error: token.error, reauthorise: token.reauthorise };

  /*
   * HMRC caps this range at 366 days and answers a wider one with
   * 400 INVALID_DATE_RANGE — measured, not assumed: two years is refused while
   * 360 days returns the same obligations.
   *
   * Weighted towards the past, because that is where filed returns live, while
   * one quarter ahead is enough to show the next deadline.
   */
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const from = new Date(now.getTime() - 270 * DAY_MS);
  const to = new Date(now.getTime() + 90 * DAY_MS);

  // HMRC wants the end user's own device details, not this server's. What the
  // browser knows is not available inside a server action, so the values that
  // require it are omitted rather than invented — see hmrc-fraud-headers.
  const requestHeaders = await headers();

  return fetchVatObligations({
    vrn: token.vrn,
    accessToken: token.accessToken,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    server: {
      publicIp: requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
      publicPort: null,
      userAgent: requestHeaders.get("user-agent"),
      deviceId: workspace.organizationId,
      userId: workspace.userId,
      vendorForwarded: requestHeaders.get("x-forwarded-for"),
    },
  });
}
