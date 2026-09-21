import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { requireAccountantRole } from "@/lib/accounting/dal";
import { beginTrueLayerBankFeedConnection } from "@/lib/banking/truelayer-connection";
import { trueLayerTokenEncryptionConfigured } from "@/lib/banking/truelayer-crypto";
import { trueLayerAuthorizeUrl, trueLayerConfigured } from "@/lib/banking/truelayer";
import {
  buildTrueLayerState,
  TRUELAYER_STATE_COOKIE,
  TRUELAYER_STATE_TTL_SECONDS,
  trueLayerStateConfigured,
} from "@/lib/banking/truelayer-state";
import { createClient } from "@/lib/supabase/server";

function bankingUrl(status: string): URL {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const url = new URL("/banking", base);
  url.searchParams.set("truelayer", status);
  return url;
}

export async function GET(request: NextRequest) {
  const workspace = await requireAccountantRole();
  const bankAccountId = request.nextUrl.searchParams.get("bankAccountId");
  if (!trueLayerConfigured()) return NextResponse.redirect(bankingUrl("not_configured"));
  if (!trueLayerTokenEncryptionConfigured() || !trueLayerStateConfigured()) {
    return NextResponse.redirect(bankingUrl("no_key"));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return NextResponse.redirect(bankingUrl("missing_user_email"));

  const existingConnection = bankAccountId
    ? await beginTrueLayerBankFeedConnection({
      organizationId: workspace.organizationId,
      bankAccountId,
      userId: workspace.userId,
    })
    : null;
  const state = buildTrueLayerState({
    // This opaque, signed nonce binds the callback to this authorization
    // attempt. A bank account does not exist in WAW Profi until the user has
    // approved access and TrueLayer returns the actual account list.
    connectionId: existingConnection?.id ?? randomUUID(),
    organizationId: workspace.organizationId,
    ...(bankAccountId ? { bankAccountId } : {}),
  });
  const jar = await cookies();
  jar.set(TRUELAYER_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TRUELAYER_STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(trueLayerAuthorizeUrl(state));
}
