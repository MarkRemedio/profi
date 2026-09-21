/**
 * Print documents for the financial reports.
 *
 * These reports used to be exported by cloning the on-screen markup into a
 * hidden iframe. That inherits everything the screen needs and print does not:
 * the report card's `overflow-hidden` clipped the Credit column off the right
 * edge of the page, the 20-row pagination meant a General Ledger PDF contained
 * only the page you happened to be looking at, and the section filter buttons
 * printed as grey rectangles.
 *
 * So the print output is built here instead, from the data rather than from the
 * DOM — a plain document with its own stylesheet, no Tailwind, no breakpoints
 * and no interactive chrome. Every row and every column, every time.
 *
 * The look is supplied by a theme from ./print-themes. A theme is presentation
 * only — it chooses the letterhead and the stylesheet, and the table it wraps
 * is rendered here from the same rows regardless. No theme can change a figure.
 */
import {
  BASE_STYLES,
  fontStacks,
  pageRule,
  paletteVariables,
  resolveSkin,
  type PaletteOverrides,
  type PaperSize,
  type PrintFontId,
} from "./print-themes";


export type PrintAlign = "left" | "right";

export type PrintColumn = {
  label: string;
  align?: PrintAlign;
  /** A width hint as a CSS value, e.g. "18%". Optional. */
  width?: string;
};

/**
 * `section`  — a heading inside the statement ("Current Assets")
 * `subtotal` — a total for one section, ruled above
 * `total`    — the report's bottom line, ruled above and double-ruled below
 * `spacer`   — vertical air between blocks
 */
export type PrintRowVariant = "normal" | "section" | "subtotal" | "total" | "spacer";

export type PrintRow = {
  cells: string[];
  variant?: PrintRowVariant;
  /** Indents the first cell — used for accounts sitting under a section heading. */
  indent?: boolean;
};

export type PrintReport = {
  /** The statement name, e.g. "Trial Balance". */
  title: string;
  /** The real organisation name. */
  orgName: string;
  /** The period line, e.g. "As of 05/08/2026". */
  note: string;
  /** Extra parameter lines, e.g. a single-account ledger filter. */
  parameters?: string[];
  columns: PrintColumn[];
  rows: PrintRow[];
  /** Rendered once at the end of the table, never repeated per page. */
  footer?: PrintRow;
  /** Formatted by the caller, which owns the workspace's date format. */
  generatedAt: string;
  /** Shown in small print at the foot of the document. */
  currencyNote?: string;
};

/**
 * How a report should be set. Both are presentation; neither reaches the rows.
 */
