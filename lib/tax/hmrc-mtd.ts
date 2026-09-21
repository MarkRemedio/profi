import "server-only";

/**
 * HMRC Making Tax Digital for VAT.
 *
 * Distinct from `hmrc-vat.ts` in a way that matters. That module checks whether
 * a VAT number exists, using an *application-restricted* endpoint: one set of
 * credentials, no user involved. This module acts *as a specific business*, so
 * it needs a *user-restricted* grant — the business owner is sent to HMRC, signs
 * in with their own Government Gateway account, and consents. HMRC returns an
 * access token that lasts four hours and a refresh token that lasts eighteen
 * months.
 *
 * The same client id and secret drive both, but the app must be subscribed to
 * the VAT (MTD) API as well as the VAT number lookup, and the redirect URI must
 * be registered on the Developer Hub exactly as sent.
 *
 * Read-only here. Fetching obligations and liabilities cannot alter anybody's
 * tax position, whereas submitting a return is a legally binding filing that a
 * business is then obliged to correct through HMRC if it is wrong. That belongs
 * behind its own explicit confirmation step and is deliberately not in this file.
 */

import {
  buildFraudPreventionHeaders,
  type BrowserFraudContext,
  type ServerFraudContext,
} from "@/lib/tax/hmrc-fraud-headers";
import type { VatObligation } from "@/lib/tax/hmrc-types";

const HMRC_HOST = process.env.HMRC_API_BASE ?? "https://api.service.hmrc.gov.uk";

/**
 * HMRC serves the consent screen from a different host than the API.
 *
 * `api.service.hmrc.gov.uk` answers machine calls — tokens, obligations. The
 * page a human signs into lives on `www.tax.service.gov.uk`. The API host does
 * 301 to it, so pointing a browser at the wrong one appears to work, but the
 * redirect drops the journey on a host that was never meant to render it and
 * costs an extra hop before the user sees anything.
 *
 * Overridable, but derived from the API base by default so switching to
 * production is still the single environment change it should be.
 */
function authorizeHost(): string {
  if (process.env.HMRC_AUTHORIZE_BASE) return process.env.HMRC_AUTHORIZE_BASE;
  return HMRC_HOST.includes("test-")
    ? "https://test-www.tax.service.gov.uk"
    : "https://www.tax.service.gov.uk";
}

/**
 * Read is all this module does. `write:vat` is requested anyway because HMRC
 * grants scopes at consent time — asking for it later means sending the owner
 * back through the whole journey again before a return could ever be filed.
 */
export const MTD_SCOPES = "read:vat write:vat";

const FETCH_TIMEOUT_MS = 10_000;
/** Refresh this far before expiry so a call cannot race the deadline. */
export const TOKEN_SAFETY_MARGIN_MS = 60_000;

export type HmrcTokens = {
  accessToken: string;
  refreshToken: string;
  /** Absolute instant the access token stops working. */
  expiresAt: Date;
  scope: string;
};

