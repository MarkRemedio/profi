import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isPlatformAdmin } from "@/lib/admin/auth";
import { ADMIN_OTP_COOKIE, verifyAdminOtpCookie } from "@/lib/admin/otp-cookie";

function isInvalidRefreshTokenError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("invalid refresh token")
  );
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().forEach((cookie) => {
    if (!cookie.name.startsWith("sb-")) {
      return;
    }

    request.cookies.delete(cookie.name);
    response.cookies.delete(cookie.name);
  });
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });

          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (isInvalidRefreshTokenError(error)) {
    clearSupabaseAuthCookies(request, response);
  }

  // Optimistic edge gate: lock /admin/* (except the login + OTP pages) to
  // platform admins who have also passed the email-OTP step. Defense-in-depth
  // is re-checked server-side in the (protected) layout.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const otp = user
      ? verifyAdminOtpCookie(
          request.cookies.get(ADMIN_OTP_COOKIE)?.value,
          process.env.ADMIN_OTP_SECRET ?? ""
        )
      : null;

    // Fail closed: no admin claim, no OTP cookie, a stale cookie, or a cookie
    // minted for a different user all bounce to the login page.
    if (!user || !isPlatformAdmin(user) || !otp || otp.sub !== user.id) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
