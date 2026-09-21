"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ChevronDown, ArrowDown, Lightbulb, X, MousePointer2,
  Hash, Coins, FileCheck, Image as ImageIcon, Palette, Building2, FileText, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import {
  LogoEmblemCard,
  type LogoPosition,
  StylingCard,
  TemplateGalleryCard,
  YourCompanyCard,
  TermsCard,
  FieldTogglesCard,
  type DocumentPalette,
  type CompanyIdentityValues,
} from "@/components/sales/document-templates/shared/document-settings-sections";
import {
  getInvoiceTemplateColors,
  getInvoiceTemplateTextColor,
  type InvoiceTemplateId,
} from "@/components/sales/document-templates/invoice-template-config";

/** The separator the address is stored and printed with. */
const NEWLINE = "\n";

export type PurchaseSectionKey =
  | "numbering"
  | "defaults"
  | "approvals"
  | "emblem"
  | "style"
  | "sender"
  | "notes"
  | "finish";

/**
 * The purchases sequence, in the order it is filled in.
 *
 * How bills are numbered and defaulted comes before what they look like: the
 * numbering is what somebody is actually asked for on day one, and the print
 * layout only matters once there is a bill to print.
 */
export const PURCHASE_SECTION_KEYS: PurchaseSectionKey[] = [
  "numbering", "defaults", "approvals", "emblem", "style", "sender", "notes", "finish",
];

const SECTION_META: Record<PurchaseSectionKey, { label: string; icon: typeof Hash }> = {
  numbering: { label: "Numbering", icon: Hash },
  defaults: { label: "Defaults", icon: Coins },
  approvals: { label: "Approvals", icon: FileCheck },
  emblem: { label: "Emblem", icon: ImageIcon },
  style: { label: "Style", icon: Palette },
  sender: { label: "Sender", icon: Building2 },
  notes: { label: "Notes", icon: FileText },
  finish: { label: "Finish", icon: Check },
};

const HEADINGS: Record<PurchaseSectionKey, { heading: string; blurb: string }> = {
  numbering: {
    heading: "Bill and claim numbers",
    blurb: "The reference each supplier bill and expense claim is filed under. Both keep counting from here.",
  },
  defaults: {
    heading: "Purchase defaults",
    blurb: "What a new bill assumes before anybody types anything. Every one can still be changed per bill.",
  },
  approvals: {
    heading: "Who signs it off",
    blurb: "Whether a second pair of eyes is needed, and whether a closed tax period can be posted into.",
  },
  emblem: {
    heading: "Bill logo",
    blurb: "Bills are internal records rather than something you send, so this is for your own filing.",
  },
  style: {
    heading: "Colours and layout",
    blurb: "Pick the layout first — it repaints the palette to match. Then change any colour you want to differ.",
  },
  sender: {
    heading: "Your company",
    blurb: "The details printed on your copy of a bill, so a filed record says who received it.",
  },
  notes: {
    heading: "Notes and footer",
    blurb: "Standing notes on every bill, and the line that closes the page.",
  },
  finish: {
    heading: "That is everything",
    blurb: "Sales documents, purchase defaults and approvals are all set. One last look before you pay.",
  },
};

/**
 * One tip per section — the thing you would otherwise only learn by getting it
 * wrong, sitting where the reader already looks for what to do next.
 */
const SECTION_TIPS: Record<PurchaseSectionKey, string> = {
  numbering: "Start the counter above your last number if you are moving from another system, so nothing collides.",
  defaults: "Exclusive of VAT is the usual choice in the UK — the tax is added on top of what you type.",
  approvals: "Locking closed periods stops a late bill quietly changing a return you have already filed.",
  emblem: "A bill is your own record, so this is mostly for recognising it in a folder at a glance.",
  style: "Bills print through the same layouts as invoices, so your filing and your sending can match.",
  sender: "There is no Prepared By here: a bill is something you received, not something you issued.",
  notes: "Internal notes are for your team. Nothing here is ever sent to the supplier.",
  finish: "Nothing has been charged yet. The next screen is a summary, not the payment.",
};

type PurchasesSettingsStepProps = {
  formData: any;
  onChange: (key: string, value: any) => void;
  /** Which section is on screen, driven by how far the wizard has been scrolled. */
  sectionIndex: number;
  /** 0–1 through the whole sequence, so the rail can fill rather than step. */
  progress: number;
  /** Scroll the page to a section, for the rail and the scroll hint. */
  onSeek: (index: number) => void;
  /** Close the sequence off and open the review card below. */
  onFinish: () => void;
  /** Open the bill fullscreen. The only way to see it below lg. */
  onOpenPreview: () => void;
};