export type TokenResult =
  | { ok: true; tokens: HmrcTokens }
  | { ok: false; error: string; reauthorise: boolean };

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Where HMRC sends the browser back to. Must match the Developer Hub entry exactly. */
export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/hmrc/callback`;
}

/** Whether the server is configured well enough to attempt a connection. */
export function mtdConfigured(): boolean {
  return credentials() !== null;
}

/**
 * The HMRC page the business owner is sent to.
 *
 * `state` is carried through unmodified and compared on the way back, which is
 * what stops a third party from feeding us an authorisation code for an account
 * the signed-in user does not control.
 */
export function authorizeUrl(state: string): string {
  const config = credentials();
  if (!config) throw new Error("HMRC credentials are not configured.");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: MTD_SCOPES,
    state,
    redirect_uri: redirectUri(),
  });

  return `${authorizeHost()}/oauth/authorize?${params.toString()}`;
}

type TokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
};

function readTokenPayload(payload: TokenPayload): HmrcTokens | null {
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : null;
  if (!accessToken || !refreshToken) return null;

  // HMRC documents four hours. A missing or nonsensical value is treated as one
  // hour: erring short costs an extra refresh, erring long sends dead tokens.
  const seconds =
    typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + seconds * 1000),
    scope: typeof payload.scope === "string" ? payload.scope : MTD_SCOPES,
  };
}

async function postToken(body: URLSearchParams): Promise<TokenResult> {
  const config = credentials();
  if (!config) {
    return { ok: false, error: "HMRC credentials are not configured.", reauthorise: false };
  }

  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  body.set("redirect_uri", redirectUri());

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(`${HMRC_HOST}/oauth/token`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/vnd.hmrc.1.0+json",
      },
      body,
    });
    clearTimeout(timer);

    if (!response.ok) {
      // A refused grant means the stored refresh token is spent or revoked —
      // the business has to authorise again, and no amount of retrying helps.
      const reauthorise = response.status === 400 || response.status === 401;
      return {
        ok: false,
        error: reauthorise
          ? "HMRC no longer accepts this authorisation. Reconnect the business."
          : `HMRC returned ${response.status} while issuing a token.`,
        reauthorise,
      };
    }

    const tokens = readTokenPayload((await response.json()) as TokenPayload);
    if (!tokens) {
      return { ok: false, error: "HMRC returned an unexpected token response.", reauthorise: false };
    }
    return { ok: true, tokens };
  } catch {
    return { ok: false, error: "Could not reach HMRC.", reauthorise: false };
  }
}

/** Trade the one-time code from the callback for a token pair. */
export function exchangeAuthorizationCode(code: string): Promise<TokenResult> {
  return postToken(new URLSearchParams({ grant_type: "authorization_code", code }));
}

/** Swap a refresh token for a fresh pair. HMRC rotates both. */
export function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  return postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export type { VatObligation } from "@/lib/tax/hmrc-types";

export type ObligationsResult =
  | { ok: true; obligations: VatObligation[] }
  | { ok: false; error: string; reauthorise: boolean };

/**
 * VAT return periods HMRC holds for this business.
 *
 * HMRC requires an explicit date range and rejects one wider than roughly a
 * year, so callers pass a window rather than asking for everything.
 */
export async function fetchVatObligations({
  vrn,
  accessToken,
  from,
  to,
  server,
  browser,
}: {
  vrn: string;
  accessToken: string;
  from: string;
  to: string;
  server: ServerFraudContext;
  browser?: BrowserFraudContext;
}): Promise<ObligationsResult> {
  const params = new URLSearchParams({ from, to });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(
      `${HMRC_HOST}/organisations/vat/${vrn}/obligations?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.hmrc.1.0+json",
          ...buildFraudPreventionHeaders(server, browser),
        },
      },
    );
    clearTimeout(timer);

    // Nothing in the window is a legitimate answer, and HMRC says so with 404.
    if (response.status === 404) return { ok: true, obligations: [] };

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: "HMRC rejected the authorisation for this business. Reconnect it.",
        reauthorise: true,
      };
    }

    if (!response.ok) {
      // HMRC names the problem in the body — INVALID_DATE_RANGE, VRN_INVALID
      // and so on. Carrying it through turns "HMRC returned 400" into
      // something that says which request was wrong.
      return {
        ok: false,
        error: `HMRC returned ${response.status}${await hmrcErrorCode(response)}.`,
        reauthorise: false,
      };
    }

    return { ok: true, obligations: parseObligations(await response.json()) };
  } catch {
    return { ok: false, error: "Could not reach HMRC.", reauthorise: false };
  }
}

/**
 * HMRC's own name for a failure, as " (INVALID_DATE_RANGE)".
 *
 * Returns an empty string when the body cannot be read or carries no code, so
 * the caller can append it unconditionally.
 */
async function hmrcErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    const code = typeof body.code === "string" ? body.code : body.message;
    return typeof code === "string" && code ? ` (${code})` : "";
  } catch {
    return "";
  }
}

/**
 * Parsed defensively — a shape change at HMRC degrades to an empty list rather
 * than showing a business the wrong filing deadline.
 */
export function parseObligations(payload: unknown): VatObligation[] {
  const rows = (payload as { obligations?: unknown })?.obligations;
  if (!Array.isArray(rows)) return [];

  const parsed: VatObligation[] = [];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    const start = typeof record.start === "string" ? record.start : null;
    const end = typeof record.end === "string" ? record.end : null;
    const due = typeof record.due === "string" ? record.due : null;
    const periodKey = typeof record.periodKey === "string" ? record.periodKey : null;
    if (!start || !end || !due || !periodKey) continue;

    parsed.push({
      start,
      end,
      due,
      received: typeof record.received === "string" ? record.received : null,
      periodKey,
      // HMRC sends "F" for fulfilled and "O" for open.
      fulfilled: record.status === "F",
    });
  }

  return parsed.sort((a, b) => a.due.localeCompare(b.due));
}
