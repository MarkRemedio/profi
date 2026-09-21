/**
 * Report print themes.
 *
 * A theme is a *skin*: the page furniture and the stylesheet, and nothing else.
 * The rows, the columns and every figure on them arrive already built in a
 * `PrintReport` and pass through untouched — a skin never sees the ledger, so
 * no theme can change what a statement says, only how it is set.
 *
 * The six themes are genuinely different skeletons rather than palette swaps,
 * which is why each supplies its own shell markup instead of overriding a
 * handful of custom properties.
 */

import type { TemplateFonts } from "./typography";

export type ReportTheme =
  | "professional"
  | "classic"
  | "corporate"
  | "bold"
  | "modern"
  | "elegant";

/**
 * One headed block of a statement, already rendered as its own table.
 *
 * Every reference template sets a statement as a run of these rather than one
 * continuous table — Revenue, then Cost of Sales, then Operating Expenses, each
 * with its own column headings and its own subtotal. Skins render the run.
 */
export type RenderedSection = {
  /**
   * The block's heading, or null for a report that has none. A Trial Balance
   * and a General Ledger arrive as a single unheaded section, which is simply
   * one plain table.
   */
  heading: string | null;
  /** The block's rows and its subtotal, as a complete table. */
  table: string;
  /** How many account rows the block holds. Some references show this. */
  rowCount: number;
};

/**
 * What a skin is handed. Every table here is finished and already escaped, so a
 * skin only decides what to wrap around them and never touches a figure.
 */
export type ReportShellContext = {
  /** The organisation's real name. Not escaped; skins escape what they emit. */
  orgName: string;
  /** The statement name, e.g. "Trial Balance". */
  title: string;
  /** The period line, e.g. "As of 05/08/2026". */
  note: string;
  /** Extra parameter lines, e.g. a single-account ledger filter. */
  parameters: string[];
  /**
   * The whole statement as one continuous table, totals included. The right
   * choice for a flat report; `sections` is the right choice for a statement.
   */
  table: string;
  /** The statement's headed blocks, in order. Never empty. */
  sections: RenderedSection[];
  /**
   * Whether any block carries a heading. False for a Trial Balance or a
   * General Ledger, where `sections` holds exactly one unheaded table.
   */
  hasSections: boolean;
  /**
   * The report's bottom line as a single-row table, sharing the column widths
   * of the blocks above so the figures line up. Null when there is no total.
   */
  totalTable: string | null;
  /**
   * The same bottom line as raw cells, for skins that set it as a bar rather
   * than a table row. Not escaped — run it through `esc`.
   */
  totalCells: string[] | null;
  generatedAt: string;
  currencyNote?: string;
  /** HTML-escapes a value. Every skin must run user data through this. */
  esc: (value: string) => string;
};

export type ReportSkin = {
  id: ReportTheme;
  /** Shown in the theme picker. */
  label: string;
  /** One line describing the look, shown under the label. */
  description: string;
  /**
   * The faces this template was designed in, used when the reader has not
   * chosen a typeface of their own.
   */
  fonts: TemplateFonts;
  /**
   * Theme CSS, concatenated after the shared base. Themes override the base
   * rather than replacing it, so the pagination rules can never be lost.
   */
  styles: string;
  /** Returns the full `<body>` content for one report. */
  renderShell: (context: ReportShellContext) => string;
};
