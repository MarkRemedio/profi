/**
 * The sheet a report is laid out for, matching the sales Sheet Sizing options.
 *
 * The size has to be written into an `@page` rule literally — `size` takes no
 * custom property — so the rule is emitted per document rather than living in
 * the shared stylesheet.
 *
 * The pixel dimensions are the same sheet at 96dpi, and exist so the settings
 * screen can reserve the right shape for its preview. A Letter preview in an A4
 * box is a preview of a document nobody will print.
 */

export type PaperSize = "a4" | "letter";

export const PAPER_OPTIONS: ReadonlyArray<{ id: PaperSize; label: string }> = [
  { id: "a4", label: "A4 Dimension Standard (Global)" },
  { id: "letter", label: "Letter Dimension Standard (US)" },
];

const PAPER = {
  a4: { css: "A4 portrait", widthPx: 794, heightPx: 1123 },
  letter: { css: "Letter portrait", widthPx: 816, heightPx: 1056 },
} as const;

export function isPaperSize(value: string | null | undefined): value is PaperSize {
  return value === "a4" || value === "letter";
}

export function paperOf(size: PaperSize) {
  return PAPER[size] ?? PAPER.a4;
}

/** The page box. Margins are the same on both sheets. */
export function pageRule(size: PaperSize): string {
  return `
  @page {
    size: ${paperOf(size).css};
    margin: 14mm 12mm;
  }
`;
}
