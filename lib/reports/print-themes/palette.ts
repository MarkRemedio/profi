import {
  getInvoiceTemplateColors,
  getInvoiceTemplateTextColor,
  type InvoiceTemplateId,
} from "@/components/sales/document-templates/invoice-template-config";
import type { ReportTheme } from "./types";

/**
 * The colours each report template is set in.
 *
 * Read from the sales document templates rather than restated here, so a
 * workspace's statements and its invoices are the same stationery — not merely
 * the same today, but permanently: there is one set of hexes in the codebase
 * and both sides read it. Change Corporate's navy for invoices and the Balance
 * Sheet follows on the next print, with nothing to keep in step by hand.
 *
 * The six report templates carry the same ids as the six invoice templates,
 * which the assignment below is checked against at compile time.
 */

/**
 * Fails to compile if the two sets of template ids ever diverge — a new report
 * template with no invoice counterpart, or an invoice template renamed.
 */
const _themesMatchInvoiceTemplates: Record<ReportTheme, InvoiceTemplateId> = {
  professional: "professional",
  classic: "classic",
  modern: "modern",
  corporate: "corporate",
  elegant: "elegant",
  bold: "bold",
};

export type PaletteTokens = {
  /** The template's principal colour, from the invoice brand colour. */
  accent: string;
  /** Black or white, whichever is legible on the accent. */
  ink: string;
  /** A light ground for banded rows and section headings. */
  wash: string;
  /** The colour hairlines are drawn in. */
  rule: string;
  /** The template's third colour, for skins that use one. */
  alt: string;
  /** The sheet itself. Near-white only — see `paperOf`. */
  paper: string;
  /** Body text. */
  text: string;
};

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Relative luminance. Decides legible foregrounds and light-versus-saturated. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mixes a colour towards white. `amount` is how much white, 0–1. */
function tint(hex: string, amount: number): string {
  return toHex(channels(hex).map((channel) => channel + (255 - channel) * amount));
}

/**
 * A template's third colour is the sheet only when it is near-white.
 *
 * Four of the six give a paper tint there — Corporate's `#f8fafc`, Elegant's
 * `#fffdf8`. Bold gives amber, which is a third brand hue and not a background:
 * printing a statement on a solid amber sheet is a page of ink and unreadable
 * besides. It is still available as `alt` for anything that wants to use it.
 */
function paperOf(tertiary: string): string {
  return luminance(tertiary) > 0.85 ? tertiary : "#ffffff";
}

/**
 * Colours set on this document in place of its template's preset.
 *
 * Absent or malformed entries fall back to the preset, so a half-filled record
 * still prints — and so a template that has never been customised prints in
 * exactly the colours its invoice counterpart uses.
 */
export type PaletteOverrides = {
  /** Primary accents and emphasis. */
  primary?: string | null;
  /** Headers and supporting colour. */
  secondary?: string | null;
  /** Highlights and surface colour. */
  highlight?: string | null;
  /** Main printable text colour. */
  text?: string | null;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Anything that is not a six-digit hex is ignored rather than trusted. */
function override(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

/**
 * The colours a document is set in: its template's invoice palette, with any
 * overrides applied on top.
 *
 * The invoice palette is a triplet whose second entry means different things by
 * template: mostly a pale companion to the brand colour (Professional's
 * `#d9e8f5`), but sometimes a saturated second hue (Corporate's sky, Bold's
 * slate). Luminance tells them apart — a pale companion becomes the wash that
 * bands rows, a saturated one becomes the rule that draws hairlines — which is
 * how Corporate ends up ruled in sky, exactly as its reference template is.
 * That test runs on whatever colour is in force, so a custom secondary is read
 * the same way the preset one is.
 */
export function paletteFor(
  theme: ReportTheme,
  overrides: PaletteOverrides = {}
): PaletteTokens {
  const [presetBrand, presetSecondary, presetTertiary] = getInvoiceTemplateColors(theme);

  const brand = override(overrides.primary, presetBrand);
  const secondary = override(overrides.secondary, presetSecondary);
  const tertiary = override(overrides.highlight, presetTertiary);
  const text = override(overrides.text, getInvoiceTemplateTextColor(theme));

  const secondaryIsPale = luminance(secondary) > 0.75;

  return {
    accent: brand,
    ink: luminance(brand) > 0.45 ? "#0f172a" : "#ffffff",
    wash: secondaryIsPale ? secondary : tint(brand, 0.93),
    rule: secondaryIsPale ? tint(brand, 0.55) : secondary,
    alt: tertiary,
    paper: paperOf(tertiary),
    text,
  };
}

/**
 * The custom properties every skin reads. Emitted once per document so a skin
 * never has to know which colours it was given.
 */
export function paletteVariables(
  theme: ReportTheme,
  overrides: PaletteOverrides = {}
): string {
  const tokens = paletteFor(theme, overrides);

  return `
  :root {
    --accent: ${tokens.accent};
    --accent-ink: ${tokens.ink};
    --accent-wash: ${tokens.wash};
    --accent-rule: ${tokens.rule};
    --accent-alt: ${tokens.alt};
    --paper: ${tokens.paper};
    --text: ${tokens.text};
  }

  html, body {
    background: var(--paper);
    color: var(--text);
  }
`;
}
