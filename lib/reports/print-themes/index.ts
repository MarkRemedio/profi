import { paletteFor, type PaletteTokens } from "./palette";
import { boldSkin } from "./bold";
import { classicSkin } from "./classic";
import { corporateSkin } from "./corporate";
import { elegantSkin } from "./elegant";
import { modernSkin } from "./modern";
import { professionalSkin } from "./professional";
import type { ReportSkin, ReportTheme } from "./types";

export type { ReportSkin, ReportShellContext, ReportTheme } from "./types";
export { BASE_STYLES } from "./base";
export {
  paletteFor,
  paletteVariables,
  type PaletteOverrides,
  type PaletteTokens,
} from "./palette";
export {
  PRINT_FONT_OPTIONS,
  fontStacks,
  isPrintFont,
  type PrintFontId,
} from "./typography";
export { PAPER_OPTIONS, isPaperSize, pageRule, paperOf, type PaperSize } from "./paper";

export const DEFAULT_REPORT_THEME: ReportTheme = "professional";

/**
 * The skins on offer, in picker order.
 *
 * The picker is built from this registry, so a theme appears to the user on the
 * day it works and not before.
 *
 * `modern` and `elegant` reach the page differently from their references:
 * both were drawn as a two-column grid with a fixed side panel down the whole
 * sheet, which is an invoice idiom that a statement cannot use — a grid does
 * not paginate, and modern's clipped at `overflow: hidden`, so a long General
 * Ledger printed page one and silently dropped the rest. In both the panel is
 * scoped to the masthead on page one and the table then runs full width across
 * as many sheets as it needs. See the note at the top of each.
 */
const SKINS: ReportSkin[] = [
  professionalSkin,
  classicSkin,
  corporateSkin,
  boldSkin,
  modernSkin,
  elegantSkin,
];

const SKINS_BY_ID = new Map<string, ReportSkin>(SKINS.map((skin) => [skin.id, skin]));

/** The themes to offer in a picker, in display order. */
export const REPORT_THEMES: ReadonlyArray<
  Pick<ReportSkin, "id" | "label" | "description"> & { palette: PaletteTokens }
> = SKINS.map(({ id, label, description }) => ({
  id,
  label,
  description,
  palette: paletteFor(id),
}));

/**
 * Resolves a stored preference to a skin.
 *
 * Falls back rather than throwing: the preference is read from the browser, so
 * it can name a theme from a newer build or one since withdrawn, and a report
 * that will not print is worse than a report in the wrong typeface.
 */
export function resolveSkin(theme: string | null | undefined): ReportSkin {
  if (theme) {
    const skin = SKINS_BY_ID.get(theme);
    if (skin) return skin;
  }
  return SKINS_BY_ID.get(DEFAULT_REPORT_THEME) ?? SKINS[0];
}

export function isReportTheme(value: string | null | undefined): value is ReportTheme {
  return typeof value === "string" && SKINS_BY_ID.has(value);
}
