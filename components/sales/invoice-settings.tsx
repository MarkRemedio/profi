"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { MAX_LOGO_MB, readLogoFile } from "@/lib/workspace-logo";
import { deleteWorkspaceLogos } from "@/app/(dashboard)/workspace-asset-actions";
import { createPortal } from "react-dom";
import {
  Upload, Save, Image as ImageIcon, FileText, Trash2, Palette,
  Building2, Layout, Eye, Receipt, Sliders, Maximize, X, Check,
  PanelRightClose, PanelRightOpen, ZoomIn, ZoomOut, Landmark, Stamp
} from "lucide-react";

/**
 * Shown as a placeholder, not saved.
 *
 * Three lines, because the point being made is that a line is a term — one
 * paragraph in this box prints as a single numbered item, which is the mistake
 * the old "Default Notes & Explanations" label invited.
 */
/** The separator the address is stored and printed with. */
const NEWLINE = "\n";

const TERMS_PLACEHOLDER = [
  "Payment is due within 14 days of the invoice date.",
  "A late payment fee of 1.5% per month applies to outstanding balances.",
  "All prices are quoted in GBP and exclusive of VAT unless stated otherwise.",
].join("\n");
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
// 🚀 Pull in the branding server actions we made earlier
import {
  saveDocumentBrandingDB,
  fetchDocumentBrandingDB,
  fetchDocumentWorkspaceIdentity,
  type DocumentWorkspaceIdentity,
} from "@/app/(dashboard)/sales/document-templates/actions";
import { createClient } from "@/lib/supabase/client"; // 🚀 Added Supabase client
import { InvoiceSettingsSkeleton } from "./skeletons";
import settingsStyles from "./invoice-settings.module.css";
import {
  DEFAULT_INVOICE_TEMPLATE_CONFIG,
  getInvoiceTemplateColors,
  getInvoiceTemplateTextColor,
  INVOICE_TEMPLATE_OPTIONS,
  parseInvoiceTemplateConfig,
  type InvoiceLineColumnId,
  type InvoiceLineColumns,
  type InvoiceLineColumnSetting,
  type InvoiceTemplateId,
} from "./document-templates/invoice-template-config";
import {
  InvoicePrintDocument,
  type InvoicePreviewHighlight,
  type PrintableInvoice,
} from "./document-templates/invoice-print-document";
// The gallery tile, shared with the onboarding wizard so the six layouts are
// drawn the same way wherever they are offered.
import { LineItemColumnsCard, LogoPositionField, TemplateThumbnail, type LogoPosition } from "./document-templates/shared/document-settings-sections";

function isInvoiceTemplateId(value: unknown): value is InvoiceTemplateId {
  return INVOICE_TEMPLATE_OPTIONS.some((option) => option.id === value);
}

const DEFAULT_TEMPLATE_COLORS = getInvoiceTemplateColors("professional");
const DEFAULT_TEMPLATE_TEXT_COLOR = getInvoiceTemplateTextColor("professional");

