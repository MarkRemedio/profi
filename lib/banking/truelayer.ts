import "server-only";

const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_SAFETY_MARGIN_MS = 60_000;

type TrueLayerTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
};

export type TrueLayerAccount = {
  account_id: string;
  display_name?: string;
  currency?: string;
  account_number?: { number?: string; sort_code?: string; iban?: string };
};

export type TrueLayerTransaction = {
  transaction_id: string;
  normalised_provider_transaction_id?: string;
  provider_transaction_id?: string;
  timestamp: string;
  description?: string;
  amount: number;
  transaction_type?: string;
  meta?: { provider_transaction_id?: string };
};

type ApiError = { ok: false; error: string; reauthorise: boolean };
type ApiSuccess<T> = { ok: true; data: T };
type ApiResult<T> = ApiSuccess<T> | ApiError;

function config() {
  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const sandbox = (process.env.TRUELAYER_ENVIRONMENT ?? "sandbox") !== "production";
  return {
    clientId,
    clientSecret,
    providers: process.env.TRUELAYER_PROVIDERS ?? (sandbox ? "uk-cs-mock" : "uk-ob-all"),
    apiBase: process.env.TRUELAYER_API_BASE ?? (sandbox ? "https://api.truelayer-sandbox.com" : "https://api.truelayer.com"),
    authBase: process.env.TRUELAYER_AUTH_BASE ?? (sandbox ? "https://auth.truelayer-sandbox.com" : "https://auth.truelayer.com"),
  };
}

export function trueLayerConfigured(): boolean {
  return config() !== null;
}

export function trueLayerRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/banking/truelayer/callback`;
}

export function trueLayerAuthorizeUrl(state: string): string {
  const settings = config();
  if (!settings) throw new Error("TrueLayer credentials are not configured.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: settings.clientId,
    redirect_uri: trueLayerRedirectUri(),
    scope: "accounts balance transactions offline_access",
    state,
    // A sandbox app has no real institutions to choose from. Explicitly
    // exposing the Mock Bank is required for a test connection. Production
    // defaults to TrueLayer's UK Open Banking provider group, while allowing
    // an approved production app to narrow the list through TRUELAYER_PROVIDERS.
    providers: settings.providers,
  });
  return `${settings.authBase}/?${params.toString()}`;
}

function parseTokens(payload: Record<string, unknown>): TrueLayerTokens | null {
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : null;
  if (!accessToken || !refreshToken) return null;
  const seconds = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + seconds * 1000),
    scope: typeof payload.scope === "string" ? payload.scope : "accounts balance transactions offline_access",
  };
}

async function tokenRequest(body: URLSearchParams): Promise<ApiResult<TrueLayerTokens>> {
  const settings = config();
  if (!settings) return { ok: false, error: "TrueLayer credentials are not configured.", reauthorise: false };
  body.set("client_id", settings.clientId);
  body.set("client_secret", settings.clientSecret);
  body.set("redirect_uri", trueLayerRedirectUri());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.authBase}/connect/token`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 400 || response.status === 401
          ? "TrueLayer no longer accepts this bank authorisation. Reconnect the bank account."
          : `TrueLayer returned ${response.status} while issuing a token.`,
        reauthorise: response.status === 400 || response.status === 401,
      };
    }
    const tokens = parseTokens((await response.json()) as Record<string, unknown>);
    return tokens
      ? { ok: true, data: tokens }
      : { ok: false, error: "TrueLayer returned an unexpected token response.", reauthorise: false };
  } catch {
    return { ok: false, error: "Could not reach TrueLayer.", reauthorise: false };
  } finally {
    clearTimeout(timeout);
  }
}

export function exchangeTrueLayerCode(code: string): Promise<ApiResult<TrueLayerTokens>> {
  return tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code }));
}

export function refreshTrueLayerToken(refreshToken: string): Promise<ApiResult<TrueLayerTokens>> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

async function getData<T>(path: string, accessToken: string): Promise<ApiResult<T>> {
  const settings = config();
  if (!settings) return { ok: false, error: "TrueLayer credentials are not configured.", reauthorise: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.apiBase}${path}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "TrueLayer rejected the bank authorisation. Reconnect the bank account.", reauthorise: true };
    }
    if (!response.ok) return { ok: false, error: `TrueLayer returned ${response.status} while reading bank data.`, reauthorise: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: "Could not reach TrueLayer.", reauthorise: false };
  } finally {
    clearTimeout(timeout);
  }
}

export function getTrueLayerAccounts(accessToken: string): Promise<ApiResult<{ results?: TrueLayerAccount[] }>> {
  return getData("/data/v1/accounts", accessToken);
}

export function getTrueLayerTransactions(
  accessToken: string,
  accountId: string,
  from: string,
  to: string,
): Promise<ApiResult<{ results?: TrueLayerTransaction[] }>> {
  return getData(`/data/v1/accounts/${encodeURIComponent(accountId)}/transactions?${new URLSearchParams({ from, to })}`, accessToken);
}

export function tokenNeedsRefresh(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() - TOKEN_SAFETY_MARGIN_MS <= Date.now();
}

export function pickTrueLayerAccount(
  accounts: TrueLayerAccount[],
  bank: { currency: string; sort_code: string; account_number_last4: string },
): TrueLayerAccount | null {
  const currencyMatches = accounts.filter((account) => !account.currency || account.currency === bank.currency);
  const candidates = currencyMatches.length > 0 ? currencyMatches : accounts;
  const sortCode = bank.sort_code.replace(/\D/g, "");
  const last4 = bank.account_number_last4.replace(/\D/g, "");
  const exact = candidates.filter((account) => {
    const number = account.account_number?.number?.replace(/\D/g, "") ?? "";
    const providerSortCode = account.account_number?.sort_code?.replace(/\D/g, "") ?? "";
    return Boolean(last4 && number.endsWith(last4)) && (!sortCode || providerSortCode === sortCode);
  });
  if (exact.length === 1) return exact[0];
  return candidates.length === 1 ? candidates[0] : null;
}

export type { TrueLayerTokens };
