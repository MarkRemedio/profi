import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { canManageWorkspaceSettings } from "@/lib/accounting/workspace-permissions";
import { prisma } from "@/lib/prisma";
import { authorizeUrl, mtdConfigured } from "@/lib/tax/hmrc-mtd";
import { buildState, STATE_COOKIE, STATE_TTL_SECONDS, stateSecret } from "@/lib/tax/hmrc-oauth-state";
import { tokenEncryptionConfigured } from "@/lib/tax/token-crypto";

function settingsUrl(status: string): URL {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const url = new URL("/settings/workspace", base);
  url.searchParams.set("hmrc", status);
  return url;
}

/**
 * Begin the HMRC authorisation journey.
 *
 * Everything checkable is checked before the browser leaves for a third party,
 * so a business is never bounced back from HMRC only to discover this server
 * was never configured to store the result.
 */
export async function GET() {
  const workspace = await requireAccountingWorkspace();

  // Connecting binds the company's tax filing to one person's decision, so it
  // sits behind the same permission as the rest of the tax profile.
  if (!canManageWorkspaceSettings(workspace.role, workspace.customFeatures)) {
    return NextResponse.redirect(settingsUrl("forbidden"));
  }

  if (!mtdConfigured()) return NextResponse.redirect(settingsUrl("not_configured"));
  if (!tokenEncryptionConfigured()) return NextResponse.redirect(settingsUrl("no_key"));

  const secret = stateSecret();
  if (!secret) return NextResponse.redirect(settingsUrl("no_key"));

  const organization = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { vatRegistered: true, vatRegistrationNo: true },
  });

  // HMRC's VAT endpoints are addressed by VAT number. Without one there is
  // nothing to connect and the consent screen would end in a dead link.
  if (!organization?.vatRegistered || !organization.vatRegistrationNo) {
    return NextResponse.redirect(settingsUrl("no_vat_number"));
  }

  const state = buildState(
    workspace.organizationId,
    randomBytes(16).toString("base64url"),
    secret,
  );

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(authorizeUrl(state));
}
