import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, mtdConfigured } from "@/lib/tax/hmrc-mtd";
import { buildState, STATE_COOKIE, STATE_TTL_SECONDS, stateSecret } from "@/lib/tax/hmrc-oauth-state";
import { tokenEncryptionConfigured } from "@/lib/tax/token-crypto";
import { normaliseVatNumber, isPlausibleVatNumber } from "@/lib/tax/vat-number";
import { hmrcPopupResponse, ONBOARDING_STATE_PREFIX } from "@/lib/tax/hmrc-popup";

/**
 * Begin an HMRC authorisation during onboarding, before any workspace exists.
 *
 * The dashboard route reads the VAT number off the organisation. There is none
 * here, so the wizard passes the number it has just had checked, and it is
 * validated rather than trusted — a request is only worth sending to HMRC if it
 * is addressed to something shaped like a VAT registration.
 *
 * Guarded by the session alone, which is the only thing that exists to guard
 * by. That is enough: the grant this produces is stored against the signed-in
 * user and can only ever be adopted by a workspace they own.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return hmrcPopupResponse("unauthenticated");

  if (!mtdConfigured()) return hmrcPopupResponse("not_configured");
  if (!tokenEncryptionConfigured()) return hmrcPopupResponse("no_key");

  const secret = stateSecret();
  if (!secret) return hmrcPopupResponse("no_key");

  const vrn = normaliseVatNumber(request.nextUrl.searchParams.get("vrn") ?? "");
  if (!isPlausibleVatNumber(vrn)) return hmrcPopupResponse("no_vat_number");

  /*
   * The state carries the user id where the dashboard's carries an
   * organisation id, and the VAT number alongside it — the callback has no
   * record to read either from, and both have to survive the round trip
   * through HMRC unmodified.
   */
  const state = buildState(`${ONBOARDING_STATE_PREFIX}${user.id}:${vrn}`, randomBytes(16).toString("base64url"), secret);

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
