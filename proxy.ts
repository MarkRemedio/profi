import { NextResponse } from "next/server"; // 🚀 IMPORT NEXTRESPONSE
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // 🚀 STRIPE GATEWAY: If the request is for the webhook, bypass Supabase completely!
  if (request.nextUrl.pathname.startsWith("/api/webhooks/stripe")) {
    return NextResponse.next();
  }

  // Protect all other pages using your standard Supabase logic
  return updateSession(request);
}

export const config = {
  matcher: [
    // 🚀 EXCLUDE STRIPE: Added 'api/webhooks/stripe' to the ignore list below
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/webhooks/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};