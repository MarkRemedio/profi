import { colophonText, monogram, renderStatement } from "./base";
import type { ReportSkin } from "./types";

/**
 * Modern — a solid side panel over an open, rounded ledger.
 *
 * The reference lays the whole page out as a two-column grid with a fixed
 * sidebar. That is an invoice idiom and it does not survive a statement: a grid
 * container does not paginate, and the reference additionally clips at
 * `overflow: hidden`, so a General Ledger long enough to reach a second page
 * would print the first and silently drop the rest.
 *
 * So the panel is scoped to the masthead. Page one carries it beside the
 * statement title exactly as designed; the table then runs full width and
 * continues across as many sheets as it needs, with the column headings
 * repeating at the top of each. Nothing is ever clipped.
 *
 * The one thing the reference does that could not be kept: the table does not
 * sit *beside* the panel on page one. A single table cannot be laid out narrow
 * on one page and full width on the next — CSS has no way to reflow it at a
 * page boundary — so it begins below the masthead rather than alongside it.
 */
const styles = `

  .masthead {
    display: flex;
    align-items: stretch;
    gap: 12pt;
    margin-bottom: 16pt;
  }

  .panel {
    width: 34%;
    flex-shrink: 0;
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 8pt;
    padding: 12pt;
  }

  .panel-brand {
    display: flex;
    align-items: center;
    gap: 8pt;
    margin-bottom: 12pt;
  }

  .crest {
    width: 24pt;
    height: 24pt;
    border-radius: 6pt;
    background: rgba(255, 255, 255, 0.18);
    color: var(--accent-ink);
    font-size: 9.5pt;
    font-weight: 700;
    line-height: 24pt;
    text-align: center;
    flex-shrink: 0;
  }

  .panel .org {
    margin: 0;
    font-size: 10.5pt;
    font-weight: 700;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .panel-item { margin-bottom: 9pt; }
  .panel-item:last-child { margin-bottom: 0; }

  .panel-label {
    display: block;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.7;
    margin-bottom: 2pt;
  }

  .panel-value {
    display: block;
    font-size: 9pt;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .masthead-main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: 21pt;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0f172a;
    line-height: 1.1;
  }

  .note {
    margin: 5pt 0 0;
    font-size: 9.5pt;
    color: #64748b;
  }

  .params {
    margin: 4pt 0 0;
    padding: 0;
    list-style: none;
    font-size: 8pt;
    color: #94a3b8;
  }

  th {
    background: transparent;
    color: #64748b;
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    border-bottom: 1pt solid var(--accent);
    padding-bottom: 5pt;
  }

  td { border-bottom: 0.5pt solid #f1f5f9; }

  .row-section td {
    font-size: 10pt;
    font-weight: 700;
    color: var(--accent);
  }

  .row-subtotal td {
    border-top: 0.5pt solid #cbd5e1;
    color: #0f172a;
  }

  .row-total td {
    font-size: 11pt;
    background: var(--accent-wash);
    color: var(--accent);
    border-top: 1pt solid var(--accent);
    border-bottom: none;
  }

  .empty { color: #94a3b8; }

  .colophon {
    margin-top: 16pt;
    padding-top: 7pt;
    border-top: 0.5pt solid #e2e8f0;
    font-size: 7.5pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
    gap: 12pt;
  }

  .colophon p { margin: 0; }

  .section { margin-bottom: 13pt; }

  .section h3 {
    margin: 0 0 5pt;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.11em;
    color: var(--accent);
    break-after: avoid;
  }

  .table-wrap {
    border: 0.5pt solid #e2e8f0;
    border-radius: 8pt;
    padding: 7pt 9pt;
  }
`;

export const modernSkin: ReportSkin = {
  id: "modern",
  label: "Modern Minimal",
  description: "Solid side panel, open ledger, rounded edges.",
  fonts: { body: "sans", display: "sans" },
  styles,

  renderShell(context) {
    const { orgName, title, note, parameters, generatedAt, currencyNote, esc } = context;

    const initials = monogram(orgName);
    const crest = initials ? `<div class="crest">${esc(initials)}</div>` : "";

    // Built from what the report already carries — no invented fields.
    const items = [
      { label: "Period", value: note },
      ...parameters.map((value) => ({ label: "Filter", value })),
      { label: "Prepared", value: generatedAt },
    ];

    const panelItems = items
      .map(
        (item) =>
          `<div class="panel-item">
            <span class="panel-label">${esc(item.label)}</span>
            <span class="panel-value">${esc(item.value)}</span>
          </div>`
      )
      .join("");

    return `<div class="doc">
      <header class="masthead">
        <aside class="panel">
          <div class="panel-brand">
            ${crest}
            <p class="org">${esc(orgName)}</p>
          </div>
          ${panelItems}
        </aside>

        <div class="masthead-main">
          <h1 class="title">${esc(title)}</h1>
          <p class="note">${esc(note)}</p>
        </div>
      </header>

      ${renderStatement(context, (section, esc) =>
      `<section class="section">
        ${section.heading ? `<h3>${esc(section.heading)}</h3>` : ""}
        <div class="table-wrap">${section.table}</div>
      </section>`
    )}

      <footer class="colophon">
        <p>${esc(orgName)} · ${esc(title)}</p>
        <p>${esc(colophonText(generatedAt, currencyNote))}</p>
      </footer>
    </div>`;
  },
};
