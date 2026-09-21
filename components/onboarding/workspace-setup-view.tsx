"use client";

import { useState, useRef, useEffect } from "react";
import { CURRENCIES, currencySymbol } from "@/lib/currency";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils"; 
import { 
  CheckCircle, ChevronRight, FastForward, Building2, Loader2, User, Users, Check, ArrowLeft, CalendarDays,
  FileText, Landmark, ShieldCheck, PlayCircle, FileSpreadsheet, Sparkles, Send, Receipt,
  Eye, Maximize, AlertCircle, Settings, Sliders, PanelRight, X, Clock, TrendingUp, Upload, Trash2
} from "lucide-react";
import { MAX_LOGO_MB, readLogoFile } from "@/lib/workspace-logo";
import { PreferencesStep } from "./preferences-step";
import { useNavPosition } from "@/components/accounting/use-nav-position";
import { toast } from "sonner";
import { completeOnboardingAndCheckout, checkCompanyAvailability } from "@/app/onboarding/actions";
import { ChartOfAccountsStep } from "./chart-of-accounts-step";
import {
  InvoicePrintDocument,
  type PrintableInvoice,
} from "@/components/sales/document-templates/invoice-print-document";
import { parseInvoiceTemplateConfig } from "@/components/sales/document-templates/invoice-template-config";
import type { InvoicePreviewHighlight } from "@/components/sales/document-templates/invoice-print-document";
import { FitPreview, EmblemPreview } from "@/components/sales/document-templates/shared/document-preview";
import { StepOneShowcase } from "./step-one-showcase";
import { ShowcasePanel } from "./showcase-panel";
import { StepTwoShowcase, type StepTwoField } from "./step-two-showcase";
import { StepThreeShowcase } from "./step-three-showcase";
import { StepFourShowcase } from "./step-four-showcase";
import { AureliusBubble } from "./aurelius-bubble";
import { StepFiveShowcase } from "./step-five-showcase";
import { AnswerReview } from "./answer-review";
import { createClient } from "@/lib/supabase/client"; 
import { SalesSettingsStep, salesSectionKeys } from "./sales-settings-step";
import { PurchasesSettingsStep, PurchaseSystemPreview, PURCHASE_SECTION_KEYS } from "./purchases-step";
import { BrandingReview } from "./branding-review";
import {
  verifyOnboardingVatNumber,
  searchCompaniesHouseOnboarding,
  fillFromCompaniesHouseOnboarding,
} from "@/app/onboarding/actions";
import { CompaniesHouseLookup } from "@/components/accounting/companies-house-lookup";
import { checkUtr, utrMessage } from "@/lib/tax/utr";
import type { VatCheckResult } from "@/lib/tax/hmrc-vat";
import { isPlausibleVatNumber } from "@/lib/tax/vat-number";

/**
 * One shape for every field on the wizard.
 *
 * The height is written as `data-[size=default]:h-14`, not `h-14`. SelectTrigger
 * ships with `data-[size=default]:h-8` baked in, and an attribute selector beats
 * a plain class whatever the source order — so every dropdown was rendering 24px
 * shorter than the input beside it while both said h-14. Matching the variant
 * lets tailwind-merge replace it rather than lose to it.
 */
/**
 * Every field label on the wizard, with the height of two lines reserved.
 *
 * "Do you pay CIS subcontractors?" wrapped where "Employer PAYE Reference"
 * beside it did not, so its dropdown sat a line lower than the input next to
 * it. Reserving the space means the fields line up whether a label wraps or
 * not — at any width, for any label added later, rather than only for the ones
 * that happen to be short enough today.
 */
const LABEL_CLASS =
  "flex min-h-8 items-end text-xs font-bold uppercase tracking-widest text-slate-500 ml-1";

const FIELD_CLASS = "h-14 bg-slate-50 border-2 rounded-xl text-slate-900";
const SELECT_TRIGGER_CLASS = "w-full data-[size=default]:h-14 rounded-xl bg-slate-50 border-2";

/** Whether a wizard answer is an exact date rather than one of the named choices. */
/**
 * What somebody came here to fix.
 *
 * These are the areas a business actually names when asked — get paid, chase
 * what is late, keep it accurate, know what it earns, stop doing it by hand.
 * The step used to offer two of them as alternatives and record the answer
 * without ever reading it again; these are multi-select, because a business
 * chasing late payment is usually also worried about accuracy, and being made
 * to pick one threw the other away.
 *
 * Stored comma-joined in the existing `topPriority` column, which already held
 * one of these values — so an older workspace still reads correctly and no
 * migration is needed to collect them.
 */
export const FOCUS_AREAS = [
  { id: "invoices", label: "Sending invoices", sub: "Raising and sending them without it taking an evening.", icon: Send },
  { id: "chasing", label: "Chasing payment", sub: "Knowing who is late and reminding them automatically.", icon: Clock },
  { id: "accuracy", label: "Keeping it accurate", sub: "Books that stand up to an accountant and to HMRC.", icon: ShieldCheck },
  { id: "profit", label: "Seeing the profit", sub: "What the business actually earns, not just what it banks.", icon: TrendingUp },
  { id: "expenses", label: "Tracking spend", sub: "Bills, receipts and expense claims in one place.", icon: Receipt },
  { id: "time", label: "Saving time", sub: "Less re-keying, fewer spreadsheets, more automation.", icon: Sparkles },
] as const;