/**
 * The purchases branding and defaults step.
 *
 * Built from the same sections as the sales step and the settings screen, and
 * advanced the same way — the card is pinned and scrolling moves through it.
 * It used to be two tabs holding every field at once, with a bill preview drawn
 * by hand that could not show any of the six layouts, so a bill printed from
 * the finished workspace looked nothing like the one previewed here.
 */
export function PurchasesSettingsStep({
  formData,
  onChange,
  sectionIndex,
  progress,
  onSeek,
  onFinish,
  onOpenPreview,
}: PurchasesSettingsStepProps) {
  const [showIntro, setShowIntro] = useState(true);

  const keys = PURCHASE_SECTION_KEYS;
  const total = keys.length;
  const currentKey = keys[Math.min(sectionIndex, total - 1)];
  const isLast = sectionIndex >= total - 1;

  const theme: InvoiceTemplateId = formData.billTheme || "professional";
  const themeColors = getInvoiceTemplateColors(theme);

  const palette: DocumentPalette = [
    formData.billBrandColor ?? themeColors[0],
    formData.billSecondaryColor ?? themeColors[1],
    formData.billTertiaryColor ?? themeColors[2],
  ];
  const textColor = formData.billTextColor ?? getInvoiceTemplateTextColor(theme);
  const logo = formData.billLogo ?? null;

  const selectTheme = (next: InvoiceTemplateId) => {
    const colors = getInvoiceTemplateColors(next);
    onChange("billTheme", next);
    onChange("billBrandColor", colors[0]);
    onChange("billSecondaryColor", colors[1]);
    onChange("billTertiaryColor", colors[2]);
    onChange("billTextColor", getInvoiceTemplateTextColor(next));
  };

  const addressParts = String(formData.billCompanyAddress ?? "").split(NEWLINE);
  const company: CompanyIdentityValues = {
    addressLine1: addressParts[0] ?? "",
    addressCity: addressParts.slice(1).join(", "),
    vatNumber: formData.billVatNumber ?? "",
    preparedBy: "",
    logoInitials: formData.billLogoInitials ?? "",
  };

  const setCompanyField = (field: keyof CompanyIdentityValues, value: string) => {
    if (field === "addressLine1" || field === "addressCity") {
      const line1 = field === "addressLine1" ? value : company.addressLine1;
      const city = field === "addressCity" ? value : company.addressCity;
      onChange("billCompanyAddress", [line1, city].filter(Boolean).join(NEWLINE));
      return;
    }
    if (field === "vatNumber") onChange("billVatNumber", value);
    if (field === "logoInitials") onChange("billLogoInitials", value);
  };

  /* Each segment fills across its own slice of the scroll, so the rail moves
     continuously rather than jumping a step at a time. */
  const segmentFill = (index: number) => {
    const size = 1 / total;
    const start = index * size;
    if (progress >= start + size) return 100;
    if (progress <= start) return 0;
    return ((progress - start) / size) * 100;
  };

  const fieldClass =
    "h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none";
  const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500";

  const card = (icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
        {icon}
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      <div className="p-5 sm:p-6">{body}</div>
    </div>
  );

  const renderSection = (key: PurchaseSectionKey) => {
    if (key === "numbering") {
      return card(
        <Hash className="size-4 text-emerald-600" />,
        "Document Numbering",
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Supplier Bill Prefix</label>
            <input type="text" className={fieldClass} value={formData.billPrefix ?? "BILL-"} onChange={(e) => onChange("billPrefix", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Next Bill No.</label>
            <input type="number" className={fieldClass} value={formData.nextBillNumber ?? "1001"} onChange={(e) => onChange("nextBillNumber", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Expense Claim Prefix</label>
            <input type="text" className={fieldClass} value={formData.claimPrefix ?? "EXP-"} onChange={(e) => onChange("claimPrefix", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Next Claim No.</label>
            <input type="number" className={fieldClass} value={formData.nextClaimNumber ?? "5001"} onChange={(e) => onChange("nextClaimNumber", e.target.value)} />
          </div>
        </div>,
      );
    }

    if (key === "defaults") {
      return card(
        <Coins className="size-4 text-emerald-600" />,
        "Purchase Defaults",
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Payment Terms</label>
            <select className={fieldClass} value={formData.defaultTerms ?? "30"} onChange={(e) => onChange("defaultTerms", e.target.value)}>
              <option value="0">Due on receipt</option>
              <option value="7">Net 7 Days</option>
              <option value="14">Net 14 Days</option>
              <option value="30">Net 30 Days</option>
              <option value="60">Net 60 Days</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Amounts Are</label>
            <select className={fieldClass} value={formData.defaultAmountType ?? "exclusive"} onChange={(e) => onChange("defaultAmountType", e.target.value)}>
              <option value="exclusive">Exclusive of VAT</option>
              <option value="inclusive">Inclusive of VAT</option>
              <option value="no_vat">No VAT</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            {/* availableOnly: this names the currency bills are raised in, so
                a code the books cannot keep is not an option somebody is
                waiting for — it is just an unpickable row in their way. The
                base currency picker is the place that answers that question. */}
            <CurrencyPicker
              value={formData.defaultCurrency || formData.currency || "GBP"} // currency:allow falls back to the workspace choice
              onChange={(code) => onChange("defaultCurrency", code)}
              availableOnly
              size="field"
            />
          </div>
        </div>,
      );
    }

    if (key === "approvals") {
      return (
        <FieldTogglesCard
          title="Approvals & Period Control"
          rows={[
            {
              label: "Require expense approvals",
              hint: "A second person approves each bill and claim before it posts to your accounts.",
              on: formData.requireApproval !== false,
              set: (on) => onChange("requireApproval", on),
            },
            {
              label: "Lock closed periods",
              hint: "Stops a bill being dated into a tax period you have already filed.",
              on: formData.lockClosedPeriods === true,
              set: (on) => onChange("lockClosedPeriods", on),
            },
          ]}
        />
      );
    }

    if (key === "emblem") {
      return (
        <LogoEmblemCard
          title="Bill Logo Emblem"
          logo={logo}
          description="Printed on your own copy of a bill, so a filed record is recognisable at a glance."
          onLogoChange={(value) => onChange("billLogo", value)}
          logoPosition={(formData.billLogoPosition ?? "left") as LogoPosition}
          onLogoPositionChange={(value) => onChange("billLogoPosition", value)}
          theme={theme}
        />
      );
    }

    if (key === "style") {
      return (
        <>
          <TemplateGalleryCard title="Bill Layout" theme={theme} palette={palette} onSelect={selectTheme} />
          <StylingCard
            palette={palette}
            textColor={textColor}
            font={formData.billTemplate ?? "sans"}
            paperSize={formData.billPaperSize ?? "a4"}
            onPaletteChange={(index, value) =>
              onChange(
                index === 0 ? "billBrandColor" : index === 1 ? "billSecondaryColor" : "billTertiaryColor",
                value,
              )
            }
            onTextColorChange={(value) => onChange("billTextColor", value)}
            onFontChange={(value) => onChange("billTemplate", value)}
            onPaperSizeChange={(value) => onChange("billPaperSize", value)}
          />
        </>
      );
    }

    if (key === "sender") {
      /* No Prepared By. A bill is something you received; there is nobody on
         your side who prepared it, and the field printed an empty card. */
      return (
        <YourCompanyCard
          values={company}
          hasLogo={Boolean(logo)}
          showPreparedBy={false}
          vatHint="Left blank, the number from your VAT step is used."
          onChange={setCompanyField}
        />
      );
    }

    if (key === "notes") {
      return (
        <>
          <TermsCard
            title="Internal Notes"
            label="Notes (one per line)"
            value={formData.billNotes ?? ""}
            rows={5}
            placeholder={"Check against the purchase order before approving.\nAttach the delivery note."}
            hint="Printed on your copy only. Each line prints as its own numbered note."
            onChange={(value) => onChange("billNotes", value)}
          />
          <TermsCard
            title="Record Footer"
            label="Footer line"
            value={formData.billFooter ?? ""}
            rows={2}
            placeholder="e.g. Filed under Accounts Payable — retain for six years."
            hint="One line at the foot of the page, for a filing reference or retention note."
            onChange={(value) => onChange("billFooter", value)}
          />
        </>
      );
    }

    /* The summary and the payment button are not here.
       They were, and the panel dwarfed the card it sat in: a scrolling review
       of twenty answers inside a pinned pane that scrolls, with the section
       heading repeated a few pixels above the panel's own. A review of both
       sequences does not belong inside one of them — it gets its own card
       below, opened from here the same way purchases was opened from sales. */
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <p className="m-0 text-sm font-bold text-emerald-900">Your workspace is ready</p>
          <p className="m-0 mt-1.5 text-xs leading-relaxed text-emerald-800">
            Nothing is locked in — every choice here can be changed later in Sales settings and
            Purchases settings.
          </p>
        </div>
        <Button
          onClick={onFinish}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md transition-transform hover:bg-emerald-700 active:scale-95"
        >
          Finish and review
          <motion.span
            animate={{ y: [0, 2, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowDown className="size-4" />
          </motion.span>
        </Button>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col text-left">
      {/* The rail — same shape as the sales step, in the purchases colour so
          the two read as siblings rather than as the same screen twice. */}
      <div className="shrink-0">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = SECTION_META[currentKey].icon;
              return <Icon className="size-4 text-emerald-600" />;
            })()}
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">Purchases</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span className="sm:hidden">{SECTION_META[currentKey].label} · </span>
              {String(Math.min(sectionIndex + 1, total)).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={onOpenPreview}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 lg:hidden"
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
                    className="absolute left-0 top-0 h-full rounded-full bg-emerald-600 transition-[width] duration-150 ease-out"
                    style={{ width: `${segmentFill(index)}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[9px] font-bold uppercase tracking-wider transition-colors sm:block",
                    active ? "text-emerald-600" : reachable ? "text-slate-500" : "text-slate-300",
                  )}
                >
                  {SECTION_META[key].label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showIntro && sectionIndex === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
            transition={{ duration: 0.3, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-3 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 pr-9"
          >
            <span className="absolute -top-1.5 left-8 size-3 rotate-45 border-l border-t border-emerald-200 bg-emerald-50/70" />
            <div className="flex items-start gap-2.5">
              <MousePointer2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p className="m-0 text-[11.5px] font-medium leading-relaxed text-slate-700">
                <span className="font-bold text-slate-900">Last stretch — scroll to move through it.</span>{" "}
                Numbering and defaults first, then what a bill looks like when you print one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIntro(false)}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-md p-1 text-emerald-500 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar scroll-fade-y">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentKey}
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

      <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Lightbulb className="mt-px size-3.5 shrink-0 text-amber-500" />
          <p className="m-0 min-w-0 text-[11px] leading-snug text-slate-500">{SECTION_TIPS[currentKey]}</p>
        </div>

        {isLast ? (
          <span className="flex shrink-0 items-center gap-1.5 self-end text-xs font-bold text-emerald-700 sm:self-auto">
            <Check className="size-4" /> Purchases ready
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowIntro(false);
              onSeek(sectionIndex + 1);
            }}
            className="flex shrink-0 items-center gap-1.5 self-end rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:bg-slate-100 hover:text-emerald-600 sm:self-auto"
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

/**
 * What the preview shows while the numbering, defaults and approvals are being
 * set — none of which are visible on a printed bill.
 *
 * The right-hand column previously held a static blurb through all of those,
 * so three sections of the wizard had nothing beside them. This shows the
 * actual next reference, the terms and the approval state as they are typed.
 */
export function PurchaseSystemPreview({ formData }: { formData: any }) {
  const currency = formData.defaultCurrency || formData.currency || "GBP"; // currency:allow
  const terms = String(formData.defaultTerms ?? "30");
  const amountType = formData.defaultAmountType ?? "exclusive";
  const requireApproval = formData.requireApproval !== false;
  const locked = formData.lockClosedPeriods === true;

  const row = (label: string, value: string) => (
    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="truncate text-right text-sm font-bold text-slate-800">{value}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Your next bill</p>
        <p className="font-mono text-2xl font-black tracking-tight text-slate-900">
          {(formData.billPrefix ?? "BILL-")}
          {formData.nextBillNumber ?? "1001"}
        </p>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Your next claim</p>
        <p className="font-mono text-lg font-black tracking-tight text-slate-600">
          {(formData.claimPrefix ?? "EXP-")}
          {formData.nextClaimNumber ?? "5001"}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {row("Payment terms", terms === "0" ? "Due on receipt" : `Net ${terms} days`)}
        {row("Amounts are", amountType === "inclusive" ? "Inclusive of VAT" : amountType === "no_vat" ? "No VAT" : "Exclusive of VAT")}
        {row("Currency", currency)}
      </div>

      <div
        className={cn(
          "rounded-2xl border p-4",
          requireApproval ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60",
        )}
      >
        <p className={cn("m-0 text-sm font-bold", requireApproval ? "text-emerald-900" : "text-amber-900")}>
          {requireApproval ? "Bills need approval before they post" : "Bills post as soon as they are entered"}
        </p>
        <p className={cn("m-0 mt-1 text-xs leading-relaxed", requireApproval ? "text-emerald-800" : "text-amber-800")}>
          {requireApproval
            ? "A bill waits for a second person before it reaches your accounts, so nothing posts unchecked."
            : "Nothing waits for a second pair of eyes. Quicker, and worth knowing if more than one person enters bills."}
        </p>
        <p className="m-0 mt-2 text-[11px] font-semibold text-slate-500">
          {locked ? "Closed tax periods are locked." : "Closed tax periods can still be posted into."}
        </p>
      </div>
    </div>
  );
}
