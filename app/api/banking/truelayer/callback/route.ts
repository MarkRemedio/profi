import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { requireAccountantRole } from "@/lib/accounting/dal";
import {
  startTrueLayerAccountSelection,
  saveTrueLayerTokens,
  syncTrueLayerBankFeed,
} from "@/lib/banking/truelayer-connection";
import { exchangeTrueLayerCode } from "@/lib/banking/truelayer";
import {
  TRUELAYER_STATE_COOKIE,
  verifyTrueLayerState,
} from "@/lib/banking/truelayer-state";

function bankingUrl(status: string, connectionId?: string): URL {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const url = new URL("/banking", base);
  url.searchParams.set("truelayer", status);
  if (connectionId) url.searchParams.set("truelayerConnection", connectionId);
  return url;
}

export async function GET(request: NextRequest) {
  const workspace = await requireAccountantRole();
  const jar = await cookies();
  const expected = jar.get(TRUELAYER_STATE_COOKIE)?.value ?? null;
  jar.delete(TRUELAYER_STATE_COOKIE);

  if (request.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(bankingUrl("declined"));
  }

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!state || !code || !expected || state !== expected) {
    return NextResponse.redirect(bankingUrl("bad_state"));
  }
  const checked = verifyTrueLayerState(state);
  if (!checked || checked.organizationId !== workspace.organizationId) {
    return NextResponse.redirect(bankingUrl("bad_state"));
  }

  const exchanged = await exchangeTrueLayerCode(code);
  if (!exchanged.ok) return NextResponse.redirect(bankingUrl("exchange_failed"));
  try {
    if (checked.bankAccountId) {
      await saveTrueLayerTokens({
        organizationId: workspace.organizationId,
        connectionId: checked.connectionId,
        tokens: exchanged.data,
      });
      await syncTrueLayerBankFeed({ organizationId: workspace.organizationId, connectionId: checked.connectionId });
    } else {
      const pending = await startTrueLayerAccountSelection({
        organizationId: workspace.organizationId,
        userId: workspace.userId,
        tokens: exchanged.data,
      });
      return NextResponse.redirect(bankingUrl("select", pending.id));
    }
  } catch (error) {
    console.error("TrueLayer initial bank-feed sync failed", error);
    return NextResponse.redirect(bankingUrl("sync_failed"));
  }
  return NextResponse.redirect(bankingUrl("connected"));
}