/** Where the books live today — what needs bringing across, and what they are used to. */
export const BOOKS_TODAY = [
  { id: "new", label: "Nothing yet — brand new business" },
  { id: "sheets", label: "Spreadsheets" },
  { id: "paper", label: "Paper, or a shoebox of receipts" },
  { id: "xero", label: "Xero" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "sage", label: "Sage" },
  { id: "freeagent", label: "FreeAgent" },
  { id: "accountant", label: "My accountant handles it" },
  { id: "other", label: "Something else" },
] as const;

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 2026-07-31 as "31 July 2026", which is how a year end is spoken about. */
function formatYearEnd(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${day} ${months[month - 1]} ${year}`;
}

export function WorkspaceSetupView({
  planCode,
  initialBusinessName = "",
  // Platform switch from Admin → Security → Onboarding. When false the
  // chart-of-accounts card is hidden and `coaType` stays on its "starter"
  // default, so the standard chart is seeded automatically at provisioning.
  showChartOfAccounts = true,
  // Seeds the multicurrency answer rather than deciding it, so an administrator
  // who turned it on platform-wide still has it start switched on here.
  multicurrencyDefault = false,
}: {
  planCode: string;
  initialBusinessName?: string;
  showChartOfAccounts?: boolean;
  multicurrencyDefault?: boolean;
}) {
  const [step, setStep] = useState(initialBusinessName ? 5 : 1); 
  const [direction, setDirection] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  
  // WORKSPACE NAME STATES
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");

  // Which reference field on step two is being filled in, so the panel beside
  // it can lift the matching "where to find this" row.
  const [activeReferenceField, setActiveReferenceField] = useState<StepTwoField>(null);

  // The side panel, opened as a sheet on phones where the column is hidden.
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Without this the form scrolls under the sheet as it is dragged, which on
    // a phone loses the reader's place in the questions they came back to.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [panelOpen]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showSkipModal, setShowSkipModal] = useState(false);

  /*
   * Connecting to HMRC from inside the wizard.
   *
   * Opened in a popup rather than navigating: everything typed so far lives in
   * React state, and sending this page to HMRC would lose it. The popup reports
   * back through postMessage and closes itself.
   *
   * There is no workspace yet to hold the grant, so the callback parks it
   * against the signed-in user and provisioning adopts it once the workspace
   * exists. If checkout is never finished, it expires on its own.
   */
  const [hmrcStatus, setHmrcStatus] = useState<"idle" | "connecting" | "connected" | "failed">("idle");
  const [hmrcError, setHmrcError] = useState<string | null>(null);

  const HMRC_POPUP_MESSAGES: Record<string, string> = {
    declined: "Authorisation was declined at HMRC.",
    unauthenticated: "Your session expired. Sign in again and retry.",
    not_configured: "HMRC is not configured on this server.",
    no_key: "HMRC connections are not configured on this server.",
    no_vat_number: "Check your VAT number before connecting.",
    bad_state: "That authorisation could not be verified. Try again.",
    exchange_failed: "HMRC would not issue a token. Try again shortly.",
    store_failed: "HMRC authorised the connection but it could not be saved. Try again.",
  };

  const connectHmrcNow = () => {
    const vrn = (formData.vatNumber ?? "").trim();
    if (!vrn) {
      toast.error("Enter and check your VAT number first.");
      return;
    }

    setHmrcError(null);
    setHmrcStatus("connecting");

    const popup = window.open(
      `/api/hmrc/onboarding/connect?vrn=${encodeURIComponent(vrn)}`,
      "waw-hmrc",
      "width=560,height=760,noopener=no"
    );
    if (!popup) {
      setHmrcStatus("failed");
      setHmrcError("Your browser blocked the HMRC window. Allow pop-ups and try again.");
      return;
    }

    const onMessage = (event: MessageEvent) => {
      // Same-origin only: the popup posts to its own origin, and anything else
      // reaching this listener is not ours to act on.
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "waw-hmrc") return;

      window.removeEventListener("message", onMessage);

      if (event.data.status === "connected") {
        setHmrcStatus("connected");
        updateForm("connectHmrc", "yes");
        toast.success("Connected to HMRC.");
      } else {
        setHmrcStatus("failed");
        setHmrcError(HMRC_POPUP_MESSAGES[event.data.status] ?? "The connection did not complete.");
      }
    };

    window.addEventListener("message", onMessage);

    /*
     * The popup may never report back — it can 500, be closed, or lose the
     * network — and without this the button spins for ever with nothing said.
     * Polling for the closed window catches all of those: if it has gone and no
     * message arrived, the attempt is over whatever the reason.
     */
    const watch = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(watch);
      window.removeEventListener("message", onMessage);
      setHmrcStatus((current) => {
        if (current !== "connecting") return current;
        setHmrcError("The HMRC window closed before finishing. Try again.");
        return "failed";
      });
    }, 700);
  };

  const [fullscreenDoc, setFullscreenDoc] = useState<"sales" | "bill" | null>(null);
  const isFullscreen = fullscreenDoc !== null;
  const [activeTab, setActiveTab] = useState<"invoice" | "credit_note" | "quote">("invoice");

  /*
   * The sales branding card is advanced by scrolling, not by a Continue button.
   *
   * The card is pinned inside a track taller than itself; how far through that
   * track the page has scrolled is which section is on screen. A button would
   * be a second control for something the reader is already doing, and it kept
   * the progress rail stepping in jumps rather than filling.
   */
  const salesTrackRef = useRef<HTMLDivElement>(null);
  const [salesSection, setSalesSection] = useState(0);
  const [salesProgress, setSalesProgress] = useState(0);
  const salesKeys = salesSectionKeys(activeTab);

  /*
   * Measured directly rather than through useScroll.
   *
   * useScroll with both a container and a target returned a value that never
   * left zero here: the target mounts long after the hook runs — the whole
   * card is behind `step >= 6` — and it does not rebind when the ref finally
   * fills in. Nothing advanced, and the rail never moved off its first
   * segment. A scroll listener that reads the two rects each time has no such
   * ordering problem, and there is nothing to get out of step.
   */
  const salesSectionCount = salesKeys.length;

  /* The branding is hidden until the preferences card is answered, for the
     same reason purchases is hidden until the branding is: the sales card is
     pinned inside a track several screens tall, so anything below it used to be
     reachable by simply carrying on scrolling — which walked people straight
     past a decision without anybody choosing to skip it. */
  const [brandingUnlocked, setBrandingUnlocked] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let frame = 0;
    const read = () => {
      const track = salesTrackRef.current;
      if (!track) return;
      const trackRect = track.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      /* How far the track has travelled past the top of the viewport, over how
         far it can travel before its end reaches the bottom. */
      const travelled = containerRect.top - trackRect.top;
      const usable = trackRect.height - container.clientHeight;
      const value = usable > 0 ? Math.min(1, Math.max(0, travelled / usable)) : 0;

      setSalesProgress((previous) => (Math.abs(previous - value) < 0.0005 ? previous : value));
      /* Capped at the last index: at exactly 1 the floor lands one past the end. */
      const next = Math.min(salesSectionCount - 1, Math.floor(value * salesSectionCount));
      setSalesSection((previous) => (previous === next ? previous : next));
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    /* Deferred so the first reading happens after layout, not during the
       effect — the track is sized in viewport units and has no height yet. */
    onScroll();

    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    /* Re-subscribed when the section count changes, because switching to a
       credit note drops the Columns step and every boundary moves with it.

     Re-subscribed on unlock too: the track does not exist until then, and the
     first reading has to happen once it does. */
  }, [step, salesSectionCount, brandingUnlocked]);

  /*
   * Purchases is revealed rather than scrolled into.
   *
   * The sales card is pinned inside a track several screens tall, so whatever
   * sits below it was previously reachable by carrying on scrolling — leaving
   * the branding half-finished without anybody deciding to. Nothing is
   * rendered below until the sequence is closed off deliberately.
   */
  const purchasesTrackRef = useRef<HTMLDivElement>(null);
  const [purchasesUnlocked, setPurchasesUnlocked] = useState(false);

  /*
   * Aurelius hands over to the customisation flow.
   *
   * The jump from step five to the branding cards was a cross-fade between two
   * completely different layouts — a narrow centred form to a wall of full
   * width cards — which read as the page having broken rather than as having
   * moved on. He steps forward, says where they are going, and the new screen
   * is already there when he steps back.
   */
  const [handingOff, setHandingOff] = useState(false);

  const enterCustomisation = () => {
    setHandingOff(true);
    seedDocumentIdentifiers();
    setDirection(1);
    /* Long enough to read one line, short enough not to feel held up. The step
       changes underneath the overlay, so nothing is waiting on this. */
    setTimeout(() => setStep(6), 900);
    setTimeout(() => setHandingOff(false), 1700);
  };

  /* The menu choice is the one answer on the preferences card that does not
     travel through checkout — it lives in this browser, so it is applied the
     moment it is picked. That also means abandoning the wizard afterwards
     still leaves the workspace opening the way they asked. */
  const [, setNavPosition] = useNavPosition();

  const updatePreference = (key: string, value: unknown) => {
    updateForm(key as any, value as any);
    if (key === "menuLayout") setNavPosition(value === "bottom" ? "bottom" : "side");
  };

  const preferencesRef = useRef<HTMLDivElement>(null);

  const scrollToPreferences = () => {
    const target = preferencesRef.current;
    const container = scrollContainerRef.current;
    if (!target || !container) return;
    container.scrollTo({
      top: container.scrollTop + target.getBoundingClientRect().top - 24,
      behavior: "smooth",
    });
  };

  const revealBranding = () => {
    setBrandingUnlocked(true);
    /* Two frames: one for the track to mount, one for layout to give it a
       height worth scrolling to. It is sized in viewport units, so measuring it
       in the same frame it appears returns zero. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = salesTrackRef.current;
        const container = scrollContainerRef.current;
        if (!target || !container) return;
        container.scrollTo({
          top: container.scrollTop + target.getBoundingClientRect().top - 8,
          behavior: "smooth",
        });
      })
    );
  };

  const revealPurchases = () => {
    setPurchasesUnlocked(true);
    /* Two frames: one for the card to mount, one for layout to give it a
       position worth scrolling to. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = purchasesTrackRef.current;
        const container = scrollContainerRef.current;
        if (!target || !container) return;
        const top =
          target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: top - 88, behavior: "smooth" });
      }),
    );
  };

  /*
   * The review card, opened from the end of purchases.
   *
   * Same gate as purchases itself: nothing below the pinned card exists until
   * the sequence above it has been closed off deliberately.
   */
  const reviewTrackRef = useRef<HTMLDivElement>(null);
  const [reviewUnlocked, setReviewUnlocked] = useState(false);

  const revealReview = () => {
    setReviewUnlocked(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = reviewTrackRef.current;
        const container = scrollContainerRef.current;
        if (!target || !container) return;
        const top =
          target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: top - 88, behavior: "smooth" });
      }),
    );
  };

  /* The purchases card is driven exactly like the sales one — same track, same
     listener, same seek. Its section count is fixed, so there is nothing to
     re-subscribe on. */
  const [purchaseSection, setPurchaseSection] = useState(0);
  const [purchaseProgress, setPurchaseProgress] = useState(0);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !purchasesUnlocked) return;

    let frame = 0;
    const read = () => {
      const track = purchasesTrackRef.current;
      if (!track) return;
      const trackRect = track.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const travelled = containerRect.top - trackRect.top;
      const usable = trackRect.height - container.clientHeight;
      const value = usable > 0 ? Math.min(1, Math.max(0, travelled / usable)) : 0;

      setPurchaseProgress((previous) => (Math.abs(previous - value) < 0.0005 ? previous : value));
      const count = PURCHASE_SECTION_KEYS.length;
      const next = Math.min(count - 1, Math.floor(value * count));
      setPurchaseSection((previous) => (previous === next ? previous : next));
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [purchasesUnlocked]);

  const seekPurchaseSection = (index: number) => {
    const track = purchasesTrackRef.current;
    const container = scrollContainerRef.current;
    if (!track || !container) return;
    const trackTop =
      track.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const usable = Math.max(0, track.offsetHeight - container.clientHeight);
    container.scrollTo({
      top: trackTop + (usable * index) / PURCHASE_SECTION_KEYS.length + 4,
      behavior: "smooth",
    });
  };

  /** Scroll the page to the top of a section, for the rail and the closing cards. */
  const seekSalesSection = (index: number) => {
    const track = salesTrackRef.current;
    const container = scrollContainerRef.current;
    if (!track || !container) return;
    /* Measured from the rects rather than offsetTop, which is relative to the
       nearest positioned ancestor — and the cards sit inside several. */
    const trackTop =
      track.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const usable = Math.max(0, track.offsetHeight - container.clientHeight);
    container.scrollTo({
      top: trackTop + (usable * index) / salesKeys.length + 4,
      behavior: "smooth",
    });
  };
  
  // 🚀 FIXED: Removed "po" from the allowed tab states

  // VAT number verification against HMRC. Advisory only — the wizard never
  // blocks on it, because HMRC has scheduled downtime and somebody signing up at
  // 2am on a Sunday still needs to finish. An unchecked number is saved as typed
  // and can be confirmed later in Settings.
  const [vatCheck, setVatCheck] = useState<VatCheckResult | null>(null);
  const [vatChecking, setVatChecking] = useState(false);

  async function runVatCheck() {
    setVatChecking(true);
    try {
      setVatCheck(await verifyOnboardingVatNumber(formData.vatNumber ?? ""));
    } catch {
      setVatCheck({ status: "unavailable", reason: "Could not reach HMRC." });
    } finally {
      setVatChecking(false);
    }
  }

  const [formData, setFormData] = useState({
    currency: "GBP", // currency:allow initial form selection, user picks in step 1
    multicurrency: multicurrencyDefault ? "yes" : "no",
    payeReference: "",
    connectHmrc: "no",
    dateFormat: "DD/MM/YYYY", businessStructure: "ltd", financialYearEnd: "april_5",
    companyNumber: "", taxReference: "", industry: "",
    vatRegistered: "no", vatFrequency: "quarterly", vatNumber: "", hasCis: "no",
    vatScheme: "none", cisStatus: "no", migrationSource: "new", topPriority: "invoices",
    /* Free text for anything the chips miss. Carried into the plan that is
       generated after signup; not stored on the organisation itself. */
    setupNotes: "",
    /* Whether an accountant or bookkeeper acts for them, and who.
       HMRC calls that person an agent; almost nobody says it about
       themselves, so the question does not. */
    hasAccountant: "no", accountantEmail: "",
    coaType: "starter", billApproval: "auto",
    // The shared layout for every sales document, chosen on the branding step.
    documentTheme: "professional",
    
    /* SALES FIELDS.

       All three document types start on the Professional palette rather than
       on a colour of their own. They used to be blue, orange and indigo, which
       was fine while each was a sketch drawn on its own; now that they share a
       layout, three unrelated accent colours on the same design read as three
       half-finished documents rather than as one set. Picking a layout in the
       gallery repaints all three together, and any of them can still be set
       individually afterwards. */
    /* Where the menu sits, and what the bell may interrupt them about. Asked
       before the branding because both are about the reader rather than the
       business, and both have working defaults. */
    menuLayout: "side" as "side" | "bottom",
    mutedAlerts: [] as string[],
    soundEnabled: true,
    notificationSound: "chime",
    /* The organisation's own logo, from step 1. Optional, and distinct from
       the three document emblems below: this one is the workspace's identity in
       the sidebar, not artwork on a printed page. */
    companyLogo: null as string | null,
    /* Whether the company logo also prints on documents that have none of
       their own. On rather than off: somebody who has just uploaded their logo
       does not expect their invoices to come out with initials on them. */
    applyCompanyLogoToDocuments: true,
    invoiceLogo: null as string | null, invoiceBrandColor: "#102a43", invoiceSecondaryColor: "#d9e8f5", invoiceTertiaryColor: "#ffffff", invoiceTextColor: "#102a43", invoiceTemplate: "sans", invoiceCompanyAddress: "", invoiceVatNumber: "", invoiceRegNumber: "", invoicePaperSize: "a4", invoicePreparedBy: "", invoiceLogoInitials: "", invoiceLogoPosition: "left", invoiceShowTax: true, invoiceShowUnitPrice: true, invoiceShowRefCode: true, invoiceShowCategory: true, invoiceShowLocation: true, invoiceShowLineDate: false, invoiceShowShipping: true, invoiceNotes: "Thank you for your business! Please quote the invoice number on all bank transfers.", invoiceFooter: "",
    creditNoteLogo: null as string | null, creditNoteBrandColor: "#102a43", creditNoteSecondaryColor: "#d9e8f5", creditNoteTertiaryColor: "#ffffff", creditNoteTextColor: "#102a43", creditNoteTemplate: "sans", creditNoteCompanyAddress: "", creditNoteVatNumber: "", creditNoteRegNumber: "", creditNotePaperSize: "a4", creditNotePreparedBy: "", creditNoteLogoInitials: "", creditNoteNotes: "Credit balances are directly applied onto your account statement ledger.", creditNoteFooter: "",
    quoteLogo: null as string | null, quoteBrandColor: "#102a43", quoteSecondaryColor: "#d9e8f5", quoteTertiaryColor: "#ffffff", quoteTextColor: "#102a43", quoteTemplate: "sans", quoteCompanyAddress: "", quoteVatNumber: "", quoteRegNumber: "", quotePaperSize: "a4", quotePreparedBy: "", quoteLogoInitials: "", quoteNotes: "All cost parameters are fixed and valid for 30 days from layout generation date.", quoteFooter: "",

    /* Bank details, set once. A business has one account, so these are not
       collected per document type — the settings screen says the same. */
    docBankName: "", docSortCode: "", docAccountNumber: "", docIban: "", docBic: "", docContactEmail: "", docContactPhone: "",

    // 🚀 FIXED: PURCHASES SETTINGS FIELDS (PO parameters fully removed)
    billPrefix: "BILL-", nextBillNumber: "1001", claimPrefix: "EXP-", nextClaimNumber: "5001",
    defaultTerms: "30", defaultTaxRate: "no_vat", defaultCurrency: "GBP", requireApproval: true, lockClosedPeriods: false,
    /* Bills print through the same six layouts as an invoice now, so they
       carry the same palette fields. Their own theme rather than the sales
       one: a filed record and a sent document are looked at by different
       people for different reasons, and plenty of businesses want their
       internal copy plainer than the thing the customer sees. */
    billTheme: "professional",
    billLogo: null as string | null, billBrandColor: "#102a43", billSecondaryColor: "#d9e8f5", billTertiaryColor: "#ffffff", billTextColor: "#102a43", billTemplate: "sans", billCompanyAddress: "", billVatNumber: "", billRegNumber: "", billPaperSize: "a4", billLogoInitials: "", billLogoPosition: "left", billShowTax: true, billShowUnitPrice: true, billNotes: "", billFooter: "",
  });

  const updateForm = (key: string, value: any) => setFormData((prev) => ({ ...prev, [key]: value }));

  /* Read out of the comma-joined string rather than held separately, so there
     is one source of truth and a restored draft needs no special handling. */
  const focusAreas = String(formData.topPriority ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const toggleFocusArea = (id: string) => {
    const next = focusAreas.includes(id)
      ? focusAreas.filter((entry) => entry !== id)
      : [...focusAreas, id];
    updateForm("topPriority", next.join(","));
  };

  /*
   * The wizard's answers, kept across a reload.
   *
   * Nothing was persisted, so a refresh — or a tab restored after a crash, or
   * a phone that dropped the page while the reader went to find their VAT
   * number — put somebody back on step one with every answer gone. Twenty
   * minutes of work behind an accidental Cmd-R.
   *
   * Logos are the awkward part: each is a data URL of up to 2MB, and four of
   * them will not fit in a 5MB origin quota alongside everything else. They
   * are dropped and the rest is kept rather than the write failing and losing
   * the lot — an emblem is one file dialog to replace, the other ninety
   * answers are not.
   */
  const DRAFT_KEY = "waw-onboarding-draft-v1";
  const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const LOGO_KEYS = ["companyLogo", "invoiceLogo", "creditNoteLogo", "quoteLogo", "billLogo"] as const;

  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(DRAFT_KEY);
    } catch {
      /* Private browsing, or storage disabled. Nothing to restore. */
    }

    /* Deferred by a frame so this is not a synchronous setState inside an
       effect, and so the first paint is the server's markup. */
    const frame = requestAnimationFrame(() => {
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          if (draft && typeof draft === "object" && Date.now() - (draft.savedAt ?? 0) < DRAFT_MAX_AGE_MS) {
            if (draft.formData) setFormData((previous) => ({ ...previous, ...draft.formData }));
            if (typeof draft.businessName === "string" && draft.businessName) setBusinessName(draft.businessName);
            if (draft.activeTab) setActiveTab(draft.activeTab);
            /* Never restored past the customisation cards: the step beyond
               them is the Stripe modal, whose client secret died with the
               page. */
            if (typeof draft.step === "number" && draft.step > 1) setStep(Math.min(6, draft.step));
            /* Or-ed with the later flags, not read alone. A draft written
               before this gate existed has no brandingUnlocked at all, and a
               reader who had already reached purchases would otherwise come
               back to find the branding they had finished hidden again. */
            if (draft.brandingUnlocked || draft.purchasesUnlocked || draft.reviewUnlocked) {
              setBrandingUnlocked(true);
            }
            if (draft.purchasesUnlocked) setPurchasesUnlocked(true);
            if (draft.reviewUnlocked) setReviewUnlocked(true);
            toast.success("Picked up where you left off.", {
              description: "Your earlier answers have been restored.",
            });
          }
        } catch {
          /* A draft written by an older build. Ignored rather than guessed at. */
        }
      }
      setDraftRestored(true);
    });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftRestored) return;

    /* Debounced: formData changes on every keystroke, and a colour picker
       fires it continuously while a thumb is dragged. */
    const timer = setTimeout(() => {
      const write = (data: Record<string, unknown>) => {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ savedAt: Date.now(), businessName, step, activeTab, brandingUnlocked, purchasesUnlocked, reviewUnlocked, formData: data }),
        );
      };
      try {
        write(formData);
      } catch {
        try {
          const lighter: Record<string, unknown> = { ...formData };
          LOGO_KEYS.forEach((key) => delete lighter[key]);
          write(lighter);
        } catch {
          /* Still no room. The wizard works without a draft; it just will not
             survive a reload, which is where it started. */
        }
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRestored, formData, businessName, step, activeTab, brandingUnlocked, purchasesUnlocked, reviewUnlocked]);

  /** Called once the answers have been acted on, so a finished draft is not
   *  offered back to somebody starting again. */
  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Nothing to clear. */
    }
  };


  // REAL-TIME NAME CHECKER
  useEffect(() => {
    if (businessName.trim().length < 2) {
      setNameStatus("idle");
      return;
    }
    setNameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await checkCompanyAvailability(businessName);
        setNameStatus(res.available ? "available" : "taken");
      } catch (err) {
        setNameStatus("error");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [businessName]);

  /**
   * True when the VAT step is answered "yes" but no number has been entered.
   *
   * Nothing required the field, so somebody could tick "VAT registered", skip
   * the number and finish setup — leaving a workspace that charges VAT on
   * invoices without the registration number those invoices are legally
   * required to display, and no prompt to go and add it.
   */
  // Named rather than inlined: the guard below and the Next button both need it,
  // and getting it wrong silently disables nothing at all — which is exactly
  // what happened when this was written as step 2.
  const VAT_STEP = 3;

  /** Steps before the branding cards take over, for the progress indicator. */
  const TOTAL_STEPS = 5;

  /** Registered at Companies House, so it has a CRN and a company UTR. */
  const isCompanyStructure = ["ltd", "plc", "cic"].includes(formData.businessStructure);
  // The one reference on this step with no register behind it, so the only
  // check available is the arithmetic inside the number itself.
  const utrNote = utrMessage(checkUtr(formData.taxReference));

  /**
   * Whether the client is asked about multicurrency at all.
   *
   * An administrator switching it on platform-wide has already made the choice,
   * so putting it to the client as an open question misrepresents it. The
   * answer is seeded to yes in that case, which is what the platform decided.
   */
  const showMulticurrencyChoice = !multicurrencyDefault;

  /**
   * Why the VAT step cannot be left, or null when it can.
   *
   * Three gates, deliberately not four:
   *
   *  - a number is required, because it must appear on every invoice issued;
   *  - it must be the right shape, which catches "123" without asking HMRC;
   *  - it must have been checked, so nobody sails past with an unverified one.
   *
   * A *successful* check is NOT required. HMRC has scheduled downtime, and the
   * production credentials are not live yet — insisting on a green tick today
   * would block every signup. So "could not check" lets you through and only a
   * definitive "HMRC has no record of this" stops you.
   */
  const vatBlockReason: string | null = (() => {
    if (formData.vatRegistered !== "yes") return null;
    const entered = formData.vatNumber?.trim() ?? "";
    if (!entered) return "Enter your VAT registration number, or set VAT registered to No.";
    if (!isPlausibleVatNumber(entered)) {
      return "A UK VAT number is 9 digits, or 12 for a branch registration.";
    }
    if (!vatCheck) return "Press Check to confirm this number before continuing.";
    if (vatCheck.status === "not_registered" || vatCheck.status === "invalid_format") {
      return "HMRC has no registration for this number. Correct it, or set VAT registered to No.";
    }
    return null;
  })();

  const vatNumberMissing = vatBlockReason !== null;

  /*
   * Carry the business's own details onto its documents.
   *
   * The branding steps ask for a VAT number and company number per document
   * type — invoice, credit note, quote and bill — which the business has
   * already given on Business Profile and Tax & Compliance. Eight boxes asking
   * for two answers, and these are the numbers a customer actually sees: a VAT
   * number typed wrongly on an invoice has to be reissued.
   *
   * Run on every advance rather than only when leaving the VAT step, because
   * the branding screens can be reached by more than one route — the wizard
   * starts at step 5 outright when a workspace name is supplied — and a seed
   * that depends on passing through one particular screen silently does
   * nothing on the others.
   *
   * Only fills what is still empty, so anything deliberately typed stands, and
   * running it repeatedly changes nothing.
   */
  const seedDocumentIdentifiers = () => {
    const vat = formData.vatRegistered === "yes" ? (formData.vatNumber ?? "").trim() : "";
    const crn = (formData.companyNumber ?? "").trim();
    if (!vat && !crn) return;

    setFormData((prev: any) => {
      const seeded = { ...prev };
      for (const doc of ["invoice", "creditNote", "quote", "bill"]) {
        if (vat && !(seeded[`${doc}VatNumber`] ?? "").trim()) seeded[`${doc}VatNumber`] = vat;
        if (crn && !(seeded[`${doc}RegNumber`] ?? "").trim()) seeded[`${doc}RegNumber`] = crn;
      }
      return seeded;
    });
  };

  const handleNext = () => {
    if (step === 1 && nameStatus !== "available") {
      toast.error("Please enter a valid, available workspace name to continue.");
      return;
    }
    if (step === VAT_STEP && vatBlockReason) {
      toast.error(vatBlockReason);
      return;
    }

    /*
     * Carry the business's own details onto its documents.
     *
     * The branding steps ask for a trading address, VAT number and company
     * number for each document type — invoice, credit note and quote — which
     * the business has already given on Business Profile and Tax & Compliance.
     * Asking again, three times over, invited a typo on the one place these
     * appear in front of a customer, and a VAT number printed wrongly on an
     * invoice is the kind of error that has to be reissued.
     *
     * Only fills what is still empty, so anything deliberately typed on a
     * document stands. Leaving this step is the moment both answers exist.
     */
    seedDocumentIdentifiers();

    setDirection(1);
    setStep((prev) => prev + 1);
  };
  
  const handleBack = () => { setDirection(-1); setStep((prev) => prev - 1); };
  const handleSkip = () => { setShowSkipModal(true); };
  const confirmSkip = () => {
    setShowSkipModal(false);
    finishSetup(); 
  };

  /* The same guarded reader the two settings pages use — one 2 MB cap and one
     MIME check across the product, rather than a third bare FileReader. */
  const handleCompanyLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared first so re-picking the same file after a rejection still fires.
    event.target.value = "";
    if (!file) return;
    try {
      updateForm("companyLogo", await readLogoFile(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  const supabase = createClient();

  const uploadLogosToStorage = async () => {
    // 🚀 FIXED: Removed 'po' from the allowed uploads
    const uploadedUrls: { company?: string, invoice?: string, creditNote?: string, quote?: string, bill?: string } = {};
    const timestamp = Date.now();

    const processUpload = async (base64Data: string | null, prefix: string) => {
      if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;
      try {
        const response = await fetch(base64Data);
        const blob = await response.blob();
        const fileExt = blob.type.split('/')[1] || 'png';
        const safeName = businessName ? businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'workspace';
        const fileName = `${safeName}-${prefix}-${timestamp}.${fileExt}`;
        const filePath = `logos/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('workspace_assets').upload(filePath, blob, { cacheControl: '3600', upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('workspace_assets').getPublicUrl(filePath);
        return publicUrl;
      } catch (error) {
        console.error(`Failed to upload ${prefix} logo:`, error);
        return null;
      }
    };

    uploadedUrls.company = (await processUpload(formData.companyLogo, 'company')) || undefined;

    /*
     * A document with no logo of its own reuses the company file rather than
     * uploading a second copy of it.
     *
     * With the box ticked and one image chosen, this is one upload and one file
     * in storage referenced five times — not five identical files, four of
     * which nothing would ever clean up. A document that had its own image
     * uploaded on its own step is untouched.
     */
    const ownOrShared = async (own: string | null, prefix: string) => {
      if (own) return (await processUpload(own, prefix)) || undefined;
      if (!formData.applyCompanyLogoToDocuments) return undefined;
      return uploadedUrls.company;
    };

    uploadedUrls.invoice = await ownOrShared(formData.invoiceLogo, 'invoice');
    uploadedUrls.creditNote = await ownOrShared(formData.creditNoteLogo, 'credit_note');
    uploadedUrls.quote = await ownOrShared(formData.quoteLogo, 'quote');
    uploadedUrls.bill = await ownOrShared(formData.billLogo, 'bill');

    return uploadedUrls;
  };

  const finishSetup = async (overrideCoaType?: string) => {
    setIsSaving(true);
    try {
      const logoUrls = await uploadLogosToStorage();

      // The admin switch wins over any client choice. When the chart-of-accounts
      // step is hidden, Admin → Security states that "the starter chart is
      // created automatically, so the accounts already exist when the client
      // first signs in" — but the blank-slate route passed "none" regardless,
      // which skipped seeding entirely and broke that promise.
      //
      // A workspace with no accounts cannot post anything: invoices, bills and
      // POS sales all resolve system accounts and throw when they are absent.
      const finalCoaType = showChartOfAccounts
        ? (overrideCoaType || formData.coaType)
        : "starter";
      
      const cleanedFormData = {
        ...formData,
        companyLogo: logoUrls.company || formData.companyLogo,
        invoiceLogo: logoUrls.invoice || formData.invoiceLogo,
        creditNoteLogo: logoUrls.creditNote || formData.creditNoteLogo,
        quoteLogo: logoUrls.quote || formData.quoteLogo,
        billLogo: logoUrls.bill || formData.billLogo,
        coaType: finalCoaType,
        businessName
      };

      const res = await completeOnboardingAndCheckout(cleanedFormData, planCode);
      
      if (res.success && res.clientSecret) {
        clearDraft();
        toast.success("Workspace built! Loading secure checkout module...");
        setClientSecret(res.clientSecret);
      } else if (res.success) {
        clearDraft();
        toast.success("Free Workspace ready!");
        // The free path provisions inside the action, so the workspace already
        // exists here and the HMRC sign-in can follow immediately — the same
        // place the paid path reaches it from, one step earlier.
        // Only when they asked for HMRC and the in-wizard connection did not
        // already succeed — a grant taken in the popup is adopted during
        // provisioning, so sending them to HMRC again would ask for the same
        // permission twice.
        const wantsHmrc =
          hmrcStatus !== "connected" &&
          cleanedFormData.connectHmrc === "yes" &&
          cleanedFormData.vatRegistered === "yes";
        window.location.href = wantsHmrc
          ? "/api/hmrc/connect"
          : "/onboarding/success?plan=free";
      } else {
        toast.error(res.error || "Failed to finalize configurations.");
      }
    } catch (err) {
      toast.error("A network error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  /*
   * Quick out, eased in — so the card's resize is what you notice.
   *
   * The exit ran 400ms over 60px, which meant the old step was still travelling
   * while the card had already collapsed to its minimum, then grew again for the
   * new one: two movements reading as a jolt. Leaving fast and arriving gently
   * lets the height animation carry the transition, so the card's edge slides to
   * its new size once.
   */
  const slideVariants = {
    hidden: (dir: number) => ({ y: dir > 0 ? 24 : -24, opacity: 0 }),
    visible: { y: 0, opacity: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 } },
    exit: (dir: number) => ({ y: dir > 0 ? -12 : 12, opacity: 0, transition: { duration: 0.16, ease: "easeOut" } })
  };

  const getCurrencySymbol = () => currencySymbol(formData.currency);
  const getDateExample = () => formData.dateFormat === "MM/DD/YYYY" ? "07/04/2026" : formData.dateFormat === "YYYY-MM-DD" ? "2026-07-04" : "04/07/2026";

  /*
   * The sales preview, rendered through the document it is previewing.
   *
   * It was its own markup — a sketch of an invoice that could not show a layout,
   * so the templates chosen here had no visible effect until after checkout. It
   * now uses the same component the settings page and the printer use, so what
   * the wizard shows is what the workspace will produce.
   */
  /** Reads whichever document type's copy of a branding field is on screen. */
  /**
   * The logo a document should show, given that it may not have its own.
   *
   * The flag is honoured here rather than by writing the company logo into
   * invoiceLogo, creditNoteLogo, quoteLogo and billLogo. Those four would each
   * hold a full copy of the same data URL — five in the draft that is saved to
   * localStorage, and five uploads of one file on the way out.
   *
   * "No logo of its own" therefore means "use the company logo", which is also
   * what Remove on a document step now means. Somebody who wants a document
   * with no mark at all unticks the box.
   */
  const shared = formData.applyCompanyLogoToDocuments ? formData.companyLogo : null;
  const documentLogo = (own: unknown) => (typeof own === "string" && own ? own : shared);

  /* Deliberately not pushed into the steps' own form state.
     
     Resolving there too would leave the emblem card showing the company logo
     with a Remove button beside it that cannot remove anything: clearing the
     field falls straight back to the same image. The card keeps reading the
     document's own value — so it says "No Emblem", Remove works, and Upload
     means what it says — while everything that renders the actual document
     resolves, because the company logo is what would print. */

  const salesField = (field: string) =>
    formData[
      `${activeTab === "invoice" ? "invoice" : activeTab === "credit_note" ? "creditNote" : "quote"}${field}` as keyof typeof formData
    ];

  /* Which identifier columns the line table carries, as the document expects
     it: a comma separated list, or "none" when all three are switched off. */
  const onboardingLineDetail =
    [
      formData.invoiceShowRefCode === false ? null : "reference",
      formData.invoiceShowCategory === false ? null : "category",
      formData.invoiceShowLocation === false ? null : "location",
    ]
      .filter(Boolean)
      .join(",") || "none";

  const onboardingSalesConfig = parseInvoiceTemplateConfig({
    theme: formData.documentTheme,
    logo: documentLogo(salesField("Logo")),
    brandColor: salesField("BrandColor"),
    secondaryColor: salesField("SecondaryColor"),
    tertiaryColor: salesField("TertiaryColor"),
    textColor: salesField("TextColor"),
    font: salesField("Template"),
    companyAddress: salesField("CompanyAddress"),
    vatNumber: salesField("VatNumber"),
    regNumber: salesField("RegNumber"),
    paperSize: salesField("PaperSize"),
    preparedBy: salesField("PreparedBy"),
    logoInitials: salesField("LogoInitials"),
    logoPosition: salesField("LogoPosition") || "left",
    bankName: formData.docBankName,
    sortCode: formData.docSortCode,
    accountNumber: formData.docAccountNumber,
    iban: formData.docIban,
    bic: formData.docBic,
    contactEmail: formData.docContactEmail,
    contactPhone: formData.docContactPhone,
    showTax: formData.invoiceShowTax !== false,
    showUnitPrice: formData.invoiceShowUnitPrice !== false,
    showShipping: formData.invoiceShowShipping !== false,
    showLineDate: formData.invoiceShowLineDate === true,
    lineDetail: onboardingLineDetail,
    notes: salesField("Notes"),
    footer: salesField("Footer"),
  });

  /** Stand-in figures, so a layout can be judged before any real document exists. */
  const onboardingSalesDocument: PrintableInvoice = {
    id: "preview",
    invoiceNo: "INV-000001",
    status: "approved",
    issueDate: "2026-05-18",
    dueDate: "2026-06-17",
    currency: formData.currency,
    contactName: "Acme Corporation",
    billingAddress: ["123 Client Street", "Tech District, London"].join(String.fromCharCode(10)),
    subtotalMinor: 120000,
    taxMinor: 24000,
    totalMinor: 144000,
    amountPaidMinor: 0,
    /* Two lines, each carrying a location, so the column switches below the
       form have something to show. With a single bare line, turning the
       Location or Category column on printed a row of dashes and read as the
       switch doing nothing. */
    lines: [
      {
        description: "Premium SaaS development service",
        accountCode: "SRV-001",
        accountName: "Services",
        location: "London",
        quantity: 1,
        unitPriceMinor: 90000,
        subtotalMinor: 90000,
        taxRate: 20,
        taxMinor: 18000,
        totalMinor: 108000,
      },
      {
        description: "Onboarding and configuration",
        accountCode: "SRV-014",
        accountName: "Consultancy",
        location: "Remote",
        quantity: 2,
        unitPriceMinor: 15000,
        subtotalMinor: 30000,
        taxRate: 20,
        taxMinor: 6000,
        totalMinor: 36000,
      },
    ],
    organization: { name: businessName || "Your company" },
  };

  const OnboardingPreviewCanvas = ({
    customClass,
    highlight = null,
  }: {
    customClass?: string;
    highlight?: InvoicePreviewHighlight;
  }) => (
    <div className={customClass}>
      <InvoicePrintDocument
        invoice={onboardingSalesDocument}
        config={onboardingSalesConfig}
        documentLabel={activeTab === "credit_note" ? "Credit note" : activeTab === "quote" ? "Quote" : "Invoice"}
        displayMode="preview"
        previewHighlight={highlight}
      />
    </div>
  );

  /*
   * What the preview shows, decided by the section being edited.
   *
   * A whole invoice at a third of its size cannot tell anybody whether their
   * emblem reads, and a document with nothing picked out cannot tell them
   * which of forty fields they just changed. So the emblem section gets the
   * mark on its own, and every other section lights the block it is about.
   */
  const salesPreviewKey = salesKeys[Math.min(salesSection, salesKeys.length - 1)];
  const salesPreviewHighlight: InvoicePreviewHighlight =
    salesPreviewKey === "company"
      ? "address"
      : salesPreviewKey === "payment"
        ? "payment"
        : salesPreviewKey === "columns"
          ? "lines"
          : null;
  const salesPreviewTitle =
    salesPreviewKey === "logo"
      ? "Your emblem"
      : salesPreviewKey === "apply"
        ? "Document Templates"
        : "Live document";
  const salesPreviewBlurb =
    salesPreviewKey === "logo"
      ? "Every size it will be seen at, from the letterhead down to the browser tab."
      : salesPreviewKey === "style"
        ? "The whole sheet, in the layout and colours you are choosing."
        : salesPreviewKey === "company"
          ? "Your details as your customer reads them, picked out on the page."
          : salesPreviewKey === "payment"
            ? "The payment block and terms, exactly as they will print."
            : salesPreviewKey === "columns"
              ? "The line table. Switch a column and watch it appear or go."
              : "This is how your invoices, credit notes and quotes will look.";

  /*
   * The bill preview, rendered through the document it is previewing.
   *
   * It was 120 lines of hand-drawn markup that could not show any of the six
   * layouts, so the bill previewed here looked nothing like the one the
   * finished workspace prints. The purchases settings screen already renders a
   * bill through the shared themed document; this now does the same.
   */
  const onboardingBillConfig = parseInvoiceTemplateConfig({
    theme: formData.billTheme,
    logo: documentLogo(formData.billLogo),
    brandColor: formData.billBrandColor,
    secondaryColor: formData.billSecondaryColor,
    tertiaryColor: formData.billTertiaryColor,
    textColor: formData.billTextColor,
    font: formData.billTemplate,
    companyAddress: formData.billCompanyAddress,
    vatNumber: formData.billVatNumber,
    regNumber: formData.billRegNumber,
    paperSize: formData.billPaperSize,
    logoInitials: formData.billLogoInitials,
    logoPosition: formData.billLogoPosition || "left",
    showTax: formData.billShowTax !== false,
    showUnitPrice: formData.billShowUnitPrice !== false,
    notes: formData.billNotes,
    footer: formData.billFooter,
  });

  /** A stand-in bill, so a layout can be judged before any real one exists. */
  const onboardingBillDocument: PrintableInvoice = {
    id: "bill-preview",
    invoiceNo: `${formData.billPrefix ?? "BILL-"}${formData.nextBillNumber ?? "1001"}`,
    status: "approved",
    issueDate: "2026-05-18",
    dueDate: "2026-06-17",
    currency: formData.defaultCurrency || formData.currency, // currency:allow mirrors the purchase default
    contactName: "Acme Supplies Co.",
    billingAddress: ["Warehouse 4B", "London"].join(String.fromCharCode(10)),
    subtotalMinor: 48000,
    taxMinor: 9600,
    totalMinor: 57600,
    amountPaidMinor: 0,
    lines: [
      {
        description: "Office supplies — monthly order",
        accountCode: "6000",
        accountName: "General Expenses",
        quantity: 1,
        unitPriceMinor: 32000,
        subtotalMinor: 32000,
        taxRate: 20,
        taxMinor: 6400,
        totalMinor: 38400,
      },
      {
        description: "Courier and delivery",
        accountCode: "6020",
        accountName: "Carriage",
        quantity: 2,
        unitPriceMinor: 8000,
        subtotalMinor: 16000,
        taxRate: 20,
        taxMinor: 3200,
        totalMinor: 19200,
      },
    ],
    organization: { name: businessName || "Your company" },
  };

  const OnboardingPurchasePreviewCanvas = ({
    customClass,
    highlight = null,
  }: {
    customClass?: string;
    highlight?: InvoicePreviewHighlight;
  }) => (
    <div className={customClass}>
      <InvoicePrintDocument
        invoice={onboardingBillDocument}
        config={onboardingBillConfig}
        documentLabel="Bill"
        displayMode="preview"
        previewHighlight={highlight}
      />
    </div>
  );

  /* What the purchases preview shows. Numbering, defaults and approvals decide
     things a printed bill never displays, so those get the system panel. */
  const purchasePreviewKey = PURCHASE_SECTION_KEYS[Math.min(purchaseSection, PURCHASE_SECTION_KEYS.length - 1)];
  const purchaseShowsDocument = ["style", "sender", "notes", "finish"].includes(purchasePreviewKey);
  const purchasePreviewHighlight: InvoicePreviewHighlight =
    purchasePreviewKey === "sender" ? "address" : purchasePreviewKey === "notes" ? "notes" : null;
  const purchasePreviewTitle =
    purchasePreviewKey === "emblem"
      ? "Your bill emblem"
      : purchaseShowsDocument
        ? "Bill record"
        : "How bills behave";
  const purchasePreviewBlurb =
    purchasePreviewKey === "numbering"
      ? "The next reference each bill and claim will be filed under."
      : purchasePreviewKey === "defaults"
        ? "What a new bill starts with before anybody edits it."
        : purchasePreviewKey === "approvals"
          ? "Whether a bill waits for a second person before it posts."
          : purchasePreviewKey === "emblem"
            ? "Every size it will be seen at on your own records."
            : purchasePreviewKey === "style"
              ? "The whole sheet, in the layout and colours you are choosing."
              : purchasePreviewKey === "sender"
                ? "Your details on your copy of the bill, picked out on the page."
                : purchasePreviewKey === "notes"
                  ? "Your standing notes and the footer, exactly as they print."
                  : "Your bill layout, finished.";

  /*
   * The panel's contents, declared once and rendered twice.
   *
   * Below the lg breakpoint the column beside the form is hidden, so on a
   * phone every explanation on it — where to find a UTR, what VAT turns on,
   * what the first three moves are — simply did not exist. The same markup
   * now also fills a sheet the reader can open, rather than being written
   * twice and drifting apart.
   */
  const panelContent = (
    <>
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="space-y-8">
                      {/* One card, not two.
                          Two mocked previews side by side read as a summary of
                          data the workspace already holds, which on the first
                          screen of setup it plainly does not — the reported
                          impression was of already having details and too much
                          going on. What matters here is simply how the two
                          choices above will look, so they are shown together
                          once, in the shape of a single document line. */}
                      <div>
                        <h3 className="text-white text-2xl font-bold mb-2">How this will look</h3>
                        <p className="text-slate-400 text-sm">
                          Your currency and date format appear on every invoice, bill and report.
                        </p>
                        {/* No "example only" note here any more.
                            It was written for a mocked invoice line showing a
                            made-up total, which a tester read as a real
                            balance. That mock is gone; these are screenshots of
                            the product, so the warning it carried would now be
                            describing something that is not on the screen. */}
                      </div>
                      {/* The three settings on this step, shown rather than
                          described. The mocked invoice line that used to sit
                          here said the same thing the form already says; a
                          picture of each setting in the product answers the
                          question the form cannot — what does choosing this
                          actually change? */}
                      <StepOneShowcase />
                    </motion.div>
                  )}
                  {step === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                      <StepTwoShowcase
                        businessStructure={formData.businessStructure}
                        hasCis={formData.hasCis}
                        activeField={activeReferenceField}
                      />
                    </motion.div>
                  )}
                  {step === 3 && (
                    <motion.div key="step3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                      <StepThreeShowcase
                        vatRegistered={formData.vatRegistered}
                        vatFrequency={formData.vatFrequency}
                        hmrcConnected={hmrcStatus === "connected"}
                        currencySymbol={getCurrencySymbol()}
                      />
                    </motion.div>
                  )}
                  {step === 4 && (
                    <motion.div key="step4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                      <StepFourShowcase
                        migrationSource={formData.migrationSource}
                        topPriority={formData.topPriority}
                      />
                    </motion.div>
                  )}
                  {step === 5 && (
                    <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <StepFiveShowcase showChartOfAccounts={showChartOfAccounts} />
                    </motion.div>
                  )}
                </AnimatePresence>
    </>
  );

  return (
    <>
      <AnimatePresence>
        {clientSecret && (
          <div className="fixed inset-0 z-[10000] bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ scale: 0.96, opacity: 0, y: 15 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.96, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
              className="w-full max-w-2xl bg-white rounded-[2rem] shadow-[0_40px_100px_-20px_rgba(15,23,42,0.25)] border border-slate-100/80 overflow-hidden relative flex flex-col max-h-[90vh]"
            >
              <div className="w-full p-6 sm:p-8 pb-4 relative shrink-0 text-center border-b border-slate-50">
                <button 
                  type="button"
                  onClick={() => setClientSecret(null)} 
                  className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 size-8 rounded-xl transition-all flex items-center justify-center z-50 cursor-pointer active:scale-95 border border-transparent hover:border-slate-200/60"
                  title="Close and Back"
                >
                  <span className="text-base font-light select-none leading-none">✕</span>
                </button>
                <div className="mx-auto w-11 h-11 bg-blue-50 border border-blue-100/60 text-blue-600 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
                  <ShieldCheck className="size-5 stroke-[2.2]" />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Start your subscription</h3>
                <p className="text-xs font-semibold text-slate-400/90 max-w-sm mx-auto mt-1 leading-relaxed">
                  Enter your card details to finish. Payment is handled securely by Stripe.
                </p>
                {/* Said before the card form, not after it.
                    Stripe prints the trial terms below its own Start trial
                    button, past the fold of a modal that scrolls — so the one
                    reassurance somebody wants before typing a card number was
                    the last thing on the screen. */}
                <p className="mx-auto mt-2.5 max-w-sm rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[11px] font-semibold leading-relaxed text-emerald-800">
                  You will not be charged during your free trial. Cancel any time before it ends and
                  nothing is taken.{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold underline underline-offset-2 hover:text-emerald-900"
                  >
                    Read the terms and conditions
                  </a>
                  .
                </p>
              </div>
              <div className="w-full overflow-y-auto px-6 sm:px-8 pr-3 sm:pr-4 pb-6 flex-1 max-h-[calc(90vh-160px)]
                [&::-webkit-scrollbar]:w-1.5 
                [&::-webkit-scrollbar-track]:bg-transparent 
                [&::-webkit-scrollbar-thumb]:bg-slate-200 
                [&::-webkit-scrollbar-thumb]:rounded-full 
                hover:[&::-webkit-scrollbar-thumb]:bg-slate-300/80
                transition-colors"
              >
                <div className="w-full mx-auto overflow-visible rounded-2xl border border-slate-100/90 shadow-sm bg-white p-1 mt-4 mb-2">
                  <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSkipModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSkipModal(false)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 15 }} transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} className="w-full max-w-md bg-white rounded-[2.5rem] shadow-[0_30px_70px_-10px_rgba(15,23,42,0.18)] border border-slate-100 p-8 text-center relative z-10 space-y-6">
              <div className="mx-auto w-16 h-16 bg-orange-50 border border-orange-100 text-orange-500 rounded-full flex items-center justify-center text-3xl font-bold select-none animate-bounce">🥺</div>
              <div className="space-y-2"><h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Are you sure?</h3><p className="text-slate-500 text-sm font-medium leading-relaxed px-2">If you skip now, default settings will be applied. You can always change them later!</p></div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowSkipModal(false)} className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">No, go back</Button>
                <Button onClick={confirmSkip} className="flex-1 h-12 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold shadow-lg shadow-orange-600/10 transition-transform active:scale-98">
                  {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : "Yes, skip & checkout"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* The "Confirm Blank Slate?" dialog is gone with the option it guarded.
          Nothing here needs confirming any more: finishing early now produces a
          standard workspace rather than an empty one. */}

      <AnimatePresence>
        {isFullscreen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setFullscreenDoc(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-zoom-out" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 w-full max-w-3xl max-h-full flex flex-col bg-slate-100 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-700">
              <div className="bg-slate-900 p-4 px-6 flex justify-between items-center shrink-0"><div className="flex items-center gap-2 text-white"><Eye className="size-5 text-blue-400" /><span className="text-sm font-bold uppercase tracking-wider">Live Document Preview</span></div><Button variant="ghost" onClick={() => setFullscreenDoc(null)} className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl h-8 px-3 text-xs font-bold transition-colors">Close Preview</Button></div>
              <div className="flex-1 p-6 md:p-10 overflow-y-auto flex items-start justify-center custom-scrollbar bg-slate-500/10"><div className="w-full max-w-[800px]">
  {fullscreenDoc === "bill" ? (
    <OnboardingPurchasePreviewCanvas customClass="shadow-2xl border border-slate-200 text-[11px] sm:text-[13px] p-8 sm:p-14 rounded-none bg-white" />
  ) : (
    <OnboardingPreviewCanvas customClass="shadow-2xl border border-slate-200 text-[11px] sm:text-[13px] p-8 sm:p-14 rounded-none bg-white" />
  )}
</div></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {handingOff ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="fixed inset-0 z-[95] grid place-items-center bg-[#0B0F19]/95 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center px-6 text-center">
              {/* The same mark as the bubble, so it reads as him coming
                  forward rather than as a new thing appearing. */}
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-2xl shadow-blue-600/40"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/40" />
                <Sparkles className="relative size-7" />
              </motion.span>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.3 }}
                className="m-0 mt-6 text-lg font-bold text-white"
              >
                Taking you to your branding
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="m-0 mt-2 max-w-sm text-sm leading-relaxed text-slate-400"
              >
                Your logo, colours and layouts next, then how bills are numbered and approved. I
                will be here the whole way — ask me anything.
              </motion.p>

              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="mt-7 h-0.5 w-40 origin-left rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Aurelius. One bubble for the whole wizard rather than a panel per
          step: the right-hand side already shows what each choice does, and
          what it cannot do is answer the question somebody actually has.
          Hidden once the answers are in and the card form is open — nobody
          wants a chat prompt over their card number. */}
      {step <= 5 && !clientSecret ? (
        <AureliusBubble
          step={step}
          planInput={{
            businessName,
            businessStructure: formData.businessStructure,
            focusAreas,
            booksToday: formData.migrationSource,
            notes: formData.setupNotes,
            vatRegistered: formData.vatRegistered === "yes",
            currency: formData.currency,
          }}
        />
      ) : null}

      <div ref={scrollContainerRef} className="w-full h-dvh overflow-x-hidden overflow-y-auto bg-slate-50 custom-scrollbar scroll-smooth">
        <AnimatePresence mode="wait">
        
        {step < 6 && (
          <motion.div key="phase1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} className="flex flex-col lg:flex-row min-h-screen lg:h-dvh lg:min-h-0 bg-white font-sans overflow-hidden select-none relative">
            {/* Depth rather than pattern.
                A 40px line grid reads as a design-tool canvas, and a repeating
                geometry directly behind a form competes with the fields for the
                eye — every cell edge is a line the reader has to dismiss. Two
                very diffuse washes give the page somewhere to recede to without
                anything to focus on, which is what makes a form feel calm
                rather than empty. */}
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 pointer-events-none" />
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[620px] w-[900px] rounded-full bg-blue-500/[0.07] blur-[130px] pointer-events-none z-0" />
            <div className="absolute bottom-[-220px] right-[-140px] h-[520px] w-[520px] rounded-full bg-indigo-400/[0.06] blur-[120px] pointer-events-none z-0" />

            {/* One centred column, and the page scrolls rather than the card.
                The card was a fixed 800px with its own overflow, which is what
                put a scrollbar inside it and left the footer stranded in a grey
                bar while short steps floated in white space. A setup form should
                be as tall as its questions. */}
            {/* The bottom padding clears the navigation, which is fixed to the
                viewport and therefore out of flow — nothing below reserves
                space for it. It was 28 (112px) against a bar about 80px tall,
                which was enough while every step was short. Step five now
                carries the whole answer summary, and its last rows finished
                underneath the bar. 40 leaves room for the bar plus the
                safe-area inset on a phone, with margin. */}
            <div className="flex-1 relative flex flex-col items-center px-3 sm:px-4 pt-6 sm:pt-16 pb-40 sm:pb-44 z-10 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
              {/* A softer, wider shadow now the page behind it is pale rather
                  than grey — on a light ground a tight shadow reads as a border,
                  a diffuse one reads as height.

                  `layout` is what smooths the height between steps. Each step
                  has a different number of questions, so the card was snapping
                  from short to tall as the content swapped, which reads as the
                  page jolting rather than the form moving on. Framer measures
                  before and after and animates the difference, so the edge
                  travels instead of teleporting. The eased curve is the same one
                  the step content uses, so the two move together.

                  layoutDependency pins that measurement to the step, so the
                  card is not re-projected on every render — step 4 has a block
                  that animates its own height, and there is no reason for the
                  card to re-measure while it does.

                  shrink-0 is what stops the card being cut off, and the reason
                  is worth writing down because it is invisible in the markup.
                  This card is a flex item in a column that becomes a fixed
                  viewport-height scroller at lg. A flex item is normally
                  protected from shrinking below its content by an automatic
                  minimum size — but that protection is dropped for any item
                  whose overflow is not visible, and this card clips to its
                  rounded corners. So on the tall steps the card was squashed to
                  the height of the column and quietly ate its own last
                  question: the notes box on step 4, the last groups of the
                  review on step 5. Holding its natural height lets the column
                  scroll instead, which is what the overflow-y-auto there was
                  always for. */}
              <motion.div
                layout
                layoutDependency={step}
                transition={{ layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
                className="w-full max-w-xl shrink-0 bg-white rounded-xl sm:rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_64px_-24px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/[0.06] flex flex-col overflow-hidden"
              >
                {/* Where am I, and how much is left. The single thing this
                    wizard lacked that every comparable product has. */}
                <div className="px-5 pt-6 sm:px-8 sm:pt-7">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Step {step} of {TOTAL_STEPS}</span>
                    <div className="flex items-center gap-3">
                      {/* Only below lg, where the panel beside the form is
                          hidden. Named for what it holds rather than labelled
                          "info", so it is worth pressing. */}
                      <button
                        type="button"
                        onClick={() => setPanelOpen(true)}
                        aria-label="Open the panel explaining this step"
                        className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95 lg:hidden"
                      >
                        <PanelRight className="size-4" />
                      </button>
                      <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-1 rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                    />
                  </div>
                </div>

                {/* A floor, not a fixed height.
                    Fixing it is what left short steps stranded in white space
                    and forced the content to scroll inside the card; letting it
                    fit content made the footer jump about between steps. A
                    minimum settles both: short steps hold a stable shape, long
                    ones grow, and because the card is anchored to the top of the
                    page rather than centred, the heading never moves — only the
                    footer travels, and only when a step genuinely needs the
                    room. */}
                <div className="px-5 py-6 sm:px-8 sm:py-8 flex flex-col justify-start min-h-[300px] sm:min-h-[420px]">
                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.div key={step} custom={direction} variants={slideVariants as any} initial="hidden" animate="visible" exit="exit" className="w-full">
                      
                      {step === 1 && (
                        <div className="space-y-7">
                          {/* Left-aligned, no decorative circle. Centring a form
                              heading makes the eye hunt for the start of each
                              line, and the icon medallion cost about 140px
                              before the first question on every step. */}
                          <div className="mb-2">
                            <h2 className="text-[28px] font-black leading-tight tracking-tight text-[#0B0F19]">Your workspace</h2>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                              Name it, and choose the currency and date format your books will use.
                            </p>
                          </div>
                          
                          <div className="space-y-8">
                            <div className="space-y-3 relative mb-6">
                              <Label className={LABEL_CLASS}>Company&rsquo;s trading name / organisation *</Label>
                              <div className="relative">
                                <Input 
                                  placeholder="e.g., WAWPROFI LTD" 
                                  className={`h-14 px-5 pr-14 text-lg rounded-xl bg-slate-50 border-2 focus-visible:bg-white transition-all shadow-sm ${
                                    nameStatus === "available" ? "border-green-400 focus-visible:ring-green-600/10" : 
                                    nameStatus === "taken" ? "border-orange-400 focus-visible:ring-orange-600/10" : 
                                    "border-slate-200 focus-visible:border-blue-600 focus-visible:ring-4 focus-visible:ring-blue-600/10"
                                  }`}
                                  value={businessName}
                                  onChange={(e) => setBusinessName(e.target.value)}
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                  {nameStatus === "checking" && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                                  {nameStatus === "available" && <CheckCircle className="h-5 w-5 text-green-500" />}
                                  {nameStatus === "taken" && <AlertCircle className="h-5 w-5 text-orange-500" />}
                                </div>
                              </div>
                              <div className="h-4 mt-1">
                                <AnimatePresence mode="wait">
                                  {nameStatus === "available" && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-bold text-green-600 flex items-center gap-1">✨ Perfect! This workspace name is available.</motion.p>}
                                  {nameStatus === "taken" && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-bold text-orange-500 flex items-center gap-1">⚠️ Name is taken. Try adding a location!</motion.p>}
                                </AnimatePresence>
                              </div>
                            </div>

                            {/* Directly under the name, because it is the
                                same question asked twice: what is this
                                workspace called, and what does it look like.
                                Optional and visibly so — a business without a
                                logo to hand must not feel stopped here, so the
                                control is a quiet row rather than a dropzone
                                the size of the field above it. */}
                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>
                                Company logo{" "}
                                <span className="ml-1 font-medium normal-case tracking-normal text-slate-400">
                                  — optional
                                </span>
                              </Label>

                              <div className="flex items-center gap-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
                                <div
                                  className={`grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl ${
                                    formData.companyLogo
                                      ? "bg-white shadow-sm"
                                      : "border-2 border-dashed border-slate-300 bg-white text-lg font-black text-slate-300"
                                  }`}
                                >
                                  {formData.companyLogo ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={formData.companyLogo}
                                      alt=""
                                      className="size-full object-contain"
                                    />
                                  ) : (
                                    (businessName.trim().charAt(0) || "?").toUpperCase()
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="relative h-9 gap-2 rounded-lg border-slate-200 bg-white text-xs font-bold shadow-sm"
                                    >
                                      <Upload className="size-3.5" />
                                      {formData.companyLogo ? "Replace" : "Upload logo"}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleCompanyLogo}
                                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                                      />
                                    </Button>

                                    {formData.companyLogo && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateForm("companyLogo", null)}
                                        className="h-9 rounded-lg text-xs font-bold text-slate-500 hover:bg-red-50 hover:text-red-600"
                                      >
                                        <Trash2 className="mr-1.5 size-3.5" /> Remove
                                      </Button>
                                    )}
                                  </div>

                                  <p className="m-0 mt-2 text-xs leading-relaxed text-slate-500">
                                    Shown in your sidebar. PNG, SVG or JPG, up to {MAX_LOGO_MB} MB.
                                    Skip it and we will use the first letter of your name — you can
                                    add one any time in Workspace Settings.
                                  </p>

                                  {/* Only once there is a logo to apply. Offered
                                      beforehand it is a promise about a file
                                      that does not exist yet. */}
                                  {formData.companyLogo && (
                                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
                                      <input
                                        type="checkbox"
                                        checked={formData.applyCompanyLogoToDocuments !== false}
                                        onChange={(event) =>
                                          updateForm(
                                            "applyCompanyLogoToDocuments",
                                            event.target.checked
                                          )
                                        }
                                        className="mt-0.5 size-4 shrink-0 accent-blue-600"
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-xs font-bold text-slate-900">
                                          Use this on my invoices, quotes and bills too
                                        </span>
                                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                                          You can still upload a different mark for any document
                                          further on, and change all of it later in Settings.
                                        </span>
                                      </span>
                                    </label>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <Label className={LABEL_CLASS} htmlFor="primary-currency">Primary Currency</Label>
                              {/* A searchable list rather than a row of tiles.
                                  Five tiles read as the complete set of
                                  currencies the product knows about, so anybody
                                  outside them could not tell whether they had
                                  missed something or the product could not
                                  serve them. The picker matches on country, so
                                  "Australia" finds AUD.

                                  availableOnly: signing up is the wrong moment
                                  to be shown thirty-four currencies that cannot
                                  be chosen. Somebody who searches for one is
                                  told so by name instead. */}
                              <CurrencyPicker
                                id="primary-currency"
                                value={formData.currency}
                                onChange={(code) => updateForm("currency", code)}
                                availableOnly
                              />
                              <p className="m-0 text-xs leading-relaxed text-slate-500">
                                Every invoice, bill and report is kept in this. You can change it
                                while the workspace is empty, but not once anything has been
                                recorded — so pick the one your business actually banks in.
                              </p>
                            </div>

                            {/* Asked here because the answer is about the
                                currency just chosen: the books stay in it
                                either way, and this only decides whether a
                                document may be raised in another. Changing the
                                base currency later is a migration, so a
                                business that already trades in more than one
                                should say so now.

                                Hidden when an administrator has switched
                                multicurrency on platform-wide, which is the same
                                bargain the chart-of-accounts step makes: a
                                platform that has already decided should not put
                                the decision to the client as though it were
                                open. The answer is set to yes in that case, so
                                nothing is lost by not asking. */}
                            {showMulticurrencyChoice && (
                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>Do you trade in more than one currency?</Label>
                              <RadioGroup value={formData.multicurrency} onValueChange={(val) => updateForm("multicurrency", val)} className="grid grid-cols-2 gap-4">
                                {[
                                  { id: "no", label: "One currency only", sub: `Everything in ${formData.currency}` },
                                  { id: "yes", label: "More than one", sub: "Invoice and bill in other currencies" },
                                ].map((item) => (
                                  <Label key={item.id} htmlFor={`multi-${item.id}`} className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.multicurrency === item.id ? "border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-600/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}>
                                    <RadioGroupItem value={item.id} id={`multi-${item.id}`} className="sr-only" />
                                    <span className="font-bold text-sm">{item.label}</span>
                                    <span className="mt-0.5 text-center text-[10px] font-medium text-slate-500">{item.sub}</span>
                                  </Label>
                                ))}
                              </RadioGroup>
                            </div>
                            )}

                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>Date Format</Label>
                              <RadioGroup value={formData.dateFormat} onValueChange={(val) => updateForm("dateFormat", val)} className="grid grid-cols-3 gap-2 sm:gap-4">
                                {[{ id: "DD/MM/YYYY", label: "04/07/2026", sub: "UK / EU" }, { id: "MM/DD/YYYY", label: "07/04/2026", sub: "US Format" }, { id: "YYYY-MM-DD", label: "2026-07-04", sub: "ISO Standard" }].map((item) => (
                                  <Label key={item.id} htmlFor={`date-${item.id}`} className={`flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer justify-center ${formData.dateFormat === item.id ? "border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-600/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}>
                                    <RadioGroupItem value={item.id} id={`date-${item.id}`} className="sr-only" />
                                    <div className="flex items-center gap-2 mb-1"><CalendarDays className="h-3 w-3" /><span className="font-bold text-xs">{item.sub}</span></div>
                                    <span className="text-[10px] font-medium text-slate-500">{item.label}</span>
                                  </Label>
                                ))}
                              </RadioGroup>
                            </div>

                            {/* The preview lives in the panel beside this
                                form, not here as well. Showing the same date
                                and total twice on one screen makes a reader
                                check whether they differ. */}
                          </div>
                        </div>
                      )}

                      {step === 2 && (
                        <div className="space-y-8">
                          <div className="mb-2">
                            <h2 className="text-[28px] font-black leading-tight tracking-tight text-[#0B0F19]">About your business</h2>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">How you are set up decides which taxes apply and which references we ask for.</p>
                          </div>
                          <div className="space-y-6">
                            {/* Six structures across two rows. "Private" is
                                stated rather than implied — a plain "Limited
                                Co." reads as covering a PLC, which files under
                                a different regime — and a CIC is here because
                                it is a company within the charge to corporation
                                tax, which people routinely assume it is not. */}
                            <RadioGroup value={formData.businessStructure} onValueChange={(val) => updateForm("businessStructure", val)} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
                              {[
                                /* Named the way Companies House names them, so
                                   the tile matches what is on the certificate
                                   of incorporation somebody is reading off. */
                                { id: "ltd", label: "Private company", sub: "Ltd", icon: Building2 },
                                { id: "plc", label: "Public limited", sub: "PLC", icon: Building2 },
                                { id: "cic", label: "Community Interest", sub: "CIC", icon: Users },
                                { id: "sole", label: "Sole Trader", sub: "Self-Employed", icon: User },
                                { id: "llp", label: "LLP", sub: "Limited liability", icon: Users },
                                { id: "other", label: "Other", sub: "Charity or unlisted", icon: Building2 },
                              ].map((item) => (
                                <Label key={item.id} htmlFor={`struct-${item.id}`} className={`flex h-full flex-col items-center justify-start p-6 rounded-2xl border-2 cursor-pointer relative ${formData.businessStructure === item.id ? "border-orange-500 bg-orange-50/50 shadow-md ring-4 ring-orange-500/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}>
                                  <RadioGroupItem value={item.id} id={`struct-${item.id}`} className="sr-only" />
                                  <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-3 ${formData.businessStructure === item.id ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"}`}><item.icon className="h-6 w-6" /></div>
                                  <span className="font-bold text-center text-sm">{item.label}</span>
                                  <span className="text-[10px] text-slate-500 mt-0.5 font-medium">{item.sub}</span>
                                </Label>
                              ))}
                            </RadioGroup>
                            {/* Which references apply follows from the structure
                                chosen above, which is why they live here rather
                                than on the defaults screen. A company has a
                                registration number and a company UTR; a sole
                                trader has neither — they have their own
                                personal UTR, which is a different number and
                                asking for "the UTR" gets the wrong one. */}
                            {/* Only for the structures that are on the
                                register. A sole trader has no Companies House
                                record to find, so offering to search for one
                                would be an invitation to pick somebody else's
                                company. */}
                            {isCompanyStructure && (
                              <CompaniesHouseLookup
                                search={searchCompaniesHouseOnboarding}
                                load={fillFromCompaniesHouseOnboarding}
                                inputClassName={FIELD_CLASS}
                                onFill={(company) => {
                                  setFormData((current) => ({
                                    ...current,
                                    companyNumber: company.companyNumber,
                                    businessStructure: company.structure ?? current.businessStructure,
                                    financialYearEnd: company.financialYearEnd ?? current.financialYearEnd,
                                    industry: company.industry ?? current.industry,
                                  }));
                                }}
                              />
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 sm:pt-4">
                              {isCompanyStructure ? (
                                <>
                                  <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Company Number (CRN)</Label>
                                    <Input placeholder="e.g. 12345678" className={FIELD_CLASS} value={formData.companyNumber} onChange={(e) => updateForm("companyNumber", e.target.value)} onFocus={() => setActiveReferenceField("companyNumber")} onBlur={() => setActiveReferenceField(null)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Company UTR Number</Label>
                                    <Input placeholder="e.g. 12345 67890" className={FIELD_CLASS} value={formData.taxReference} onChange={(e) => updateForm("taxReference", e.target.value)} onFocus={() => setActiveReferenceField("taxReference")} onBlur={() => setActiveReferenceField(null)} />
                                    {utrNote && (
                                      <p className={`ml-1 text-[11px] font-medium ${utrNote.tone === "ok" ? "text-emerald-600" : "text-amber-600"}`}>{utrNote.text}</p>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-2 md:col-span-2">
                                  <Label className={LABEL_CLASS}>
                                    {formData.businessStructure === "llp" ? "LLP UTR Number" : "Sole Trader UTR Number"}
                                  </Label>
                                  <Input placeholder="e.g. 12345 67890" className={FIELD_CLASS} value={formData.taxReference} onChange={(e) => updateForm("taxReference", e.target.value)} onFocus={() => setActiveReferenceField("taxReference")} onBlur={() => setActiveReferenceField(null)} />
                                  {utrNote ? (
                                    <p className={`ml-1 text-[11px] font-medium ${utrNote.tone === "ok" ? "text-emerald-600" : "text-amber-600"}`}>{utrNote.text}</p>
                                  ) : (
                                    <p className="text-[11px] text-slate-500 ml-1">
                                      Your own Unique Taxpayer Reference, quoted on every self assessment.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Grouped with the other references rather than
                                sitting on the VAT screen: both are facts about
                                how the business is set up, not about VAT. */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className={LABEL_CLASS}>Employer PAYE Reference</Label>
                                <Input placeholder="e.g. 123/AB456" className={FIELD_CLASS} value={formData.payeReference} onChange={(e) => updateForm("payeReference", e.target.value)} onFocus={() => setActiveReferenceField("payeReference")} onBlur={() => setActiveReferenceField(null)} />
                                <p className="text-[11px] text-slate-500 ml-1">Only if you run payroll.</p>
                              </div>
                              <div className="space-y-2">
                                {/* "Do you pay subcontractors", not "do you use
                                    contractors". Under CIS the business asking
                                    this question is the contractor, and the
                                    people it pays are the subcontractors —
                                    asking it the other way round invites the
                                    wrong answer from exactly the businesses
                                    this applies to. Matches the wording already
                                    used in Workspace Settings. */}
                                <Label className={LABEL_CLASS}>Pay CIS subcontractors?</Label>
                                <Select value={formData.hasCis} onValueChange={(val) => updateForm("hasCis", val)}>
                                  <SelectTrigger className={SELECT_TRIGGER_CLASS}><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent>
                                </Select>
                                <p className="text-[11px] text-slate-500 ml-1">Construction Industry Scheme — a contractor files a CIS300 every month, even with no payments.</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className={LABEL_CLASS}>Financial Year End</Label>
                                <Select value={formData.financialYearEnd} onValueChange={(val) => updateForm("financialYearEnd", val)}>
                                  <SelectTrigger className={SELECT_TRIGGER_CLASS}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="april_5">5th April (UK Tax Year)</SelectItem>
                                    <SelectItem value="dec_31">31st December</SelectItem>
                                    {/* Most companies end their year on neither
                                        of the two above. When the register has
                                        told us the real date, it is offered as
                                        itself rather than collapsing to
                                        "custom", which stores nothing. */}
                                    {isIsoDate(formData.financialYearEnd) && (
                                      <SelectItem value={formData.financialYearEnd}>
                                        {formatYearEnd(formData.financialYearEnd)}
                                      </SelectItem>
                                    )}
                                    <SelectItem value="custom">Custom Date (Later)</SelectItem>
                                  </SelectContent>
                                </Select>
                                {/* The provenance goes here rather than inside
                                    the option, where it was cut off by the
                                    width of the select. */}
                                {isIsoDate(formData.financialYearEnd) && (
                                  <p className="text-[11px] text-slate-500 ml-1">From Companies House.</p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <Label className={LABEL_CLASS}>Nature of Business</Label>
                                {/* Free text, the same control workspace
                                    settings uses for the same column. A list of
                                    five could not cover a veterinary practice
                                    or a driving instructor, and having a
                                    dropdown here and a text box there meant one
                                    column held two vocabularies — an option
                                    value from signup, readable words from
                                    settings. */}
                                <Input
                                  // Carried to Stripe as its own metadata value,
                                  // and Stripe rejects the whole checkout call
                                  // over 500 characters.
                                  maxLength={60}
                                  placeholder="e.g. Construction, Professional services"
                                  className={FIELD_CLASS}
                                  value={formData.industry}
                                  onChange={(e) => updateForm("industry", e.target.value)}
                                />
                                <p className="text-[11px] text-slate-500 ml-1">What the business actually does.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {step === 3 && (
                        <div className="space-y-8">
                          <div className="mb-2">
                            <h2 className="text-[28px] font-black leading-tight tracking-tight text-[#0B0F19]">VAT</h2>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                              Whether your invoices and bills carry VAT, and how often you file.
                            </p>
                          </div>
                          <RadioGroup value={formData.vatRegistered} onValueChange={(val) => updateForm("vatRegistered", val)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                            {[
                              { id: "yes", label: "Registered", sub: "I have a VAT number", soon: false },
                              { id: "no", label: "Not registered", sub: "No VAT on documents", soon: false },
                              /* Listed rather than left out. A business
                                 registered for VAT outside the UK looks at two
                                 UK-shaped options and cannot tell whether it
                                 has missed something or the product cannot
                                 serve it — the same reason the currency picker
                                 shows the ones it does not support yet. */
                              { id: "global", label: "Outside the UK", sub: "EU and international", soon: true },
                            ].map((item) => (
                              <Label key={item.id} htmlFor={`vat-${item.id}`} className={`relative flex flex-col p-4 rounded-2xl border-2 transition-all ${item.soon ? "pointer-events-none border-slate-100 bg-slate-50/60 opacity-70" : "cursor-pointer"} ${!item.soon && formData.vatRegistered === item.id ? "border-emerald-500 bg-emerald-50/50 shadow-md ring-4 ring-emerald-500/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}>
                                <RadioGroupItem value={item.id} id={`vat-${item.id}`} disabled={item.soon} className="sr-only" />
                                {item.soon ? (
                                  <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                    Soon
                                  </span>
                                ) : null}
                                <div className="mb-2.5">
                                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${formData.vatRegistered === item.id ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>{formData.vatRegistered === item.id && <Check className="h-4 w-4 text-white" />}</div>
                                </div>
                                <span className="block whitespace-nowrap text-[15px] font-bold leading-tight text-slate-900">{item.label}</span>
                                <span className="mt-1 block text-pretty text-[12px] font-medium leading-snug text-slate-500">{item.sub}</span>
                              </Label>
                            ))}
                          </RadioGroup>

                          <AnimatePresence>
                            {formData.vatRegistered === "yes" && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-2 gap-4 overflow-hidden pt-2">
                                <div className="space-y-2">
                                  <Label className={LABEL_CLASS}>VAT Number</Label>
                                  <div className="flex items-center gap-2">
                                    <Input placeholder="e.g. GB 123 4567 89" className="h-14 bg-emerald-50/30 border-emerald-200 rounded-xl" value={formData.vatNumber} onChange={(e) => { updateForm("vatNumber", e.target.value); setVatCheck(null); }} />
                                    <Button type="button" variant="outline" className="h-14 shrink-0 gap-1.5 rounded-xl" disabled={!formData.vatNumber?.trim() || vatChecking} onClick={runVatCheck}>
                                      {vatChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                      Check
                                    </Button>
                                  </div>
                                  {/* Confirming the number against HMRC catches a typo now rather
                                      than on the first invoice a customer refuses to pay. The
                                      registered name is shown back because a valid number may
                                      belong to a different business entirely. Never blocking:
                                      HMRC has downtime and signup must still complete. */}
                                  {/* Says why Next is blocked, rather than leaving a
                                      disabled button with no explanation. */}
                                  {vatBlockReason && !vatCheck && (
                                    <p className="ml-1 text-xs font-medium text-slate-500">{vatBlockReason}</p>
                                  )}
                                  {vatCheck?.status === "registered" && (
                                    <p className="ml-1 text-xs font-medium text-emerald-600">✓ Registered to {vatCheck.name}</p>
                                  )}
                                  {vatCheck?.status === "not_registered" && (
                                    <p className="ml-1 text-xs font-medium text-red-600">HMRC has no registration for this number.</p>
                                  )}
                                  {vatCheck?.status === "invalid_format" && (
                                    <p className="ml-1 text-xs font-medium text-red-600">{vatCheck.reason}</p>
                                  )}
                                  {vatCheck?.status === "unavailable" && (
                                    <p className="ml-1 text-xs font-medium text-amber-600">Could not check right now — you can confirm it later in Settings.</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label className={LABEL_CLASS}>Filing Frequency</Label>
                                  <Select value={formData.vatFrequency} onValueChange={(val) => updateForm("vatFrequency", val)}>
                                    <SelectTrigger className="w-full data-[size=default]:h-14 bg-emerald-50/30 border-emerald-200 rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
                                  </Select>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* "Have employees?" and the PAYE reference it revealed
                              are gone, and CIS has moved to Business Profile
                              alongside the other tax references — it describes
                              how the business is set up, not how it accounts
                              for VAT. This step is now about VAT alone. */}

                          {/* Asked here, performed after provisioning.
                              HMRC authorises a specific business, so the grant
                              needs a workspace to belong to and the workspace
                              does not exist until checkout completes. Signing in
                              at HMRC is also a full navigation away, which would
                              discard everything typed into this wizard. So the
                              answer is carried through and the sign-in happens
                              the moment the workspace is ready.

                              A username and password box would be the wrong
                              answer to the same question: those credentials
                              reach the whole tax account, and HMRC's conditions
                              for Making Tax Digital software forbid holding
                              them. This is why the grant exists. */}
                          {formData.vatRegistered === "yes" && (
                            <div className="border-t border-slate-100 pt-6">
                              <div className="flex items-center gap-2 mb-3">
                                <Landmark className="h-4 w-4 text-emerald-600" />
                                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Connect to HMRC</Label>
                              </div>

                              {hmrcStatus === "connected" ? (
                                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                  <div>
                                    <p className="m-0 text-sm font-bold text-emerald-900">Connected to HMRC</p>
                                    <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-emerald-800">
                                      Your VAT deadlines will come from HMRC. This is applied to your
                                      workspace as soon as setup finishes.
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                                    Sign in with your Government Gateway account to read your real VAT
                                    return periods and deadlines. It opens in a new window, so nothing
                                    you have entered here is lost — and we never see your password.
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <Button
                                      type="button"
                                      onClick={connectHmrcNow}
                                      disabled={hmrcStatus === "connecting"}
                                      className="h-11 rounded-full bg-emerald-600 px-6 text-sm font-bold text-white hover:bg-emerald-700"
                                    >
                                      {hmrcStatus === "connecting" ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Waiting for HMRC…</>
                                      ) : (
                                        <>Connect to HMRC <ChevronRight className="ml-1.5 h-4 w-4" /></>
                                      )}
                                    </Button>
                                    <span className="text-[11px] font-medium text-slate-400">
                                      Optional — you can also do this later in Settings.
                                    </span>
                                  </div>
                                </>
                              )}

                              {hmrcError && (
                                <p className="mt-3 text-[11px] font-medium text-red-600">{hmrcError}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {step === 4 && (
                        <div className="space-y-8">
                          <div className="mb-2">
                            <h2 className="text-[28px] font-black leading-tight tracking-tight text-[#0B0F19]">What do you want to fix?</h2>
                            {/* Was "How you work", asking two binary questions
                                whose answers were recorded and never read
                                again. This asks what somebody actually came
                                here to solve, and the answers are used: they
                                write the setup plan waiting in the workspace. */}
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                              Pick everything that applies. We will build your first-week plan around it.
                            </p>
                          </div>

                          <div className="space-y-6">
                            {/* Multi-select, because these are not alternatives.
                                A business chasing late payment is usually also
                                worried about accuracy, and being made to pick
                                one threw away the other. */}
                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>Where should we focus?</Label>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {FOCUS_AREAS.map((item) => {
                                  const chosen = focusAreas.includes(item.id);
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      aria-pressed={chosen}
                                      onClick={() => toggleFocusArea(item.id)}
                                      className={`flex items-start gap-3.5 rounded-2xl border-2 p-5 text-left transition-all ${chosen ? "border-orange-500 bg-orange-50/50 shadow-md ring-4 ring-orange-500/10" : "border-slate-100 bg-white hover:border-slate-200"}`}
                                    >
                                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${chosen ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                                        {chosen ? <Check className="size-5" /> : <item.icon className="size-5" />}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block text-sm font-bold text-[#0B0F19]">{item.label}</span>
                                        <span className="mt-0.5 block text-pretty text-[11px] font-medium leading-relaxed text-slate-500">{item.sub}</span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="m-0 ml-1 text-xs text-slate-400">
                                {focusAreas.length === 0
                                  ? "Choose at least one, or skip — we will assume invoicing."
                                  : `${focusAreas.length} chosen. Pick as many as you need.`}
                              </p>
                            </div>

                            {/* Asked before the books question, because the
                                answer changes what that one means: somebody
                                whose accountant already holds the records is
                                describing their accountant's system, not their
                                own.

                                "Agent" is what HMRC calls it, but almost
                                nobody says it about themselves — so the
                                question says accountant and bookkeeper, which
                                is what people actually call the person. */}
                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>Does an accountant act for you?</Label>
                              <RadioGroup
                                value={formData.hasAccountant}
                                onValueChange={(val) => updateForm("hasAccountant", val)}
                                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                              >
                                {[
                                  { id: "yes", label: "Yes", sub: "An accountant or bookkeeper handles some of it", icon: Users },
                                  { id: "no", label: "No, I do it myself", sub: "You can invite one at any time", icon: User },
                                ].map((item) => (
                                  <Label
                                    key={item.id}
                                    htmlFor={`agent-${item.id}`}
                                    className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border-2 p-5 transition-all ${formData.hasAccountant === item.id ? "border-orange-500 bg-orange-50/50 shadow-md ring-4 ring-orange-500/10" : "border-slate-100 bg-white hover:border-slate-200"}`}
                                  >
                                    <RadioGroupItem value={item.id} id={`agent-${item.id}`} className="sr-only" />
                                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${formData.hasAccountant === item.id ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                                      <item.icon className="size-5" />
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-sm font-bold text-[#0B0F19]">{item.label}</span>
                                      <span className="mt-0.5 block text-pretty text-[11px] font-medium leading-relaxed text-slate-500">{item.sub}</span>
                                    </span>
                                  </Label>
                                ))}
                              </RadioGroup>

                              {/* Optional, and it says so. Somebody who has an
                                  accountant but not their email to hand should
                                  not be stopped here. */}
                              <AnimatePresence>
                                {formData.hasAccountant === "yes" ? (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pt-1">
                                      <Label className={LABEL_CLASS}>Their email (optional)</Label>
                                      <Input
                                        type="email"
                                        placeholder="e.g. name@practice.co.uk"
                                        className="mt-1.5 h-12 rounded-xl border-slate-200"
                                        value={formData.accountantEmail}
                                        onChange={(e) => updateForm("accountantEmail", e.target.value.slice(0, 160))}
                                      />
                                      <p className="m-0 ml-1 mt-1.5 text-xs text-slate-400">
                                        We will not email them yet. You invite them yourself from Settings once
                                        your workspace is open, so you decide when they get access.
                                      </p>
                                    </div>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>

                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>What do you keep your books in today?</Label>
                              <Select value={formData.migrationSource} onValueChange={(val) => updateForm("migrationSource", val)}>
                                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white data-[size=default]:h-14"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {BOOKS_TODAY.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="m-0 ml-1 text-xs text-slate-400">
                                Tells us what needs bringing across, and what you are used to.
                              </p>
                            </div>

                            {/* Optional, and last. A blank box is more work than
                                a chip, so it is offered to the people who have
                                something specific to say rather than put in
                                front of everybody as the only way through. */}
                            <div className="space-y-3">
                              <Label className={LABEL_CLASS}>Anything else we should know? (optional)</Label>
                              <textarea
                                rows={3}
                                value={formData.setupNotes}
                                onChange={(e) => updateForm("setupNotes", e.target.value.slice(0, 400))}
                                placeholder="e.g. We invoice 40 clients a month and half pay late. Moving off Xero at year end."
                                className="w-full rounded-xl border-2 border-slate-100 bg-white px-4 py-3 text-sm leading-relaxed shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                              />
                              <p className="m-0 ml-1 text-xs text-slate-400">
                                {formData.setupNotes?.length ? `${formData.setupNotes.length} / 400` : "The more specific, the more useful your plan."}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {step === 5 && (
                        <div className="space-y-7">
                          <div className="mb-2">
                            <h2 className="text-[28px] font-black leading-tight tracking-tight text-[#0B0F19]">Almost done</h2>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                              Your business details are saved. Would you like to set up your chart of
                              accounts and document branding now, or finish with the standard setup?
                            </p>
                          </div>
                          
                          <div className="grid sm:grid-cols-2 gap-4 pt-2 pb-6">
                            <button
                              type="button"
                              // Seeded here too: this jumps straight into the
                              // branding steps without passing through
                              // handleNext, which is where the identifiers are
                              // normally carried across.
                              onClick={enterCustomisation}
                              className="flex flex-col items-start p-5 rounded-xl border-2 border-slate-200/80 bg-white hover:border-blue-500 hover:bg-blue-50/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 text-left group active:translate-y-0 active:scale-[0.99] shadow-sm"
                            >
                              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105">
                                <Sliders className="h-5 w-5" />
                              </div>
                              <span className="font-extrabold text-[#0B0F19] text-base">Customise it</span>
                              {/* Only promises the steps this platform actually
                                  shows. With the chart-of-accounts step hidden
                                  by an administrator, offering to "configure
                                  custom charts" describes a screen the client
                                  will never reach. */}
                              <span className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500">
                                {showChartOfAccounts
                                  ? "Set up your chart of accounts, brand your documents and choose approval rules."
                                  : "Brand your invoices and quotes, and choose your approval rules."}
                              </span>
                            </button>

                            {/* Skipping now means the standard chart, not an
                                empty one.
                                This offered "blank slate" — zero ledger
                                accounts — behind a confirmation warning. That
                                is not a shortcut, it is an unusable workspace:
                                without accounts nothing can be invoiced,
                                billed or posted, and the person least equipped
                                to rebuild a chart of accounts is exactly the
                                one who chose to skip the wizard. Skipping now
                                seeds the standard chart, which is what somebody
                                pressing "no thanks" actually wants, so there is
                                nothing left to warn about. */}
                            <button
                              type="button"
                              onClick={() => finishSetup("starter")}
                              disabled={isSaving}
                              className="flex flex-col items-start p-5 rounded-xl border-2 border-slate-200/80 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 text-left group active:translate-y-0 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
                            >
                              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105">
                                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                              </div>
                              <span className="font-extrabold text-[#0B0F19] text-base">Use the standard setup</span>
                              <span className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500">Finish now with sensible defaults. Everything can be changed later in Settings.</span>
                            </button>
                          </div>

                          {/* Below the two paths, not above them: the question
                              this step asks is which way to finish, and the
                              answers are here to be checked against, not to be
                              read before the question. */}
                          <AnswerReview
                            businessName={businessName}
                            formData={formData}
                            hmrcConnected={hmrcStatus === "connected"}
                            onEdit={(target) => { setDirection(-1); setStep(target); }}
                          />
                        </div>
                      )}

                    </motion.div>
                  </AnimatePresence>
                </div>

              </motion.div>

              {/* Navigation as a floating pill, not a bar across the bottom.
                  A full-width bar always has an edge, and beside a dark column
                  that runs the whole height of the page that edge reads as the
                  footer being cut off. An island has no edge to cut: it sits
                  over the form, clear of the panel entirely, and stays in the
                  same place on every step whatever the step contains. */}
              <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4 lg:right-[480px]">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 p-1.5 shadow-[0_10px_40px_-8px_rgba(15,23,42,0.25)] backdrop-blur-md">
                  {step > 1 && (
                    <Button variant="ghost" onClick={handleBack} className="h-11 rounded-full px-5 text-sm font-bold text-slate-500 hover:bg-slate-100">
                      <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                    </Button>
                  )}
                  {/* The brand's action colour and shape, taken from the
                      marketing site's primary call to action rather than chosen
                      here: #ED6A2C, a full pill, bold small text. */}
                  {step < 5 && (
                    <Button onClick={handleNext} disabled={(step === 1 && nameStatus !== "available") || (step === VAT_STEP && vatNumberMissing)} className="group h-11 rounded-full bg-[#ED6A2C] px-8 text-sm font-bold text-white hover:bg-[#d45d25] flex items-center shadow-sm transition-transform active:scale-95">
                      Next step
                      <ChevronRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* The example panel, beside the form rather than behind it.
                ShowcasePanel owns the dark surface and the light that follows
                the cursor; everything below is just what sits on it. */}
            {/* The same content as a sheet, for phones. Mounted only while
                open: the step-one showcase rotates on a timer and fetches
                images, and a second copy running permanently offscreen would
                do both for nobody. */}
            <AnimatePresence>
              {panelOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setPanelOpen(false)}
                  className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm lg:hidden"
                >
                  {/* In from the right, which is where this panel sits at
                      desktop widths — so the small screen behaves like a
                      narrower version of the same layout rather than a
                      different one. */}
                  <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute inset-y-0 right-0 w-[85vw] max-w-[420px] overflow-y-auto border-l border-slate-800 bg-[#0B0F19] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16"
                  >
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      aria-label="Close"
                      className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                    >
                      <X className="size-4" />
                    </button>
                    {panelContent}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <ShowcasePanel>
              {panelContent}
            </ShowcasePanel>
          </motion.div>
        )}

        {step >= 6 && (
          <motion.div key="phase2" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex-1 w-full min-h-screen font-sans relative">
            {/*
              Persistent way back to the fork. This used to live only on the
              Chart of Accounts card, which is hidden whenever the platform
              setting turns it off — so in that configuration the customization
              flow had no exit at all once you entered it.
            */}
            <div className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/85 backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:pl-24 md:pr-8">
                <Button
                  variant="ghost"
                  onClick={() => { setDirection(-1); setStep(5); }}
                  className="h-10 rounded-xl font-bold text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to setup
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={isSaving}
                  className="h-10 rounded-xl font-bold text-slate-400 hover:text-slate-600"
                >
                  {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FastForward className="mr-1.5 h-4 w-4" />}
                  Skip setup
                </Button>
              </div>
            </div>

            <div className="w-full max-w-7xl mx-auto flex flex-col gap-[12vh] py-[6vh] px-4 md:px-8 relative z-10">

              {/* CARD 1 (STEP 6): CHART OF ACCOUNTS — hidden when the platform
                  setting turns it off; the starter chart is then seeded for them. */}
              {showChartOfAccounts && (
              <div className="relative w-full">
                <motion.div initial={{ scale: 0.85, opacity: 0.3 }} whileInView={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0.3 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} viewport={{ once: false, amount: 0.4 }} className="w-full h-auto lg:h-[650px] bg-white rounded-[2.5rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)] border border-slate-100 flex flex-col lg:flex-row overflow-hidden shrink-0">
                <div className="w-full lg:w-3/5 flex flex-col justify-between p-6 md:p-12 relative">
                  <div className="flex-1 flex flex-col justify-center w-full py-4 lg:py-0"><ChartOfAccountsStep coaType={formData.coaType} onChange={(val) => updateForm("coaType", val)} /></div>
                  {/* Back and Skip now live in the sticky bar above, which is
                      always present regardless of which cards are shown. */}
                  <div className="border-t border-slate-100 pt-6 flex justify-end items-center mt-6">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg animate-pulse hidden sm:block">Scroll down</span>
                  </div>
                </div>
                <div className="w-full lg:w-2/5 bg-slate-50 p-6 md:p-8 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-slate-100 relative overflow-hidden h-full">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 flex flex-col h-full space-y-4">
                    <div className="shrink-0"><h3 className="text-slate-900 text-2xl font-bold mb-1">Chart of Accounts</h3><p className="text-slate-500 text-sm">The architecture of your database ledger across standard assets and balances.</p></div>
                    <div className="w-full h-40 shrink-0 bg-white rounded-2xl border border-slate-200 crystalline flex items-center justify-center relative shadow-sm cursor-pointer hover:bg-slate-50 transition-all group overflow-hidden"><div className="absolute inset-0 bg-gradient-to-tr from-blue-600/5 to-transparent" /><div className="flex flex-col items-center gap-3 z-10"><div className="size-14 rounded-full bg-blue-50/80 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300 border border-blue-100/50"><PlayCircle className="size-6 text-blue-600" /></div><span className="text-slate-700 text-[11px] font-bold tracking-widest uppercase">1-Min Tour</span></div></div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col flex-1 min-h-0">
                      <div className="flex items-center justify-between mb-3 shrink-0"><div className="flex items-center gap-1.5 text-blue-600"><FileText className="size-4" /><span className="text-[10px] font-bold uppercase tracking-widest">Template Preview</span></div><span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-md tracking-wider">14 ACCOUNTS</span></div>
                      {formData.coaType === "starter" ? (
                        <div className="overflow-y-auto pr-2 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-[10px] text-slate-600 custom-scrollbar flex-1 min-h-0">
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-blue-600 font-semibold">1000 · Bank Current Account</span><span className="text-slate-400">Asset</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-blue-600 font-semibold">1100 · Accounts Receivable</span><span className="text-slate-400">Asset</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-blue-600 font-semibold">1200 · VAT Control</span><span className="text-slate-400">Asset</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-orange-600 font-semibold">2000 · Accounts Payable</span><span className="text-slate-400">Liability</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-orange-600 font-semibold">2100 · VAT Payable</span><span className="text-slate-400">Liability</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-purple-600 font-semibold">3000 · Owner Equity</span><span className="text-slate-400">Equity</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-purple-600 font-semibold">3100 · Retained Earnings</span><span className="text-slate-400">Equity</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-purple-600 font-semibold">3200 · Current Year Earnings</span><span className="text-slate-400">Equity</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-emerald-600 font-semibold">4000 · Sales</span><span className="text-slate-400">Revenue</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-emerald-600 font-semibold">4100 · Sales Discount</span><span className="text-slate-400">Revenue</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-slate-600 font-semibold">5000 · Cost of Sales</span><span className="text-slate-400">Expense</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-slate-600 font-semibold">5100 · Purchase Discount</span><span className="text-slate-400">Expense</span></div>
                          <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-slate-600 font-semibold">6000 · General Expenses</span><span className="text-slate-400">Expense</span></div>
                          <div className="flex justify-between"><span className="text-slate-600 font-semibold">7000 · Payroll Expenses</span><span className="text-slate-400">Expense</span></div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono text-xs text-slate-600 text-center flex-1 min-h-0 flex flex-col items-center justify-center italic text-slate-500 gap-2"><span className="text-lg not-italic">🫙</span><span>Clean slate initialized.<br/>No ledgers will be generated.</span></div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
              </div>
              )}

              {/* CARD 1b: PREFERENCES — where the menu sits and what the bell
                  may interrupt them about.

                  Ahead of the branding because both answers are about the
                  reader rather than the business, both are quick, and both have
                  working defaults. Not gated behind an unlock like purchases
                  and the review: the sales track below measures itself against
                  the scroll container, and a track that mounts late is exactly
                  what broke the progress rail once already. */}
              <div ref={preferencesRef} className="relative w-full">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0.4 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)]"
                >
                  <PreferencesStep
                    values={{
                      menuLayout: formData.menuLayout,
                      mutedAlerts: formData.mutedAlerts,
                      soundEnabled: formData.soundEnabled,
                      notificationSound: formData.notificationSound as any,
                    }}
                    onChange={updatePreference}
                    onFinish={revealBranding}
                  />
                </motion.div>
              </div>

              {/* CARD 2 (STEP 7): SALES & INVOICES.

                  Pinned inside a track taller than itself, so scrolling the
                  page is what moves through the branding sections — the same
                  idea as the feature section on the marketing site. One
                  screenful per section plus one to settle on; a shorter track
                  whips the sections past faster than anyone can read them.

                  Mounted only once the preferences card has been answered, so
                  the tall track cannot be scrolled past before the reader has
                  chosen anything. */}
              <AnimatePresence>
              {brandingUnlocked && (
              <div
                ref={salesTrackRef}
                className="relative w-full"
                style={{ height: `${(salesKeys.length + 1) * 85}vh` }}
              >
                {/* Pinned below the "Back to setup" bar, which is itself sticky
                    at the top of the page — at top-4 the card slid under it and
                    its own header row was cut off.

                    Height is capped rather than filling the window: a section
                    asking one question does not need 1200px, and the full-height
                    card left most of itself empty. */}
                <div className="sticky top-[4.5rem] flex h-[calc(100dvh-5.5rem)] items-center">
                  <motion.div initial={{ scale: 0.94, opacity: 0.5 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: false, amount: 0.15 }} layout layoutDependency={salesSection} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }} className="w-full bg-white rounded-[2rem] border border-slate-200 shadow-md flex h-full flex-col lg:h-auto lg:min-h-[24rem] lg:max-h-full lg:flex-row">
                    <div className="flex w-full min-h-0 flex-1 flex-col p-5 md:p-6 lg:w-[55%] lg:flex-none">
                      <div className="min-h-0 flex-1">
                        <SalesSettingsStep
                          formData={formData}
                          activeTab={activeTab}
                          setActiveTab={setActiveTab}
                          onChange={updateForm}
                          sectionIndex={salesSection}
                          progress={salesProgress}
                          onSeek={seekSalesSection}
                          onFinish={revealPurchases}
                          onOpenPreview={() => setFullscreenDoc("sales")}
                        />
                      </div>
                      <div className="mt-3 flex shrink-0 items-center justify-center"><Button variant="ghost" type="button" onClick={handleSkip} className="text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs">Skip layout <FastForward className="ml-1 size-3.5" /></Button></div>
                    </div>

                    {/* The preview column does not hide its overflow, and
                        neither does the card: the glow is clipped by a wrapper
                        of its own instead. */}
                    <div className="relative hidden min-h-0 w-full flex-col self-stretch rounded-b-[2rem] border-t border-slate-200 bg-slate-50/60 p-5 lg:flex lg:w-[45%] lg:rounded-b-none lg:rounded-r-[2rem] lg:border-l lg:border-t-0">
                      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-[2rem] lg:rounded-b-none lg:rounded-r-[2rem]">
                        <div className="absolute right-0 top-0 size-64 rounded-full bg-blue-600/5 blur-3xl" />
                      </div>
                      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
                        {/* One header row rather than a title block above a
                            toolbar. The two together ate about 140px of a
                            column whose whole job is to be a big picture. */}
                        <div className="mb-3 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 pb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Eye className="size-3.5 shrink-0 text-blue-600" />
                              <h3 className="truncate text-base font-bold text-slate-900">{salesPreviewTitle}</h3>
                            </div>
                            <p className="mt-0.5 text-xs leading-snug text-slate-500">{salesPreviewBlurb}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-blue-600 shadow-sm">{(activeTab === "invoice" ? formData.invoicePaperSize : activeTab === "credit_note" ? formData.creditNotePaperSize : formData.quotePaperSize)?.toUpperCase() || "A4"}</span>
                            <button type="button" onClick={() => setFullscreenDoc("sales")} className="cursor-pointer rounded-lg border border-slate-200 bg-slate-100 p-1.5 text-slate-500 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600 active:scale-95"><Maximize className="size-3.5" /></button>
                          </div>
                        </div>

                        {/* What the preview shows follows the section being
                            edited: the emblem on its own while it is being
                            chosen, and otherwise the whole sheet with the
                            block under discussion lit up. */}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={salesPreviewKey === "logo" ? "emblem" : "document"}
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="h-full"
                            >
                              {salesPreviewKey === "logo" ? (
                                <EmblemPreview
                                  logo={documentLogo(activeTab === "invoice" ? formData.invoiceLogo : activeTab === "credit_note" ? formData.creditNoteLogo : formData.quoteLogo)}
                                  inherited={!salesField("Logo") && Boolean(shared)}
                                  initials={String(salesField("LogoInitials") ?? "")}
                                  companyName={businessName || "Your company"}
                                  brandColor={String(salesField("BrandColor") ?? "") || "#102a43"}
                                  logoPosition={
                                    (salesField("LogoPosition") as "left" | "center" | "right") || "left"
                                  }
                                />
                              ) : (
                                <FitPreview fitHeight className="cursor-zoom-in">
                                  <div onClick={() => setFullscreenDoc("sales")}>
                                    <OnboardingPreviewCanvas
                                      customClass="shadow-md border border-slate-200 rounded-lg bg-white overflow-hidden"
                                      highlight={salesPreviewHighlight}
                                    />
                                  </div>
                                </FitPreview>
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
              )}
              </AnimatePresence>

              {/* CARD 3 (STEP 8): PURCHASES.

                  Mounted only once the sales sequence has been finished off.
                  The sales card is pinned inside a tall scroll track, so
                  anything below it was reachable by simply scrolling past —
                  dropping out of the branding flow without meaning to. */}
              <AnimatePresence>
              {purchasesUnlocked && (
              <motion.div
                ref={purchasesTrackRef}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full"
                style={{ height: `${(PURCHASE_SECTION_KEYS.length + 1) * 85}vh` }}
              >
                <div className="sticky top-[4.5rem] flex h-[calc(100dvh-5.5rem)] items-center">
                  <motion.div layout layoutDependency={purchaseSection} transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }} className="w-full bg-white rounded-[2rem] border border-slate-200 shadow-md flex h-full flex-col lg:h-auto lg:min-h-[24rem] lg:max-h-full lg:flex-row">
                    <div className="flex w-full min-h-0 flex-1 flex-col p-5 md:p-6 lg:w-[55%] lg:flex-none">
                      <div className="min-h-0 flex-1">
                        <PurchasesSettingsStep
                          formData={formData}
                          onChange={updateForm}
                          sectionIndex={purchaseSection}
                          progress={purchaseProgress}
                          onSeek={seekPurchaseSection}
                          onFinish={revealReview}
                          onOpenPreview={() => setFullscreenDoc("bill")}
                        />
                      </div>
                    </div>

                    <div className="relative hidden min-h-0 w-full flex-col self-stretch rounded-b-[2rem] border-t border-slate-200 bg-slate-50/60 p-5 lg:flex lg:w-[45%] lg:rounded-b-none lg:rounded-r-[2rem] lg:border-l lg:border-t-0">
                      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-[2rem] lg:rounded-b-none lg:rounded-r-[2rem]">
                        <div className="absolute right-0 top-0 size-64 rounded-full bg-emerald-600/5 blur-3xl" />
                      </div>
                      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
                        <div className="mb-3 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 pb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Eye className="size-3.5 shrink-0 text-emerald-600" />
                              <h3 className="truncate text-base font-bold text-slate-900">{purchasePreviewTitle}</h3>
                            </div>
                            <p className="mt-0.5 text-xs leading-snug text-slate-500">{purchasePreviewBlurb}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-700 shadow-sm">{(formData.billPaperSize || "a4").toUpperCase()}</span>
                            {purchaseShowsDocument ? (
                              <button type="button" onClick={() => setFullscreenDoc("bill")} className="cursor-pointer rounded-lg border border-slate-200 bg-slate-100 p-1.5 text-slate-500 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-600 active:scale-95"><Maximize className="size-3.5" /></button>
                            ) : null}
                          </div>
                        </div>

                        {/* The first three sections decide things a printed
                            bill never shows, so the document would be a still
                            picture beside them. They get the numbering and
                            approval state instead, which does move. */}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={purchasePreviewKey === "emblem" ? "emblem" : purchaseShowsDocument ? "document" : "system"}
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="h-full overflow-y-auto custom-scrollbar"
                            >
                              {purchasePreviewKey === "emblem" ? (
                                <EmblemPreview
                                  logo={documentLogo(formData.billLogo)}
                                  inherited={!formData.billLogo && Boolean(shared)}
                                  initials={String(formData.billLogoInitials ?? "")}
                                  companyName={businessName || "Your company"}
                                  brandColor={String(formData.billBrandColor ?? "") || "#102a43"}
                                  logoPosition={
                                    (formData.billLogoPosition as "left" | "center" | "right") || "left"
                                  }
                                />
                              ) : purchaseShowsDocument ? (
                                <FitPreview fitHeight className="cursor-zoom-in">
                                  <div onClick={() => setFullscreenDoc("bill")}>
                                    <OnboardingPurchasePreviewCanvas
                                      customClass="shadow-md border border-slate-200 rounded-lg bg-white overflow-hidden"
                                      highlight={purchasePreviewHighlight}
                                    />
                                  </div>
                                </FitPreview>
                              ) : (
                                <PurchaseSystemPreview formData={formData} />
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
              )}
              </AnimatePresence>
              {/* CARD 4: REVIEW AND CHECKOUT.

                  A review of both sequences does not belong inside either of
                  them. It sat in the purchases card until it dwarfed the pane
                  it was scrolling in, with that card's own heading repeated a
                  few pixels above the panel's. Its own container, opened the
                  same way purchases was opened from sales. */}
              <AnimatePresence>
              {reviewUnlocked && (
              <motion.div
                ref={reviewTrackRef}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="w-full"
              >
                <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md md:p-10">
                  <div className="mb-6 text-center">
                    <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                      <Check className="size-3" /> Setup complete
                    </span>
                    <h3 className="m-0 text-2xl font-bold text-slate-900 md:text-3xl">Almost done</h3>
                    <p className="m-0 mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                      Here is everything you chose. Have a last look, then carry on to payment —
                      nothing has been charged yet.
                    </p>
                  </div>

                  <BrandingReview
                    formData={formData}
                    onEditSales={seekSalesSection}
                    onEditPurchases={seekPurchaseSection}
                    onEditPreferences={scrollToPreferences}
                  />

                  <div className="mt-6 flex flex-col items-center gap-3">
                    <Button
                      onClick={() => finishSetup()}
                      disabled={isSaving}
                      className="flex h-14 w-full max-w-sm items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-md transition-transform hover:bg-blue-700 active:scale-95"
                    >
                      {isSaving ? <Loader2 className="mr-2 size-5 animate-spin" /> : null}
                      {isSaving ? "Generating Secure Payment Link..." : "Continue to Payment"}
                    </Button>
                    <p className="m-0 text-[11px] text-slate-400">
                      Secure checkout by Stripe. You can change any of this later in Settings.
                    </p>
                  </div>
                </div>
              </motion.div>
              )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </>
  );
}