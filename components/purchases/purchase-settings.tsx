"use client";

import { useCurrency } from "@/components/currency-provider";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { PURCHASE_SETTINGS_DEFAULTS } from "@/lib/accounting/purchase-defaults";
import { LogoPositionField, type LogoPosition } from "@/components/sales/document-templates/shared/document-settings-sections";
import React, { useState, useEffect, useRef, startTransition } from "react";
import { MAX_LOGO_MB, readLogoFile } from "@/lib/workspace-logo";
import { deleteWorkspaceLogos } from "@/app/(dashboard)/workspace-asset-actions";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sliders, FileCheck, Save, Loader2, Coins, CalendarDays,
  Percent, Receipt, Upload, Image as ImageIcon, FileText, Trash2, 
  Palette, Building2, Layout, Eye, Maximize, X, Settings, Check, PanelRightClose, PanelRightOpen, ZoomIn, ZoomOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Database Actions
import { getPurchaseSettingsAction, savePurchaseSettingsAction } from "@/app/(dashboard)/purchases/settings/actions";
import { saveDocumentBrandingDB, fetchDocumentBrandingDB, fetchDocumentWorkspaceIdentity } from "@/app/(dashboard)/sales/document-templates/actions";
import {
  InvoicePrintDocument,
  type InvoicePreviewHighlight,
  type PrintableInvoice,
} from "@/components/sales/document-templates/invoice-print-document";
import {
  parseInvoiceTemplateConfig,
  INVOICE_TEMPLATE_OPTIONS,
  getInvoiceTemplateColors,
  getInvoiceTemplateTextColor,
  type InvoiceTemplateId,
} from "@/components/sales/document-templates/invoice-template-config";

/** The palette a bill starts on, taken from the same source the invoice uses. */
const DEFAULT_TEMPLATE_COLORS = getInvoiceTemplateColors("professional");
const DEFAULT_TEMPLATE_TEXT_COLOR = getInvoiceTemplateTextColor("professional");
import { createClient } from "@/lib/supabase/client";
import railStyles from "@/components/sales/invoice-settings.module.css";
import { PurchaseSettingsSkeleton } from "@/components/purchases/skeletons"; // 🚀 Correctly imports your dedicated purchases skeleton!

