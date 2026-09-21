/**
 * HMRC fraud prevention headers.
 *
 * Every Making Tax Digital call must carry a set of headers describing the
 * device and connection the request originated from. HMRC treats this as a
 * legal obligation on the software vendor, not an optional extra, and checks
 * conformance with a dedicated validation endpoint before granting production
 * credentials.
 *
 * This application is a server-rendered web app, so the connection method is
 * WEB_APP_VIA_SERVER: the browser talks to us and we talk to HMRC. That choice
 * dictates which headers are required — in particular HMRC wants both the end
 * user's public IP (which only we can see) and several values only the browser
 * knows, such as screen size and timezone offset.
 *
 * Deliberately free of `server-only` and of any Next.js import so the encoding
 * rules can be tested directly. The caller passes plain values in.
 *
 * Reference: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
 */

/** What the browser can tell us that the server cannot. */
export type BrowserFraudContext = {
  /** Minutes offset from UTC, as returned by `new Date().getTimezoneOffset()`. */
  timezoneOffsetMinutes?: number;
  screenWidth?: number;
  screenHeight?: number;
  screenScalingFactor?: number;
  colourDepth?: number;
  windowWidth?: number;
  windowHeight?: number;
  /** navigator.doNotTrack === "1". */
  doNotTrack?: boolean;
  /** navigator.userAgent, as the browser reports it to itself. */
  jsUserAgent?: string;
};

export type ServerFraudContext = {
  /** The end user's public IP, as seen by our edge. */
  publicIp: string | null;
  /** Source port of that connection, when the platform exposes it. */
  publicPort: string | null;
  /** The browser's User-Agent request header. */
  userAgent: string | null;
  /** Stable per-device identifier we set ourselves, in UUID form. */
  deviceId: string;
  /** Our own identifier for the signed-in user. Never their email. */
  userId: string;
  /** Value of any forwarding header chain, for Gov-Vendor-Forwarded. */
  vendorForwarded?: string | null;
};

/** Shown to HMRC so they can identify the software making the call. */
const PRODUCT_NAME = "WAW-Profi";
const PRODUCT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";

/**
 * HMRC requires percent-encoding of any value that could contain a delimiter.
 * Encoding everything uniformly is simpler than deciding case by case, and is
 * what their own examples do.
 */
function encode(value: string): string {
  return encodeURIComponent(value);
}

/**
 * `UTC+HH:MM`, derived from the browser's offset.
 *
 * `getTimezoneOffset` returns minutes *behind* UTC, so the sign is inverted:
 * London in summer reports -60 and must be sent as UTC+01:00. Getting this
 * backwards is the single most common mistake in these headers.
 */
export function formatTimezone(offsetMinutes: number | undefined): string {
  const offset = typeof offsetMinutes === "number" ? -offsetMinutes : 0;
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const hours = `${Math.floor(absolute / 60)}`.padStart(2, "0");
  const minutes = `${absolute % 60}`.padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

/** `width=1920&height=1080&scaling-factor=1&colour-depth=24` */
export function formatScreens(browser: BrowserFraudContext): string {
  const parts = [
    `width=${browser.screenWidth ?? 0}`,
    `height=${browser.screenHeight ?? 0}`,
    `scaling-factor=${browser.screenScalingFactor ?? 1}`,
    `colour-depth=${browser.colourDepth ?? 24}`,
  ];
  return parts.join("&");
}

/**
 * Build the header set for one outbound MTD call.
 *
 * Headers whose value we genuinely do not have are omitted rather than sent
 * empty: HMRC's validator treats a present-but-blank header as an error, while
 * a missing optional one is a warning. Sending a fabricated value would be
 * worse than either, since these headers exist so HMRC can trace fraud.
 */
export function buildFraudPreventionHeaders(
  server: ServerFraudContext,
  browser: BrowserFraudContext = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Device-ID": server.deviceId,
    "Gov-Client-User-IDs": `${encode(PRODUCT_NAME.toLowerCase())}=${encode(server.userId)}`,
    "Gov-Client-Timezone": formatTimezone(browser.timezoneOffsetMinutes),
    "Gov-Client-Screens": formatScreens(browser),
    "Gov-Client-Window-Size": `width=${browser.windowWidth ?? 0}&height=${browser.windowHeight ?? 0}`,
    "Gov-Vendor-Product-Name": encode(PRODUCT_NAME),
    "Gov-Vendor-Version": `${encode(PRODUCT_NAME)}=${encode(PRODUCT_VERSION)}`,
    // We do not operate our own multi-factor step in front of HMRC, and HMRC
    // asks for the header to be absent rather than empty in that case.
    "Gov-Client-Browser-Do-Not-Track": browser.doNotTrack ? "true" : "false",
  };

  if (server.publicIp) headers["Gov-Client-Public-IP"] = server.publicIp;
  if (server.publicPort) headers["Gov-Client-Public-Port"] = server.publicPort;
  if (server.userAgent) headers["Gov-Client-User-Agent"] = encode(server.userAgent);
  if (browser.jsUserAgent) {
    headers["Gov-Client-Browser-JS-User-Agent"] = encode(browser.jsUserAgent);
  }
  if (server.vendorForwarded) headers["Gov-Vendor-Forwarded"] = server.vendorForwarded;

  return headers;
}
