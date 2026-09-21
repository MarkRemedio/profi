import { colophonText, monogram, renderStatement } from "./base";
import type { ReportSkin } from "./types";

/**
 * Corporate — banded header, metadata strip, tight ledger.
 *
 * The densest of the themes: a solid header band, a row of metadata cells
 * carrying the period and the run date, and compact rows. Built for a report
 * that gets circulated internally, where fitting more on the page matters more
 * than air around it.
 *
 * One deviation from the reference, and it is deliberate. The reference bleeds
 * the header and footer bands to the paper edge using `@page { margin: 0 }`
 * with padding on a page div. That works for a one-page invoice and fails for a
 * statement: padding applies to the box once, not per sheet, so page two of a
 * General Ledger would start hard against the paper edge with no margin at all.
 * The bands here span the text column instead, and the page keeps proper
 * margins on every sheet.
 */
const styles = `

  .banner {
    background: var(--accent);
    color: var(--accent-ink);
    padding: 9pt 11pt;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12pt;
  }

  .banner-brand {
    display: flex;
    align-items: center;
    gap: 8pt;
    min-width: 0;
  }

  .crest {
    width: 26pt;
    height: 26pt;
    border: 1pt solid var(--accent-rule);
    border-radius: 2pt;
    color: var(--accent-ink);
    font-size: 10pt;
    font-weight: 700;
    line-height: 24pt;
    text-align: center;
    flex-shrink: 0;
  }

  .org {
    margin: 0;
    font-size: 11.5pt;
    font-weight: 700;
    line-height: 1.2;
  }

  .banner-title {
    margin: 0;
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    text-align: right;
  }

  /* The metadata strip: what the statement covers, at a glance. */
  .meta-bar {
    display: flex;
    background: var(--accent-wash);
    border-bottom: 0.75pt solid var(--accent-rule);
    margin-bottom: 12pt;
  }

  .meta-cell {
    flex: 1;
    padding: 5pt 11pt;
    border-right: 0.5pt solid var(--accent-rule);
    min-width: 0;
  }

  .meta-cell:last-child { border-right: none; }

  .meta-label {
    display: block;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    font-weight: 700;
    margin-bottom: 1pt;
  }

  .meta-value {
    display: block;
    font-size: 8.5pt;
    font-weight: 700;
    color: #0f172a;
    overflow-wrap: anywhere;
  }

  th {
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 7pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 4.5pt 6pt;
    border-bottom: 1.5pt solid var(--accent-rule);
  }

  td {
    padding: 3.5pt 6pt;
    border-bottom: 0.5pt solid #e2e8f0;
  }

  .row-section td {
    font-size: 9.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
  }

  .row-subtotal td {
    border-top: 0.75pt solid var(--accent-rule);
    background: var(--accent-wash);
  }

  .row-total td {
    font-size: 10pt;
    background: var(--accent);
    color: var(--accent-ink);
    border-top: none;
    border-bottom: none;
  }

  .empty { color: #64748b; }

  .colophon {
    margin-top: 12pt;
    background: var(--accent);
    color: var(--accent-ink);
    padding: 5pt 11pt;
    font-size: 7pt;
    display: flex;
    justify-content: space-between;
    gap: 12pt;
  }

  .colophon p { margin: 0; }

  .section { margin-bottom: 10pt; }

  .section h3 {
    margin: 0 0 3pt;
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: #64748b;
    break-after: avoid;
  }
`;

export const corporateSkin: ReportSkin = {
  id: "corporate",
  label: "Corporate",
  description: "Banded header, metadata strip, dense rows.",
  fonts: { body: "sans", display: "sans" },
  styles,

  renderShell(context) {
    const { orgName, title, note, parameters, generatedAt, currencyNote, esc } = context;

    const initials = monogram(orgName);
    const crest = initials ? `<div class="crest">${esc(initials)}</div>` : "";

    // The strip is built from what the report already carries — no invented
    // fields, and any run parameters become cells of their own.
    const cells = [
      { label: "Statement", value: title },
      { label: "Period", value: note },
      ...parameters.map((value) => ({ label: "Filter", value })),
      { label: "Prepared", value: generatedAt },
    ];

    const metaBar = cells
      .map(
        (cell) =>
          `<div class="meta-cell">
            <span class="meta-label">${esc(cell.label)}</span>
            <span class="meta-value">${esc(cell.value)}</span>
          </div>`
      )
      .join("");

    return `<div class="doc">
      <header class="banner">
        <div class="banner-brand">
          ${crest}
          <p class="org">${esc(orgName)}</p>
        </div>
        <h1 class="banner-title">${esc(title)}</h1>
      </header>

      <div class="meta-bar">${metaBar}</div>

      ${renderStatement(context, (section, esc) =>
      `<section class="section">
        ${section.heading ? `<h3>${esc(section.heading)}</h3>` : ""}
        ${section.table}
      </section>`
    )}

      <footer class="colophon">
        <p>${esc(orgName)} · ${esc(title)}</p>
        <p>${esc(colophonText(generatedAt, currencyNote))}</p>
      </footer>
    </div>`;
  },
};
