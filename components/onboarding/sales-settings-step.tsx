"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Receipt, Sliders, Copy, Check, ChevronDown, ArrowDown,
  Image as ImageIcon, Palette, Building2, Landmark, Columns3, Sparkles,
  Lightbulb, X, MousePointer2, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  LogoEmblemCard,
  type LogoPosition,
  StylingCard,
  TemplateGalleryCard,
  YourCompanyCard,
  PaymentInstructionsCard,
  TermsCard,
  FieldTogglesCard,
  type DocumentPalette,
  type CompanyIdentityValues,
  type PaymentDetailValues,
} from "@/components/sales/document-templates/shared/document-settings-sections";
import {
  getInvoiceTemplateColors,
  getInvoiceTemplateTextColor,
  type InvoiceTemplateId,
} from "@/components/sales/document-templates/invoice-template-config";

/** The separator the address is stored and printed with. */
const NEWLINE = "\n";

export type SalesTab = "invoice" | "credit_note" | "quote";

/** The section keys, in order. Shared with the wizard, which needs the count to
 *  size the scroll track and the key to decide what the preview should show. */
export type SalesSectionKey = "logo" | "style" | "company" | "payment" | "columns" | "apply";

/**
 * Column switches are asked once, on the invoice.
 *
 * A credit note and a quote print from the same line table, and a business
 * wants one consistent table rather than three that disagree — so the section
 * is simply absent on those two, and the sequence is a step shorter.
 */
export function salesSectionKeys(activeTab: SalesTab): SalesSectionKey[] {
  return activeTab === "invoice"
    ? ["logo", "style", "company", "payment", "columns", "apply"]
    : ["logo", "style", "company", "payment", "apply"];
}

type SalesSettingsStepProps = {
  formData: any;
  activeTab: SalesTab;
  setActiveTab: (tab: SalesTab) => void;
  onChange: (key: string, value: any) => void;
  /** Which section is on screen, driven by how far the wizard has been scrolled. */
  sectionIndex: number;
  /** 0–1 through the whole sequence, so the rail can fill rather than step. */
  progress: number;
  /** Scroll the page to a section — the rail and the closing cards use it. */
  onSeek: (index: number) => void;
  /** Reveal the purchases card and scroll to it. Called from the last section. */
  onFinish: () => void;
  /** Open the document fullscreen. The only way to see it below lg, where the
   *  preview column is hidden. */
  onOpenPreview: () => void;
};

const TAB_PREFIX: Record<SalesTab, string> = {
  invoice: "invoice",
  credit_note: "creditNote",
  quote: "quote",
};

const TAB_NOUN: Record<SalesTab, string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  quote: "Quote",
};

const TAB_ICON: Record<SalesTab, typeof FileText> = {
  invoice: FileText,
  credit_note: Receipt,
  quote: Sliders,
};

const SECTION_META: Record<SalesSectionKey, { label: string; icon: typeof FileText }> = {
  logo: { label: "Emblem", icon: ImageIcon },
  style: { label: "Style", icon: Palette },
  company: { label: "Sender", icon: Building2 },
  payment: { label: "Payment", icon: Landmark },
  columns: { label: "Columns", icon: Columns3 },
  apply: { label: "Apply", icon: Sparkles },
};

/** Every branding key that is set once and used by all three document types. */
const SHARED_PAYMENT_KEYS: Array<[keyof PaymentDetailValues, string]> = [
  ["bankName", "docBankName"],
  ["sortCode", "docSortCode"],
  ["accountNumber", "docAccountNumber"],
  ["iban", "docIban"],
  ["bic", "docBic"],
  ["contactEmail", "docContactEmail"],
  ["contactPhone", "docContactPhone"],
];

/**
 * One tip per section, in the footer.
 *
 * Each says the thing somebody only finds out by getting it wrong: that a
 * blank line in the terms box prints as a gap, that picking a layout repaints
 * the colours, that leaving a field empty is a decision rather than an
 * omission. They sit where the reader already looks for what to do next.
 */