function PreviewCanvas({
  invoice,
  config,
  documentLabel,
  previewHighlight = null,
  isLarge = false,
  natural = false,
  onOpen,
}: {
  invoice: PrintableInvoice;
  config: ReturnType<typeof parseInvoiceTemplateConfig>;
  documentLabel: string;
  previewHighlight?: InvoicePreviewHighlight;
  isLarge?: boolean;
  /**
   * Render the document at the size CSS gives it and let the container scroll,
   * instead of measuring the container and scaling to fit.
   *
   * The measured path depends on the container reporting a width before the
   * first measurement, and on reading the size of an element scaled by CSS
   * `zoom`. Both held in the fixed desktop rail and neither held reliably in the
   * stacked panel or inside the fullscreen modal, where the result was an empty
   * box. Nothing here can produce one: the document is in normal flow at a size
   * the stylesheet decides, so it is either visible or the stylesheet is wrong.
   */
  natural?: boolean;
  onOpen?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{
    scale: number;
    width: number;
    height: number;
  } | null>(null);

  /*
   * The last applied scale, readable from inside measure().
   *
   * measure() has to divide the transform back out of the measured rect, and
   * reading that from state would mean listing it as an effect dependency —
   * which would tear down and rebuild the ResizeObserver on every measurement.
   */
  const previewSizeRef = useRef<{ scale: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (natural) return;
    const viewport = viewportRef.current;
    const documentNode = documentRef.current;
    if (!viewport || !documentNode) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        /*
         * Measured from the rendered box, not offsetWidth.
         *
         * The document is scaled with CSS `zoom`, and offsetWidth reports it
         * inconsistently between engines — a rounded layout value in some, the
         * unzoomed one in others. getBoundingClientRect reports what is actually
         * on screen, which is what the fit calculation needs. The wrapper this
         * measures carries the scale transform, so the rect is divided back out
         * to recover the natural size.
         */
        const rect = documentNode.getBoundingClientRect();
        const appliedScale = previewSizeRef.current?.scale ?? 1;
        const naturalWidth = rect.width / (appliedScale || 1);
        const naturalHeight = rect.height / (appliedScale || 1);
        if (naturalWidth < 2 || naturalHeight < 2) return;

        const padding = isLarge ? 48 : 0;
        const availableWidth = viewport.clientWidth - padding;
        /*
         * Wait for a real width rather than inventing one.
         *
         * This used to floor the available width at 1px. Measuring before layout
         * had given the container a width therefore produced a valid-looking
         * scale of 1/794 — a preview about one pixel wide — and stored it as a
         * successful measurement, so nothing ever corrected it and the panel
         * showed an empty box. Bailing out leaves previewSize null and the
         * ResizeObserver measures again the moment the container has a size.
         */
        if (availableWidth < 2) return;

        // Same reasoning for the fullscreen view, which measures its own height
        // and animates in — so its first frame can have none.
        const availableHeight = isLarge ? viewport.clientHeight - padding : Math.max(420, window.innerHeight - 180);
        if (isLarge && availableHeight < 2) return;
        const scale = Math.min(
          1,
          availableWidth / naturalWidth,
          availableHeight / naturalHeight,
        );

        const next = {
          scale,
          width: naturalWidth * scale,
          height: naturalHeight * scale,
        };
        previewSizeRef.current = next;
        setPreviewSize(next);
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(documentNode);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isLarge, natural]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        settingsStyles.previewViewport,
        isLarge && settingsStyles.previewViewportLarge,
        natural && settingsStyles.previewViewportNatural,
        onOpen && settingsStyles.previewViewportInteractive,
      )}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open ${documentLabel} fullscreen preview` : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      {natural ? (
        <div className={settingsStyles.previewNaturalDocument}>
          {/* A display mode, so the sheet is scaled.
              Without one this falls back to "print" — a full 210mm page at 1:1,
              wider and far taller than a phone — which is why the stacked
              preview ran off the screen. The preview scales drop further below
              700px, and fullscreen has its own zoom on top. */}
          <InvoicePrintDocument
            invoice={invoice}
            config={config}
            documentLabel={documentLabel}
            previewHighlight={previewHighlight}
            displayMode={isLarge ? "preview-large" : "preview"}
          />
        </div>
      ) : (
        <div
          className={settingsStyles.previewStage}
          style={{
            width: previewSize?.width ?? 0,
            height: previewSize?.height ?? 0,
          }}
        >
          <div
            ref={documentRef}
            className={settingsStyles.previewDocument}
            style={{
              opacity: previewSize ? 1 : 0,
              transform: `scale(${previewSize?.scale ?? 1})`,
            }}
          >
            <InvoicePrintDocument
              invoice={invoice}
              config={config}
              documentLabel={documentLabel}
              previewHighlight={previewHighlight}
            />
          </div>
        </div>
      )}
      {onOpen ? (
        <span className={settingsStyles.previewZoomHint} aria-hidden="true">
          <ZoomIn className="size-4" />
          Open preview
        </span>
      ) : null}
    </div>
  );
}

export function InvoiceSettings({
  activeOrgId,
  activeTab: controlledTab,
  onTabChange,
  hideChrome = false,
}: {
  activeOrgId: string;
  activeTab?: "invoice" | "credit_note" | "quote";
  onTabChange?: (tab: "invoice" | "credit_note" | "quote") => void;
  hideChrome?: boolean;
}) {
  const [loading, setLoading] = useState(false); // saving, not fetching
  // Guards the initial three-template fetch below, so the form doesn't render
  // with placeholder defaults before the saved branding arrives.
  const [fetching, setFetching] = useState(true);
  const [workspaceIdentity, setWorkspaceIdentity] =
    useState<DocumentWorkspaceIdentity | null>(null);
  const [activeTabState, setActiveTabState] = useState<"invoice" | "credit_note" | "quote">("invoice");
  const activeTab = controlledTab ?? activeTabState;
  const setActiveTab = (tab: "invoice" | "credit_note" | "quote") => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  /*
   * A reader-controlled zoom for the fullscreen view.
   *
   * The sheet is shown whole, which puts the body text below reading size. This
   * multiplies it and lets the modal scroll — the same control the bill preview
   * has, so the two behave alike.
   */
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const zoomFullscreenBy = (step: number) =>
    setFullscreenZoom((current) =>
      Math.min(2, Math.max(0.6, Math.round((current + step) * 10) / 10)),
    );
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focusedField, setFocusedField] = useState<InvoicePreviewHighlight>(null);

  useEffect(() => {
    // The portal can only mount after the browser document exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFullscreen]);

  // 📦 1. INVOICE STATES
  const [logo, setLogo] = useState<string | null>(null);
  /* What the three template rows actually hold, as distinct from what is on
     screen. Needed to delete the files a replacement supersedes: by save time
     the state is the new image, and the old URLs would be gone with nothing
     left pointing at the files. A ref rather than state — nothing renders
     from it. */
  const persistedLogos = useRef<{ invoice: string | null; creditNote: string | null; quote: string | null }>({
    invoice: null,
    creditNote: null,
    quote: null,
  });
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_TEMPLATE_COLORS[1]);
  const [tertiaryColor, setTertiaryColor] = useState(DEFAULT_TEMPLATE_COLORS[2]);
  const [textColor, setTextColor] = useState(DEFAULT_TEMPLATE_TEXT_COLOR);
  const [font, setFont] = useState("sans");
  const [companyAddress, setCompanyAddress] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [showCustomerRegNumber, setShowCustomerRegNumber] = useState(true);
  const [paperSize, setPaperSize] = useState("a4");
  const [showTax, setShowTax] = useState(true);
  const [showShipping, setShowShipping] = useState(true);
  const [theme, setTheme] = useState<InvoiceTemplateId>("professional");
  const [notes, setNotes] = useState("");

  /*
   * Payment details, once, for all three document types.
   *
   * A business has one bank account. Asking for it separately on the invoice,
   * the credit note and the quote is three places to update when the account
   * changes and two of them to forget — so the fields are shared and written
   * into all three template records, which is what the print document reads.
   *
   * These are what invoice-print-document renders as the payment rows. Before
   * this they existed in the template config, defaulted to empty and had
   * nowhere to be entered, so that section never showed bank details at all.
   */
  /*
   * The free-text payment footer is retired.
   *
   * It existed to hold bank details as prose; those are structured fields now,
   * and anything else it carried belongs in the terms. Deliberately written
   * back as empty rather than simply dropped from the form: a value left in the
   * record would keep printing on every document with nothing on this screen
   * able to change it.
   */
  const RETIRED_FOOTER = "";

  /*
   * Logo initials and who prepared the document.
   *
   * Shared, like the payment details: both are facts about the business rather
   * than about a document type, and the "Copy Details to All Tabs" button that
   * already exists is evidence the per-tab model was a nuisance for exactly
   * these fields.
   */
  /*
   * The line table's columns — visibility and custom headings.
   *
   * This replaces the five separate column switches (reference, category,
   * location, date, quantity/unit price): the config now carries them as one
   * `columns` object, and this state is that object verbatim. The older
   * `lineDetail` / `showLineDate` / `showUnitPrice` fields are still written on
   * save, derived from here, so anything that only reads those keeps working.
   */
  const [lineColumns, setLineColumns] = useState<InvoiceLineColumns>(
    DEFAULT_INVOICE_TEMPLATE_CONFIG.columns,
  );
  const setLineColumn = (id: InvoiceLineColumnId, patch: Partial<InvoiceLineColumnSetting>) =>
    setLineColumns((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const [logoInitials, setLogoInitials] = useState("");
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("left");
  const [preparedBy, setPreparedBy] = useState("");

  /*
   * The business stamp and the signatory's signature.
   *
   * Shared across the three tabs like the payment details: a business has one
   * stamp and one authorised signature, so they are entered once and written
   * into all three template records. The toggles switch printing without
   * losing the uploaded file.
   */
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [showStamp, setShowStamp] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [signaturePosition, setSignaturePosition] = useState<"left" | "right">("right");
  /* Same job as persistedLogos: the URLs the saved records actually hold, so a
     replaced or removed file can be deleted from storage on save. */
  const persistedSignatureAssets = useRef<{ stamp: string | null; signature: string | null }>({
    stamp: null,
    signature: null,
  });

  const [payment, setPayment] = useState({
    bankName: "",
    sortCode: "",
    accountNumber: "",
    iban: "",
    bic: "",
    contactEmail: "",
    contactPhone: "",
  });

  const paymentField = (key: keyof typeof payment) => ({
    value: payment[key],
    onFocus: () => setFocusedField("payment"),
    onBlur: () => setFocusedField(null),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setPayment((current) => ({ ...current, [key]: event.target.value })),
    className:
      "w-full rounded-md border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm",
  });

  // 📦 2. CREDIT NOTE STATES
  const [cnLogo, setCnLogo] = useState<string | null>(null);
  const [cnBrandColor, setCnBrandColor] = useState("#f97316");
  const [cnSecondaryColor, setCnSecondaryColor] = useState(DEFAULT_TEMPLATE_COLORS[1]);
  const [cnTertiaryColor, setCnTertiaryColor] = useState(DEFAULT_TEMPLATE_COLORS[2]);
  const [cnTextColor, setCnTextColor] = useState(DEFAULT_TEMPLATE_TEXT_COLOR);
  const [cnFont, setCnFont] = useState("sans");
  const [cnCompanyAddress, setCnCompanyAddress] = useState("");
  const [cnVatNumber, setCnVatNumber] = useState("");
  const [cnRegNumber, setCnRegNumber] = useState("");
  const [cnShowCustomerRegNumber, setCnShowCustomerRegNumber] = useState(true);
  const [cnPaperSize, setCnPaperSize] = useState("a4");
  const [cnNotes, setCnNotes] = useState("");
  const [cnTheme, setCnTheme] = useState<InvoiceTemplateId>("professional");

  // 📦 3. QUOTE STATES
  const [qLogo, setQLogo] = useState<string | null>(null);
  const [qBrandColor, setQBrandColor] = useState("#4f46e5");
  const [qSecondaryColor, setQSecondaryColor] = useState(DEFAULT_TEMPLATE_COLORS[1]);
  const [qTertiaryColor, setQTertiaryColor] = useState(DEFAULT_TEMPLATE_COLORS[2]);
  const [qTextColor, setQTextColor] = useState(DEFAULT_TEMPLATE_TEXT_COLOR);
  const [qFont, setQFont] = useState("sans");
  const [qCompanyAddress, setQCompanyAddress] = useState("");
  const [qVatNumber, setQVatNumber] = useState("");
  const [qRegNumber, setQRegNumber] = useState("");
  const [qShowCustomerRegNumber, setQShowCustomerRegNumber] = useState(true);
  const [qPaperSize, setQPaperSize] = useState("a4");
  const [qNotes, setQNotes] = useState("");
  const [qTheme, setQTheme] = useState<InvoiceTemplateId>("professional");
  useEffect(() => {
    async function loadAllTemplates() {
      if (!activeOrgId) {
        setFetching(false);
        return;
      }
      try {
        const identity = await fetchDocumentWorkspaceIdentity(activeOrgId);
        setWorkspaceIdentity(identity);

        // 🏢 1. FETCH INVOICE PROFILE
        const inv = (await fetchDocumentBrandingDB(activeOrgId, "invoice")) as any;
        if (inv) {
          const invTheme = isInvoiceTemplateId(inv.theme) ? inv.theme : "professional";
          const invColors = getInvoiceTemplateColors(invTheme);
          const invTextColor = getInvoiceTemplateTextColor(invTheme);
          setLogo(inv.logo || null); persistedLogos.current.invoice = inv.logo || null; setBrandColor(inv.brandColor || "#2563eb"); setFont(inv.font || "sans");
          setSecondaryColor(inv.secondaryColor || invColors[1]); setTertiaryColor(inv.tertiaryColor || invColors[2]);
          setTextColor(inv.textColor || invTextColor);
          setCompanyAddress(inv.companyAddress || ""); setVatNumber(inv.vatNumber || ""); setRegNumber(inv.regNumber || "");
          setShowCustomerRegNumber(inv.showCustomerRegNumber !== false);
          setPaperSize(inv.paperSize || "a4"); setShowTax(inv.showTax !== false); setShowShipping(inv.showShipping !== false);
          setTheme(invTheme);
          setLogoInitials(inv.logoInitials || ""); setPreparedBy(inv.preparedBy || ""); setLogoPosition(inv.logoPosition ?? "left");
          // Shared copy, like the payment details: any of the three records
          // would do, and the invoice one is already in hand.
          setStampUrl(inv.stampUrl || null); persistedSignatureAssets.current.stamp = inv.stampUrl || null;
          setSignatureUrl(inv.signatureUrl || null); persistedSignatureAssets.current.signature = inv.signatureUrl || null;
          setSignatureName(inv.signatureName || "");
          setShowStamp(inv.showStamp !== false); setShowSignature(inv.showSignature !== false);
          setSignaturePosition(inv.signaturePosition === "left" ? "left" : "right");
          // The parser folds the older lineDetail / showLineDate / showUnitPrice
          // toggles into the column set, so records from before `columns`
          // existed load with the switches they were saved with.
          setLineColumns(parseInvoiceTemplateConfig(inv).columns);
          setNotes(inv.notes || "");
          // Read from the invoice record, which holds the shared copy. All
          // three are written together, so any of them would do.
          setPayment({
            bankName: inv.bankName || "",
            sortCode: inv.sortCode || "",
            accountNumber: inv.accountNumber || "",
            iban: inv.iban || "",
            bic: inv.bic || "",
            contactEmail: inv.contactEmail || "",
            contactPhone: inv.contactPhone || "",
          });
        } else {
          setLogo(localStorage.getItem("invoiceLogo") || null); setBrandColor(localStorage.getItem("invoiceBrandColor") || "#2563eb"); setFont(localStorage.getItem("invoiceFont") || "sans"); setCompanyAddress(localStorage.getItem("invoiceCompanyAddress") || ""); setVatNumber(localStorage.getItem("invoiceVatNumber") || ""); setRegNumber(localStorage.getItem("invoiceRegNumber") || ""); setPaperSize(localStorage.getItem("invoicePaperSize") || "a4"); setShowTax(localStorage.getItem("invoiceShowTax") !== "false"); setShowShipping(localStorage.getItem("invoiceShowShipping") !== "false"); setNotes(localStorage.getItem("invoiceNotes") || "");
          // The pre-database fallback only ever stored the unit-price toggle;
          // the parser turns it into the column set the same way it does for a
          // saved record.
          setLineColumns(
            parseInvoiceTemplateConfig({
              showUnitPrice: localStorage.getItem("invoiceShowUnitPrice") !== "false",
            }).columns,
          );
          const savedTheme = localStorage.getItem("invoiceTheme");
          const invTheme = isInvoiceTemplateId(savedTheme) ? savedTheme : "professional";
          const invColors = getInvoiceTemplateColors(invTheme);
          setTheme(invTheme);
          setSecondaryColor(localStorage.getItem("invoiceSecondaryColor") || invColors[1]);
          setTertiaryColor(localStorage.getItem("invoiceTertiaryColor") || invColors[2]);
          setTextColor(localStorage.getItem("invoiceTextColor") || getInvoiceTemplateTextColor(invTheme));
        }

        // 🏢 2. FETCH CREDIT NOTE PROFILE
        const cn = (await fetchDocumentBrandingDB(activeOrgId, "credit_note")) as any;
        if (cn) {
          const cnSavedTheme = isInvoiceTemplateId(cn.theme) ? cn.theme : "professional";
          const cnColors = getInvoiceTemplateColors(cnSavedTheme);
          setCnLogo(cn.logo || null); persistedLogos.current.creditNote = cn.logo || null; setCnBrandColor(cn.brandColor || "#f97316"); setCnFont(cn.font || "sans");
          setCnSecondaryColor(cn.secondaryColor || cnColors[1]); setCnTertiaryColor(cn.tertiaryColor || cnColors[2]);
          setCnTextColor(cn.textColor || getInvoiceTemplateTextColor(cnSavedTheme));
          setCnCompanyAddress(cn.companyAddress || ""); setCnVatNumber(cn.vatNumber || ""); setCnRegNumber(cn.regNumber || "");
          setCnShowCustomerRegNumber(cn.showCustomerRegNumber !== false);
          setCnPaperSize(cn.paperSize || "a4"); setCnNotes(cn.notes || "");
          setCnTheme(cnSavedTheme);
        } else {
          setCnLogo(localStorage.getItem("creditNoteLogo") || null); setCnBrandColor(localStorage.getItem("creditNoteBrandColor") || "#f97316"); setCnFont(localStorage.getItem("creditNoteFont") || "sans"); setCnCompanyAddress(localStorage.getItem("creditNoteCompanyAddress") || ""); setCnVatNumber(localStorage.getItem("creditNoteVatNumber") || ""); setCnRegNumber(localStorage.getItem("creditNoteRegNumber") || ""); setCnPaperSize(localStorage.getItem("creditNotePaperSize") || "a4"); setCnNotes(localStorage.getItem("creditNoteNotes") || "");
          const savedTheme = localStorage.getItem("creditNoteTheme");
          const cnSavedTheme = isInvoiceTemplateId(savedTheme) ? savedTheme : "professional";
          const cnColors = getInvoiceTemplateColors(cnSavedTheme);
          setCnTheme(cnSavedTheme);
          setCnSecondaryColor(localStorage.getItem("creditNoteSecondaryColor") || cnColors[1]);
          setCnTertiaryColor(localStorage.getItem("creditNoteTertiaryColor") || cnColors[2]);
          setCnTextColor(localStorage.getItem("creditNoteTextColor") || getInvoiceTemplateTextColor(cnSavedTheme));
        }

        // 🏢 3. FETCH QUOTE PROFILE
        const q = (await fetchDocumentBrandingDB(activeOrgId, "quote")) as any;
        if (q) {
          const qSavedTheme = isInvoiceTemplateId(q.theme) ? q.theme : "professional";
          const qColors = getInvoiceTemplateColors(qSavedTheme);
          setQLogo(q.logo || null); persistedLogos.current.quote = q.logo || null; setQBrandColor(q.brandColor || "#4f46e5"); setQFont(q.font || "sans");
          setQSecondaryColor(q.secondaryColor || qColors[1]); setQTertiaryColor(q.tertiaryColor || qColors[2]);
          setQTextColor(q.textColor || getInvoiceTemplateTextColor(qSavedTheme));
          setQCompanyAddress(q.companyAddress || ""); setQVatNumber(q.vatNumber || ""); setQRegNumber(q.regNumber || "");
          setQShowCustomerRegNumber(q.showCustomerRegNumber !== false);
          setQPaperSize(q.paperSize || "a4"); setQNotes(q.notes || "");
          setQTheme(qSavedTheme);
        } else {
          setQLogo(localStorage.getItem("quoteLogo") || null); setQBrandColor(localStorage.getItem("quoteBrandColor") || "#4f46e5"); setQFont(localStorage.getItem("quoteFont") || "sans"); setQCompanyAddress(localStorage.getItem("quoteCompanyAddress") || ""); setQVatNumber(localStorage.getItem("quoteVatNumber") || ""); setQRegNumber(localStorage.getItem("quoteRegNumber") || ""); setQPaperSize(localStorage.getItem("quotePaperSize") || "a4"); setQNotes(localStorage.getItem("quoteNotes") || "");
          const savedTheme = localStorage.getItem("quoteTheme");
          const qSavedTheme = isInvoiceTemplateId(savedTheme) ? savedTheme : "professional";
          const qColors = getInvoiceTemplateColors(qSavedTheme);
          setQTheme(qSavedTheme);
          setQSecondaryColor(localStorage.getItem("quoteSecondaryColor") || qColors[1]);
          setQTertiaryColor(localStorage.getItem("quoteTertiaryColor") || qColors[2]);
          setQTextColor(localStorage.getItem("quoteTextColor") || getInvoiceTemplateTextColor(qSavedTheme));
        }
      } catch (err) {
        console.error("Error matching workspace branding data profile maps", err);
      } finally {
        setFetching(false);
      }
    }
    loadAllTemplates();
  }, [activeOrgId]);

  const handleSyncAll = () => {
    if (!confirm("Sync this logo, color, font, and company address to all other document types?")) return;
    
    const curLogo = activeTab === "invoice" ? logo : activeTab === "credit_note" ? cnLogo : qLogo;
    const curColor = activeTab === "invoice" ? brandColor : activeTab === "credit_note" ? cnBrandColor : qBrandColor;
    const curSecondaryColor = activeTab === "invoice" ? secondaryColor : activeTab === "credit_note" ? cnSecondaryColor : qSecondaryColor;
    const curTertiaryColor = activeTab === "invoice" ? tertiaryColor : activeTab === "credit_note" ? cnTertiaryColor : qTertiaryColor;
    const curTextColor = activeTab === "invoice" ? textColor : activeTab === "credit_note" ? cnTextColor : qTextColor;
    const curFont = activeTab === "invoice" ? font : activeTab === "credit_note" ? cnFont : qFont;
    const curAddr = activeTab === "invoice" ? companyAddress : activeTab === "credit_note" ? cnCompanyAddress : qCompanyAddress;
    const curVat = activeTab === "invoice" ? vatNumber : activeTab === "credit_note" ? cnVatNumber : qVatNumber;
    const curReg = activeTab === "invoice" ? regNumber : activeTab === "credit_note" ? cnRegNumber : qRegNumber;
    const curShowCustomerRegNumber = activeTab === "invoice" ? showCustomerRegNumber : activeTab === "credit_note" ? cnShowCustomerRegNumber : qShowCustomerRegNumber;
    const curTheme = activeTab === "invoice" ? theme : activeTab === "credit_note" ? cnTheme : qTheme;

    setLogo(curLogo); setCnLogo(curLogo); setQLogo(curLogo);
    setBrandColor(curColor); setCnBrandColor(curColor); setQBrandColor(curColor);
    setSecondaryColor(curSecondaryColor); setCnSecondaryColor(curSecondaryColor); setQSecondaryColor(curSecondaryColor);
    setTertiaryColor(curTertiaryColor); setCnTertiaryColor(curTertiaryColor); setQTertiaryColor(curTertiaryColor);
    setTextColor(curTextColor); setCnTextColor(curTextColor); setQTextColor(curTextColor);
    setFont(curFont); setCnFont(curFont); setQFont(curFont);
    setCompanyAddress(curAddr); setCnCompanyAddress(curAddr); setQCompanyAddress(curAddr);
    setVatNumber(curVat); setCnVatNumber(curVat); setQVatNumber(curVat);
    setRegNumber(curReg); setCnRegNumber(curReg); setQRegNumber(curReg);
    setShowCustomerRegNumber(curShowCustomerRegNumber); setCnShowCustomerRegNumber(curShowCustomerRegNumber); setQShowCustomerRegNumber(curShowCustomerRegNumber);
    setTheme(curTheme); setCnTheme(curTheme); setQTheme(curTheme);

    toast.success("Design & Details synced! Click 'Save Template Settings' to confirm.");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared first so picking the same file again after a rejection still
    // fires a change event.
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readLogoFile(file);
      if (activeTab === "invoice") setLogo(dataUrl);
      else if (activeTab === "credit_note") setCnLogo(dataUrl);
      else setQLogo(dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  /* Same reader and limits as the logo — a stamp or signature scan is the same
     kind of small image, and one set of rules is one message to learn. */
  const handleSignatureAssetUpload = (kind: "stamp" | "signature") =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const dataUrl = await readLogoFile(file);
        if (kind === "stamp") setStampUrl(dataUrl);
        else setSignatureUrl(dataUrl);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That file could not be read.");
      }
    };

 const supabase = createClient();

  // 🚀 Converts base64 image hashes back to real files and posts to your custom bucket
  const uploadLogoToStorage = async (base64Data: string | null, prefix: string) => {
    if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;

    try {
      const response = await fetch(base64Data);
      const blob = await response.blob();
      const fileExt = blob.type.split('/')[1] || 'png';
      const fileName = `workspace-${activeOrgId}-${prefix}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('workspace_assets') // 🚀 Points to your custom policy bucket!
        .upload(filePath, blob, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('workspace_assets')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error(`Failed to upload ${prefix} logo:`, error);
      return base64Data;
    }
  };

  const handleSave = async () => {
    if (!activeOrgId) {
      toast.error("Active organization context is missing.");
      return;
    }
    setLoading(true);
    try {
      // 🚀 1. Run the storage uploads sequentially to secure valid static layout URLs
      const finalInvoiceLogo = await uploadLogoToStorage(logo, 'invoice');
      const finalCnLogo = await uploadLogoToStorage(cnLogo, 'credit_note');
      const finalQuoteLogo = await uploadLogoToStorage(qLogo, 'quote');
      const finalStampUrl = await uploadLogoToStorage(stampUrl, 'stamp');
      const finalSignatureUrl = await uploadLogoToStorage(signatureUrl, 'signature');

      /* One shared copy, written into all three records like the payment
         details — a business has one stamp and one authorised signature. */
      const signatureBlockFields = {
        stampUrl: finalStampUrl,
        signatureUrl: finalSignatureUrl,
        signatureName,
        showStamp,
        showSignature,
        signaturePosition,
      };

      // 🚀 2. Persist Invoice Profile Data
      await saveDocumentBrandingDB(activeOrgId, "invoice", {
        logo: finalInvoiceLogo, brandColor, secondaryColor, tertiaryColor, textColor, font, companyAddress, vatNumber, regNumber, showCustomerRegNumber, paperSize, showTax, showShipping, showUnitPrice, notes, footer: RETIRED_FOOTER, theme, ...payment, logoInitials, logoPosition, preparedBy, lineDetail, showLineDate, columns: lineColumns, ...signatureBlockFields
      });

      // 🚀 3. Persist Credit Note Profile Data
      await saveDocumentBrandingDB(activeOrgId, "credit_note", {
        logo: finalCnLogo, brandColor: cnBrandColor, secondaryColor: cnSecondaryColor, tertiaryColor: cnTertiaryColor, textColor: cnTextColor, font: cnFont, companyAddress: cnCompanyAddress, vatNumber: cnVatNumber, regNumber: cnRegNumber, showCustomerRegNumber: cnShowCustomerRegNumber, paperSize: cnPaperSize, notes: cnNotes, footer: RETIRED_FOOTER, theme: cnTheme, ...payment, logoInitials, logoPosition, preparedBy, lineDetail, showLineDate, columns: lineColumns, ...signatureBlockFields
      });

      // 🚀 4. Persist Quote Profile Data
      await saveDocumentBrandingDB(activeOrgId, "quote", {
        logo: finalQuoteLogo, brandColor: qBrandColor, secondaryColor: qSecondaryColor, tertiaryColor: qTertiaryColor, textColor: qTextColor, font: qFont, companyAddress: qCompanyAddress, vatNumber: qVatNumber, regNumber: qRegNumber, showCustomerRegNumber: qShowCustomerRegNumber, paperSize: qPaperSize, notes: qNotes, footer: RETIRED_FOOTER, theme: qTheme, ...payment, logoInitials, logoPosition, preparedBy, lineDetail, showLineDate, columns: lineColumns, ...signatureBlockFields
      });

      // 🚀 5. Update state pointers to public paths so subsequent clicks don't re-trigger an upload
      if (finalInvoiceLogo) setLogo(finalInvoiceLogo);
      if (finalCnLogo) setCnLogo(finalCnLogo);
      if (finalQuoteLogo) setQLogo(finalQuoteLogo);
      if (finalStampUrl) setStampUrl(finalStampUrl);
      if (finalSignatureUrl) setSignatureUrl(finalSignatureUrl);

      /* The three rows now point at the new files, so whatever they pointed at
         before is unreachable. Collected into one call rather than three: the
         same image is often set on all three templates, and one delete of a
         deduplicated list beats three that race each other over one path.
         Deliberately after the save, and non-blocking — this is tidy-up, and
         the templates are stored either way. */
      const superseded = [
        [persistedLogos.current.invoice, finalInvoiceLogo] as const,
        [persistedLogos.current.creditNote, finalCnLogo] as const,
        [persistedLogos.current.quote, finalQuoteLogo] as const,
        [persistedSignatureAssets.current.stamp, finalStampUrl] as const,
        [persistedSignatureAssets.current.signature, finalSignatureUrl] as const,
      ]
        .filter(([was, now]) => was && was !== now)
        .map(([was]) => was);

      const stillUsed = new Set([
        finalInvoiceLogo,
        finalCnLogo,
        finalQuoteLogo,
        finalStampUrl,
        finalSignatureUrl,
      ]);
      const removable = superseded.filter((url) => !stillUsed.has(url));
      if (removable.length > 0) void deleteWorkspaceLogos(removable);

      persistedLogos.current = {
        invoice: finalInvoiceLogo ?? null,
        creditNote: finalCnLogo ?? null,
        quote: finalQuoteLogo ?? null,
      };
      persistedSignatureAssets.current = {
        stamp: finalStampUrl ?? null,
        signature: finalSignatureUrl ?? null,
      };

      toast.success("Template settings saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to synchronize layout templates to database configuration state.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    const targetName = activeTab === "invoice" ? "Invoice" : activeTab === "credit_note" ? "Credit Note" : "Quote";
    if (confirm(`Are you sure you want to clear all customization fields for the current ${targetName} template?`)) {
      if (activeTab === "invoice") {
        setLogo(null); setBrandColor(DEFAULT_TEMPLATE_COLORS[0]); setSecondaryColor(DEFAULT_TEMPLATE_COLORS[1]); setTertiaryColor(DEFAULT_TEMPLATE_COLORS[2]); setTextColor(DEFAULT_TEMPLATE_TEXT_COLOR); setFont("sans"); setCompanyAddress(""); setVatNumber(""); setRegNumber(""); setShowCustomerRegNumber(true); setPaperSize("a4"); setShowTax(true); setShowShipping(true); setLineColumns(DEFAULT_INVOICE_TEMPLATE_CONFIG.columns); setNotes(""); setTheme("professional");
        setPayment({ bankName: "", sortCode: "", accountNumber: "", iban: "", bic: "", contactEmail: "", contactPhone: "" });
        setLogoInitials(""); setPreparedBy("");
        setStampUrl(null); setSignatureUrl(null); setSignatureName("");
        setShowStamp(true); setShowSignature(true); setSignaturePosition("right");
      } else if (activeTab === "credit_note") {
        setCnLogo(null); setCnBrandColor(DEFAULT_TEMPLATE_COLORS[0]); setCnSecondaryColor(DEFAULT_TEMPLATE_COLORS[1]); setCnTertiaryColor(DEFAULT_TEMPLATE_COLORS[2]); setCnTextColor(DEFAULT_TEMPLATE_TEXT_COLOR); setCnFont("sans"); setCnCompanyAddress(""); setCnVatNumber(""); setCnRegNumber(""); setCnShowCustomerRegNumber(true); setCnPaperSize("a4"); setCnNotes(""); setCnTheme("professional");
      } else {
        setQLogo(null); setQBrandColor(DEFAULT_TEMPLATE_COLORS[0]); setQSecondaryColor(DEFAULT_TEMPLATE_COLORS[1]); setQTertiaryColor(DEFAULT_TEMPLATE_COLORS[2]); setQTextColor(DEFAULT_TEMPLATE_TEXT_COLOR); setQFont("sans"); setQCompanyAddress(""); setQVatNumber(""); setQRegNumber(""); setQShowCustomerRegNumber(true); setQPaperSize("a4"); setQNotes(""); setQTheme("professional");
      }
      toast.info(`Current ${targetName} workspace fields have been reset.`);
    }
  };

  const currentLogo = activeTab === "invoice" ? logo : activeTab === "credit_note" ? cnLogo : qLogo;
  const currentBrandColor = activeTab === "invoice" ? brandColor : activeTab === "credit_note" ? cnBrandColor : qBrandColor;
  const currentSecondaryColor = activeTab === "invoice" ? secondaryColor : activeTab === "credit_note" ? cnSecondaryColor : qSecondaryColor;
  const currentTertiaryColor = activeTab === "invoice" ? tertiaryColor : activeTab === "credit_note" ? cnTertiaryColor : qTertiaryColor;
  const currentTextColor = activeTab === "invoice" ? textColor : activeTab === "credit_note" ? cnTextColor : qTextColor;
  const currentPalette: [string, string, string] = [
    currentBrandColor,
    currentSecondaryColor,
    currentTertiaryColor,
  ];
  const currentFont = activeTab === "invoice" ? font : activeTab === "credit_note" ? cnFont : qFont;
  /*
   * The older toggle fields, derived from the column set.
   *
   * `columns` is what this screen edits and what the print document reads, but
   * the record still carries `lineDetail`, `showLineDate` and `showUnitPrice`
   * for anything that only reads those — so they are kept in step here rather
   * than allowed to contradict the columns saved beside them. Empty lineDetail
   * means "none": the table then carries description and amounts only.
   */
  const lineDetail =
    (["reference", "category", "location"] as const)
      .filter((detail) => lineColumns[detail].show)
      .join(",") || "none";
  const showLineDate = lineColumns.date.show;
  const showUnitPrice = lineColumns.unitPrice.show;

  const currentAddress = activeTab === "invoice" ? companyAddress : activeTab === "credit_note" ? cnCompanyAddress : qCompanyAddress;

  /*
   * Two inputs over one stored value.
   *
   * The address prints as separate lines and is stored as a single newline
   * separated string, so it is split for editing and rejoined on change rather
   * than migrated into two columns. Anything already saved with more than two
   * lines keeps its remainder, which is why the tail is preserved.
   */
  const addressLines = currentAddress.split(NEWLINE);
  const addressLine1 = addressLines[0] ?? "";
  const addressCity = addressLines[1] ?? "";

  const setAddressPart = (index: 0 | 1, value: string) => {
    const next = [...addressLines];
    while (next.length < 2) next.push("");
    next[index] = value;
    const joined = next.join(NEWLINE).replace(/\n+$/, "");
    if (activeTab === "invoice") setCompanyAddress(joined);
    else if (activeTab === "credit_note") setCnCompanyAddress(joined);
    else setQCompanyAddress(joined);
  };
  const currentVat = activeTab === "invoice" ? vatNumber : activeTab === "credit_note" ? cnVatNumber : qVatNumber;
  const currentReg = activeTab === "invoice" ? regNumber : activeTab === "credit_note" ? cnRegNumber : qRegNumber;
  const currentShowCustomerRegNumber = activeTab === "invoice" ? showCustomerRegNumber : activeTab === "credit_note" ? cnShowCustomerRegNumber : qShowCustomerRegNumber;
  const setCurrentShowCustomerRegNumber = (checked: boolean) => {
    if (activeTab === "invoice") setShowCustomerRegNumber(checked);
    else if (activeTab === "credit_note") setCnShowCustomerRegNumber(checked);
    else setQShowCustomerRegNumber(checked);
  };
  const currentPaperSize = activeTab === "invoice" ? paperSize : activeTab === "credit_note" ? cnPaperSize : qPaperSize;

  const currentTheme = activeTab === "invoice" ? theme : activeTab === "credit_note" ? cnTheme : qTheme;
  const currentNotes = activeTab === "invoice" ? notes : activeTab === "credit_note" ? cnNotes : qNotes;

  const setCurrentPaletteColor = (slot: 0 | 1 | 2, value: string) => {
    if (activeTab === "invoice") {
      if (slot === 0) setBrandColor(value);
      else if (slot === 1) setSecondaryColor(value);
      else setTertiaryColor(value);
    } else if (activeTab === "credit_note") {
      if (slot === 0) setCnBrandColor(value);
      else if (slot === 1) setCnSecondaryColor(value);
      else setCnTertiaryColor(value);
    } else {
      if (slot === 0) setQBrandColor(value);
      else if (slot === 1) setQSecondaryColor(value);
      else setQTertiaryColor(value);
    }
  };

  const setCurrentTextColor = (value: string) => {
    if (activeTab === "invoice") setTextColor(value);
    else if (activeTab === "credit_note") setCnTextColor(value);
    else setQTextColor(value);
  };

  const selectTheme = (nextTheme: InvoiceTemplateId) => {
    const [primary, secondary, tertiary] = getInvoiceTemplateColors(nextTheme);
    const nextTextColor = getInvoiceTemplateTextColor(nextTheme);
    if (activeTab === "invoice") {
      setTheme(nextTheme); setBrandColor(primary); setSecondaryColor(secondary); setTertiaryColor(tertiary); setTextColor(nextTextColor);
    } else if (activeTab === "credit_note") {
      setCnTheme(nextTheme); setCnBrandColor(primary); setCnSecondaryColor(secondary); setCnTertiaryColor(tertiary); setCnTextColor(nextTextColor);
    } else {
      setQTheme(nextTheme); setQBrandColor(primary); setQSecondaryColor(secondary); setQTertiaryColor(tertiary); setQTextColor(nextTextColor);
    }
  };
  const workspaceName = workspaceIdentity?.name?.trim() || "Your company";
  const workspaceCurrency = workspaceIdentity?.baseCurrency || "GBP"; // currency:allow last-resort default while the workspace identity loads
  const workspaceDateFormat = workspaceIdentity?.dateFormat || "YYYY-MM-DD";
  const previewDocumentLabel = activeTab === "invoice" ? "Invoice" : activeTab === "credit_note" ? "Credit note" : "Quote";
  const previewSubtotalMinor = activeTab === "credit_note" ? 35000 : 120000;
  const previewShippingMinor = activeTab === "invoice" ? 15000 : 0;
  const previewTaxMinor = activeTab === "invoice" && showTax ? 24000 : 0;
  const previewInvoice: PrintableInvoice = {
    id: activeTab === "invoice" ? "INV-004381" : activeTab === "credit_note" ? "CN-001092" : "QTE-007421",
    invoiceNo: activeTab === "invoice" ? "INV-004381" : activeTab === "credit_note" ? "CN-001092" : "QTE-007421",
    status: activeTab === "credit_note" ? "issued" : activeTab === "quote" ? "draft" : "approved",
    issueDate: "2026-05-18",
    dueDate: activeTab === "credit_note" ? null : "2026-06-17",
    currency: workspaceCurrency,
    contactName: "Acme Corporation",
    contactRegistrationNumber: "12345678",
    billingAddress: "123 Client Street\nTech District, London",
    paymentTermsDays: 30,
    poNumber: activeTab === "quote" ? "PO-PENDING" : "PO-004381",
    reference: activeTab === "credit_note" ? "INV-987028" : "REF-004381",
    subtotalMinor: previewSubtotalMinor + previewShippingMinor,
    discountMinor: 0,
    taxMinor: previewTaxMinor,
    totalMinor: previewSubtotalMinor + previewShippingMinor + previewTaxMinor,
    amountPaidMinor: 0,
    lines: [
      {
        id: "preview-line",
        description:
          activeTab === "credit_note"
            ? "Account adjustment / value credit"
            : activeTab === "quote"
              ? "Strategic integration architecture scope"
              : "Premium SaaS development service",
        accountCode: activeTab === "credit_note" ? "ADJ-001" : "SRV-001",
        accountName: activeTab === "credit_note" ? "Adjustments" : "Services",
        quantity: 1,
        unitPriceMinor: previewSubtotalMinor,
        subtotalMinor: previewSubtotalMinor,
        totalMinor: previewSubtotalMinor,
      },
      ...(previewShippingMinor
        ? [
            {
              id: "preview-shipping",
              description: "Shipping",
              accountCode: "SHIP-001",
              accountName: "Delivery",
              quantity: 1,
              unitPriceMinor: previewShippingMinor,
              subtotalMinor: previewShippingMinor,
              totalMinor: previewShippingMinor,
            },
          ]
        : []),
    ],
    organization: {
      name: workspaceName,
      dateFormat: workspaceDateFormat,
      vatRegistrationNo: currentVat || workspaceIdentity?.vatRegistrationNo || null,
      companyNumber: currentReg || workspaceIdentity?.companyNumber || null,
    },
  };
  const previewConfig = parseInvoiceTemplateConfig({
    theme: currentTheme,
    logo: currentLogo,
    brandColor: currentBrandColor,
    secondaryColor: currentSecondaryColor,
    tertiaryColor: currentTertiaryColor,
    textColor: currentTextColor,
    font: currentFont,
    companyAddress: currentAddress,
    vatNumber: currentVat,
    regNumber: currentReg,
    showCustomerRegNumber: currentShowCustomerRegNumber,
    paperSize: currentPaperSize,
    logoPosition,
    stampUrl,
    signatureUrl,
    signatureName,
    showStamp,
    showSignature,
    signaturePosition,
    showTax: activeTab === "invoice" ? showTax : false,
    showShipping: activeTab === "invoice" ? showShipping : false,
    showUnitPrice: activeTab === "invoice" ? showUnitPrice : true,
    showLineDate,
    lineDetail,
    // Only the invoice tab edits columns; the other previews keep deriving
    // theirs from the legacy fields above, exactly as their print flows do.
    columns: activeTab === "invoice" ? lineColumns : undefined,
    // Was hardcoded to the workspace name, so the "Prepared by" line on every
    // document named the company rather than the person who raised it.
    preparedBy: preparedBy || workspaceName,
    logoInitials,
    notes:
      currentNotes ||
      "Thank you for your business.\nPlease quote the document number on all payments.",
    footer: RETIRED_FOOTER,
    ...payment,
  });

  const renderPreviewPanel = ({ collapsible = false }: { collapsible?: boolean } = {}) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-slate-700">
          <Eye className="size-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            {activeTab === "invoice"
              ? "Live Invoice Preview"
              : activeTab === "credit_note"
                ? "Live Credit Note Preview"
                : "Live Quote Preview"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {collapsible ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setIsPreviewCollapsed(true)}
              className="h-6 w-6 rounded-full p-0 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
              aria-label="Minimize live preview"
              title="Minimize live preview"
            >
              <PanelRightClose className="size-3.5" />
            </Button>
          ) : null}
          <span className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-600">
            {currentPaperSize}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(true)}
            className="h-6 w-6 rounded-full p-0 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
          >
            <Maximize className="size-3.5" />
          </Button>
        </div>
      </div>
      <PreviewCanvas
        invoice={previewInvoice}
        config={previewConfig}
        documentLabel={previewDocumentLabel}
        previewHighlight={focusedField}
        // The rail measures and scales to fit; everywhere else renders at the
        // size CSS gives it, which is the version that cannot come out blank.
        natural={!collapsible}
        onOpen={() => setIsFullscreen(true)}
      />
    </div>
  );

  // Placed after every hook so the hook order stays stable across renders.
  if (fetching) return <InvoiceSettingsSkeleton />;

  return (
    <>
      {/* 🚀 FULLSCREEN PREVIEW MODAL (PORTALED TO BODY) */}
      {mounted && createPortal(
        <AnimatePresence>
          {isFullscreen && (
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={`Fullscreen ${previewDocumentLabel} preview`}
            >
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={() => setIsFullscreen(false)}
              />
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="relative w-full max-w-5xl max-h-[90vh] bg-slate-100 rounded-3xl flex flex-col overflow-hidden shadow-2xl"
              >
               <div className="flex justify-between items-center p-4 px-6 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3">
                  <Eye className="size-5 text-blue-600" />
                  <h3 className="font-bold text-slate-800 text-lg">Fullscreen Document Preview</h3>
                </div>
                <div className="ml-auto mr-2 flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => zoomFullscreenBy(-0.2)} disabled={fullscreenZoom <= 0.6} className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Zoom out" title="Zoom out">
                    <ZoomOut className="size-4" />
                  </Button>
                  <span className="w-11 text-center font-mono text-xs font-bold text-slate-500">
                    {Math.round(fullscreenZoom * 100)}%
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => zoomFullscreenBy(0.2)} disabled={fullscreenZoom >= 2} className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Zoom in" title="Zoom in">
                    <ZoomIn className="size-4" />
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => setIsFullscreen(false)} className="h-10 w-10 p-0 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900">
                  <X className="size-5" />
                </Button>
              </div>
              {/* Scrolls rather than clipping. It measured its own height to
                  scale the document to fit, and that height is zero on the
                  modal's first frame because it animates in — so the fit came
                  out at nothing and the modal opened empty. */}
              <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-slate-500/5">
                <div
                  style={{
                    transform: `scale(${fullscreenZoom})`,
                    transformOrigin: "top center",
                    transition: "transform 160ms ease",
                  }}
                >
                  <PreviewCanvas
                    invoice={previewInvoice}
                    config={previewConfig}
                    documentLabel={previewDocumentLabel}
                    previewHighlight={focusedField}
                    natural
                  />
                </div>
              </div>
            </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {mounted &&
        createPortal(
          <motion.aside
            layout
            layoutDependency={isPreviewCollapsed}
            transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
            className={cn(
              settingsStyles.desktopPreviewRail,
              isPreviewCollapsed && settingsStyles.desktopPreviewRailCollapsed,
            )}
            aria-label={`${previewDocumentLabel} preview`}
          >
            <AnimatePresence initial={false} mode="wait">
              {isPreviewCollapsed ? (
                <motion.div
                  key="collapsed-preview"
                  initial={{ opacity: 0, x: 16, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 16, scale: 0.92 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsPreviewCollapsed(false)}
                    className={settingsStyles.previewRestoreButton}
                    aria-label={`Restore ${previewDocumentLabel} preview`}
                    title={`Restore ${previewDocumentLabel} preview`}
                  >
                    <PanelRightOpen className="size-4" />
                    <span>Preview</span>
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="expanded-preview"
                  initial={{ opacity: 0, x: 24, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.98 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                >
                  {renderPreviewPanel({ collapsible: true })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>,
          document.body,
        )}

      <div className="w-full space-y-6 pb-16">
        
        {/* HEADER SECTION */}
        {!hideChrome && (
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                Document Template Workspace
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Configure isolated branding backgrounds, legal declarations, and line layouts for sales documents.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start shrink-0 shadow-sm max-w-full overflow-x-auto whitespace-nowrap scrollbar-none">
              <button
                onClick={() => setActiveTab("invoice")}
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider flex items-center gap-2",
                  activeTab === "invoice" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <FileText className="size-3.5" />
                <span>Invoice</span>
              </button>
              <button
                onClick={() => setActiveTab("credit_note")}
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider flex items-center gap-2",
                  activeTab === "credit_note" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Receipt className="size-3.5" />
                <span>Credit Note</span>
              </button>
              <button
                onClick={() => setActiveTab("quote")}
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider flex items-center gap-2",
                  activeTab === "quote" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Sliders className="size-3.5" />
                <span>Quote / Estimate</span>
              </button>
            </div>
          </div>
        )}

        {/* DASHBOARD WORKSPACE GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Animates on the toggle, and only on the toggle.
              A plain `layout` fires on any box change, so every tick of a window
              resize set the whole column bouncing. `layoutDependency` tells
              Framer to recalculate the animation only when the value named here
              changes — collapsing or expanding does, resizing does not.

              Eased rather than sprung: this is a panel opening out, like a video
              going theatre mode, and a spring on something this large reads as a
              wobble rather than as weight. */}
          <motion.div
            layout
            layoutDependency={isPreviewCollapsed}
            transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
            className={cn(
              "space-y-6 transition-[grid-column] duration-300",
              isPreviewCollapsed
                ? "xl:col-span-12 xl:pr-16"
                : "xl:col-span-12 xl:pr-[calc(var(--doc-preview-rail)+var(--doc-preview-gutter))]",
            )}
          >
            
            {/* EMBLEM LOGO */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {activeTab === "invoice" ? "Invoice Logo Emblem" : activeTab === "credit_note" ? "Credit Note Logo Emblem" : "Quote Logo Emblem"}
                  </h2>
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden relative">
                    {currentLogo ? (
                      // User-uploaded data/blob URLs are intentionally previewed directly.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={currentLogo} alt="Logo Emblem" className="object-contain w-full h-full p-1" />
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No Emblem</span>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-sm text-slate-600">Upload an emblem specific to this template layout block.</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="relative h-8 gap-2 text-xs font-bold text-slate-700 bg-white border-slate-200 shadow-sm">
                        <Upload className="size-3" /> Upload Image
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      </Button>
                      {currentLogo && (
                        <Button variant="ghost" onClick={() => activeTab === "invoice" ? setLogo(null) : activeTab === "credit_note" ? setCnLogo(null) : setQLogo(null)} className="h-8 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="size-3 mr-1" /> Remove
                        </Button>
                      )}
                    </div>

                    {/* Stated where the file is picked, not left to a toast
                        after the fact. A limit somebody only meets by breaking
                        it is a rejection; a limit they can read first is a
                        rule. */}
                    <p className="mt-2 mb-0 text-xs leading-relaxed text-slate-500">
                      PNG, SVG or JPG, up to {MAX_LOGO_MB} MB. Replacing or removing this emblem
                      deletes the old file when you save.
                    </p>
                  </div>
                </div>

                {/* Under the emblem rather than with the colours: it is a
                    property of the logo, and somebody who has just uploaded one
                    is already looking here. It applies to all six layouts, and
                    to every document type — a business does not want its logo
                    left on the invoice and centred on the credit note. */}
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <LogoPositionField value={logoPosition} onChange={setLogoPosition} theme={currentTheme} />
                </div>
              </div>
            </div>

            {/* STYLING */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-900">Styling Configurations</h2>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
                {[
                  ["Primary", currentBrandColor, "Primary accents and emphasis"],
                  ["Secondary", currentSecondaryColor, "Headers and supporting colour"],
                  ["Highlight", currentTertiaryColor, "Highlights and surface colour"],
                ].map(([label, color, description], index) => (
                  <div key={label} className="min-w-0">
                    <label
                      className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500"
                      title={description}
                    >
                      {label}
                    </label>
                    <div className="flex h-10 min-w-0 items-center gap-2.5">
                      <input
                        type="color"
                        value={color}
                        onChange={(event) => setCurrentPaletteColor(index as 0 | 1 | 2, event.target.value)}
                        className="size-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                        aria-label={`Choose ${label.toLowerCase()} colour`}
                      />
                      <span className="min-w-0 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold uppercase text-slate-600">
                        {color}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="min-w-0">
                  <label
                    className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500"
                    title="Main printable text colour"
                  >
                    Text
                  </label>
                  <div className="flex h-10 min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={currentTextColor}
                      onChange={(event) => setCurrentTextColor(event.target.value)}
                      className="size-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                      aria-label="Choose printable text colour"
                    />
                    <span className="min-w-0 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold uppercase text-slate-600">
                      {currentTextColor}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 lg:col-span-2">
                  <label className="mb-2 block truncate text-xs font-bold uppercase tracking-wider text-slate-500">Typography</label>
                  <select 
                    value={currentFont} 
                    onChange={(e) => {
                      if (activeTab === "invoice") setFont(e.target.value);
                      else if (activeTab === "credit_note") setCnFont(e.target.value);
                      else setQFont(e.target.value);
                    }} 
                    className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none shadow-sm"
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
                    value={currentPaperSize} 
                    onChange={(e) => {
                      if (activeTab === "invoice") setPaperSize(e.target.value);
                      else if (activeTab === "credit_note") setCnPaperSize(e.target.value);
                      else setQPaperSize(e.target.value);
                    }} 
                    className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none shadow-sm"
                  >
                    <option value="a4">A4 Dimension Standard (Global)</option>
                    <option value="letter">Letter Dimension Standard (US)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* OUTPUT TEMPLATE */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Layout className="size-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {activeTab === "invoice" ? "Invoice Layout" : activeTab === "credit_note" ? "Credit Note Layout" : "Quote Layout"}
                  </h2>
                </div>
                <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  Preview + print
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
                {INVOICE_TEMPLATE_OPTIONS.map((option) => {
                  const selected = currentTheme === option.id;
                  const swatches = selected ? currentPalette : option.colors;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectTheme(option.id)}
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
                          <p className="text-sm font-bold text-slate-900">
                            {option.id === "modern" ? "Modern Minimal" : option.name}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                        </div>
                        <span
                          className={cn(
                            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                            selected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-slate-300 bg-white text-transparent",
                          )}
                        >
                          <Check className="size-3" />
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                        {swatches.map((color, index) => (
                          <span key={`${index}-${color}`} className="size-2.5 rounded-full border border-black/10" style={{ background: color }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* YOUR COMPANY.
                Replaces "Statutory Details". The company registration number is gone:
                the print document already prefers the organisation's own
                companyNumber, which the tax profile now fills from Companies House, so
                a second copy here could only ever disagree with it. The company name
                is not here either — it is the workspace name.

                What is left is what genuinely differs from the workspace record: how
                the address should be laid out on a document, the VAT number as it
                should be printed, the initials to show when there is no logo, and who
                prepared it. */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-slate-900">Your Company</h2>
                  </div>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">Sender</span>
                </div>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Address Line 1</label>
                    <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm" placeholder="e.g. 123 Business Road, Suite 100" value={addressLine1} onFocus={() => setFocusedField("address")} onBlur={() => setFocusedField(null)} onChange={(e) => setAddressPart(0, e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">City, Postcode</label>
                    <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm" placeholder="e.g. London, EC1A 1BB" value={addressCity} onFocus={() => setFocusedField("address")} onBlur={() => setFocusedField(null)} onChange={(e) => setAddressPart(1, e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">VAT Registration</label>
                    <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm" placeholder="e.g. GB 123 4567 89" value={currentVat} onFocus={() => setFocusedField("vat")} onBlur={() => setFocusedField(null)} onChange={(e) => activeTab === "invoice" ? setVatNumber(e.target.value) : activeTab === "credit_note" ? setCnVatNumber(e.target.value) : setQVatNumber(e.target.value)} />
                    <p className="mt-1 text-[11px] text-slate-500">Left blank, the number on your tax profile is used.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Prepared By</label>
                    <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm" placeholder="e.g. Jane Smith, ACA" value={preparedBy} onFocus={() => setFocusedField("preparedBy")} onBlur={() => setFocusedField(null)} onChange={(e) => setPreparedBy(e.target.value)} />
                    <p className="mt-1 text-[11px] text-slate-500">Printed on the document. Blank falls back to the company name.</p>
                  </div>
                </div>
                <div className="sm:w-1/2">
                  <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Logo Initials</label>
                  <input type="text" maxLength={3} className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm uppercase" placeholder="e.g. AC" value={logoInitials} onChange={(e) => setLogoInitials(e.target.value.toUpperCase())} />
                  {/* Only ever seen when no logo is uploaded, so say so rather than
                      leaving somebody to wonder why it never appears. */}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Used in place of a logo. {currentLogo ? "A logo is uploaded, so this is not shown." : "No logo uploaded, so this is what prints."}
                  </p>
                </div>
              </div>
            </div>

            {/* STAMP & SIGNATURE.
                Shared across the tabs like the bank details: a business has one
                stamp and one authorised signature, so they are entered once and
                print on invoices, credit notes and quotes alike. The switches
                turn printing off without deleting the uploaded file, and with
                nothing uploaded the document simply carries no block at all. */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stamp className="size-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-slate-900">Stamp &amp; Signature</h2>
                  </div>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">All documents</span>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {([
                    {
                      kind: "stamp" as const,
                      label: "Business Stamp",
                      asset: stampUrl,
                      clear: () => setStampUrl(null),
                      on: showStamp,
                      setOn: setShowStamp,
                      hint: "Printed near the foot of the document at a natural size.",
                    },
                    {
                      kind: "signature" as const,
                      label: "Signature",
                      asset: signatureUrl,
                      clear: () => setSignatureUrl(null),
                      on: showSignature,
                      setOn: setShowSignature,
                      hint: "Printed on a ruled line, with the signatory named beneath it.",
                    },
                  ]).map((tile) => (
                    <div key={tile.kind} className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{tile.label}</span>
                        {/* The switch, not the file, is what "don't print this
                            for now" means — removing would throw the upload
                            away with it. */}
                        <label className="flex cursor-pointer select-none items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${tile.on ? "text-slate-700" : "text-slate-400"}`}>
                            {tile.on ? "Prints" : "Hidden"}
                          </span>
                          <Switch checked={tile.on} onCheckedChange={(checked: boolean) => tile.setOn(checked)} aria-label={`Print the ${tile.label.toLowerCase()}`} />
                        </label>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
                          {tile.asset ? (
                            // User-uploaded data/blob URLs are intentionally previewed directly.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={tile.asset} alt={tile.label} className="h-full w-full object-contain p-1" />
                          ) : (
                            <span className="px-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">None</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" className="relative h-8 gap-2 border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm">
                              <Upload className="size-3" /> Upload
                              <input type="file" accept="image/*" onChange={handleSignatureAssetUpload(tile.kind)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                            </Button>
                            {tile.asset && (
                              <Button variant="ghost" onClick={tile.clear} className="h-8 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700">
                                <Trash2 className="mr-1 size-3" /> Remove
                              </Button>
                            )}
                          </div>
                          <p className="mb-0 mt-2 text-[11px] leading-relaxed text-slate-500">
                            {tile.hint} PNG, SVG or JPG, up to {MAX_LOGO_MB} MB.
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Signatory Name</label>
                    <input
                      type="text"
                      className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none"
                      placeholder="e.g. Jane Smith, Director"
                      value={signatureName}
                      onFocus={() => setFocusedField("signature")}
                      onBlur={() => setFocusedField(null)}
                      onChange={(e) => setSignatureName(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Printed under the signature. Blank leaves just the signed line.</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Position on the Page</p>
                    <div className="flex gap-2">
                      {([
                        { id: "left" as const, label: "Left" },
                        { id: "right" as const, label: "Right" },
                      ]).map((option) => {
                        const active = signaturePosition === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSignaturePosition(option.id)}
                            aria-pressed={active}
                            className={cn(
                              "flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-2 text-[11px] font-bold transition",
                              active
                                ? "border-blue-500 bg-blue-50/70 text-blue-700 shadow-sm"
                                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                            )}
                          >
                            {/* The page in miniature: the filled block is where
                                the stamp & signature land above the footer. */}
                            <svg viewBox="0 0 24 14" className="h-3.5 w-6" aria-hidden="true">
                              <rect x="1" y="1" width="22" height="1.4" rx="0.7" fill={active ? "#93c5fd" : "#cbd5e1"} />
                              <rect x="1" y="4" width="22" height="1.4" rx="0.7" fill={active ? "#93c5fd" : "#cbd5e1"} />
                              <rect x={option.id === "left" ? 1 : 15} y="8" width="8" height="4" rx="1" fill={active ? "#2563eb" : "#94a3b8"} />
                            </svg>
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">Where the block sits above the page footer.</p>
                  </div>
                </div>
                <p className="m-0 text-[11px] leading-relaxed text-slate-500">
                  Used on invoices, credit notes and quotes alike. Nothing uploaded means nothing
                  printed — the document carries no empty signature slot.
                </p>
              </div>
            </div>

            {/* Recipient legal details come from the customer record, which is
                the source of truth. This setting controls presentation only. */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Customer details</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Show the customer&apos;s saved registration number in the Bill to section when one is available.
                  </p>
                </div>
                <Switch
                  checked={currentShowCustomerRegNumber}
                  onCheckedChange={setCurrentShowCustomerRegNumber}
                  aria-label="Show customer registration number"
                  className="mt-0.5 shrink-0"
                />
              </div>
            </div>

            {/* TERMS & CONDITIONS, beside the payment details it belongs with.
                One term per line: the print document splits this on newlines and
                numbers them, so a paragraph here comes out as a single item. The
                field was labelled "Default Notes & Explanations", which is not
                what it has printed as for some time.

                The separate free-text payment box is gone. It existed to hold
                bank details as prose; those are fields now, and everything else
                it carried belongs in these terms. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-slate-900">Payment Instructions</h2>
                  </div>
                </div>
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Bank Name</label>
                      <input {...paymentField("bankName")} placeholder="e.g. Barclays Bank PLC" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Sort Code</label>
                      <input {...paymentField("sortCode")} placeholder="e.g. 20-00-00" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Account Number</label>
                      <input {...paymentField("accountNumber")} placeholder="e.g. 12345678" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">IBAN</label>
                      <input {...paymentField("iban")} placeholder="e.g. GB29 BARC 2000 0012 3456 78" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">BIC / SWIFT</label>
                      <input {...paymentField("bic")} placeholder="e.g. BARCGB22" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Email</label>
                      <input {...paymentField("contactEmail")} type="email" placeholder="e.g. accounts@yourcompany.co.uk" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Phone</label>
                    <input {...paymentField("contactPhone")} placeholder="e.g. +44 (0)20 7946 0958" />
                  </div>
                  {/* Said plainly, because the tabs above change everything else
                      on this screen and somebody would reasonably expect these to
                      follow suit. */}
                  <p className="m-0 text-[11px] leading-relaxed text-slate-500">
                    Used on invoices, credit notes and quotes alike — a business has one bank
                    account, so these are not set per document type.
                  </p>
                </div>
              </div>

              {/* PAYMENT INSTRUCTIONS — shared across all three document types.
                  The print document reads these as its payment rows, and until
                  now there was nowhere to enter them, so a document could only
                  ever carry whatever prose had been typed into the free-text box
                  above. Structured, they can be laid out and labelled properly
                  on the page instead of being a paragraph. */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-slate-900">Terms &amp; Conditions</h2>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Terms (one per line)</label>
                  <textarea
                    onFocus={() => setFocusedField("notes")}
                    onBlur={() => setFocusedField(null)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-sm"
                    rows={8}
                    value={currentNotes}
                    placeholder={TERMS_PLACEHOLDER}
                    onChange={(e) =>
                      activeTab === "invoice"
                        ? setNotes(e.target.value)
                        : activeTab === "credit_note"
                          ? setCnNotes(e.target.value)
                          : setQNotes(e.target.value)
                    }
                  />
                  <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Each line prints as its own numbered term, and a blank line prints as a gap. Set
                    separately for invoices, credit notes and quotes — the tabs above switch between
                    them.
                  </p>
                </div>
              </div>
            </div>


            {/* LINE ITEM COLUMNS.
                One row per column the line table can carry: show/hide plus a
                rename box. This replaces the five per-column switches that used
                to sit in the toggles card below — the column set now also
                drives the invoice entry form, so it earns a card of its own. */}
            {activeTab === "invoice" && (
              <LineItemColumnsCard
                columns={lineColumns}
                onChange={setLineColumn}
                onFocusField={(field) => setFocusedField(field as InvoicePreviewHighlight)}
              />
            )}

            {/* DYNAMIC FIELD TOGGLES */}
            {activeTab === "invoice" && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Layout className="size-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-slate-900">Dynamic Field Layout Toggles</h2>
                  </div>
                </div>
                <div className="p-5 sm:p-6 space-y-3 font-semibold text-slate-700 text-xs tracking-wide">
                  {/* Every layout choice as a switch.
                      Each one turns a whole section on or off on the printed
                      document, which is a setting rather than an item ticked off
                      a list — and a switch shows its state without being read.
                      The per-column switches live in the Line Item Columns card
                      above; what is left here is the VAT and shipping blocks. */}
                  <div className="-mx-5 divide-y divide-slate-100 sm:-mx-6">
                    {[
                      { label: "Tax / VAT breakdown", on: showTax, set: setShowTax, hint: "Per-line VAT and the totals block below the table." },
                      { label: "Shipping & delivery", on: showShipping, set: setShowShipping, hint: "A shipping line and its own total row." },
                    ].map((row) => (
                      <label
                        key={row.label}
                        className="flex cursor-pointer select-none items-start justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50/60 sm:px-6"
                      >
                        <span className="min-w-0">
                          <span className={`block text-xs font-bold ${row.on ? "text-slate-900" : "text-slate-500"}`}>
                            {row.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-slate-500">
                            {row.hint}
                          </span>
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
                </div>
              </div>
            )}

            {/* The additional-charges catalogue is managed inline in invoice
                creation (the charge editor's "Save for reuse"), so it no
                longer needs a settings card here. */}

            {/* ACTION BUTTON CONTROLS HUB */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pt-2">
              <Button variant="outline" type="button" onClick={handleSyncAll} className="w-full sm:w-auto h-9 px-4 text-xs font-bold text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-all">
                Copy Details to All Tabs
              </Button>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button variant="outline" type="button" className="w-full sm:w-auto h-9 px-4 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 bg-white border-slate-200 shadow-sm transition-all" onClick={handleReset} disabled={loading}>
                  Clear Current Tab
                </Button>
                <Button className="w-full sm:w-auto h-9 gap-2 bg-blue-600 px-6 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-colors" onClick={handleSave} disabled={loading}>
                  <Save className="size-4 shrink-0" />
                  {loading ? "Saving..." : "Save Template Settings"}
                </Button>
              </div>
            </div>
          </motion.div>

          {/* ─── RIGHT SIDEBAR PANEL: LIVE PREVIEW ─── */}
          <div className="xl:col-span-5 xl:hidden">
            {renderPreviewPanel()}
          </div>

        </div>

      </div>
    </>
  );
}
