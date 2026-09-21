"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Check, Layout, Palette, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildReportHtml, type PrintReport } from "@/lib/reports/print-document";
import {
  PAPER_OPTIONS,
  PRINT_FONT_OPTIONS,
  REPORT_THEMES,
  paletteFor,
  paperOf,
  resolveSkin,
  type PaletteTokens,
  type ReportTheme,
} from "@/lib/reports/print-themes";
import {
  getPrintFormat,
  getServerPrintFormat,
  selectTheme,
  setPrintFormat,
  subscribeToPrintFormat,
} from "@/lib/reports/print-format-preference";
import thumbnailStyles from "./print-template-thumbnail.module.css";

/**
 * Reads the stored print format. Shared by the settings panel and by whoever is
 * about to export, so both always agree on what will be printed.
 */
export function usePrintFormat() {
  return useSyncExternalStore(
    subscribeToPrintFormat,
    getPrintFormat,
    getServerPrintFormat
  );
}


/**
 * A miniature of one template, tinted with the accent it would print in.
 *
 * The same device the invoice layout picker uses — a few bars standing in for
 * the letterhead, the rows and the bottom line. It is not a rendering of the
 * document; the live preview beside the picker is.
 */
function TemplateThumbnail({ theme, palette }: { theme: ReportTheme; palette: PaletteTokens }) {
  return (
    <div
      aria-hidden="true"
      className={cn(thumbnailStyles.thumbnail, thumbnailStyles[theme])}
      style={{ "--ink": palette.accent, "--wash": palette.wash } as CSSProperties}
    >
      <span className={thumbnailStyles.header} />
      <span className={thumbnailStyles.rule} />
      <span className={thumbnailStyles.lineOne} />
      <span className={thumbnailStyles.lineTwo} />
      <span className={thumbnailStyles.total} />
    </div>
  );
}

/** A colour control: a swatch that opens the picker, and the hex beside it. */
function ColourField({
  label,
  title,
  value,
  onChange,
}: {
  label: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label
        className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500"
        title={title}
      >
        {label}
      </label>
      <div className="flex h-10 min-w-0 items-center gap-2.5">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
          aria-label={`Choose ${label.toLowerCase()} colour`}
        />
        <span className="min-w-0 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold uppercase text-slate-600">
          {value}
        </span>
      </div>
    </div>
  );
}

/** A labelled select, matching the sales styling controls. */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 lg:col-span-2">
      <label className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A settings card with the header strip used across the document workspaces. */