const SECTION_TIPS: Record<SalesSectionKey, string> = {
  logo: "A PNG or SVG with a transparent background reads best. No file? Your initials print instead.",
  style: "Pick a layout first — it repaints the palette to match. Then change any colour you want to differ.",
  company: "Leave a box empty and the answer you gave earlier in setup is used on the document.",
  payment: "One term per line. A blank line prints as a gap between them, not as an empty term.",
  columns: "Any combination works. All seven off leaves description and amounts, which is a clean look.",
  apply: "Send this look to your credit notes and quotes, or give either one its own — then carry on.",
};

/** The per-document-type fields the "use this everywhere" card copies. */
const COPYABLE_FIELDS = [
  "Logo", "BrandColor", "SecondaryColor", "TertiaryColor", "TextColor",
  "Template", "CompanyAddress", "VatNumber", "RegNumber", "PaperSize",
  "PreparedBy", "LogoInitials", "Notes",
];

/**
 * The sales branding step, advanced by scrolling.
 *
 * It was a single column holding every card at once, which made the card
 * taller than the window and put forty inputs in front of somebody who had not
 * yet produced anything. Then it was the same sections behind a Continue
 * button, which is one more thing to find on a page you are already scrolling.
 *
 * Now the page itself is the control: the card is pinned, and scrolling moves
 * through the sections while the rail at the top fills — the same idea as the
 * feature section on the marketing site, so the product behaves like the page
 * that sold it. The preview beside it changes with the section, showing the
 * part of the document currently being decided.
 */
