import { syncStaleTrueLayerBankFeeds } from "@/lib/banking/truelayer-connection";
import { trueLayerConfigured } from "@/lib/banking/truelayer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] TRUELAYER_BANK_FEEDS skipped: CRON_SECRET is not set.");
    return Response.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!trueLayerConfigured()) return Response.json({ skipped: "TrueLayer is not configured." });

  return Response.json(await syncStaleTrueLayerBankFeeds());
}
