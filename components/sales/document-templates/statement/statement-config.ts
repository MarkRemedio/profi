export type StatementFont = "sans" | "serif" | "mono";
export type StatementPaperSize = "a4" | "letter";

export type StatementTemplateConfig = {
  // Branding
  logo: string | null;
  brandColor: string;
  font: StatementFont;
  companyAddress: string;
  vatNumber: string;
  regNumber: string;
  paperSize: StatementPaperSize;
  statementTitle: string;
  introText: string;
  footer: string;
  // Section toggles — the transparency controls
  showSummaryTiles: boolean;
  showActivityLedger: boolean;
  showLineBreakdown: boolean;
  showAgingSummary: boolean;
  showOutstandingTable: boolean;
  showDisclosures: boolean;
};

export const STATEMENT_DEFAULTS: StatementTemplateConfig = {
  logo: null,
  brandColor: "#0f766e", // teal — distinct from invoice/credit-note/quote defaults
  font: "sans",
  companyAddress: "",
  vatNumber: "",
  regNumber: "",
  paperSize: "a4",
  statementTitle: "Statement of Account",
  introText: "",
  footer: "",
  showSummaryTiles: true,
  showActivityLedger: true,
  showLineBreakdown: true,
  showAgingSummary: true,
  showOutstandingTable: true,
  showDisclosures: true,
};

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Overlay a possibly-malformed DB blob (untyped `Json` column) onto typed
 * defaults. Every missing / wrong-typed / null / array value falls back to its
 * default. NEVER throws — the print route depends on always getting a valid config.
 */
export function mergeStatementDefaults(raw: unknown): StatementTemplateConfig {
  const o: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    logo: typeof o.logo === "string" ? o.logo : null,
    brandColor: asString(o.brandColor, STATEMENT_DEFAULTS.brandColor),
    font: asEnum(o.font, ["sans", "serif", "mono"] as const, STATEMENT_DEFAULTS.font),
    companyAddress: asString(o.companyAddress, ""),
    vatNumber: asString(o.vatNumber, ""),
    regNumber: asString(o.regNumber, ""),
    paperSize: asEnum(o.paperSize, ["a4", "letter"] as const, STATEMENT_DEFAULTS.paperSize),
    statementTitle: asString(o.statementTitle, STATEMENT_DEFAULTS.statementTitle),
    introText: asString(o.introText, ""),
    footer: asString(o.footer, ""),
    showSummaryTiles: asBool(o.showSummaryTiles, true),
    showActivityLedger: asBool(o.showActivityLedger, true),
    showLineBreakdown: asBool(o.showLineBreakdown, true),
    showAgingSummary: asBool(o.showAgingSummary, true),
    showOutstandingTable: asBool(o.showOutstandingTable, true),
    showDisclosures: asBool(o.showDisclosures, true),
  };
}