export type PrintFormatOptions = PaletteOverrides & {
  /** A theme id from ./print-themes. Unknown values fall back to the default. */
  theme?: string | null;
  /** A typeface id. `template` keeps the faces the template was designed in. */
  font?: PrintFontId | null;
  /** The sheet to lay out for. Defaults to A4. */
  paperSize?: PaperSize | null;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Account names are user data and go into a document that is then printed and
 * sent on, so they are escaped rather than trusted.
 */
export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function renderRow(row: PrintRow, columns: PrintColumn[]): string {
  if (row.variant === "spacer") {
    return `<tr class="row-spacer"><td colspan="${columns.length}"></td></tr>`;
  }

  const classes = ["row-" + (row.variant ?? "normal")];
  if (row.indent) classes.push("indent");

  const cells = columns
    .map((column, index) => {
      const value = row.cells[index] ?? "";
      const align = column.align === "right" ? " num" : "";
      return `<td class="cell-${index}${align}">${escapeHtml(value)}</td>`;
    })
    .join("");

  return `<tr class="${classes.join(" ")}">${cells}</tr>`;
}

/**
 * Renders the statement itself: colgroup, headings, rows and the totals line.
 *
 * Kept apart from the skins so every theme prints the same table from the same
 * rows. A skin chooses the letterhead and the typeface; it never gets to decide
 * which figures appear.
 */
function renderTable(report: PrintReport): string {
  const { columns, rows, footer } = report;

  const body =
    rows.length > 0
      ? rows.map((row) => renderRow(row, columns)).join("")
      : `<tr><td class="empty" colspan="${columns.length}">No posted journal data for this report.</td></tr>`;

  const foot = footer && rows.length > 0 ? `<tfoot>${renderRow(footer, columns)}</tfoot>` : "";

  return wrapTable(body, columns, foot);
}

/** The shared table chrome: fixed column widths and repeating column headings. */
function wrapTable(body: string, columns: PrintColumn[], foot = ""): string {
  const colgroup = columns
    .map((column) => `<col${column.width ? ` style="width:${column.width}"` : ""} />`)
    .join("");

  const head = columns
    .map(
      (column) =>
        `<th class="${column.align === "right" ? "num" : ""}">${escapeHtml(column.label)}</th>`
    )
    .join("");

  return `<table>
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
        ${foot}
      </table>`;
}

/**
 * Splits a statement into its sections, one per `section` row.
 *
 * Every reference template sets a statement as a run of headed blocks — each
 * with its own table, its own column headings and its own subtotal — rather
 * than one continuous table with headings inside it. Skins therefore need the
 * rows grouped, not just concatenated.
 *
 * A report with no `section` rows at all — a Trial Balance, a General Ledger —
 * comes back as a single unheaded group, which a skin renders as one plain
 * table. That is the correct shape for those two, and it means no skin needs a
 * special case for them.
 *
 * Spacer rows are dropped: they existed to put air between blocks in a single
 * table, and the blocks now space themselves.
 *
 * `total` rows are pulled out rather than left where they fall. A statement's
 * bottom line — Net Profit, Total Equity — arrives as the last row of `rows`
 * rather than as `footer`, so grouping it with whatever section preceded it
 * would print the report's headline figure inside the Current Liabilities block.
 * It belongs under the whole statement, which is where every reference puts it.
 */
type Segment = { heading: string | null; rows: PrintRow[]; rowCount: number };

function segmentRows(rows: PrintRow[]): { sections: Segment[]; totals: PrintRow[] } {
  const sections: Segment[] = [];
  const totals: PrintRow[] = [];
  let current: Segment | null = null;

  for (const row of rows) {
    if (row.variant === "section") {
      current = { heading: row.cells[0] ?? "", rows: [], rowCount: 0 };
      sections.push(current);
      continue;
    }

    if (row.variant === "spacer") continue;

    if (row.variant === "total") {
      totals.push(row);
      continue;
    }

    if (!current) {
      current = { heading: null, rows: [], rowCount: 0 };
      sections.push(current);
    }

    current.rows.push(row);
    if (!row.variant || row.variant === "normal") current.rowCount += 1;
  }

  return { sections, totals };
}

/**
 * Builds the complete printable document for one report.
 *
 * Returns a full HTML string rather than writing to the DOM, so it can be
 * tested without a browser.
 *
 * `format` picks the template — the page furniture, the stylesheet and the
 * colours it is set in, and nothing more. The report passed in is rendered
 * unchanged whichever template is chosen, so switching one can never alter a
 * figure, a row or a total. An unrecognised template falls back to the default
 * rather than failing.
 */
export function buildReportHtml(report: PrintReport, format?: PrintFormatOptions): string {
  const { title, orgName, note, parameters = [], generatedAt, currencyNote } = report;

  const skin = resolveSkin(format?.theme);
  const fonts = fontStacks(format?.font ?? "template", skin.fonts);
  const page = pageRule(format?.paperSize ?? "a4");

  // The typefaces are custom properties so a skin can ask for "the display
  // face" without knowing which one the reader chose.
  const fontVariables = `
  :root {
    --font-body: ${fonts.body};
    --font-display: ${fonts.display};
  }
`;

  const { sections: segments, totals } = segmentRows(report.rows);
  const hasSections = segments.some((segment) => segment.heading !== null);

  const sections = segments.map((segment) => ({
    heading: segment.heading,
    rowCount: segment.rowCount,
    table: wrapTable(
      segment.rows.map((row) => renderRow(row, report.columns)).join(""),
      report.columns
    ),
  }));

  // The bottom line: any total rows lifted out of the run, plus the report's
  // own footer if it has one. Rendered beneath the whole statement.
  const totalRows =
    report.rows.length > 0 && report.footer ? [...totals, report.footer] : totals;

  const shell = skin.renderShell({
    orgName,
    title,
    note,
    parameters,
    table: renderTable(report),
    sections,
    hasSections,
    totalTable:
      totalRows.length > 0
        ? wrapTable(
            "",
            report.columns,
            `<tfoot>${totalRows.map((row) => renderRow(row, report.columns)).join("")}</tfoot>`
          )
        : null,
    totalCells: totalRows.length > 0 ? totalRows[totalRows.length - 1].cells : null,
    generatedAt,
    currencyNote,
    esc: escapeHtml,
  });

  // The document title becomes the PDF's filename suggestion, so it carries the
  // organisation and the statement rather than a placeholder.
  const documentTitle = `${orgName} — ${title}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${page}${fontVariables}${BASE_STYLES}${paletteVariables(skin.id, format ?? {})}${skin.styles}</style>
  </head>
  <body>
    ${shell}
  </body>
</html>`;
}

/**
 * Opens the browser's print dialog on a generated document.
 *
 * A freshly appended iframe loads `about:blank` first and fires `load` for it,
 * then fires `load` again once the real document is written. Printing from that
 * event therefore opened the dialog twice: once on the empty frame — a blank
 * sheet carrying the parent tab's title, because a blank iframe has none of its
 * own — and again on the report. Cancelling the blank one revealed the real one
 * underneath.
 *
 * So the print is fired once, explicitly, after the document is written, and
 * guarded so no later event can fire it a second time.
 */
export function printReportDocument(html: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  // A real A4-ish box rather than 0×0, so there is something to lay out against.
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return;
  }

  // Writing a complete document string parses it synchronously, and every style
  // is inline, so there is nothing left to wait for once close() returns.
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  let hasPrinted = false;
  let hasCleanedUp = false;

  const cleanUp = () => {
    if (hasCleanedUp) return;
    hasCleanedUp = true;
    // A tick of grace: Safari finishes reading the document after afterprint.
    setTimeout(() => iframe.remove(), 250);
  };

  const startPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;

    frameWindow.addEventListener("afterprint", cleanUp);
    // Not every engine fires afterprint when the dialog is dismissed, so this is
    // the backstop that stops hidden iframes accumulating on the page.
    setTimeout(cleanUp, 60_000);

    frameWindow.focus();
    frameWindow.print();
  };

  if (frameDocument.readyState === "complete") {
    // Deferred one frame so layout settles before the snapshot is taken.
    requestAnimationFrame(startPrint);
  } else {
    frameWindow.addEventListener("load", startPrint, { once: true });
    // readyState can reach complete without a load event when the document was
    // written rather than navigated to; this makes sure we still print.
    setTimeout(startPrint, 300);
  }
}