export function PurchaseSettingsUI({ vatRegistered = true, activeOrgId }: { vatRegistered?: boolean; activeOrgId?: string }) {
  const { symbol, format, currency: workspaceCurrency } = useCurrency();
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Set when the settings could not be read, which makes saving unsafe. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const supabase = createClient();

  // --- TABS & UI STATE ---
  const [activeTab, setActiveTab] = useState<"system" | "bill">("system");
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Whether the preview is put away, widening the form beside it. */
  const [bPreviewCollapsed, setBPreviewCollapsed] = useState(false);
  /*
   * A zoom the reader controls, on top of the fixed preview scale.
   *
   * The sheet is shown small enough to see whole, which makes the body text too
   * small to proofread. Rather than choose between the two, this multiplies the
   * rendered size and lets the panel scroll — 0.6 to see the shape, 2 to read a
   * line of terms.
   */
  const [bZoom, setBZoom] = useState(1);
  /** The scale last applied, so a measurement can divide the transform back out. */
  const fitRef = React.useRef<number>(1);

  /*
   * The rail no longer has to be measured.
   *
   * It used to read the form column's right edge on every resize - and keep
   * re-reading it for half a second afterwards, because Framer animates the
   * column with a transform that ResizeObserver does not report. All of that
   * existed to answer one question: where does the form stop. The form now
   * stops one gutter short of `--doc-preview-rail` by its own padding, so the
   * rail can simply be that wide against the same right edge.
   */
  const zoomBy = (step: number) =>
    setBZoom((current) => Math.min(2, Math.max(0.6, Math.round((current + step) * 10) / 10)));
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isFullscreen) return;
    /*
     * Without this, scrolling inside the fullscreen document carries on into
     * the settings form once it reaches its end, so closing the overlay leaves
     * the form somewhere other than where it was opened from.
     */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  // 1. SYSTEM DEFAULTS — shared with the numbering code, so what this page
  // shows before anything is saved is what a document will actually get.
  // Annotated as string: the defaults are `as const`, so without it these
  // infer the literal type and nothing else could be typed into them.
  const [billPrefix, setBillPrefix] = useState<string>(PURCHASE_SETTINGS_DEFAULTS.billPrefix);
  const [nextBillNumber, setNextBillNumber] = useState<string>(
    PURCHASE_SETTINGS_DEFAULTS.nextBillNumber
  );
  const [claimPrefix, setClaimPrefix] = useState<string>(PURCHASE_SETTINGS_DEFAULTS.claimPrefix);
  const [nextClaimNumber, setNextClaimNumber] = useState<string>(
    PURCHASE_SETTINGS_DEFAULTS.nextClaimNumber
  );
  const [defaultTerms, setDefaultTerms] = useState<string>(
    PURCHASE_SETTINGS_DEFAULTS.defaultTerms
  );

  // 🚀 THIS IS THE NEW "AMOUNTS ARE" STATE
  const [defaultAmountType, setDefaultAmountType] = useState<string>(
    PURCHASE_SETTINGS_DEFAULTS.defaultAmountType
  );
  
  /* The workspace’s own currency, not GBP. A workspace that has never saved
     its purchase settings gets no row back from the server, so this initial
     value is what the form shows — and what pressing Save writes. Seeded with
     GBP it silently made every bill in a Canadian workspace a foreign-currency
     document, converted at a rate the person entering it never saw. */
  const [defaultCurrency, setDefaultCurrency] = useState<string>(workspaceCurrency);
  const [requireApproval, setRequireApproval] = useState(true);
  const [lockClosedPeriods, setLockClosedPeriods] = useState(false);

  // 2. BILL PRINT TEMPLATE STATE
  const [bLogo, setBLogo] = useState<string | null>(null);
  /* What the template row actually holds, as distinct from what is on screen.
     Needed to delete the file a replacement supersedes: by save time bLogo is
     the new image, and the old URL would otherwise be gone with nothing left
     pointing at the file. A ref rather than state — nothing renders from it. */
  const persistedBillLogo = useRef<string | null>(null);
  const [bBrandColor, setBBrandColor] = useState("#2563eb");
  /*
   * The rest of the palette, and the layout.
   *
   * The bill print now renders through the same themed document as an invoice,
   * so these are read by the output rather than being decoration on this form.
   */
  const [bSecondaryColor, setBSecondaryColor] = useState(DEFAULT_TEMPLATE_COLORS[1]);
  const [bTertiaryColor, setBTertiaryColor] = useState(DEFAULT_TEMPLATE_COLORS[2]);
  const [bTextColor, setBTextColor] = useState(DEFAULT_TEMPLATE_TEXT_COLOR);
  const [bTheme, setBTheme] = useState<InvoiceTemplateId>("professional");
  const [bFont, setBFont] = useState("sans");
  const [bCompanyAddress, setBCompanyAddress] = useState("");
  const [bVatNumber, setBVatNumber] = useState("");
  const [bRegNumber, setBRegNumber] = useState("");
  const [bPaperSize, setBPaperSize] = useState("a4");
  const [bNotes, setBNotes] = useState("");
  const [bFooter, setBFooter] = useState("");
  const [bShowTax, setBShowTax] = useState(true);
  const [bShowUnitPrice, setBShowUnitPrice] = useState(true);
  /** Shown in place of a logo, exactly as on the sales documents. */
  const [bLogoInitials, setBLogoInitials] = useState("");
  const [bLogoPosition, setBLogoPosition] = useState<LogoPosition>("left");
  /*
   * The workspace's own name, for the preview.
   *
   * It was a hardcoded "Your Company Name", so the panel showed a stand-in while
   * the printed bill used the real record — the one line on screen that did not
   * match the output.
   */
  const [bWorkspaceName, setBWorkspaceName] = useState<string | null>(null);

  /*
   * Two inputs over one stored address.
   *
   * It prints as separate lines and is stored as one newline separated string,
   * so it is split for editing and rejoined on change rather than migrated into
   * two columns. Anything already saved with more lines keeps its remainder.
   */
  const bAddressLines = bCompanyAddress.split(String.fromCharCode(10));
  const bAddressLine1 = bAddressLines[0] ?? "";
  const bAddressCity = bAddressLines[1] ?? "";

  const setBAddressPart = (index: 0 | 1, value: string) => {
    const next = [...bAddressLines];
    while (next.length < 2) next.push("");
    next[index] = value;
    setBCompanyAddress(next.join(String.fromCharCode(10)).trimEnd());
  };

  // 🔄 HYDRATE ALL DATA ON LOAD
  useEffect(() => {
    startTransition(async () => {
      try {
        const settings = await getPurchaseSettingsAction();
        if (settings) {
          setBillPrefix(settings.billPrefix); setNextBillNumber(settings.nextBillNumber);
          setClaimPrefix(settings.claimPrefix); setNextClaimNumber(settings.nextClaimNumber);
          setDefaultTerms(settings.defaultTerms); 
          
          // 🚀 HYDRATE "AMOUNTS ARE" FROM DB
          setDefaultAmountType(settings.defaultAmountType || "exclusive");
          
          setDefaultCurrency(settings.defaultCurrency); setRequireApproval(settings.requireApproval);
          setLockClosedPeriods(settings.lockClosedPeriods);
        }

        if (activeOrgId) {
          const identity = await fetchDocumentWorkspaceIdentity(activeOrgId);
          setBWorkspaceName(identity?.name?.trim() || null);
          const billBrand = (await fetchDocumentBrandingDB(activeOrgId, "bill")) as any;
          if (billBrand) {
            setBLogo(billBrand.logo || null); persistedBillLogo.current = billBrand.logo || null; setBBrandColor(billBrand.brandColor || "#2563eb"); setBFont(billBrand.font || "sans");
            setBCompanyAddress(billBrand.companyAddress || ""); setBVatNumber(billBrand.vatNumber || ""); setBRegNumber(billBrand.regNumber || "");
            setBPaperSize(billBrand.paperSize || "a4"); setBNotes(billBrand.notes || ""); setBFooter(billBrand.footer || "");
            setBShowTax(billBrand.showTax !== false); setBShowUnitPrice(billBrand.showUnitPrice !== false);
            // Without these the layout and palette saved a moment ago would come
            // back as the defaults on the next visit.
            if (billBrand.theme) setBTheme(billBrand.theme);
            if (billBrand.secondaryColor) setBSecondaryColor(billBrand.secondaryColor);
            if (billBrand.tertiaryColor) setBTertiaryColor(billBrand.tertiaryColor);
            if (billBrand.textColor) setBTextColor(billBrand.textColor);
            setBLogoInitials(billBrand.logoInitials || "");
            setBLogoPosition(billBrand.logoPosition ?? "left");
          }
        }
      } catch (err) {
        console.error("Error loading settings", err);
        // Saving is blocked from here on. The form is showing its own defaults,
        // not this workspace's settings, and letting Save run would write those
        // defaults over the real row — which is exactly what happened while the
        // read was failing silently.
        setLoadError(
          err instanceof Error ? err.message : "Could not load your purchase settings."
        );
      } finally {
        setPageLoading(false);
      }
    });
  }, [activeOrgId]);

  // --- BRANDING ACTIONS ---
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared first so picking the same file again after a rejection still
    // fires a change event.
    e.target.value = "";
    if (!file) return;
    try {
      setBLogo(await readLogoFile(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  const uploadLogoToStorage = async (base64Data: string | null, prefix: string) => {
    if (!base64Data || !base64Data.startsWith('data:image') || !activeOrgId) return base64Data;
    try {
      const response = await fetch(base64Data);
      const blob = await response.blob();
      const fileExt = blob.type.split('/')[1] || 'png';
      const fileName = `workspace-${activeOrgId}-${prefix}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('workspace_assets').upload(filePath, blob, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('workspace_assets').getPublicUrl(filePath);
      return publicUrl;
    } catch (error) {
      console.error(`Failed to upload ${prefix} logo:`, error);
      return base64Data;
    }
  };

  const handleReset = () => {
    if (confirm(`Are you sure you want to clear all customization fields for the Bill template?`)) {
      setBLogo(null); setBBrandColor("#2563eb"); setBFont("sans"); setBCompanyAddress(""); setBVatNumber(""); setBRegNumber(""); setBPaperSize("a4"); setBNotes(""); setBFooter(""); setBShowTax(true); setBShowUnitPrice(true);
      toast.info(`Current Bill fields have been reset.`);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loadError) {
      toast.error("Your settings could not be loaded, so saving would overwrite them. Reload the page.");
      return;
    }
    setSaving(true);
    try {
      // 🚀 SAVE "AMOUNTS ARE" TO DATABASE
      const result = await savePurchaseSettingsAction({
        billPrefix, nextBillNumber, claimPrefix, nextClaimNumber,
        defaultTerms, defaultAmountType, defaultCurrency, requireApproval, lockClosedPeriods,
      });

      if (!result.success) throw new Error(result.error);

      if (activeOrgId) {
        const finalBillLogo = await uploadLogoToStorage(bLogo, 'bill');

        await saveDocumentBrandingDB(activeOrgId, "bill", {
          logo: finalBillLogo, brandColor: bBrandColor, secondaryColor: bSecondaryColor,
          tertiaryColor: bTertiaryColor, textColor: bTextColor, theme: bTheme,
          font: bFont, companyAddress: bCompanyAddress,
          vatNumber: bVatNumber, regNumber: bRegNumber, paperSize: bPaperSize, notes: bNotes, footer: bFooter,
          showTax: bShowTax, showUnitPrice: bShowUnitPrice, logoInitials: bLogoInitials,
          logoPosition: bLogoPosition
        });

        if (finalBillLogo) setBLogo(finalBillLogo);

        // The row now points at the new file, so whatever it pointed at before
        // is unreachable. Deliberately after the save, and non-blocking: this
        // is tidy-up, and the settings are already stored either way.
        if (persistedBillLogo.current && persistedBillLogo.current !== finalBillLogo) {
          void deleteWorkspaceLogos([persistedBillLogo.current]);
        }
        persistedBillLogo.current = finalBillLogo ?? null;
      }
      toast.success("Settings and templates saved successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update configurations.");
    } finally {
      setSaving(false);
    }
  };

  // --- PREVIEW CANVAS ---
  /*
   * The preview is the printed document, not a drawing of it.
   *
   * This used to be its own markup — a green summary that looked nothing like
   * the output and could not show a layout at all, so choosing one changed the
   * print and left the panel beside it unmoved. It now renders the same
   * component the bill prints through, so what is on screen is what comes out.
   */
  const previewConfig = parseInvoiceTemplateConfig({
    theme: bTheme,
    logo: bLogo,
    brandColor: bBrandColor,
    secondaryColor: bSecondaryColor,
    tertiaryColor: bTertiaryColor,
    textColor: bTextColor,
    font: bFont,
    companyAddress: bCompanyAddress,
    vatNumber: bVatNumber,
    regNumber: bRegNumber,
    paperSize: bPaperSize,
    showTax: bShowTax,
    showUnitPrice: bShowUnitPrice,
    showShipping: false,
    showLineDate: false,
    lineDetail: "reference",
    notes: bNotes,
    footer: bFooter || "INTERNAL ACCOUNTS PAYABLE RECORD",
    logoInitials: bLogoInitials,
    logoPosition: bLogoPosition,
  });

  /**
   * Stand-in figures, so the layout can be judged before a real bill exists.
   *
   * In the workspace’s own currency: the point of the preview is to show what
   * this workspace’s bills will look like, and a sterling sample answers that
   * question for somebody else’s business.
   */
  const previewBill: PrintableInvoice = {
    id: "preview",
    invoiceNo: "BILL-004381",
    status: "approved",
    issueDate: "2026-05-18",
    dueDate: "2026-06-17",
    currency: workspaceCurrency as PrintableInvoice["currency"],
    contactName: "Acme Supplies Co.",
    billingAddress: ["Warehouse 4B", "Industrial Park, London"].join(String.fromCharCode(10)),
    reference: "REF-004381",
    subtotalMinor: 120000,
    taxMinor: 24000,
    totalMinor: 144000,
    amountPaidMinor: 0,
    lines: [
      {
        description: "Office hardware supplies (bulk)",
        accountCode: "SRV-001",
        accountName: "Office supplies",
        quantity: 50,
        unitPriceMinor: 2400,
        subtotalMinor: 120000,
        taxRate: 20,
        taxMinor: 24000,
        totalMinor: 144000,
      },
    ],
    organization: { name: bWorkspaceName || "Your company" },
  };

  /*
   * Scales the sheet to whatever width it is given.
   *
   * A fixed scale meant the container had to be sized to the sheet, so every
   * window width needed a different number and the rail ended up over the form.
   * Measuring instead lets the sheet shrink with the panel, which is how the
   * invoice preview behaves.
   *
   * The measurement bails out rather than inventing a width. Flooring it at 1px
   * is what produced a preview one pixel wide that never corrected itself,
   * because a bad value still counts as a successful measurement.
   */
  /*
   * The preview's fit, measured once at this level.
   *
   * PreviewCanvas used to be declared inside this component, which makes it a
   * new component type on every render — React unmounts and remounts it each
   * time, throwing away the measurement and restarting the observer. That is why
   * the sheet kept vanishing and why it never appeared at all on a narrow
   * screen, where the first measurement is the one that matters. The hooks live
   * here now and the canvas is plain markup.
   */
  const previewViewportRef = React.useRef<HTMLDivElement>(null);
  const previewSheetRef = React.useRef<HTMLDivElement>(null);
  const [previewFit, setPreviewFit] = useState<{ scale: number; height: number } | null>(null);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    const sheet = previewSheetRef.current;
    if (!viewport || !sheet) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const available = viewport.clientWidth;
        if (available < 2) return;
        const rect = sheet.getBoundingClientRect();
        const applied = fitRef.current || 1;
        const naturalWidth = rect.width / applied;
        const naturalHeight = rect.height / applied;
        if (naturalWidth < 2) return;
        const scale = Math.min(1, available / naturalWidth);
        fitRef.current = scale;
        setPreviewFit({ scale, height: naturalHeight * scale });
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(sheet);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeTab, bPreviewCollapsed, bTheme, bPaperSize]);

  const previewCanvas = (
    <div
      ref={previewViewportRef}
      className="w-full overflow-hidden"
      style={{ height: previewFit?.height }}
    >
      <div
        ref={previewSheetRef}
        style={{
          transform: `scale(${previewFit?.scale ?? 1})`,
          transformOrigin: "top center",
          width: "max-content",
          marginInline: "auto",
        }}
      >
        <div className="mx-auto w-full">
          <InvoicePrintDocument
            invoice={previewBill}
            config={previewConfig}
            documentLabel="Bill"
            previewHighlight={focusedField as InvoicePreviewHighlight}
            displayMode="preview"
          />
        </div>
      </div>
    </div>
  );

  /* The preview panel, rendered inline below xl and as a fixed rail above. */
  const billPreviewPanel = (
    <>
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Eye className="size-4 text-slate-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Live Bill Summary Preview
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBPreviewCollapsed(true)} className="hidden h-6 w-6 p-0 rounded-full text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 xl:inline-flex" aria-label="Minimize bill preview" title="Minimize">
                      <PanelRightClose className="size-3.5" />
                    </Button>
                    <span className="text-[10px] bg-emerald-50 border border-emerald-100 font-bold px-1.5 py-0.5 rounded text-emerald-600 uppercase font-mono">
                      {bPaperSize}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsFullscreen(true)} className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full">
                      <Maximize className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Open fullscreen bill preview"
                  onClick={() => setIsFullscreen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setIsFullscreen(true);
                    }
                  }}
                  className="group relative cursor-zoom-in rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  {previewCanvas}
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-slate-900/0 transition-colors group-hover:bg-slate-900/10" />
                  <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 scale-95 items-center gap-2 rounded-full bg-slate-900/80 px-4 py-2 text-xs font-extrabold text-white opacity-0 shadow-lg backdrop-blur-sm transition group-hover:scale-100 group-hover:opacity-100">
                    <ZoomIn className="size-4" />
                    Open preview
                  </span>
                </div>
    </>
  );

  if (pageLoading) {
    // 🚀 Instantly renders the skeleton to match the server load perfectly!
    return <PurchaseSettingsSkeleton />;
  }

  return (
    <>
      {/* FULLSCREEN PREVIEW PORTAL */}
      {mounted && createPortal(
        <AnimatePresence>
          {isFullscreen && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullscreen(false)} />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="relative w-full max-w-5xl max-h-[90vh] bg-slate-100 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                <div className="flex justify-between items-center p-4 px-6 bg-white border-b border-slate-200 shrink-0">
                  <div className="flex items-center gap-3">
                    <Eye className="size-5 text-blue-600" />
                    <h3 className="font-bold text-slate-800 text-lg">Fullscreen Document Preview</h3>
                  </div>
                  {/* Zoom lives here rather than on the panel: this is the view
                      somebody reads a line of terms in, and the panel is for
                      seeing the shape of the page. */}
                  <div className="ml-auto mr-2 flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => zoomBy(-0.2)} disabled={bZoom <= 0.6} className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Zoom out" title="Zoom out">
                      <ZoomOut className="size-4" />
                    </Button>
                    <span className="w-11 text-center font-mono text-xs font-bold text-slate-500">
                      {Math.round(bZoom * 100)}%
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => zoomBy(0.2)} disabled={bZoom >= 2} className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Zoom in" title="Zoom in">
                      <ZoomIn className="size-4" />
                    </Button>
                  </div>
                  <Button variant="ghost" onClick={() => setIsFullscreen(false)} className="h-10 w-10 p-0 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900"><X className="size-5" /></Button>
                </div>
                {/* `min-h-0` alongside `flex-1`, matching the invoice modal: without it a
                    flex item will not shrink below its content, so a document taller
                    than the modal is clipped by the rounded overflow rather than
                    scrolled to. */}
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-slate-500/5">
                  <div style={{ transform: `scale(${bZoom})`, transformOrigin: "top center", transition: "transform 160ms ease" }}>
                    {previewCanvas}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>, document.body
      )}

      <form onSubmit={handleSaveSettings} className="w-full space-y-6 pb-16">

        {/* Says why Save is disabled, rather than leaving a dead button. The
            fields below are defaults, not this workspace's settings. */}
        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="m-0 text-sm font-bold text-red-900">
              Could not load your purchase settings
            </p>
            <p className="m-0 mt-1 text-xs leading-relaxed text-red-700">
              The fields below are the built-in defaults, not what is saved for this workspace.
              Saving is disabled so they cannot overwrite it. Reload the page to try again.
            </p>
          </div>
        )}

        {/* HEADER & TABS */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Purchase Settings
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Configure system rules, document numbering, and PDF print templates.
            </p>
          </div>
          
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start shrink-0 shadow-sm overflow-x-auto">
            <button type="button" onClick={() => setActiveTab("system")} className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider flex items-center gap-2", activeTab === "system" ? "bg-white shadow-sm text-emerald-700" : "text-slate-500 hover:text-slate-700")}>
              <Settings className="size-3.5" /> <span>System</span>
            </button>
            <button type="button" onClick={() => setActiveTab("bill")} className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider flex items-center gap-2", activeTab === "bill" ? "bg-white shadow-sm text-emerald-700" : "text-slate-500 hover:text-slate-700")}>
              <Receipt className="size-3.5" /> <span>Bill Print</span>
            </button>
          </div>
        </div>

        {/* TAB 1: SYSTEM SETTINGS */}
        {activeTab === "system" && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-in fade-in duration-300">
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-50">
                    <Sliders className="size-4.5 text-emerald-600" />
                    <h3 className="font-bold text-slate-900">Document Prefixes & Sequencing</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier Bill Prefix</label>
                      <input type="text" value={billPrefix} onChange={(e) => setBillPrefix(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next Bill Sequence No.</label>
                      <input type="number" value={nextBillNumber} onChange={(e) => setNextBillNumber(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expense Claim Prefix</label>
                      <input type="text" value={claimPrefix} onChange={(e) => setClaimPrefix(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next Claim Sequence No.</label>
                      <input type="number" value={nextClaimNumber} onChange={(e) => setNextClaimNumber(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-50">
                    <Receipt className="size-4.5 text-emerald-600" />
                    <h3 className="font-bold text-slate-900">Purchasing Ledger Defaults</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    
                    {/* Fallback Terms */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <CalendarDays className="size-3 text-slate-400" /> Fallback Terms
                      </label>
                      <Select value={defaultTerms} onValueChange={setDefaultTerms}>
                        <SelectTrigger className="h-9 w-full bg-white shadow-sm border-slate-300 font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Due on receipt</SelectItem>
                          <SelectItem value="7">Net 7 Days</SelectItem>
                          <SelectItem value="15">Net 15 Days</SelectItem>
                          <SelectItem value="30">Net 30 Days</SelectItem>
                          <SelectItem value="45">Net 45 Days</SelectItem>
                          <SelectItem value="60">Net 60 Days</SelectItem>
                          <SelectItem value="90">Net 90 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Amounts Are */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Percent className="size-3 text-slate-400" /> Amounts Are
                      </label>
                      <Select 
                        value={defaultAmountType} 
                        onValueChange={setDefaultAmountType}
                      >
                        <SelectTrigger className="h-9 w-full bg-white shadow-sm border-slate-300 font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exclusive">Exclusive of VAT</SelectItem>
                          <SelectItem value="inclusive">Inclusive of VAT</SelectItem>
                          <SelectItem value="no_vat">No VAT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Base Currency */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Coins className="size-3 text-slate-400" /> Base Currency
                      </label>
                      {/* Searchable, matched on country name. availableOnly: a
                          bill can only be recorded in a currency the books can
                          keep. */}
                      <CurrencyPicker
                        value={defaultCurrency}
                        onChange={setDefaultCurrency}
                        availableOnly
                        size="field"
                      />
                    </div>

                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-50">
                    <FileCheck className="size-4.5 text-emerald-600" />
                    <h3 className="font-bold text-slate-900">Internal Governance</h3>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/30 p-3.5">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">Require Expense Approvals</p>
                      <p className="text-[11px] font-medium text-slate-400 leading-relaxed">Forced manager signs off required before internal employee reimbursement tokens lock.</p>
                    </div>
                    <Switch checked={requireApproval} onCheckedChange={(checked: boolean) => setRequireApproval(checked)} aria-label="Require Expense Approvals" className="mt-0.5 shrink-0" />
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/30 p-3.5">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">Lock Closed Periods</p>
                      <p className="text-[11px] font-medium text-slate-400 leading-relaxed">Restricts retroactively posting bills or adjustments into locked tax quarters or years.</p>
                    </div>
                    <Switch checked={lockClosedPeriods} onCheckedChange={(checked: boolean) => setLockClosedPeriods(checked)} aria-label="Lock Closed Periods" className="mt-0.5 shrink-0" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* 🚀 System Tab Save Button */}
            <div className="flex justify-end pt-6">
              <Button type="submit" disabled={saving || loadError !== null} className="h-9 gap-2 bg-blue-600 px-6 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-colors">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save System Settings
              </Button>
            </div>
          </>
        )}

        {/* TAB 2: PRINT BRANDING TEMPLATES */}
        {activeTab === "bill" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
            {/* Eased, and scoped to the toggle. A bare `layout` also fires on
                every tick of a window resize, which sets the whole column
                bouncing; `layoutDependency` limits it to this value changing. */}
            <motion.div
              layout
              layoutDependency={bPreviewCollapsed}
              transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
              className={
                bPreviewCollapsed
                  ? "lg:col-span-11 space-y-6"
                  : "lg:col-span-7 space-y-6 xl:col-span-12 xl:pr-[calc(var(--doc-preview-rail)+var(--doc-preview-gutter))]"
              }
            >
              
              {/* EMBLEM LOGO */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-emerald-600" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Bill Print Emblem
                    </h2>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden relative">
                      {bLogo ? (
                        <img src={bLogo} alt="Logo Emblem" className="object-contain w-full h-full p-1" />
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No Emblem</span>
                      )}
                    </div>
                    <div>
                      <p className="mb-3 text-sm text-slate-600">Upload an emblem specific to this document layout.</p>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" className="relative h-8 gap-2 text-xs font-bold text-slate-700 bg-white border-slate-200 shadow-sm">
                          <Upload className="size-3" /> Upload Image
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                        </Button>
                        {bLogo && (
                          <Button type="button" variant="ghost" onClick={() => setBLogo(null)} className="h-8 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50">
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
                      property of the logo, and somebody who has just uploaded
                      one is already looking here. Applies to all six layouts. */}
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <LogoPositionField value={bLogoPosition} onChange={setBLogoPosition} theme={bTheme} />
                  </div>
                </div>
              </div>

              {/* STYLING */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Palette className="size-4 text-emerald-600" />
                    <h2 className="text-sm font-bold text-slate-900">Styling Configurations</h2>
                  </div>
                </div>
                <div className="p-5 sm:p-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Primary</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bBrandColor} onChange={(e) => setBBrandColor(e.target.value)} className="size-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white shadow-sm" />
                      <span className="text-xs font-mono font-bold uppercase text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">{bBrandColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Secondary</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bSecondaryColor} onChange={(e) => setBSecondaryColor(e.target.value)} className="size-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white shadow-sm" />
                      <span className="text-xs font-mono font-bold uppercase text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">{bSecondaryColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Highlight</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bTertiaryColor} onChange={(e) => setBTertiaryColor(e.target.value)} className="size-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white shadow-sm" />
                      <span className="text-xs font-mono font-bold uppercase text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">{bTertiaryColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Text</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bTextColor} onChange={(e) => setBTextColor(e.target.value)} className="size-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white shadow-sm" />
                      <span className="text-xs font-mono font-bold uppercase text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">{bTextColor}</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Typography</label>
                    <select value={bFont} onChange={(e) => setBFont(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none shadow-sm">
                      <option value="sans">Modern Sans (Default)</option>
                      <option value="humanist">Humanist Sans</option>
                      <option value="serif">Classic Serif</option>
                      <option value="editorial">Editorial Serif</option>
                      <option value="mono">Technical Mono</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider">Sheet Sizing</label>
                    <select value={bPaperSize} onChange={(e) => setBPaperSize(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none shadow-sm">
                      <option value="a4">A4 Dimension Standard</option>
                      <option value="letter">Letter Dimension Standard</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* BILL LAYOUT.
                  The same six layouts the sales documents use. They apply for
                  real now that the bill prints through the shared themed
                  document rather than its own markup — before this there was
                  nothing on the output for them to change. */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layout className="size-4 text-emerald-600" />
                      <h2 className="text-sm font-bold text-slate-900">Bill Layout</h2>
                    </div>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Preview + Print
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
                  {INVOICE_TEMPLATE_OPTIONS.map((option) => {
                    const selected = bTheme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          // Choosing a layout takes its palette too, so the
                          // colours below start from something coherent rather
                          // than whatever the previous theme left behind.
                          setBTheme(option.id);
                          const colors = getInvoiceTemplateColors(option.id);
                          setBBrandColor(colors[0]);
                          setBSecondaryColor(colors[1]);
                          setBTertiaryColor(colors[2]);
                          setBTextColor(getInvoiceTemplateTextColor(option.id));
                        }}
                        className={`rounded-xl border-2 p-4 text-left transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50/40 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div
                          className="mb-3 h-16 w-full overflow-hidden rounded-md border border-slate-200"
                          style={{ background: option.colors[2] }}
                        >
                          <div className="h-4 w-full" style={{ background: option.colors[0] }} />
                          <div className="space-y-1 p-2">
                            <div className="h-1.5 w-2/3 rounded" style={{ background: option.colors[1] }} />
                            <div className="h-1.5 w-1/2 rounded" style={{ background: option.colors[1] }} />
                          </div>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">{option.name}</span>
                          <span
                            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              selected ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                            }`}
                          >
                            {selected ? <Check className="size-2.5 text-white" /> : null}
                          </span>
                        </div>
                        <p className="m-0 mt-1 text-[11px] leading-relaxed text-slate-500">
                          {option.description}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          {option.colors.map((color) => (
                            <span
                              key={color}
                              className="size-3 rounded-full border border-black/10"
                              style={{ background: color }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* YOUR COMPANY.
                  The invoice card's shape, minus Prepared by: a bill was
                  prepared by the supplier, so naming yourself under it would be
                  wrong — and the printed document now hides that card when it is
                  unset rather than falling back to the company name. */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-emerald-600" />
                      <h2 className="text-sm font-bold text-slate-900">Your Company</h2>
                    </div>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Recipient
                    </span>
                  </div>
                </div>
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Address Line 1</label>
                      <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none" placeholder="e.g. 123 Business Road, Suite 100" value={bAddressLine1} onFocus={() => setFocusedField("address")} onBlur={() => setFocusedField(null)} onChange={(e) => setBAddressPart(0, e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">City, Postcode</label>
                      <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none" placeholder="e.g. London, EC1A 1BB" value={bAddressCity} onFocus={() => setFocusedField("address")} onBlur={() => setFocusedField(null)} onChange={(e) => setBAddressPart(1, e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">VAT Registration</label>
                      <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none" placeholder="e.g. GB 123 4567 89" value={bVatNumber} onFocus={() => setFocusedField("vat")} onBlur={() => setFocusedField(null)} onChange={(e) => setBVatNumber(e.target.value)} />
                      <p className="mt-1 text-[11px] text-slate-500">Left blank, the number on your tax profile is used.</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Company Registration No</label>
                      <input type="text" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none" placeholder="e.g. 01234567" value={bRegNumber} onFocus={() => setFocusedField("registration")} onBlur={() => setFocusedField(null)} onChange={(e) => setBRegNumber(e.target.value)} />
                    </div>
                  </div>
                  <div className="sm:w-1/2">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Logo Initials</label>
                    <input type="text" maxLength={3} className={`${"h-9 w-full rounded-md border border-slate-200 px-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none"} uppercase`} placeholder="e.g. AC" value={bLogoInitials} onChange={(e) => setBLogoInitials(e.target.value.toUpperCase())} />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Used in place of a logo. {bLogo ? "A logo is uploaded, so this is not shown." : "No logo uploaded, so this is what prints."}
                    </p>
                  </div>
                </div>
              </div>

              {/* BILL RECORD FOOTNOTES.
                  The invoice card's shape — paired cards, one term per line —
                  with the bill's own fields. Payment instructions are not here
                  and should not be: those are your bank details, and a bill is
                  something you received. Nor are Terms and Conditions, which on
                  a bill belong to the supplier who wrote it. What is left is
                  what an internal accounts payable record actually carries. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-emerald-600" />
                      <h2 className="text-sm font-bold text-slate-900">Internal Notes</h2>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Notes (one per line)</label>
                    <textarea
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none"
                      rows={8}
                      value={bNotes}
                      placeholder="Approved by finance before posting.&#10;Match against purchase order before payment.&#10;File with the supplier statement at month end."
                      onFocus={() => setFocusedField("notes")} onBlur={() => setFocusedField(null)} onChange={(e) => setBNotes(e.target.value)}
                    />
                    <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      Each line prints as its own numbered note, and a blank line prints as a gap.
                      These are for your own records — the supplier never sees them.
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Receipt className="size-4 text-emerald-600" />
                      <h2 className="text-sm font-bold text-slate-900">Record Footer</h2>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Default Footer</label>
                    <textarea
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed placeholder:text-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none"
                      rows={3}
                      value={bFooter}
                      placeholder="INTERNAL ACCOUNTS PAYABLE RECORD"
                      onFocus={() => setFocusedField("payment")} onBlur={() => setFocusedField(null)} onChange={(e) => setBFooter(e.target.value)}
                    />
                    <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      Printed along the bottom of every page. Left blank it reads
                      &ldquo;Internal accounts payable record&rdquo;, which is what this document is.
                    </p>
                  </div>
                </div>
              </div>

              {/* DYNAMIC FIELD TOGGLES */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Layout className="size-4 text-emerald-600" />
                    <h2 className="text-sm font-bold text-slate-900">Dynamic Field Layout Toggles</h2>
                  </div>
                </div>
                {/* Switches, matching the invoice tab. Each turns a block of
                    the printed record on or off, which is a setting rather than
                    an item ticked off a list. */}
                <div className="divide-y divide-slate-100">
                  {[
                    { label: "Tax / VAT breakdown", on: bShowTax, set: setBShowTax, hint: "Per-line VAT and the totals block below the table." },
                    { label: "Quantity column", on: bShowUnitPrice, set: setBShowUnitPrice, hint: "Quantity and unit price, rather than a line total alone." },
                  ].map((row) => (
                    <label
                      key={row.label}
                      className="flex cursor-pointer select-none items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/60 sm:px-6"
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

              <div className="flex justify-end pt-2">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button variant="outline" type="button" onClick={handleReset} disabled={saving} className="w-full sm:w-auto h-9 px-4 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 bg-white border-slate-200 shadow-sm transition-all">
                    Clear Current Tab
                  </Button>
                  <Button type="submit" disabled={saving} className="w-full sm:w-auto h-9 gap-2 bg-blue-600 px-6 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-colors">
                    {saving ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Save className="size-4 shrink-0" />}
                    Save Template Settings
                  </Button>
                </div>
              </div>

            </motion.div>
            
            {/* LIVE PREVIEW CANVAS */}
            {bPreviewCollapsed ? (
              <>
              {/* Portalled, like the rail it restores.
                  It was `fixed` inside the grid, and fixed resolves against the
                  nearest transformed ancestor rather than the viewport — the
                  animated form column beside it provides one, so the tab
                  scrolled away with the page. Hanging off the body, nothing can
                  contain it. This is how the invoice rail has always worked. */}
              <div className="lg:col-span-1" />
              {mounted &&
                createPortal(
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBPreviewCollapsed(false)}
                    className={`fixed right-4 top-[152px] z-30 ${railStyles.previewRestoreButton}`}
                    aria-label="Restore bill preview"
                    title="Restore bill preview"
                  >
                    {/* The invoice's restore tab, reused rather than reproduced:
                        same class, so the two cannot drift apart. */}
                    <PanelRightOpen className="size-4" />
                    <span className="text-[11px] font-bold uppercase tracking-widest [writing-mode:vertical-rl]">
                      Preview
                    </span>
                  </Button>,
                  document.body,
                )}
              </>
            ) : (
            <div className="space-y-3 lg:col-span-5 xl:hidden">
              {billPreviewPanel}
            </div>
            )}

            {/* From xl up, the preview leaves the layout entirely.
                It was `sticky`, which any ancestor with hidden overflow silently
                kills — and this page has one. A fixed element hanging off the
                body has no ancestors to be killed by, which is exactly how the
                invoice preview has always followed the scroll. */}
            {mounted && !bPreviewCollapsed &&
              createPortal(
                <aside
                  className="fixed right-8 top-[152px] z-20 hidden max-h-[calc(100vh-176px)] w-[var(--doc-preview-rail)] space-y-3 overflow-y-auto overflow-x-hidden xl:block"
                  aria-label="Bill preview"
                >
                  {billPreviewPanel}
                </aside>,
                document.body,
              )}
          </div>
        )}
      </form>
    </>
  );
}