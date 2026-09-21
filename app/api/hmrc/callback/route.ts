import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { canManageWorkspaceSettings } from "@/lib/accounting/workspace-permissions";
import { prisma } from "@/lib/prisma";
import { saveHmrcConnection } from "@/lib/tax/hmrc-connection";
import { exchangeAuthorizationCode } from "@/lib/tax/hmrc-mtd";
import { safeEqual, STATE_COOKIE, stateSecret, verifyState } from "@/lib/tax/hmrc-oauth-state";
import { hmrcPopupResponse, parseOnboardingState } from "@/lib/tax/hmrc-popup";
import { savePendingConnection } from "@/lib/tax/hmrc-pending";
import { createClient } from "@/lib/supabase/server";

function settingsUrl(status: string): URL {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const url = new URL("/settings/workspace", base);
  url.searchParams.set("hmrc", status);
  return url;
}

/**
 * The onboarding half of the callback, or null when this is a workspace one.
 *
 * Every check the workspace path makes is made here too — the state must match
 * the cookie, its signature must verify, and the user it names must be the one
 * signed in now. The last of those is what stops somebody completing a journey
 * begun by a different person.
 *
 * The tokens are parked against that user rather than a business, because there
 * is no business yet. They expire on their own if checkout is never finished.
 */
async function handleOnboardingCallback(request: NextRequest): Promise<NextResponse | null> {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? null;
  const state = request.nextUrl.searchParams.get("state");

  const secret = stateSecret();
  if (!state || !secret) return null;

  const checked = verifyState(state, secret);
  // A state that will not verify is not ours to interpret; leave it to the
  // workspace path to reject in its own way.
  if (!checked.ok) return null;

  const parsed = parseOnboardingState(checked.organizationId);
  if (!parsed) return null;

  // Definitely an onboarding journey from here, so every exit closes the popup
  // with a reason rather than redirecting a page nobody is looking at.
  jar.delete(STATE_COOKIE);

  if (request.nextUrl.searchParams.get("error")) return hmrcPopupResponse("declined");
  if (!expected || !safeEqual(state, expected)) return hmrcPopupResponse("bad_state");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return hmrcPopupResponse("unauthenticated");
  if (user.id !== parsed.userId) return hmrcPopupResponse("bad_state");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return hmrcPopupResponse("bad_state");

  const exchanged = await exchangeAuthorizationCode(code);
  if (!exchanged.ok) return hmrcPopupResponse("exchange_failed");

  /*
   * Storing must not surface as a bare 500.
   *
   * This runs in a popup, so an unhandled throw shows the browser's own "this
   * page isn't working" and the wizard sits on "Waiting for HMRC…" for ever,
   * with nothing anywhere saying why. Caught, logged, and reported back so the
   * wizard can stop waiting and say something.
   */
  try {
    await savePendingConnection({ userId: user.id, vrn: parsed.vrn, tokens: exchanged.tokens });
  } catch (error) {
    console.error("Could not store the onboarding HMRC authorisation:", error);
    return hmrcPopupResponse("store_failed");
  }

  return hmrcPopupResponse("connected");
}

/**
 * Where HMRC returns the business owner after they consent.
 *
 * The authorisation code arriving here is only meaningful alongside proof that
 * we started this journey, for this workspace. All of it is checked before the
 * code is spent: the state must match the cookie we set, its signature must
 * verify, and the organisation named inside it must be the one the user is in
 * now. Skipping any of those lets somebody bind their own HMRC account to
 * another company's books.
 */
export async function GET(request: NextRequest) {
  /*
   * Two journeys land here, and which one is told by the state.
   *
   * Onboarding connects before a workspace exists, so it cannot go through
   * requireAccountingWorkspace below — that redirects to /onboarding when there
   * is no workspace, which is exactly the situation it is in. It is handled
   * first, and reports back to the popup it opened rather than navigating.
   *
   * One redirect URI serves both, so nothing extra has to be registered on
   * HMRC's Developer Hub.
   */
  const onboarding = await handleOnboardingCallback(request);
  if (onboarding) return onboarding;

  const workspace = await requireAccountingWorkspace();

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? null;
  // One journey, one code. Cleared whatever the outcome, so a replay finds nothing.
  jar.delete(STATE_COOKIE);

  if (!canManageWorkspaceSettings(workspace.role, workspace.customFeatures)) {
    return NextResponse.redirect(settingsUrl("forbidden"));
  }

  const params = request.nextUrl.searchParams;

  // The owner pressed "Do not grant authority", or HMRC refused outright.
  if (params.get("error")) return NextResponse.redirect(settingsUrl("declined"));

  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code || !expected || !safeEqual(state, expected)) {
    return NextResponse.redirect(settingsUrl("bad_state"));
  }

  const secret = stateSecret();
  if (!secret) return NextResponse.redirect(settingsUrl("no_key"));

  const checked = verifyState(state, secret);
  if (!checked.ok) return NextResponse.redirect(settingsUrl("bad_state"));
  // Switched workspace mid-journey: this grant belongs to the other company.
  if (checked.organizationId !== workspace.organizationId) {
    return NextResponse.redirect(settingsUrl("wrong_workspace"));
  }

  const organization = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { vatRegistrationNo: true },
  });
  if (!organization?.vatRegistrationNo) {
    return NextResponse.redirect(settingsUrl("no_vat_number"));
  }

  const exchanged = await exchangeAuthorizationCode(code);
  if (!exchanged.ok) return NextResponse.redirect(settingsUrl("exchange_failed"));

  await saveHmrcConnection({
    organizationId: workspace.organizationId,
    vrn: organization.vatRegistrationNo,
    tokens: exchanged.tokens,
    connectedBy: workspace.userId,
  });

  return NextResponse.redirect(settingsUrl("connected"));
}
