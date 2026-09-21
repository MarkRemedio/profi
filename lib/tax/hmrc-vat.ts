import "server-only";
import { normaliseVatNumber, isPlausibleVatNumber } from "@/lib/tax/vat-number";

/**
 * VAT number verification against HMRC.
 *
 * Uses HMRC's "Check a UK VAT number" API, which confirms a number is genuinely
 * registered and returns the name and address it is registered to. That second
 * part is the useful bit: a number can be real and belong to somebody else, so
 * the registered name is shown back to the user to check against their own.
 *
 * A verified check also returns a consultation reference. HMRC treats that
 * reference as evidence the check was made, which matters when a business
 * reclaims input VAT on a supplier invoice and is later asked to show it took
 * reasonable care. It is stored alongside the result rather than discarded.
 *
 * Nothing here is allowed to block a user. Every failure resolves to a result
 * the form can explain, never a thrown error: HMRC has scheduled downtime, and
 * a business must still be able to finish signing up at 2am on a Sunday. An
 * unverified number is saved as entered and can be checked again later.
 *
 * UK only. A workspace keeping books in pesos or shillings has no UK VAT number,
 * so callers must treat verification as unavailable rather than failed.
 */

/**
 * Sandbox and production are separate hosts with separate credentials, and a
 * sandbox token is rejected by production. Configurable so the environment is a
 * deployment decision rather than a code change — set HMRC_API_BASE to
 * https://test-api.service.hmrc.gov.uk while testing.
 */
const HMRC_HOST = process.env.HMRC_API_BASE ?? "https://api.service.hmrc.gov.uk";
const API_BASE = `${HMRC_HOST}/organisations/vat/check-vat-number/lookup`;

/**
 * Whether we are pointed at HMRC's sandbox rather than production.
 *
 * Matters because each sandbox API carries its own unrelated test data. A VAT
 * number generated for the Making Tax Digital sandbox is genuinely absent from
 * the VAT-lookup sandbox — measured, not assumed: the MTD test VRN answers 404
 * while an unrelated lookup-sandbox number answers 200 with a fictional company
 * against it. In production one register backs both, so no such split exists.
 */
export function isHmrcSandbox(): boolean {
  return HMRC_HOST.includes("test-");
}

/** Give up rather than hang a signup form waiting on a third party. */
const FETCH_TIMEOUT_MS = 6000;

export type VatCheckResult =
  | {
      status: "registered";
      /** Normalised, digits only, no GB prefix. */
      vatNumber: string;
      /** The business name HMRC holds for this number. */
      name: string;
      address: string | null;
      /** HMRC's evidence that this check happened, when one was issued. */
      consultationNumber: string | null;
    }
  | { status: "not_registered"; vatNumber: string }
  | { status: "invalid_format"; reason: string }
  | { status: "unavailable"; reason: string };

// The shape rules live in a module without `server-only` so the onboarding
// wizard applies exactly the same test the server does. Re-exported here so
// existing callers are unaffected.
export { normaliseVatNumber, isPlausibleVatNumber } from "@/lib/tax/vat-number";

/**
 * Cached application access token.
 *
 * HMRC deprecated the static server token, so an application-restricted call
 * needs an OAuth 2.0 client-credentials token. Those expire — typically within
 * hours — so one is fetched on demand and reused until shortly before it lapses,
 * rather than requested per lookup, which would double the latency of every
 * check and hammer the token endpoint.
 *
 * Module-level, so it lives as long as the server process. That is deliberate:
 * this is an application credential, identical for every workspace, and carries
 * no per-user data worth isolating.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Refresh this far ahead of expiry so a lookup cannot race the deadline. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

async function accessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()) {
    return cachedToken.value;
  }

  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    const value = typeof payload.access_token === "string" ? payload.access_token : null;
    if (!value) return null;

    // A missing or nonsensical expiry is treated as an hour. Erring short costs
    // one extra token request; erring long sends expired tokens to HMRC.
    const seconds =
      typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;

    cachedToken = { value, expiresAt: Date.now() + seconds * 1000 };
    return value;
  } catch {
    return null;
  }
}

/**
 * Recently resolved numbers.
 *
 * A VAT registration changes at most a handful of times in a company's life, so
 * the same number asked for twice in a minute has the same answer. People check,
 * correct a typo, and check again — measured against HMRC's sandbox each lookup
 * is roughly 400ms, which is a long time to wait twice for the same result.
 *
 * Short-lived on purpose: a business that has just registered should not be told
 * for hours that it is not on the register.
 */
