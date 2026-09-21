import "server-only";

/**
 * Companies House lookups.
 *
 * Two calls: search a name to find the company, then read the full record for
 * the one chosen. The register is public, so this is application-restricted —
 * an API key identifies us and nothing is authorised per business. There is no
 * OAuth here and nothing to store per workspace, which is what makes it far
 * simpler than the HMRC connection beside it.
 *
 * Nothing here throws at a caller. Every failure resolves to a result the form
 * can explain, for the same reason the VAT check does: Companies House has
 * outages, and a settings page must not break when it has one. Everything these
 * calls fill in is typed by hand otherwise, so an unavailable lookup costs
 * convenience and nothing more.
 */

/**
 * Live and sandbox are separate hosts with separate keys, and a key issued to
 * one is rejected by the other.
 *
 * An application's environment is fixed when it is created on the Developer
 * Hub, so a key from a "test" application only ever answers on the sandbox —
 * where the register contains synthetic companies and none of the real ones.
 * Configurable so moving between them is a deployment change rather than a code
 * change: set COMPANIES_HOUSE_API_BASE to
 * https://api-sandbox.company-information.service.gov.uk while testing.
 */
const API_BASE =
  process.env.COMPANIES_HOUSE_API_BASE ?? "https://api.company-information.service.gov.uk";

/** Whether we are pointed at the sandbox, where no real company exists. */
export function isCompaniesHouseSandbox(): boolean {
  return API_BASE.includes("sandbox");
}

/** Give up rather than hang a form waiting on a third party. */
const FETCH_TIMEOUT_MS = 6000;

/** Enough to choose from without turning the panel into a directory. */
const SEARCH_LIMIT = 8;

export function companiesHouseConfigured(): boolean {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
}

/**
 * Companies House authenticates with HTTP Basic, the key as the username and
 * an empty password — not a bearer token, which is the usual first guess and
 * answers 401.
 */
function authorizationHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function request(path: string): Promise<unknown | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { authorization: authorizationHeader(key), accept: "application/json" },
      signal: controller.signal,
      // The register changes daily at most, and a company's type and year end
      // effectively never. Nothing here is worth a fresh round trip per render.
      cache: "no-store",
    });

    if (!response.ok) {
      // 404 is a normal answer to "is this company number real", not a fault,
      // so it is not logged. Anything else is worth knowing about.
      if (response.status !== 404) {
        console.error(`Companies House ${response.status} for ${path}`);
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Companies House request failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type CompanyMatch = {
  companyNumber: string;
  name: string;
  status: string | null;
  /** Single line, as Companies House composes it for search results. */
  address: string | null;
};

export type CompanyRecord = {
  companyNumber: string;
  name: string;
  status: string | null;
  type: string | null;
  subtype: string | null;
  sicCodes: string[];
  accounts: {
    next_accounts?: { period_end_on?: string };
    accounting_reference_date?: { day?: string; month?: string };
  } | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Whether this looks like a company number rather than a name.
 *
 * Eight characters: either eight digits, or a two letter jurisdiction prefix
 * (SC for Scotland, NI for Northern Ireland, OC and OE for partnerships and
 * overseas entities) followed by six. Older records can be shorter.
 */
export function looksLikeCompanyNumber(query: string): boolean {
  const normalised = query.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{0,2}[0-9]{6,8}$/.test(normalised) && normalised.length <= 8;
}

async function searchByName(query: string): Promise<CompanyMatch[]> {
  const payload = await request(
    `/search/companies?q=${encodeURIComponent(query)}&items_per_page=${SEARCH_LIMIT}`,
  );
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const companyNumber = asString(row.company_number);
    const name = asString(row.title);
    if (!companyNumber || !name) return [];

    return [
      {
        companyNumber,
        name,
        status: asString(row.company_status),
        address: asString(row.address_snippet),
      },
    ];
  });
}

/**
 * Companies matching a name or number, most relevant first.
 *
 * A query shaped like a company number is also fetched directly, not left to
 * the search index. Two reasons, one of them measured: the sandbox index does
 * not contain companies made by the test data generator at all — an exact
 * search for one returns nothing — so without this the lookup cannot be
 * exercised outside production. And on the live register it is simply better,
 * because somebody holding their certificate types the number, and a direct
 * read always finds it.
 *
 * The exact match leads, and the name results are filtered so it cannot appear
 * twice.
 */
export async function searchCompanies(query: string): Promise<CompanyMatch[]> {
  const trimmed = query.trim();
  // Two characters matches most of the register and is never what was meant.
  if (trimmed.length < 3) return [];

  const [byName, exact] = await Promise.all([
    searchByName(trimmed),
    looksLikeCompanyNumber(trimmed) ? fetchCompanyRecord(trimmed) : Promise.resolve(null),
  ]);

  if (!exact) return byName;

  return [
    {
      companyNumber: exact.companyNumber,
      name: exact.name,
      status: exact.status,
      address: null,
    },
    ...byName.filter((match) => match.companyNumber !== exact.companyNumber),
  ];
}

/** The full record for one company, or null when there is no such number. */
export async function fetchCompanyRecord(companyNumber: string): Promise<CompanyRecord | null> {
  // Company numbers are eight characters and may carry a letter prefix (SC, NI,
  // OC). Anything else is not worth a request.
  const normalised = companyNumber.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{6,8}$/.test(normalised)) return null;

  const payload = await request(`/company/${encodeURIComponent(normalised)}`);
  if (!payload || typeof payload !== "object") return null;

  const row = payload as Record<string, unknown>;
  const name = asString(row.company_name);
  if (!name) return null;

  return {
    companyNumber: asString(row.company_number) ?? normalised,
    name,
    status: asString(row.company_status),
    type: asString(row.type),
    subtype: asString(row.subtype),
    sicCodes: Array.isArray(row.sic_codes)
      ? row.sic_codes.filter((code): code is string => typeof code === "string")
      : [],
    accounts: (row.accounts as CompanyRecord["accounts"]) ?? null,
  };
}
