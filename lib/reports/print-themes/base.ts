/**
 * The shared foundation every skin is built on.
 *
 * Everything here is structural: page geometry, table mechanics and the rules
 * that decide where a long statement breaks. Themes restyle on top of it and
 * are appended after it, so a theme can change how a total looks but cannot
 * lose the rule that stops a General Ledger being cut off mid-page.
 *
 * Three rules in particular are load-bearing and deliberately live here rather
 * than in any theme:
 *
 *   thead { display: table-header-group }
 *     Repeats the column headings on every page. A page of figures with no
 *     headings is unreadable.
 *
 *   tfoot { display: table-row-group }
 *     Stops the totals doing the same. The default repeats them on every page,
 *     so a two-page trial balance printed "Totals" twice and read as though the
 *     report had run twice.
 *
 *   tr { break-inside: avoid }
 *     Scoped to the row, never the table. The source templates carried
 *     `table { page-break-inside: avoid }`, which is wrong for a statement that
 *     runs to several pages — a ledger cannot avoid breaking, and asking it to
 *     either overflows the sheet or pushes the whole table to a fresh page and
 *     breaks it there anyway.
 *
 * There is also no webfont anywhere in this directory. The print document is
 * written into a blank iframe and printed on the next frame, so a remote
 * @import would not have resolved in time: the PDF would come out in fallback
 * faces having reflowed, and offline printing would never get the font at all.
 * Every theme uses a system stack.
 */

import type { RenderedSection, ReportShellContext } from "./types";

/** Font stacks. System faces only — see the note above. */
export const FONT_SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
export const FONT_SERIF = `Georgia, "Times New Roman", Times, serif`;

export const BASE_STYLES = `
  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0f172a;
    font-family: var(--font-body);
    font-size: 10pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .doc { width: 100%; }

  /* ---- table mechanics ------------------------------------------------- */

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-variant-numeric: tabular-nums;
  }

  thead { display: table-header-group; }
  tfoot { display: table-row-group; }

  th {
    padding: 5pt 6pt;
    text-align: left;
    font-weight: 700;
  }

  td {
    padding: 4.5pt 6pt;
    vertical-align: top;
    /* Long account names and memos wrap instead of pushing the money columns
       off the page — the whole reason the Credit column used to vanish. */
    overflow-wrap: anywhere;
  }

  tr { break-inside: avoid; page-break-inside: avoid; }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .indent .cell-0 { padding-left: 18pt; }

  /* ---- row semantics --------------------------------------------------- */

  /* A heading stranded as the last row on a page orphans its section, so the
     break is pushed ahead of it. */
  .row-section td {
    font-weight: 700;
    padding-top: 10pt;
    border-bottom: none;
  }

  .row-section { break-after: avoid; page-break-after: avoid; }

  .row-subtotal td {
    font-weight: 700;
    border-bottom: none;
  }

  .row-total td {
    font-weight: 800;
    padding-top: 6pt;
    padding-bottom: 6pt;
  }

  .row-spacer td {
    height: 8pt;
    border-bottom: none;
    padding: 0;
  }

  .empty {
    padding: 28pt 0;
    text-align: center;
    font-style: italic;
  }
`;

/**
 * Lays out the body of a statement: a run of headed blocks, then the bottom
 * line beneath them.
 *
 * Every skin needs the same decision and it is easy to get subtly wrong, so it
 * is made once here. A report with no headings — a Trial Balance, a General
 * Ledger — falls back to the single continuous table, which already carries its
 * own totals in a `tfoot`; a statement renders block by block with the total as
 * a separate aligned row beneath.
 *
 * A skin supplies only the wrapper around one block, which is where the themes
 * actually differ: a bordered card, a ruled caption, a bare heading.
 */
export function renderStatement(
  context: ReportShellContext,
  renderSection: (section: RenderedSection, esc: (value: string) => string) => string
): string {
  if (!context.hasSections) return context.table;

  const blocks = context.sections
    .map((section) => renderSection(section, context.esc))
    .join("");

  return blocks + (context.totalTable ?? "");
}

/**
 * Initials for a letterhead monogram, derived from the organisation's own name
 * rather than invented — at most two characters, which is what the crest-sized
 * box in the source templates holds without spilling.
 */
export function monogram(orgName: string): string {
  const words = String(orgName ?? "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The parameter list shared by the skins that show one. Returns an empty string
 * when a report was run without filters, so no empty block is emitted.
 */
export function renderParameters(
  parameters: string[],
  esc: (value: string) => string,
  className = "params"
): string {
  if (parameters.length === 0) return "";
  const items = parameters.map((line) => `<li>${esc(line)}</li>`).join("");
  return `<ul class="${className}">${items}</ul>`;
}

/**
 * The small print at the foot of a statement. Every skin ends with some form of
 * this, so the text is composed once and only the markup differs.
 */
export function colophonText(
  generatedAt: string,
  currencyNote: string | undefined
): string {
  return currencyNote
    ? `${currencyNote} · Generated ${generatedAt}`
    : `Generated ${generatedAt}`;
}