export function SalesSettingsStep({
  formData,
  activeTab,
  setActiveTab,
  onChange,
  sectionIndex,
  progress,
  onSeek,
  onFinish,
  onOpenPreview,
}: SalesSettingsStepProps) {
  /* Shown once, on arrival. Scrolling to advance is not a convention anybody
     can be assumed to know, and the alternative is somebody sitting on step
     one looking for a button that is deliberately not there. */
  const [showIntro, setShowIntro] = useState(true);
  const prefix = TAB_PREFIX[activeTab];
  const noun = TAB_NOUN[activeTab];

  const read = (field: string, fallback = "") => formData[`${prefix}${field}`] ?? fallback;
  const write = (field: string, value: any) => onChange(`${prefix}${field}`, value);

  const theme: InvoiceTemplateId = formData.documentTheme || "professional";
  const themeColors = getInvoiceTemplateColors(theme);

  const palette: DocumentPalette = [
    read("BrandColor", themeColors[0]),
    read("SecondaryColor", themeColors[1]),
    read("TertiaryColor", themeColors[2]),
  ];
  const textColor = read("TextColor", getInvoiceTemplateTextColor(theme));
  const logo = formData[`${prefix}Logo`] ?? null;

  const completedTabs: SalesTab[] = formData.salesTabsDone ?? [];

  /*
   * Picking a layout repaints the palette with that layout's own colours.
   *
   * The alternative is carrying the previous layout's colours onto a design
   * they were not chosen for — Bold's red on Elegant's bronze editorial sheet —
   * which reads as the gallery being broken rather than as a deliberate choice.
   * Anyone who wants that combination can still set it, in the card below.
   */
  const selectTheme = (next: InvoiceTemplateId) => {
    const colors = getInvoiceTemplateColors(next);
    onChange("documentTheme", next);
    (["invoice", "creditNote", "quote"] as const).forEach((key) => {
      onChange(`${key}BrandColor`, colors[0]);
      onChange(`${key}SecondaryColor`, colors[1]);
      onChange(`${key}TertiaryColor`, colors[2]);
      onChange(`${key}TextColor`, getInvoiceTemplateTextColor(next));
    });
  };

  /* The address is one field in the wizard's state and two boxes on the form,
     the same way the settings screen splits it, so both write the same shape. */
  const addressParts = String(read("CompanyAddress")).split(NEWLINE);
  const company: CompanyIdentityValues = {
    addressLine1: addressParts[0] ?? "",
    addressCity: addressParts.slice(1).join(", "),
    vatNumber: read("VatNumber"),
    preparedBy: read("PreparedBy"),
    logoInitials: read("LogoInitials"),
  };

  const setCompanyField = (field: keyof CompanyIdentityValues, value: string) => {
    if (field === "addressLine1" || field === "addressCity") {
      const line1 = field === "addressLine1" ? value : company.addressLine1;
      const city = field === "addressCity" ? value : company.addressCity;
      write("CompanyAddress", [line1, city].filter(Boolean).join(NEWLINE));
      return;
    }
    write(field === "vatNumber" ? "VatNumber" : field === "preparedBy" ? "PreparedBy" : "LogoInitials", value);
  };

  const payment = SHARED_PAYMENT_KEYS.reduce((accumulator, [field, key]) => {
    accumulator[field] = formData[key] ?? "";
    return accumulator;
  }, {} as PaymentDetailValues);

  const setPaymentField = (field: keyof PaymentDetailValues, value: string) => {
    const entry = SHARED_PAYMENT_KEYS.find(([name]) => name === field);
    if (entry) onChange(entry[1], value);
  };

  const toggle = (key: string, fallback: boolean) =>
    formData[key] === undefined ? fallback : formData[key] !== false;

  /** Hands the sequence to another document type, from the top. */
  const editNext = (tab: SalesTab) => {
    if (!completedTabs.includes(activeTab)) onChange("salesTabsDone", [...completedTabs, activeTab]);
    setActiveTab(tab);
    onSeek(0);
  };

  const keys = salesSectionKeys(activeTab);
  const total = keys.length;
  const currentKey = keys[Math.min(sectionIndex, total - 1)];

  /* Each segment fills across its own slice of the scroll, so the rail moves
     continuously rather than jumping a step at a time. */
  const segmentFill = (index: number) => {
    const size = 1 / total;
    const start = index * size;
    if (progress >= start + size) return 100;
    if (progress <= start) return 0;
    return ((progress - start) / size) * 100;
  };

  /* Every other document type, whether or not it has been through the
     sequence. Filtering the set ones out meant that finishing all three
     emptied this list and left nothing to click. */
  const others = (["invoice", "credit_note", "quote"] as SalesTab[]).filter((tab) => tab !== activeTab);

  const HEADINGS: Record<SalesSectionKey, { heading: string; blurb: string }> = {
    logo: {
      heading: `${noun} logo`,
      blurb: "The mark at the top of every document you send. Skip it and your initials are used instead.",
    },
    style: {
      heading: "Colours and layout",
      blurb: "Pick the layout first — it sets the palette to match. Then adjust any colour you want to differ.",
    },
    company: {
      heading: "Your company",
      blurb: "How your own details read on the page. This is the block your customer looks at first.",
    },
    payment: {
      heading: "Getting paid",
      blurb: "Where the money goes, and the terms it goes on. Bank details are set once and used everywhere.",
    },
    columns: {
      heading: "What each line shows",
      blurb: "Every switch turns a whole column on or off. Watch the table in the preview as you go.",
    },
    apply: {
      heading: "Credit notes and quotes",
      blurb: `Your ${noun.toLowerCase()} is set. Use the same look for the rest, or give one of them its own.`,
    },
  };

  const renderSection = (key: SalesSectionKey) => {
    if (key === "logo") {
      return (
        <LogoEmblemCard
          title={`${noun} Logo Emblem`}
          logo={logo}
          onLogoChange={(value) => write("Logo", value)}
          logoPosition={read("LogoPosition", "left") as LogoPosition}
          onLogoPositionChange={(value) => write("LogoPosition", value)}
          theme={theme}
        />
      );
    }
    if (key === "style") {
      return (
        <>
          <TemplateGalleryCard title={`${noun} Layout`} theme={theme} palette={palette} onSelect={selectTheme} />
          <StylingCard
            palette={palette}
            textColor={textColor}
            font={read("Template", "sans")}
            paperSize={read("PaperSize", "a4")}
            onPaletteChange={(index, value) =>
              write(index === 0 ? "BrandColor" : index === 1 ? "SecondaryColor" : "TertiaryColor", value)
            }
            onTextColorChange={(value) => write("TextColor", value)}
            onFontChange={(value) => write("Template", value)}
            onPaperSizeChange={(value) => write("PaperSize", value)}
          />
        </>
      );
    }
    if (key === "company") {
      return (
        <YourCompanyCard
          values={company}
          hasLogo={Boolean(logo)}
          vatHint="Left blank, the number from your VAT step is used."
          onChange={setCompanyField}
        />
      );
    }
    if (key === "payment") {
      return (
        <>
          <PaymentInstructionsCard values={payment} onChange={setPaymentField} />
          <TermsCard
            title={activeTab === "quote" ? "Quote Terms" : "Terms & Conditions"}
            value={read("Notes")}
            onChange={(value) => write("Notes", value)}
            rows={5}
            hint="Each line prints as its own numbered term, and a blank line prints as a gap."
          />
        </>
      );
    }
    if (key === "columns") {
      return (
        <FieldTogglesCard
          rows={[
            { label: "Reference code column", hint: "The account code each line posts to.", on: toggle("invoiceShowRefCode", true), set: (on) => onChange("invoiceShowRefCode", on) },
            { label: "Category column", hint: "The account name, or its report category.", on: toggle("invoiceShowCategory", true), set: (on) => onChange("invoiceShowCategory", on) },
            { label: "Location column", hint: "The location entered on the line.", on: toggle("invoiceShowLocation", true), set: (on) => onChange("invoiceShowLocation", on) },
            { label: "Date column", hint: "A date per line, for work delivered across a period.", on: toggle("invoiceShowLineDate", false), set: (on) => onChange("invoiceShowLineDate", on) },
            { label: "Tax / VAT breakdown", hint: "Per-line VAT and the totals block below the table.", on: toggle("invoiceShowTax", true), set: (on) => onChange("invoiceShowTax", on) },
            { label: "Quantity column", hint: "Quantity and unit price, rather than a line total alone.", on: toggle("invoiceShowUnitPrice", true), set: (on) => onChange("invoiceShowUnitPrice", on) },
            { label: "Shipping & delivery", hint: "A shipping line and its own total row.", on: toggle("invoiceShowShipping", true), set: (on) => onChange("invoiceShowShipping", on) },
          ]}
        />
      );
    }

    /* The closing section. Rather than making somebody fill the same form three
       times, it offers the two answers people actually give: the others look
       the same, or one of them needs its own turn through the sequence. */
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            (["invoice", "credit_note", "quote"] as SalesTab[])
              .filter((tab) => tab !== activeTab)
              .forEach((tab) => {
                COPYABLE_FIELDS.forEach((field) =>
                  onChange(`${TAB_PREFIX[tab]}${field}`, formData[`${prefix}${field}`]),
                );
              });
            onChange("salesTabsDone", ["invoice", "credit_note", "quote"]);
            toast.success(`Applied your ${noun} look to every document.`);
          }}
          className="flex w-full items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-left transition-all hover:border-blue-400 hover:bg-blue-50"
        >
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
            <Copy className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900">Use this look for all three</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
              Copies the emblem, colours, layout, company details and terms onto your credit notes and
              quotes. You can still change any of them later in Sales settings.
            </span>
          </span>
        </button>

        {others.map((tab) => {
          const Icon = TAB_ICON[tab];
          const isDone = completedTabs.includes(tab);
          return (
            <button
              key={tab}
              type="button"
              onClick={() => editNext(tab)}
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                  isDone ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600",
                )}
              >
                {isDone ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">
                  {isDone ? "Edit" : "Set up"} {TAB_NOUN[tab].toLowerCase()}s separately
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                  {isDone
                    ? `Already set. Takes you back through these steps to change anything.`
                    : `Takes you back to the top of these steps for ${TAB_NOUN[tab].toLowerCase()}s.`}
                </span>
              </span>
            </button>
          );
        })}

        {completedTabs.length >= 3 ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs font-semibold leading-relaxed text-emerald-800">
            All three document types are set. Keep scrolling when you are ready — or pick any of them
            above to change something.
          </p>
        ) : null}
      </div>
    );
  };

  const isLast = sectionIndex >= total - 1;

  return (
    <div className="flex h-full w-full flex-col text-left">
      {/* The rail. Which document type, how far through, and a segment per
          section that fills as the page scrolls rather than snapping. Passed
          sections are clickable; ahead is not, because the layout in section
          two repaints choices made in it. */}
      <div className="shrink-0">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          {/* Always switchable, never a one-way door.
              The closing section used to be the only place a document type
              could be changed, and it dropped each one from the list once it
              was set — so finishing all three left no way back into any of
              them. These stay put and stay clickable throughout. */}
          <div className="flex items-center gap-1">
            {(["invoice", "credit_note", "quote"] as SalesTab[]).map((tab) => {
              const Icon = TAB_ICON[tab];
              const isActive = tab === activeTab;
              const isDone = completedTabs.includes(tab);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    if (isActive) return;
                    setActiveTab(tab);
                    onSeek(0);
                  }}
                  title={`Set up ${TAB_NOUN[tab].toLowerCase()}s`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
                  )}
                >
                  {isDone && !isActive ? <Check className="size-3 text-emerald-600" /> : <Icon className="size-3" />}
                  <span className="hidden sm:inline">{TAB_NOUN[tab]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span className="sm:hidden">{SECTION_META[currentKey].label} · </span>
              {String(Math.min(sectionIndex + 1, total)).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            {/* The preview column is desktop only, so on a phone this is the
                only way to see the document being described. */}
            <button
              type="button"
              onClick={onOpenPreview}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 lg:hidden"
            >
              <Eye className="size-3" /> Preview
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {keys.map((key, index) => {
            const active = index === sectionIndex;
            const reachable = index <= sectionIndex;
            return (
              <button
                key={key}
                type="button"
                disabled={!reachable}
                onClick={() => onSeek(index)}
                title={SECTION_META[key].label}
                className={cn("group flex min-w-0 flex-1 flex-col gap-1.5", reachable ? "cursor-pointer" : "cursor-default")}
              >
                <span className="relative h-[3px] w-full overflow-hidden rounded-full bg-slate-200">
                  <span
                    className="absolute left-0 top-0 h-full rounded-full bg-blue-600 transition-[width] duration-150 ease-out"
                    style={{ width: `${segmentFill(index)}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[9px] font-bold uppercase tracking-wider transition-colors sm:block",
                    active ? "text-blue-600" : reachable ? "text-slate-500" : "text-slate-300",
                  )}
                >
                  {SECTION_META[key].label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* How this page works, said once.
          It points up at the rail it is describing, and goes away for good on
          the first click or the moment the reader scrolls off section one. */}
      <AnimatePresence>
        {showIntro && sectionIndex === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
            transition={{ duration: 0.3, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-3 shrink-0 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2.5 pr-9"
          >
            <span className="absolute -top-1.5 left-8 size-3 rotate-45 border-l border-t border-blue-200 bg-blue-50/70" />
            <div className="flex items-start gap-2.5">
              <MousePointer2 className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <p className="m-0 text-[11.5px] font-medium leading-relaxed text-slate-700">
                <span className="font-bold text-slate-900">Scroll to move through the steps.</span>{" "}
                The bar above fills as you go, and the preview on the right follows along. Click any
                segment you have passed to jump back to it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIntro(false)}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-md p-1 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* One section at a time, keyed on the document type as well as the
          section — so handing the sequence to credit notes animates as a fresh
          start rather than as the same section re-rendering. */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar scroll-fade-y">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${activeTab}-${currentKey}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">{HEADINGS[currentKey].heading}</h3>
              <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{HEADINGS[currentKey].blurb}</p>
            </div>
            {renderSection(currentKey)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* The footer does the coaching. A tip for whatever is on screen on the
          left, and on the right either the way onward or — on the last
          section — the button that opens purchases.

          There is no Continue: the page is the control. But the scroll hint is
          clickable, because somebody who has read "scroll" and reached for it
          anyway should not be told no. */}
      <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Lightbulb className="mt-px size-3.5 shrink-0 text-amber-500" />
          <p className="m-0 min-w-0 text-[11px] leading-snug text-slate-500">{SECTION_TIPS[currentKey]}</p>
        </div>

        {isLast ? (
          <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <Check className="size-4" /> {noun} ready
            </span>
            <Button
              type="button"
              onClick={onFinish}
              className="h-9 gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition-transform hover:bg-blue-700 active:scale-95"
            >
              Next: Purchases
              <motion.span
                animate={{ y: [0, 2, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowDown className="size-3.5" />
              </motion.span>
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowIntro(false);
              onSeek(sectionIndex + 1);
            }}
            className="flex shrink-0 items-center gap-1.5 self-end rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 sm:self-auto"
          >
            Scroll for {SECTION_META[keys[sectionIndex + 1]].label}
            <motion.span
              animate={{ y: [0, 3, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          </button>
        )}
      </div>
    </div>
  );
}
