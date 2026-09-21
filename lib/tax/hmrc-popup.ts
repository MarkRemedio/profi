import { NextResponse } from "next/server";

/**
 * The page HMRC returns to when the authorisation ran in a popup.
 *
 * Onboarding connects from inside the wizard, so the journey cannot navigate
 * the page it started from — everything typed so far lives in React state and
 * would be gone. The popup reports back through postMessage and closes itself,
 * leaving the wizard exactly as it was.
 *
 * Targeted at this origin rather than "*", so the message cannot be read by
 * another site that happens to have a handle on the window.
 */
export function hmrcPopupResponse(status: string): NextResponse {
  const payload = JSON.stringify({ source: "waw-hmrc", status });

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>HMRC</title></head>
<body style="font:14px/1.5 system-ui,sans-serif;padding:2rem;color:#0B0F19;margin:0">
<p>You can close this window.</p>
<script>
  try {
    if (window.opener) window.opener.postMessage(${payload}, window.location.origin);
  } catch (e) {}
  setTimeout(function () { try { window.close(); } catch (e) {} }, 400);
</script>
</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Prefix marking a state issued by onboarding rather than by a workspace. */
export const ONBOARDING_STATE_PREFIX = "u:";

export type OnboardingState = { userId: string; vrn: string };

/** Reads `u:<userId>:<vrn>` back out, or null when this is a workspace state. */
export function parseOnboardingState(value: string): OnboardingState | null {
  if (!value.startsWith(ONBOARDING_STATE_PREFIX)) return null;
  const [, userId, vrn] = value.split(":");
  if (!userId || !vrn) return null;
  return { userId, vrn };
}
