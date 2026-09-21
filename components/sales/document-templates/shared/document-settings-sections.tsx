"use client";

import { type CSSProperties } from "react";
import {
  Upload, Image as ImageIcon, FileText, Trash2, Palette,
  Building2, Layout, Check, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import settingsStyles from "../../invoice-settings.module.css";
import {
  INVOICE_LINE_COLUMN_DEFAULT_LABELS,
  INVOICE_LINE_COLUMN_IDS,
  INVOICE_LINE_COLUMN_LABEL_MAX,
  INVOICE_TEMPLATE_OPTIONS,
  REQUIRED_INVOICE_LINE_COLUMNS,
  type InvoiceLineColumnId,
  type InvoiceLineColumns,
  type InvoiceLineColumnSetting,
  type InvoiceTemplateConfig,
  type InvoiceTemplateId,
} from "../invoice-template-config";

/** Taken from the config so the two can never disagree. */
export type LogoPosition = InvoiceTemplateConfig["logoPosition"];

/**
 * Templates whose letterhead cannot honour a logo position.
 *
 * Modern Minimal draws its letterhead as a coloured sidebar down the side of
 * the page rather than a band across the top, with the logo, company and
 * document facts stacked inside it. There is no left, centre or right to move
 * the logo to, and forcing one puts a logo and three lines of detail side by
 * side in about 20mm each.
 *
 * A list rather than a boolean, because the next sidebar layout should join it
 * here instead of growing a second special case.
 */
export const FIXED_LOGO_TEMPLATES: InvoiceTemplateId[] = ["modern"];

export function templateSupportsLogoPosition(theme: InvoiceTemplateId): boolean {
  return !FIXED_LOGO_TEMPLATES.includes(theme);
}

const LOGO_POSITIONS: Array<{ id: LogoPosition; label: string; hint: string }> = [
  { id: "left", label: "Left", hint: "Logo at the left, document details opposite it" },
  { id: "center", label: "Center", hint: "Logo alone above centred details" },
  { id: "right", label: "Right", hint: "Logo at the right, document details opposite it" },
];

/**
 * The document branding form, as sections.
 *
 * These were written inline on the sales settings screen, then copied onto
 * purchases, and the onboarding wizard grew a third, smaller version of its own
 * that offered a fraction of the same choices. Somebody setting their branding
 * up at signup got one brand colour and three fonts; coming back to change it a
 * week later they got four colours, six layouts and five fonts, on a screen
 * that looked nothing like the one they had used.
 *
 * Every section here is presentation only — a value and a change handler. None
 * of them know about organisations, saving, or where the value lives, which is
 * what lets the wizard render them against its own form state before any
 * organisation exists.
 */

export type DocumentPalette = [string, string, string];

const PALETTE_ROLES: Array<[string, string]> = [
  ["Primary", "Primary accents and emphasis"],
  ["Secondary", "Headers and supporting colour"],
  ["Highlight", "Highlights and surface colour"],
];

export const TERMS_PLACEHOLDER = [
  "Payment is due within 14 days of the invoice date.",
  "A late payment fee of 1.5% per month applies to outstanding balances.",
  "All prices are quoted in GBP and exclusive of VAT unless stated otherwise.",
].join("\n");

/* ── shared chrome ─────────────────────────────────────────────────────── */

function SectionCard({
  icon: Icon,
  title,
  badge,
  children,
  bodyClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        </div>
        {badge ? (
          <span className="shrink-0 rounded bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
            {badge}
          </span>
        ) : null}
      </div>
      <div className={bodyClassName ?? "p-4 sm:p-5"}>{children}</div>
    </div>
  );
}

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";

const LABEL_CLASS =
  "mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500";

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/* ── 1. logo emblem ────────────────────────────────────────────────────── */

/**
 * The ceiling on an uploaded emblem, in megabytes.
 *
 * The image is read as a data URL and stored inline with the rest of the
 * branding — during onboarding it also has to survive being carried through
 * checkout — so a phone photograph dropped in here is not merely large, it is
 * large in a field that was never sized for it. Two megabytes is far more than
 * any logo needs and well short of anything that causes trouble. Base64 adds
 * about a third, which the limit already allows for.
 */
export const MAX_LOGO_MB = 2;

export function LogoEmblemCard({
  title,
  logo,
  onLogoChange,
  description = "Upload an emblem specific to this template layout block.",
  maxSizeMb = MAX_LOGO_MB,
  logoPosition,
  onLogoPositionChange,
  theme,
}: {
  title: string;
  logo: string | null;
  onLogoChange: (dataUrl: string | null) => void;
  description?: string;
  maxSizeMb?: number;
  /* Both given, the position control appears under the upload. Optional so a
     caller that has nowhere to store the answer simply does not offer it. */
  logoPosition?: LogoPosition;
  onLogoPositionChange?: (next: LogoPosition) => void;
  theme?: InvoiceTemplateId;
}) {
  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    /* Cleared either way, so choosing the same file again after a rejection
       still fires a change event. */
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("That is not an image. Try a PNG, SVG or JPG.");
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      /* Says how big it actually is. "Too large" alone leaves somebody
         guessing whether they need to shave a little off or start again. */
      toast.error(`That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${maxSizeMb} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => toast.error("That file could not be read. Try another one.");
    reader.onloadend = () => onLogoChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <SectionCard icon={ImageIcon} title={title}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
          {logo ? (
            // User-uploaded data/blob URLs are intentionally previewed directly.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo Emblem" className="size-full object-contain p-1" />
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No Emblem</span>
          )}
        </div>
        <div>
          <p className="mb-1 text-sm text-slate-600">{description}</p>
          <p className="mb-3 text-[11px] font-medium text-slate-400">
            PNG, SVG or JPG · up to {maxSizeMb} MB
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="relative h-8 gap-2 border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm"
            >
              <Upload className="size-3" /> Upload Image
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </Button>
            {logo ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onLogoChange(null)}
                className="h-8 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-1 size-3" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {logoPosition && onLogoPositionChange ? (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <LogoPositionField
            value={logoPosition}
            onChange={onLogoPositionChange}
            theme={theme}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}

/**
 * Where the logo sits in the letterhead.
 *
 * Three buttons rather than a select: there are only three answers, and each
 * one is easier to recognise from a picture of the layout than from the word
 * for it. The glyph is the letterhead in miniature — the filled block is the
 * logo, the lines beside or beneath it are the company details.
 *
 * One control for all six templates. They share the same header markup and the
 * stylesheet arranges it from a single attribute, so this is not a per-template
 * setting and should not look like one.
 */
export function LogoPositionField({
  value,
  onChange,
  label = "Logo position",
  theme,
}: {
  value: LogoPosition;
  onChange: (next: LogoPosition) => void;
  label?: string;
  /** Given, the control locks itself for layouts that cannot honour it. */
  theme?: InvoiceTemplateId;
}) {
  const supported = theme ? templateSupportsLogoPosition(theme) : true;

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="flex gap-2">
        {LOGO_POSITIONS.map((option) => {
          /* Locked layouts show their own arrangement as the active one, so
             the control never claims a setting the document will not honour. */
          const active = supported ? value === option.id : option.id === "left";
          return (
            <button
              key={option.id}
              type="button"
              disabled={!supported}
              onClick={() => onChange(option.id)}
              aria-pressed={active}
              title={supported ? option.hint : "This layout keeps its logo in the sidebar"}
              className={cn(
                "flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition",
                active
                  ? "border-blue-500 bg-blue-50/70 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300",
                !supported && "cursor-not-allowed opacity-50 hover:border-slate-200"
              )}
            >
              {/* A 24x14 sketch of the letterhead, so the choice is legible
                  without reading. */}
              <svg viewBox="0 0 24 14" className="h-3.5 w-6" aria-hidden="true">
                <rect
                  x={option.id === "left" ? 1 : option.id === "right" ? 17 : 9}
                  y={option.id === "center" ? 1 : 2}
                  width="6"
                  height="5"
                  rx="1"
                  fill={active ? "#2563eb" : "#94a3b8"}
                />
                <rect
                  x={option.id === "center" ? 5 : option.id === "right" ? 1 : 9}
                  y={option.id === "center" ? 8 : 3}
                  width={option.id === "center" ? 14 : 6}
                  height="1.4"
                  rx="0.7"
                  fill={active ? "#93c5fd" : "#cbd5e1"}
                />
                <rect
                  x={option.id === "center" ? 7 : option.id === "right" ? 1 : 9}
                  y={option.id === "center" ? 11 : 6}
                  width={option.id === "center" ? 10 : 5}
                  height="1.4"
                  rx="0.7"
                  fill={active ? "#93c5fd" : "#cbd5e1"}
                />
              </svg>
              <span
                className={cn(
                  "text-[10px] font-bold",
                  active ? "text-blue-700" : "text-slate-500"
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {supported ? null : (
        <p className="m-0 mt-2 text-[11px] leading-relaxed text-slate-500">
          Modern Minimal puts its letterhead in a sidebar down the side of the page, so there is no
          left, centre or right to move the logo to. Pick another layout to place it.
        </p>
      )}
    </div>
  );
}

/* ── 2a. styling ───────────────────────────────────────────────────────── */

export function StylingCard({
  palette,
  textColor,
  font,
  paperSize,
  onPaletteChange,
  onTextColorChange,
  onFontChange,
  onPaperSizeChange,
}: {
  palette: DocumentPalette;
  textColor: string;
  font: string;
  paperSize: string;
  onPaletteChange: (index: 0 | 1 | 2, value: string) => void;
  onTextColorChange: (value: string) => void;
  onFontChange: (value: string) => void;
  onPaperSizeChange: (value: string) => void;
}) {
  const swatch = (label: string, title: string, color: string, onChange: (value: string) => void) => (
    <div key={label} className="min-w-0">
      <label className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500" title={title}>
        {label}
      </label>
      <div className="flex h-10 min-w-0 items-center gap-2.5">
        <input
          type="color"
          value={color}
          onChange={(event) => onChange(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
          aria-label={`Choose ${label.toLowerCase()} colour`}
        />
        <span className="min-w-0 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold uppercase text-slate-600">
          {color}
        </span>
      </div>
    </div>
  );

  return (
    <SectionCard
      icon={Palette}
      title="Styling Configurations"
      bodyClassName="grid grid-cols-1 gap-x-4 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
    >
      {PALETTE_ROLES.map(([label, description], index) =>
        swatch(label, description, palette[index], (value) => onPaletteChange(index as 0 | 1 | 2, value)),
      )}
      {swatch("Text", "Main printable text colour", textColor, onTextColorChange)}
      <div className="min-w-0 lg:col-span-2">
        <label className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500">Typography</label>
        <select
          value={font}
          onChange={(event) => onFontChange(event.target.value)}
          className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm outline-none"
        >
          <option value="sans">Modern Sans (Default)</option>
          <option value="humanist">Humanist Sans</option>
          <option value="serif">Classic Serif</option>
          <option value="editorial">Editorial Serif</option>
          <option value="mono">Technical Mono</option>
        </select>
      </div>
      <div className="min-w-0 lg:col-span-2">
        <label className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500">Sheet Sizing</label>
        <select
          value={paperSize}
          onChange={(event) => onPaperSizeChange(event.target.value)}
          className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm outline-none"
        >
          <option value="a4">A4 Dimension Standard (Global)</option>
          <option value="letter">Letter Dimension Standard (US)</option>
        </select>
      </div>
    </SectionCard>
  );
}

/* ── 2b. layout gallery ────────────────────────────────────────────────── */

export function TemplateThumbnail({
  theme,
  colors,
}: {
  theme: InvoiceTemplateId;
  colors: DocumentPalette;
}) {
  return (
    <div
      className={cn(settingsStyles.templateThumbnail, settingsStyles[`thumbnail_${theme}`])}
      style={
        {
          "--template-ink": colors[0],
          "--template-secondary": colors[1],
          "--template-tertiary": colors[2],
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className={settingsStyles.thumbnailSidebar} />
      <span className={settingsStyles.thumbnailHeader} />
      <span className={settingsStyles.thumbnailLineOne} />
      <span className={settingsStyles.thumbnailLineTwo} />
      <span className={settingsStyles.thumbnailTotal} />
    </div>
  );
}

export function TemplateGalleryCard({
  title,
  theme,
  palette,
  onSelect,
}: {
  title: string;
  theme: InvoiceTemplateId;
  palette: DocumentPalette;
  onSelect: (theme: InvoiceTemplateId) => void;
}) {
  return (
    <SectionCard
      icon={Layout}
      title={title}
      badge="Preview + print"
      bodyClassName="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5"
    >
      {INVOICE_TEMPLATE_OPTIONS.map((option) => {
        const selected = theme === option.id;
        const swatches = selected ? palette : option.colors;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group relative rounded-xl border p-3 text-left transition-all",
              selected
                ? "border-blue-500 bg-blue-50/60 shadow-sm ring-1 ring-blue-500"
                : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm",
            )}
          >
            <TemplateThumbnail theme={option.id} colors={swatches} />
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{option.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
              </div>
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                  selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent",
                )}
              >
                <Check className="size-3" />
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
              {swatches.map((color, index) => (
                <span
                  key={`${index}-${color}`}
                  className="size-2.5 rounded-full border border-black/10"
                  style={{ background: color }}
                />
              ))}
            </div>
          </button>
        );
      })}
    </SectionCard>
  );
}

/* ── 3. your company ───────────────────────────────────────────────────── */

export type CompanyIdentityValues = {
  addressLine1: string;
  addressCity: string;
  vatNumber: string;
  preparedBy: string;
  logoInitials: string;
};

export function YourCompanyCard({
  values,
  hasLogo,
  showPreparedBy = true,
  vatHint = "Left blank, the number on your tax profile is used.",
  onChange,
  onFocusField,
}: {
  values: CompanyIdentityValues;
  hasLogo: boolean;
  showPreparedBy?: boolean;
  vatHint?: string;
  onChange: (field: keyof CompanyIdentityValues, value: string) => void;
  onFocusField?: (field: string | null) => void;
}) {
  const focus = (field: string) => ({
    onFocus: () => onFocusField?.(field),
    onBlur: () => onFocusField?.(null),
  });

  return (
    <SectionCard icon={Building2} title="Your Company" badge="Sender" bodyClassName="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Address Line 1">
          <input
            type="text"
            className={FIELD_CLASS}
            placeholder="e.g. 123 Business Road, Suite 100"
            value={values.addressLine1}
            {...focus("address")}
            onChange={(event) => onChange("addressLine1", event.target.value)}
          />
        </Field>
        <Field label="City, Postcode">
          <input
            type="text"
            className={FIELD_CLASS}
            placeholder="e.g. London, EC1A 1BB"
            value={values.addressCity}
            {...focus("address")}
            onChange={(event) => onChange("addressCity", event.target.value)}
          />
        </Field>
        <Field label="VAT Registration" hint={vatHint}>
          <input
            type="text"
            className={FIELD_CLASS}
            placeholder="e.g. GB 123 4567 89"
            value={values.vatNumber}
            {...focus("vat")}
            onChange={(event) => onChange("vatNumber", event.target.value)}
          />
        </Field>
        {showPreparedBy ? (
          <Field label="Prepared By" hint="Printed on the document. Blank falls back to the company name.">
            <input
              type="text"
              className={FIELD_CLASS}
              placeholder="e.g. Jane Smith, ACA"
              value={values.preparedBy}
              {...focus("preparedBy")}
              onChange={(event) => onChange("preparedBy", event.target.value)}
            />
          </Field>
        ) : null}
      </div>
      <Field
        label="Logo Initials"
        className="sm:w-1/2"
        hint={`Used in place of a logo. ${
          hasLogo ? "A logo is uploaded, so this is not shown." : "No logo uploaded, so this is what prints."
        }`}
      >
        <input
          type="text"
          maxLength={3}
          className={cn(FIELD_CLASS, "uppercase")}
          placeholder="e.g. AC"
          value={values.logoInitials}
          onChange={(event) => onChange("logoInitials", event.target.value.toUpperCase())}
        />
      </Field>
    </SectionCard>
  );
}

/* ── 4. payment instructions and terms ─────────────────────────────────── */

export type PaymentDetailValues = {
  bankName: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  bic: string;
  contactEmail: string;
  contactPhone: string;
};

const PAYMENT_FIELDS: Array<[keyof PaymentDetailValues, string, string]> = [
  ["bankName", "Bank Name", "e.g. Barclays Bank PLC"],
  ["sortCode", "Sort Code", "e.g. 20-00-00"],
  ["accountNumber", "Account Number", "e.g. 12345678"],
  ["iban", "IBAN", "e.g. GB29 BARC 2000 0012 3456 78"],
  ["bic", "BIC / SWIFT", "e.g. BARCGB22"],
  ["contactEmail", "Contact Email", "e.g. accounts@yourcompany.co.uk"],
];

export function PaymentInstructionsCard({
  values,
  onChange,
  onFocusField,
  note = "Used on invoices, credit notes and quotes alike — a business has one bank account, so these are not set per document type.",
}: {
  values: PaymentDetailValues;
  onChange: (field: keyof PaymentDetailValues, value: string) => void;
  onFocusField?: (field: string | null) => void;
  note?: string;
}) {
  const bind = (field: keyof PaymentDetailValues) => ({
    className: FIELD_CLASS,
    value: values[field] ?? "",
    onFocus: () => onFocusField?.("payment"),
    onBlur: () => onFocusField?.(null),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(field, event.target.value),
  });

  return (
    <SectionCard icon={Landmark} title="Payment Instructions" bodyClassName="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PAYMENT_FIELDS.map(([field, label, placeholder]) => (
          <Field key={field} label={label}>
            <input
              {...bind(field)}
              type={field === "contactEmail" ? "email" : "text"}
              placeholder={placeholder}
            />
          </Field>
        ))}
      </div>
      <Field label="Contact Phone">
        <input {...bind("contactPhone")} type="text" placeholder="e.g. +44 (0)20 7946 0958" />
      </Field>
      <p className="m-0 text-[11px] leading-relaxed text-slate-500">{note}</p>
    </SectionCard>
  );
}

export function TermsCard({
  title = "Terms & Conditions",
  label = "Terms (one per line)",
  value,
  onChange,
  onFocusField,
  rows = 8,
  hint = "Each line prints as its own numbered term, and a blank line prints as a gap.",
  placeholder = TERMS_PLACEHOLDER,
}: {
  title?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onFocusField?: (field: string | null) => void;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <SectionCard icon={FileText} title={title}>
      <label className={LABEL_CLASS}>{label}</label>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onFocus={() => onFocusField?.("notes")}
        onBlur={() => onFocusField?.(null)}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
      />
      <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>
    </SectionCard>
  );
}

/* ── 4b. line item columns ─────────────────────────────────────────────── */

/**
 * What each column holds, said once here so every screen that offers the
 * switches explains them the same way. Columns that only exist on one of the
 * two surfaces say so — a switch that silently does nothing on the screen the
 * user is thinking about reads as broken.
 */
const LINE_COLUMN_HINTS: Record<InvoiceLineColumnId, string> = {
  description: "Always shown — a line without a description says nothing.",
  date: "A date per line, for work delivered across a period. Printed document only.",
  reference: "The account code each line posts to. Printed document only.",
  category:
    "The income account for each line. Hiding it also hides the account picker when entering an invoice — lines then post to your default income account.",
  location: "The location entered on the line.",
  quantity: "Hidden, new lines are quantity 1 and you enter the line amount directly.",
  unitPrice:
    "Hidden on the printed document only — the entry form always needs a price to build the amount from.",
  discount: "The per-line discount on the entry form.",
  tax: "The per-line VAT selector on the entry form. The document's VAT treatment still applies.",
  amount: "Always shown — every line prints what it charges.",
};

/**
 * Per-column visibility and renaming for the line-item table.
 *
 * One row per column: a switch for whether it appears, and a rename box whose
 * placeholder is the default heading — blank means "keep the default", so
 * clearing the box is how a rename is undone. Description and amount cannot be
 * hidden (their switches are locked on) but can still be renamed.
 */
export function LineItemColumnsCard({
  columns,
  onChange,
  onFocusField,
  title = "Line Item Columns",
}: {
  columns: InvoiceLineColumns;
  onChange: (id: InvoiceLineColumnId, patch: Partial<InvoiceLineColumnSetting>) => void;
  onFocusField?: (field: string | null) => void;
  title?: string;
}) {
  return (
    <SectionCard
      icon={Layout}
      title={title}
      badge="Form + print"
      bodyClassName="p-0 text-xs font-semibold tracking-wide text-slate-700"
    >
      <div className="divide-y divide-slate-100">
        {INVOICE_LINE_COLUMN_IDS.map((id) => {
          const column = columns[id];
          const required = REQUIRED_INVOICE_LINE_COLUMNS.includes(id);
          const defaultLabel = INVOICE_LINE_COLUMN_DEFAULT_LABELS[id];
          const on = required || column.show;
          return (
            <div
              key={id}
              className="flex items-start justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-slate-50/60 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <span className={cn("block text-xs font-bold", on ? "text-slate-900" : "text-slate-500")}>
                  {defaultLabel}
                  {column.label && column.label !== defaultLabel ? (
                    <span className="ml-1.5 font-medium text-blue-600">→ {column.label}</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-slate-500">
                  {LINE_COLUMN_HINTS[id]}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <input
                  type="text"
                  value={column.label}
                  maxLength={INVOICE_LINE_COLUMN_LABEL_MAX}
                  placeholder={defaultLabel}
                  aria-label={`Rename the ${defaultLabel} column`}
                  onFocus={() => onFocusField?.("lines")}
                  onBlur={() => onFocusField?.(null)}
                  onChange={(event) => onChange(id, { label: event.target.value })}
                  className="h-8 w-28 rounded-md border border-slate-200 px-2 text-xs font-medium shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none sm:w-32"
                />
                <Switch
                  checked={on}
                  disabled={required}
                  onCheckedChange={(checked: boolean) => onChange(id, { show: checked })}
                  aria-label={`Show the ${defaultLabel} column`}
                  title={required ? "This column is always shown" : undefined}
                  className="mt-1.5 shrink-0"
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ── 5. field toggles ──────────────────────────────────────────────────── */

export type FieldToggleRow = {
  label: string;
  hint: string;
  on: boolean;
  set: (on: boolean) => void;
};

export function FieldTogglesCard({
  rows,
  title = "Dynamic Field Layout Toggles",
}: {
  rows: FieldToggleRow[];
  title?: string;
}) {
  return (
    <SectionCard
      icon={Layout}
      title={title}
      bodyClassName="space-y-3 p-4 text-xs font-semibold tracking-wide text-slate-700 sm:p-5"
    >
      {/* Every layout choice as a switch. Each one turns a whole column on or
          off on the printed document, which is a setting rather than an item
          ticked off a list — and a switch shows its state without being read. */}
      <div className="-mx-4 divide-y divide-slate-100 sm:-mx-5">
        {rows.map((row) => (
          <label
            key={row.label}
            className="flex cursor-pointer select-none items-start justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-slate-50/60 sm:px-5"
          >
            <span className="min-w-0">
              <span className={cn("block text-xs font-bold", row.on ? "text-slate-900" : "text-slate-500")}>
                {row.label}
              </span>
              <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-slate-500">{row.hint}</span>
            </span>
            <Switch
              checked={row.on}
              onCheckedChange={(checked: boolean) => row.set(checked)}
              aria-label={row.label}
              className="mt-0.5 shrink-0"
            />
          </label>
        ))}
      </div>
    </SectionCard>
  );
}
