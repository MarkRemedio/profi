import { colophonText, renderStatement } from "./base";
import type { ReportSkin } from "./types";

/**
 * Elegant — an italic serif masthead, a hairline rule, a tinted aside.
 *
 * The quietest of the accent themes: serif display type, generous leading and
 * almost no fill. Suits a statement going to a client or a lender rather than
 * around the office.
 *
 * Like `Modern`, the reference's magazine two-column layout is scoped to the
 * masthead rather than the whole page — a grid does not paginate, so on a
 * multi-page ledger the aside would leave a third of every sheet after the
 * first empty. The aside sits beside the title on page one; the table then runs
 * full width and continues for as many sheets as it needs.
 *
 * The reference also tints the entire page cream. That is a whole sheet of ink
 * per page on a real printer, so the paper stays white here and the tint is
 * kept for the aside, where it does the same job for a fraction of the cost.
 */
const styles = `

  .masthead {
    text-align: center;
    padding-bottom: 10pt;
    margin-bottom: 14pt;
  }

  .org {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16pt;
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0.01em;
    color: #292524;
  }

  /* The hairline flourish: a rule interrupted by a small diamond. */
  .flourish {
    display: flex;
    align-items: center;
    gap: 6pt;
    margin: 7pt auto 9pt;
    width: 45%;
  }

  .flourish::before,
  .flourish::after {
    content: "";
    flex: 1;
    height: 0.5pt;
    background: var(--accent);
  }

  .flourish span {
    color: var(--accent);
    font-size: 7pt;
    line-height: 1;
  }

  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 15pt;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--accent);
  }

  .lede {
    display: flex;
    align-items: flex-start;
    gap: 14pt;
    margin-bottom: 14pt;
  }

  .aside {
    width: 32%;
    flex-shrink: 0;
    background: var(--accent-wash);
    border-left: 1.5pt solid var(--accent);
    padding: 9pt 11pt;
  }

  .aside-item { margin-bottom: 8pt; }
  .aside-item:last-child { margin-bottom: 0; }

  .aside-label {
    display: block;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #78716c;
    margin-bottom: 2pt;
  }

  .aside-value {
    display: block;
    font-family: var(--font-display);
    font-size: 9.5pt;
    color: #292524;
    overflow-wrap: anywhere;
  }

  .lede-main {
    flex: 1;
    min-width: 0;
    padding: 9pt 0;
    text-align: right;
  }

  th {
    background: transparent;
    color: #78716c;
    font-family: var(--font-display);
    font-size: 8pt;
    font-weight: 400;
    font-style: italic;
    text-transform: none;
    letter-spacing: 0.02em;
    border-bottom: 0.75pt solid var(--accent);
    padding-bottom: 5pt;
  }

  td {
    border-bottom: 0.5pt solid #e7e5e4;
    padding: 5pt 6pt;
  }

  .row-section td {
    font-family: var(--font-display);
    font-size: 10.5pt;
    font-weight: 400;
    font-style: italic;
    color: var(--accent);
  }

  .row-subtotal td {
    border-top: 0.5pt solid #d6d3d1;
    color: #292524;
  }

  .row-total td {
    font-family: var(--font-display);
    font-size: 11pt;
    font-weight: 700;
    color: var(--accent);
    border-top: 0.75pt solid var(--accent);
    border-bottom: 2.5pt double var(--accent);
  }

  .empty { color: #a8a29e; }

  .colophon {
    margin-top: 16pt;
    padding-top: 6pt;
    border-top: 0.5pt solid var(--accent-rule);
    font-size: 7.5pt;
    font-style: italic;
    color: #a8a29e;
    display: flex;
    justify-content: space-between;
    gap: 12pt;
  }

  .colophon p { margin: 0; }

  .section { margin-bottom: 14pt; }

  .section h3 {
    margin: 0 0 5pt;
    font-family: var(--font-display);
    font-size: 11.5pt;
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0.02em;
    color: #292524;
    break-after: avoid;
  }
`;

export const elegantSkin: ReportSkin = {
  id: "elegant",
  label: "Elegant",
  description: "Italic serif masthead, hairline rule, tinted aside.",
  fonts: { body: "sans", display: "serif" },
  styles,

  renderShell(context) {
    const { orgName, title, note, parameters, generatedAt, currencyNote, esc } = context;

    const item = (label: string, value: string) =>
      `<div class="aside-item">
        <span class="aside-label">${esc(label)}</span>
        <span class="aside-value">${esc(value)}</span>
      </div>`;

    // Both columns carry real metadata the report already holds. Nothing here
    // is composed prose, and nothing is invented to fill the space.
    const asideItems = [
      item("Period", note),
      ...parameters.map((value) => item("Filter", value)),
    ].join("");

    const ledeItems = [
      item("Prepared", generatedAt),
      ...(currencyNote ? [item("Currency", currencyNote)] : []),
    ].join("");

    return `<div class="doc">
      <header class="masthead">
        <p class="org">${esc(orgName)}</p>
        <div class="flourish"><span>&#9670;</span></div>
        <h1 class="title">${esc(title)}</h1>
      </header>

      <div class="lede">
        <aside class="aside">${asideItems}</aside>
        <div class="lede-main">${ledeItems}</div>
      </div>

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
