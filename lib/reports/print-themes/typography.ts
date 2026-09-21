/**
 * The typefaces a report can be set in, matching the sales Styling
 * Configurations options.
 *
 * System stacks only. The print document is written into a blank iframe and
 * printed on the next frame, so a webfont would not have arrived in time: the
 * PDF would come out reflowed in a fallback face, and offline it would never
 * arrive at all. Each option is therefore a stack of faces that ship with the
 * operating systems this runs on, not a download.
 */

export type PrintFontId = "template" | "sans" | "humanist" | "serif" | "editorial" | "mono";

/**
 * A choice supplies two stacks: the body text, and the display face used for
 * letterheads and section headings. Most options set both the same; `editorial`
 * is the one that deliberately pairs a serif display with a sans body, which is
 * what makes it editorial.
 */
export type FontStacks = { body: string; display: string };

const SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
const HUMANIST = `"Segoe UI", Optima, Candara, "Gill Sans", "Trebuchet MS", ui-sans-serif, sans-serif`;
const SERIF = `Georgia, "Times New Roman", Times, serif`;
const EDITORIAL = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`;
const MONO = `ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace`;

export const PRINT_FONT_OPTIONS: ReadonlyArray<{ id: PrintFontId; label: string }> = [
  { id: "template", label: "Template Default" },
  { id: "sans", label: "Modern Sans" },
  { id: "humanist", label: "Humanist Sans" },
  { id: "serif", label: "Classic Serif" },
  { id: "editorial", label: "Editorial Serif" },
  { id: "mono", label: "Technical Mono" },
];

const STACKS: Record<Exclude<PrintFontId, "template">, FontStacks> = {
  sans: { body: SANS, display: SANS },
  humanist: { body: HUMANIST, display: HUMANIST },
  serif: { body: SERIF, display: SERIF },
  editorial: { body: SANS, display: EDITORIAL },
  mono: { body: MONO, display: MONO },
};

/** Which faces a template reaches for when the user has not chosen. */
export type TemplateFonts = { body: "sans" | "serif"; display: "sans" | "serif" };

const TEMPLATE_STACKS = { sans: SANS, serif: SERIF };

export function isPrintFont(value: string | null | undefined): value is PrintFontId {
  return value === "template" || (typeof value === "string" && value in STACKS);
}

/**
 * Resolves the two stacks for a document.
 *
 * `template` is not a face of its own — it means "whatever this template was
 * designed in", which is why the templates keep their own typography until the
 * user asks for something else. Classic is a serif document; overriding it to
 * Modern Sans by default would be a strange thing for choosing Classic to do.
 */
export function fontStacks(font: PrintFontId, template: TemplateFonts): FontStacks {
  if (font === "template") {
    return {
      body: TEMPLATE_STACKS[template.body],
      display: TEMPLATE_STACKS[template.display],
    };
  }
  return STACKS[font];
}
