import { colophonText, renderStatement } from "./base";
import type { ReportSkin } from "./types";

/**
 * Bold — heavy type, a thick accent rule, sections set as cards.
 *
 * The most graphic of the themes, and the one that departs furthest from a
 * plain ledger: an accent bar beside the organisation name, a strip of run
 * metadata, then each block of the statement as its own bordered card with a
 * tinted heading and a count of the accounts inside it. The bottom line is a
 * filled bar rather than a ruled row. Suits a management pack or a board paper,
 * where the report is being presented rather than filed.
 *
 * The reference also carries a row of coloured metric cards across the top —
 * Total Assets, Total Liabilities, Net Assets, Total Equity. They are not
 * reproduced, and deliberately: a `PrintReport` holds the rows of a statement
 * and nothing else, so those cards could only be filled by deriving figures the
 * ledger has not been asked for. An empty card row would be worse than none.
 *
 * The reference gives each section its own hue — red, amber, slate, green.
 * Here they all take this template's red, so the cards read as one document
 * rather than as five colour-coded ones.
 *
 * Zebra striping is kept here, alone among the themes, because it is part of
 * this one's identity. Worth knowing that the banding re-phases at every page
 * break, so on a ledger running to several pages the stripes will not line up
 * sheet to sheet. `Professional` or `Classic` rule instead of shade.
 */
const styles = `

  .letterhead {
    display: flex;
    align-items: stretch;
    gap: 10pt;
    margin-bottom: 12pt;
  }

  .brand-bar {
    width: 6pt;
    border-radius: 3pt;
    background: var(--accent);
    flex-shrink: 0;
  }

  .letterhead-text {
    display: flex;
    flex: 1;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12pt;
    min-width: 0;
  }

  .org {
    margin: 0;
    font-size: 15pt;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: #0f172a;
  }

  .title {
    margin: 0;
    font-size: 20pt;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1;
    text-align: right;
    color: var(--accent);
  }

  .doc-sub {
    margin: 4pt 0 0;
    font-size: 8.5pt;
    font-weight: 600;
    color: #64748b;
    text-align: right;
  }

  /* The run metadata, as a strip of boxed cells. */
  .meta-strip {
    display: flex;
    gap: 6pt;
    margin-bottom: 14pt;
  }

  .meta-item {
    flex: 1;
    min-width: 0;
    background: #f8fafc;
    border: 0.5pt solid #e2e8f0;
    border-radius: 6pt;
    padding: 6pt 8pt;
  }

  .meta-label {
    display: block;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #94a3b8;
    margin-bottom: 1pt;
  }

  .meta-value {
    display: block;
    font-size: 8.5pt;
    font-weight: 700;
    color: #0f172a;
    overflow-wrap: anywhere;
  }

  /* Each block of the statement is a card. */
  .section {
    margin-bottom: 12pt;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8pt;
    padding: 5pt 10pt;
    background: var(--accent-wash);
    border-left: 4pt solid var(--accent);
    border-radius: 5pt 5pt 0 0;
    break-after: avoid;
    page-break-after: avoid;
  }

  .section-header h3 {
    margin: 0;
    font-size: 10pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0f172a;
  }

  .section-tag {
    font-size: 7.5pt;
    font-weight: 700;
    color: #64748b;
    white-space: nowrap;
  }

  .section-body {
    border: 0.5pt solid #e2e8f0;
    border-top: none;
    border-radius: 0 0 5pt 5pt;
    padding: 7pt 10pt;
  }

  th {
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 6pt;
  }

  td {
    padding: 5pt 6pt;
    border-bottom: 0.5pt solid #e2e8f0;
  }

  /* See the note above: the banding re-phases at each page break. */
  tbody tr.row-normal:nth-child(even) { background: #f8fafc; }

  .row-subtotal td {
    font-weight: 800;
    background: #f1f5f9;
    border-top: 1.5pt solid var(--accent);
    border-bottom: 1.5pt solid var(--accent);
  }

  .row-total td {
    font-size: 12pt;
    font-weight: 900;
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    padding-top: 9pt;
    padding-bottom: 9pt;
  }

  /* The bottom line, set as a filled bar rather than a ruled row. */
  .grand-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12pt;
    margin-top: 4pt;
    padding: 9pt 14pt;
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 6pt;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gt-label {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .gt-value {
    font-size: 16pt;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .empty { color: #64748b; }

  .colophon {
    margin-top: 14pt;
    padding-top: 6pt;
    border-top: 3pt solid var(--accent);
    font-size: 7.5pt;
    font-weight: 600;
    color: #64748b;
    display: flex;
    justify-content: space-between;
    gap: 12pt;
  }

  .colophon p { margin: 0; }
`;

export const boldSkin: ReportSkin = {
  id: "bold",
  label: "Bold",
  description: "Heavy type, sections as cards, filled total bar.",
  fonts: { body: "sans", display: "sans" },
  styles,

  renderShell(context) {
    const {
      orgName,
      title,
      note,
      parameters,
      hasSections,
      totalCells,
      generatedAt,
      currencyNote,
      esc,
    } = context;

    // Built from what the report already carries — no invented fields.
    const metaItems = [
      { label: "Company", value: orgName },
      { label: "Period", value: note },
      ...parameters.map((value) => ({ label: "Filter", value })),
      ...(currencyNote ? [{ label: "Currency", value: currencyNote }] : []),
      { label: "Prepared", value: generatedAt },
    ]
      .map(
        (item) =>
          `<div class="meta-item">
            <span class="meta-label">${esc(item.label)}</span>
            <span class="meta-value">${esc(item.value)}</span>
          </div>`
      )
      .join("");

    const card = (
      section: { heading: string | null; table: string; rowCount: number },
      escape: (value: string) => string
    ) => `<section class="section">
        <div class="section-header">
          <h3>${escape(section.heading ?? "")}</h3>
          <span class="section-tag">${section.rowCount} ${
            section.rowCount === 1 ? "account" : "accounts"
          }</span>
        </div>
        <div class="section-body">${section.table}</div>
      </section>`;

    // The bar carries a label and one figure, so it only suits a statement with
    // a single money column. A Trial Balance or a Ledger totals two, and keeps
    // its ruled totals row instead.
    const values = (totalCells ?? []).slice(1).filter(Boolean);
    const showBar = hasSections && totalCells !== null && values.length === 1;

    // With a bar, the totals row beneath the cards would say the same thing
    // twice, so the sections are laid out without it.
    const statement = showBar
      ? context.sections.map((section) => card(section, esc)).join("") +
        `<div class="grand-total">
            <span class="gt-label">${esc(totalCells![0])}</span>
            <span class="gt-value">${esc(values[0])}</span>
          </div>`
      : renderStatement(context, card);

    return `<div class="doc">
      <header class="letterhead">
        <div class="brand-bar"></div>
        <div class="letterhead-text">
          <p class="org">${esc(orgName)}</p>
          <div>
            <h1 class="title">${esc(title)}</h1>
            <p class="doc-sub">${esc(note)}</p>
          </div>
        </div>
      </header>

      <div class="meta-strip">${metaItems}</div>

      ${statement}

      <footer class="colophon">
        <p>${esc(orgName)} · ${esc(title)}</p>
        <p>${esc(colophonText(generatedAt, currencyNote))}</p>
      </footer>
    </div>`;
  },
};
