import { colophonText, monogram, renderParameters, renderStatement } from "./base";
import type { ReportSkin } from "./types";

/**
 * Professional — the default.
 *
 * A centred statement letterhead over an accent-banded ledger, following the
 * `assets/` reference template. Sans-serif body with serif headings, and the
 * double bottom rule under the bottom line that accounting convention expects.
 *
 * The solid heading band is faithful to the reference and reads well as a
 * PDF, but it is a lot of ink and renders as a grey slab on a mono office
 * printer. `Classic` is the theme to reach for when the output is going to
 * paper in volume.
 */
const styles = `
  .letterhead {
    text-align: center;
    padding-bottom: 10pt;
    border-bottom: 2.5pt double #334155;
    margin-bottom: 16pt;
  }

  .crest {
    width: 34pt;
    height: 34pt;
    margin: 0 auto 7pt;
    background: var(--accent);
    color: #fff;
    border-radius: 2pt;
    font-family: var(--font-display);
    font-size: 15pt;
    font-weight: 700;
    line-height: 34pt;
    letter-spacing: 0.02em;
  }

  .org {
    font-family: var(--font-display);
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 0.01em;
    margin: 0 0 2pt;
  }

  .title {
    font-family: var(--font-display);
    font-size: 16pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin: 9pt 0 3pt;
  }

  .note {
    font-size: 9pt;
    color: #475569;
    margin: 0;
  }

  .params {
    margin: 4pt 0 0;
    padding: 0;
    list-style: none;
    font-size: 8.5pt;
    color: #64748b;
  }

  th {
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  td { border-bottom: 0.5pt solid #e2e8f0; }

  .row-section td {
    font-family: var(--font-display);
    font-size: 10.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #0f172a;
  }

  .row-subtotal td {
    border-top: 0.75pt solid #475569;
    background: var(--accent-wash);
  }

  .row-total td {
    font-size: 10.5pt;
    color: var(--accent);
    background: var(--accent-wash);
    border-top: 1pt solid #0f172a;
    border-bottom: 2.5pt double #0f172a;
  }

  .empty { color: #64748b; }

  .colophon {
    margin-top: 14pt;
    padding-top: 6pt;
    border-top: 0.75pt solid #475569;
    font-size: 7.5pt;
    color: #64748b;
    display: flex;
    justify-content: space-between;
    gap: 12pt;
  }

  .colophon p { margin: 0; }

  .section { margin-bottom: 14pt; }

  .section h3 {
    margin: 0 0 6pt;
    font-family: var(--font-display);
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0f172a;
    padding-bottom: 4pt;
    border-bottom: 0.5pt solid #cbd5e1;
    break-after: avoid;
  }
`;

export const professionalSkin: ReportSkin = {
  id: "professional",
  label: "Professional",
  description: "Centred letterhead, navy ledger banding, serif headings.",
  fonts: { body: "sans", display: "serif" },
  styles,

  renderShell(context) {
    const { orgName, title, note, parameters, generatedAt, currencyNote, esc } = context;

    const initials = monogram(orgName);
    const crest = initials ? `<div class="crest">${esc(initials)}</div>` : "";

    return `<div class="doc">
      <header class="letterhead">
        ${crest}
        <p class="org">${esc(orgName)}</p>
        <h1 class="title">${esc(title)}</h1>
        <p class="note">${esc(note)}</p>
        ${renderParameters(parameters, esc)}
      </header>

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