const RESULT_TTL_MS = 10 * 60 * 1000;
const resultCache = new Map<string, { result: VatCheckResult; expiresAt: number }>();

/**
 * Fetch the access token ahead of time.
 *
 * The token round trip is about 776ms and is pure overhead on the first check of
 * a session — it happens before the lookup can even start. Callers fire this
 * when the VAT form appears so the token is already in hand by the time somebody
 * finishes typing a number. Failure is silent: this is an optimisation, and the
 * real check reports its own problems.
 */
export async function prewarmVatCheck(): Promise<void> {
  await accessToken().catch(() => null);
}

/**
 * Look up a VAT number.
 *
 * Returns `unavailable` when the service cannot answer — no credentials
 * configured, HMRC down, request timed out. Callers must let the user proceed
 * on `unavailable`; only `not_registered` is a real answer meaning "no".
 */
export async function checkVatNumber(raw: string): Promise<VatCheckResult> {
  const vatNumber = normaliseVatNumber(raw);

  if (!isPlausibleVatNumber(vatNumber)) {
    return {
      status: "invalid_format",
      reason: "A UK VAT number is 9 digits, or 12 for a branch registration.",
    };
  }

  // Version 2 of this API moved behind authentication, so without a token there
  // is nothing to call. That is a deployment gap rather than a bad number, and
  // the user is told the check could not run rather than that they failed it.
  const cached = resultCache.get(vatNumber);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const token = await accessToken();
  if (!token) {
    return {
      status: "unavailable",
      reason: "VAT checking is not configured on this server.",
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(`${API_BASE}/${vatNumber}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.hmrc.2.0+json",
      },
    });
    clearTimeout(timer);

    // HMRC answers 404 for a number that is not on the register. That is a
    // genuine answer, not a failure, and is the one case that should stop a
    // user claiming to be registered when they are not.
    if (response.status === 404) {
      const answer: VatCheckResult = { status: "not_registered", vatNumber };
      remember(vatNumber, answer);
      return answer;
    }

    // A refused token usually means it lapsed early or the credentials changed
    // underneath us. Drop the cache so the next attempt fetches a fresh one
    // instead of replaying a token HMRC has already rejected.
    if (response.status === 401 || response.status === 403) {
      cachedToken = null;
      return {
        status: "unavailable",
        reason: "HMRC rejected our credentials. Check the app is subscribed to this API.",
      };
    }

    if (!response.ok) {
      return {
        status: "unavailable",
        reason: `HMRC returned ${response.status}. Try again shortly.`,
      };
    }

    const parsed = parseLookup(await response.json(), vatNumber);
    if (parsed.status === "registered") remember(vatNumber, parsed);
    return parsed;
  } catch {
    // Offline, timed out, or HMRC is down — never a reason to block signup.
    return {
      status: "unavailable",
      reason: "Could not reach HMRC. The number is saved and can be checked later.",
    };
  }
}

/**
 * Parsed defensively: a shape change at HMRC must degrade to "unavailable"
 * rather than write a wrong name against a business.
 */
function parseLookup(payload: unknown, vatNumber: string): VatCheckResult {
  const target = (payload as { target?: unknown })?.target as
    | { name?: unknown; address?: Record<string, unknown> }
    | undefined;

  const name = typeof target?.name === "string" ? target.name : null;
  if (!name) {
    return { status: "unavailable", reason: "HMRC returned an unexpected response." };
  }

  const address = target?.address
    ? Object.entries(target.address)
        .filter(([key, value]) => key !== "countryCode" && typeof value === "string" && value)
        .map(([, value]) => value as string)
        .join(", ")
    : null;

  const consultation = (payload as { consultationNumber?: unknown })?.consultationNumber;

  return {
    status: "registered",
    vatNumber,
    name,
    address: address || null,
    consultationNumber: typeof consultation === "string" ? consultation : null,
  };
}

/** Cache a definitive answer. Outages and timeouts are never remembered. */
function remember(vatNumber: string, result: VatCheckResult) {
  resultCache.set(vatNumber, { result, expiresAt: Date.now() + RESULT_TTL_MS });
}