function Panel({
  title,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  icon: typeof Layout;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        </div>
        {badge && (
          <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * The document, rendered at the true width of its sheet and scaled to fit the
 * column.
 *
 * Laying the frame out at full width and scaling it down keeps the type sizes
 * proportionally correct — narrowing the frame instead would re-wrap the table
 * and show a layout the printer will never produce. `width` and `height` are
 * the chosen sheet at 96dpi, so switching to Letter changes the shape of the
 * preview rather than showing a Letter document in an A4 box.
 *
 * The scale has to be measured rather than expressed in CSS: the ratio wanted
 * is `container ÷ sheet width`, and there is no CSS length that means "my own
 * rendered width".
 */
function PagePreview({
  html,
  reloadKey,
  width,
  height,
}: {
  html: string;
  reloadKey: string;
  width: number;
  height: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const available = entries[0]?.contentRect.width ?? 0;
      if (available > 0) setScale(available / width);
    });

    observer.observe(element);
    return () => observer.disconnect();
    // Re-measures when the sheet changes shape, not only when the box does.
  }, [width]);

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
      // Before the first measurement the box still has to reserve the right
      // shape, or the dialog jumps when the preview appears.
      style={
        scale > 0
          ? { height: height * scale }
          : { aspectRatio: `${width} / ${height}` }
      }
    >
      {scale > 0 && (
        <iframe
          key={reloadKey}
          title="Print preview"
          aria-label="Preview of the printed report"
          tabIndex={-1}
          srcDoc={html}
          sandbox=""
          scrolling="no"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: width,
            height: height,
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}

type PrintFormatSettingsProps = {
  /**
   * Builds the report the user is currently looking at. Used for the preview,
   * so what they see is their own statement in the chosen template rather than
   * invented figures. Returns null when there is nothing to show yet.
   *
   * A callback rather than the built report, because building it walks every
   * ledger row: the panel only mounts when the dialog opens, so this is not
   * paid on every render of the reports page.
   */
  getPreviewReport: () => PrintReport | null;
};

/**
 * Where the printed look of every report is chosen.
 *
 * This lives beside the reports rather than inside the Export menu because it
 * is a setting, not an action: the choice persists and applies to every export
 * from here on, whereas everything else in that menu happens once and is done.
 *
 * Laid out to match Sales → Invoice Layout, so choosing how a statement prints
 * works the same way as choosing how an invoice does.
 */
export function PrintFormatSettings({ getPreviewReport }: PrintFormatSettingsProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-blue-600"
        >
          <Printer className="size-4" />
          Custom Print Format
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto bg-slate-50 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-slate-200 bg-white px-6 py-4 text-left">
          <DialogTitle className="text-xl font-extrabold tracking-tight text-slate-950">
            Custom Print Format
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Choose how every report prints. Each template brings its own
            colours. It changes how a statement is set, never what it says.
          </DialogDescription>
        </DialogHeader>

        <PrintFormatPanel getPreviewReport={getPreviewReport} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The panel body. Split out so it mounts with the dialog rather than with the
 * page — building the preview report walks the ledger, and nobody should pay
 * for that while the dialog is shut.
 */
function PrintFormatPanel({ getPreviewReport }: PrintFormatSettingsProps) {
  const format = usePrintFormat();
  const skin = resolveSkin(format.theme);

  // What the document is set in right now: the template's preset with any
  // styling overrides applied, which is exactly what the renderer will use.
  const live = paletteFor(skin.id, format);
  const sheet = paperOf(format.paperSize);

  const previewReport = getPreviewReport();
  const previewHtml = previewReport ? buildReportHtml(previewReport, format) : null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 p-5 sm:p-6 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <Panel title="Report Layout" icon={Layout} badge="Preview + print">
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {REPORT_THEMES.map((theme) => {
              const selected = theme.id === format.theme;

              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectTheme(theme.id)}
                  className={cn(
                    "group relative rounded-xl border p-3 text-left transition-all",
                    selected
                      ? "border-blue-500 bg-blue-50/60 shadow-sm ring-1 ring-blue-500"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
                  )}
                >
                  <TemplateThumbnail theme={theme.id} palette={theme.palette} />

                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{theme.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {theme.description}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                        selected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                  </div>

                  {/* The unselected cards show the template's own preset; the
                      selected one shows whatever is actually in force, so the
                      dots read as "what you'd get" against "what you have". */}
                  <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                    {(selected
                      ? [live.accent, live.rule, live.wash]
                      : [theme.palette.accent, theme.palette.rule, theme.palette.wash]
                    ).map((color, index) => (
                      <span
                        key={index}
                        className="size-2.5 rounded-full border border-black/10"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Styling Configurations" icon={Palette}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <ColourField
              label="Primary"
              title="Primary accents and emphasis"
              value={format.primary}
              onChange={(primary) => setPrintFormat({ primary })}
            />
            <ColourField
              label="Secondary"
              title="Headers and supporting colour"
              value={format.secondary}
              onChange={(secondary) => setPrintFormat({ secondary })}
            />
            <ColourField
              label="Highlight"
              title="Highlights and surface colour"
              value={format.highlight}
              onChange={(highlight) => setPrintFormat({ highlight })}
            />
            <ColourField
              label="Text"
              title="Main printable text colour"
              value={format.text}
              onChange={(text) => setPrintFormat({ text })}
            />

            <SelectField
              label="Typography"
              value={format.font}
              options={PRINT_FONT_OPTIONS}
              onChange={(font) => setPrintFormat({ font: font as typeof format.font })}
            />
            <SelectField
              label="Sheet Sizing"
              value={format.paperSize}
              options={PAPER_OPTIONS}
              onChange={(paperSize) =>
                setPrintFormat({ paperSize: paperSize as typeof format.paperSize })
              }
            />
          </div>
        </Panel>
      </div>

      <div className="xl:col-span-5 xl:sticky xl:top-0">
        <Panel title="Live Preview" icon={Printer} badge={skin.label}>
          <div className="p-5">
            {previewHtml ? (
              <>
                <PagePreview
                  html={previewHtml}
                  width={sheet.widthPx}
                  height={sheet.heightPx}
                  // Re-keyed so the frame reloads on any styling change;
                  // srcDoc alone does not repaint reliably in every engine.
                  reloadKey={JSON.stringify(format)}
                />
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  Your current report, set in the chosen template. First page only.
                </p>
              </>
            ) : (
              <div className="grid place-items-center rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                Open a report to preview it here.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
