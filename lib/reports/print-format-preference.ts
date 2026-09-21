import {
  DEFAULT_REPORT_THEME,
  isPaperSize,
  isPrintFont,
  isReportTheme,
  paletteFor,
  type PaperSize,
  type PrintFontId,
  type ReportTheme,
} from "./print-themes";

/**
 * How the printed reports are set, remembered per browser.
 *
 * The template comes with its own colours and typography, so a format that has
 * never been customised is just a template id. The styling fields exist for
 * when someone wants to depart from it.
 *
 * The preference lives in localStorage rather than on the organisation, so it
 * is per-device and does not follow the user to another machine. That is a
 * deliberate limit of this pass: persisting it properly means a column on
 * Organization, which is a schema change.
 *
 * Exposed as an external store rather than component state because that is what
 * it is — localStorage is read by the browser, not owned by React. Reading it
 * in an effect and calling setState would work but triggers a cascading render
 * on every mount, and reading it during render would disagree with the server-
 * rendered markup. `useSyncExternalStore` handles both: the server snapshot is
 * the default format, and React reconciles to the stored one after hydration.
 */
const STORAGE_KEY = "waw.reports.print-format";

export type PrintFormat = {
  theme: string;
  /** Colours in force. Seeded from the template's preset — see `selectTheme`. */
  primary: string;
  secondary: string;
  highlight: string;
  text: string;
  font: PrintFontId;
  paperSize: PaperSize;
};

/** The colours a template prints in before anyone changes them. */
function presetFor(theme: ReportTheme): Pick<
  PrintFormat,
  "primary" | "secondary" | "highlight" | "text"
> {
  const tokens = paletteFor(theme);
  return {
    primary: tokens.accent,
    secondary: tokens.wash,
    highlight: tokens.alt,
    text: tokens.text,
  };
}

export const DEFAULT_PRINT_FORMAT: PrintFormat = {
  theme: DEFAULT_REPORT_THEME,
  ...presetFor(DEFAULT_REPORT_THEME),
  font: "template",
  paperSize: "a4",
};

/**
 * Switches template, taking that template's colours with it.
 *
 * Matches how the sales templates behave: choosing Corporate chooses its navy
 * and its sky rule too. That does discard colours someone had customised, which
 * is the same trade the invoice settings make — a template half in its own
 * colours and half in the previous one's is not a design either of them had.
 */
export function selectTheme(theme: ReportTheme): void {
  setPrintFormat({ theme, ...presetFor(theme) });
}

const listeners = new Set<() => void>();

/**
 * getSnapshot runs on every render and must return the same object identity
 * until something actually changes, or React re-renders forever. Hence the
 * cache, invalidated on write and on a cross-tab storage event.
 */
let cached: PrintFormat | null = null;

function readStoredFormat(): PrintFormat {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PrintFormat> | null;
      const theme = isReportTheme(parsed?.theme)
        ? parsed!.theme!
        : DEFAULT_PRINT_FORMAT.theme;

      // A stored record may predate any of these fields, so each falls back to
      // the template's own preset rather than to the default template's.
      const preset = presetFor(theme as ReportTheme);
      const colour = (value: unknown, fallback: string) =>
        typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

      return {
        theme,
        primary: colour(parsed?.primary, preset.primary),
        secondary: colour(parsed?.secondary, preset.secondary),
        highlight: colour(parsed?.highlight, preset.highlight),
        text: colour(parsed?.text, preset.text),
        font: isPrintFont(parsed?.font) ? parsed!.font! : DEFAULT_PRINT_FORMAT.font,
        paperSize: isPaperSize(parsed?.paperSize)
          ? parsed!.paperSize!
          : DEFAULT_PRINT_FORMAT.paperSize,
      };
    }
  } catch {
    // Blocked storage throws, and a value written by an older or newer build
    // may not parse. The default format is a fine answer; failing to print is
    // not.
  }
  return DEFAULT_PRINT_FORMAT;
}

export function subscribeToPrintFormat(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  // Fires only for *other* tabs, which is exactly the case local writes miss.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cached = null;
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getPrintFormat(): PrintFormat {
  if (cached === null) cached = readStoredFormat();
  return cached;
}

/** There is no localStorage on the server, so the default stands in. */
export function getServerPrintFormat(): PrintFormat {
  return DEFAULT_PRINT_FORMAT;
}

export function setPrintFormat(next: Partial<PrintFormat>): void {
  const merged: PrintFormat = { ...getPrintFormat(), ...next };
  cached = merged;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Not persisting is survivable; the choice still applies for this session.
  }

  for (const listener of listeners) listener();
}
