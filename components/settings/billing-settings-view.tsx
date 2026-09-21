"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  completeEmbeddedBillingSetup,
  createEmbeddedBillingSetupSession,
  openAuthenticatedBillingPortal,
} from "@/app/(dashboard)/billing.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

/**
 * The payroll portal is still in testing, so neither button leaves this app
 * yet — both acknowledge the interest and say it is not open.
 *
 * Deliberately no link: sending a paying customer to a build that is still
 * being worked on is worse than telling them to wait. When it opens, these
 * become anchors to its sign-up and sign-in.
 */
const PAYROLL_COMING_SOON = "WAW Payroll is coming soon";

/**
 * The payroll product's own palette, so the card looks like a window onto that
 * application rather than a panel of this one.
 *
 *   #ff6b4a  coral, its primary action colour
 *   #f04e28  the pressed/hover step down from it
 *   #d9451f  the same hue darkened until it is legible as text on cream
 *   #faf4ec  its cream page background
 *   #efe3d3  a warm border, cream with the lightness pulled down
 *   #17233f  its navy, used for headings and the status chip
 *
 * Written as literals rather than theme tokens: these belong to a different
 * product and should not drift when this application's palette changes.
 */

/** How long each showcase slide holds before advancing, in milliseconds. */
const SLIDE_MS = 5000;

const PAYROLL_SHOWCASE = [
  {
    src: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/payroll%20showcase1.png",
    alt: "WAW Payroll dashboard",
  },
  {
    src: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/payroll%20showcase2.png",
    alt: "Running a pay period in WAW Payroll",
  },
  {
    src: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/payroll%20showcase3.png",
    alt: "Payslips produced by WAW Payroll",
  },
];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether this person has asked for less movement.
 *
 * useSyncExternalStore rather than reading matchMedia into state from an
 * effect: matchMedia is an external store, and subscribing to it properly
 * avoids the render-then-correct that setting state on mount produces. The
 * third argument is the server snapshot — there is no media query during SSR,
 * and assuming "no preference" matches what the browser will report before it
 * hydrates.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange: () => void) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * The screenshots, with a progress bar per slide.
 *
 * Advances on its own so the card shows more than one screen without anybody
 * clicking, and pauses on hover or keyboard focus — a slide moving out from
 * under the pointer as somebody leans in to read it is the usual failing of
 * this pattern. Stops entirely under prefers-reduced-motion, where the bars
 * become plain step indicators and only manual navigation moves it.
 */
function PayrollShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % PAYROLL_SHOWCASE.length),
      SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [index, paused, reducedMotion]);

  const go = (next: number) => setIndex((next + PAYROLL_SHOWCASE.length) % PAYROLL_SHOWCASE.length);

  return (
    <div
      className="w-full min-w-0 lg:w-[420px] xl:w-[480px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="group relative aspect-16/10 w-full overflow-hidden rounded-2xl border border-[#efe3d3] bg-white shadow-sm">
        {PAYROLL_SHOWCASE.map((slide, slideIndex) => (
          // All slides stay mounted and cross-fade. Swapping the src instead
          // would show a blank frame while the next image loads.
          <Image
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 480px"
            priority={slideIndex === 0}
            className={`object-cover object-top transition-opacity duration-700 ${
              slideIndex === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {/* Arrows appear on hover on a pointer device, and are always present
            for keyboard users via focus-visible. */}
        <button
          type="button"
          aria-label="Previous screenshot"
          onClick={() => go(index - 1)}
          className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-md transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next screenshot"
          onClick={() => go(index + 1)}
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-md transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Segmented progress. Each bar is also the control for its own slide,
          so there is no separate row of dots doing the same job. */}
      <div className="mt-3 flex items-center gap-2">
        {PAYROLL_SHOWCASE.map((slide, slideIndex) => {
          const done = slideIndex < index;
          const active = slideIndex === index;
          return (
            <button
              key={slide.src}
              type="button"
              onClick={() => go(slideIndex)}
              aria-label={`Screenshot ${slideIndex + 1} of ${PAYROLL_SHOWCASE.length}`}
              aria-current={active}
              className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full border-none bg-[#f0e3d1] p-0 transition hover:bg-[#e4d2ba]"
            >
              <span
                // Keyed on the slide index so the fill restarts each time this
                // one becomes active rather than resuming mid-way.
                key={`${slideIndex}-${index}-${paused}-${reducedMotion}`}
                className="block h-full rounded-full bg-[#ff6b4a]"
                style={
                  done || (active && (reducedMotion || paused))
                    ? { width: "100%" }
                    : active
                      ? { animation: `payroll-slide-fill ${SLIDE_MS}ms linear forwards` }
                      : { width: "0%" }
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A cross-sell for the payroll product.
 *
 * Placed below the billing information rather than above it: somebody who came
 * here to check a card or download a receipt should not have to scroll past an
 * advertisement to do it. Written as a statement of what the product is rather
 * than a pitch — this sits inside software people are already paying for, and
 * a hard sell in the billing screen reads badly.
 */
function PayrollPromo() {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#efe3d3] bg-gradient-to-br from-[#faf4ec] via-[#fdfaf7] to-white shadow-sm">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ff6b4a]/12">
              <Users className="size-4.5 text-[#d9451f]" />
            </span>
            <span className="rounded-full bg-[#ff6b4a]/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#d9451f]">
              Separate product
            </span>
            {/* Said on the card, not only after a click. Advertising something
                that cannot be signed up for reads as broken unless the wait is
                stated up front.

                Navy rather than amber: amber sat too close to the cream and
                coral to register as a separate piece of information. */}
            <span className="rounded-full bg-[#17233f] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
              Coming soon
            </span>
          </div>

          <h3 className="mt-4 text-xl font-black tracking-tight text-[#17233f] sm:text-2xl">
            Run your payroll with WAW-Profi
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6f6558]">
            Pay your people, produce payslips and file with HMRC — billed separately from this
            subscription and signed into on its own portal.
          </p>

          {/* Only what is certain. Naming specific submission types or
              features would be claiming things about an application this
              codebase does not own. */}
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#6f6558]">
            {["Its own login", "Billed on its own plan", "Built for UK payroll"].map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 shrink-0 text-[#ff6b4a]" />
                {point}
              </li>
            ))}
          </ul>

          {/* Buttons live with the copy rather than in their own column now
              that the screenshots take the right-hand side.

              Still buttons rather than disabled controls: a dead control gives
              no reason for being dead, whereas a press that answers "not yet"
              tells somebody what they wanted to know. */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                toast.info(PAYROLL_COMING_SOON, {
                  description: "Sign-ups open once the payroll portal is out of testing.",
                })
              }
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[#ff6b4a] px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-[#f04e28] active:scale-95"
            >
              Create a payroll account
              <Clock className="size-4 opacity-70" />
            </button>
            <button
              type="button"
              onClick={() =>
                toast.info(PAYROLL_COMING_SOON, {
                  description: "The portal is not open yet — we'll let you know when it is.",
                })
              }
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e7d9c6] bg-white px-6 text-sm font-bold text-[#17233f] shadow-sm transition-all hover:bg-[#faf4ec] active:scale-95"
            >
              I already have one
            </button>
          </div>
        </div>

        <PayrollShowcase />
      </div>
    </div>
  );
}

// 🚀 Mini component to handle the loading state of the Stripe redirect button
function BillingPortalButton({ hasBillingProfile = true }: { hasBillingProfile?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      disabled={pending}
      type="submit"
      variant="outline"
      className="h-11 w-full rounded-xl px-5 font-bold sm:w-auto"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ExternalLink className="size-4 opacity-70" />
      )}
      {pending ? "Opening Stripe..." : hasBillingProfile ? "Plan & cancellation" : "Choose a plan"}
    </Button>
  );
}

type EmbeddedBillingSession = {
  clientSecret: string;
  sessionId: string;
};

function EmbeddedBillingDialog({
  session,
  onClose,
}: {
  session: EmbeddedBillingSession;
  onClose: () => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const handleComplete = useCallback(async () => {
    setFinishing(true);
    setCompletionError(null);

    try {
      const result = await completeEmbeddedBillingSetup(session.sessionId);
      if (!result.success) {
        setCompletionError(result.error);
        setFinishing(false);
        return;
      }

      toast.success("Payment method updated", {
        description: "Stripe will use it for future subscription invoices.",
      });
      onClose();
    } catch {
      setCompletionError("The secure update completed, but confirmation failed. Try again.");
      setFinishing(false);
    }
  }, [onClose, session.sessionId]);

  const checkoutOptions = useMemo(
    () => ({
      clientSecret: session.clientSecret,
      onComplete: handleComplete,
    }),
    [handleComplete, session.clientSecret],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !finishing) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!finishing}
        className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden rounded-3xl border-slate-200 p-0 shadow-2xl sm:max-w-2xl"
      >
        <DialogHeader className="border-b border-slate-100 px-6 py-5 pr-14 sm:px-8">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-black tracking-tight text-slate-900">
                Update payment method
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-lg text-xs leading-relaxed">
                Enter your new card in Stripe&apos;s encrypted checkout. Card details never pass
                through WAW Profi.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="relative max-h-[calc(92vh-112px)] overflow-y-auto bg-slate-50/40 px-3 py-4 sm:px-6">
          {completionError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{completionError}</span>
            </div>
          )}

          <div className="min-h-[420px] overflow-hidden rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={checkoutOptions}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>

          {finishing && (
            <div
              role="status"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm"
            >
              <Loader2 className="size-6 animate-spin text-blue-600" />
              <p className="text-sm font-bold text-slate-700">Saving your payment method...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BillingSettingsView({ billingData }: { billingData: any }) {
  // State for Search, Pagination, AND Date Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // 🚀 NEW: Tracks the selected timeframe
  const [currentPage, setCurrentPage] = useState(1);
  const [billingSession, setBillingSession] = useState<EmbeddedBillingSession | null>(null);
  const [openingBilling, setOpeningBilling] = useState(false);
  const itemsPerPage = 5;

  useEffect(() => {
    if (!billingData.billingNotice) return;

    if (billingData.billingNotice.type === "success") {
      toast.success("Payment method updated", {
        description: "Stripe will use it for future subscription invoices.",
      });
    } else {
      toast.error("Payment method update needs attention", {
        description: billingData.billingNotice.message,
      });
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, [billingData.billingNotice]);

  // Bulletproof data extraction for the subscription
  const subscription_status = billingData.subscription_status || billingData.subscriptionStatus;
  const currentPeriodEnd = billingData.currentPeriodEnd || billingData.current_period_end;
  const trialEndsAt = billingData.trialEndsAt || billingData.trial_ends_at;
  const cancelAtPeriodEnd = billingData.cancelAtPeriodEnd || billingData.cancel_at_period_end;
  const hasStripeBilling = Boolean(billingData.stripeCustomerId || billingData.stripe_customer_id);
  const subscriptionPlan = billingData.subscriptionPlan || billingData.subscription_plan;

  // Extract invoices array sent from your backend
  const invoices = billingData.invoices || [];

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return "N/A";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(dateString));
  };

  const formatStripeDate = (unixTimestamp: number) => {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(unixTimestamp * 1000));
  };

  const formatCurrency = (amount: number, currency: string = "gbp") => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const isTrial = subscription_status === "trial" || subscription_status === "trialing";
  const isPastDue =
    subscription_status === "past_due" ||
    subscription_status === "unpaid" ||
    subscription_status === "incomplete";

  const planName = subscriptionPlan?.name || "Practice Plan";
  const planPrice = subscriptionPlan?.price
    ? `£${subscriptionPlan.price}/${subscriptionPlan.interval}`
    : "£23.99/month";

  let trialDaysLeft = 0;
  if (isTrial && trialEndsAt) {
    const endDate = new Date(trialEndsAt).getTime();
    const now = new Date().getTime();
    trialDaysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
  }

  // 🚀 UPGRADED: Filtering by BOTH Search Text AND Date!
  const filteredInvoices = invoices.filter((invoice: any) => {
    // 1. Check Search Match
    const dateStr = invoice.created ? formatStripeDate(invoice.created) : formatDate(invoice.date);
    const status = invoice.status || "paid";
    const description =
      invoice.lines?.data?.[0]?.description || invoice.description || "Subscription update";

    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      dateStr.toLowerCase().includes(searchLower) ||
      status.toLowerCase().includes(searchLower) ||
      description.toLowerCase().includes(searchLower);

    // 2. Check Date Match
    let matchesDate = true;
    if (dateFilter !== "all") {
      const invoiceDate = invoice.created
        ? new Date(invoice.created * 1000)
        : new Date(invoice.date);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - invoiceDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (dateFilter === "30") matchesDate = diffDays <= 30;
      if (dateFilter === "90") matchesDate = diffDays <= 90;
      if (dateFilter === "year") matchesDate = invoiceDate.getFullYear() === now.getFullYear();
    }

    return matchesSearch && matchesDate;
  });

  // Pagination Math
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + itemsPerPage);

  const closeEmbeddedBilling = useCallback(() => setBillingSession(null), []);

  async function handleOpenEmbeddedBilling() {
    setOpeningBilling(true);
    try {
      const result = await createEmbeddedBillingSetupSession();
      if (!result.success) {
        toast.error("Could not open secure billing", { description: result.error });
        return;
      }

      setBillingSession({
        clientSecret: result.clientSecret,
        sessionId: result.sessionId,
      });
    } catch {
      toast.error("Could not open secure billing", {
        description: "Check your connection and try again.",
      });
    } finally {
      setOpeningBilling(false);
    }
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <div className="size-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <CreditCard className="size-5 text-blue-600" />
          </div>
          Billing & Plans
        </h1>
        <p className="mt-3 text-sm text-slate-500 font-medium max-w-2xl leading-relaxed">
          Manage your subscription, securely update your payment method here, and download previous
          invoices.
        </p>
      </div>

      {/* Main Billing Card */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        {/* Top Half: Plan Summary & Button */}
        <div className="p-6 sm:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">
              Current Plan
            </h2>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-black text-slate-900">{planName}</span>
              <span className="text-lg font-bold text-slate-400 mb-1">{planPrice}</span>
            </div>

            {/* Dynamic Status Badges */}
            <div className="mt-4 flex items-center gap-2">
              {isPastDue ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                  <AlertCircle className="size-3.5" /> Payment Failed
                </span>
              ) : cancelAtPeriodEnd ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                  <Clock className="size-3.5" /> Cancels at period end
                </span>
              ) : isTrial ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                  <Clock className="size-3.5" /> Trial Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 className="size-3.5" /> Active Subscription
                </span>
              )}
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            {hasStripeBilling && (
              <Button
                type="button"
                disabled={openingBilling}
                onClick={handleOpenEmbeddedBilling}
                className="h-11 w-full rounded-xl bg-blue-600 px-5 font-bold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95 sm:w-auto"
              >
                {openingBilling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CreditCard className="size-4" />
                )}
                {openingBilling ? "Preparing secure form..." : "Update payment method"}
              </Button>
            )}
            <form action={openAuthenticatedBillingPortal} className="w-full sm:w-auto">
              <BillingPortalButton hasBillingProfile={hasStripeBilling} />
            </form>
          </div>
        </div>

        {/* Bottom Half: Details */}
        <div className="bg-slate-50/50 p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Calendar className="size-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {isTrial
                  ? "Trial Ends On"
                  : cancelAtPeriodEnd
                    ? "Access Ends On"
                    : "Next Billing Date"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-slate-900 font-bold text-lg">
                {isTrial && trialEndsAt
                  ? formatDate(trialEndsAt)
                  : currentPeriodEnd
                    ? formatDate(currentPeriodEnd)
                    : "N/A"}
              </p>
              {isTrial && trialDaysLeft > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-xs font-black uppercase tracking-wide">
                  {trialDaysLeft} Days Left
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <CreditCard className="size-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Payment Method</span>
            </div>
            <p className="text-slate-900 font-semibold text-sm mt-2">
              {isPastDue ? (
                <span className="text-red-600 bg-red-50 px-2 py-1 rounded-md">Update required</span>
              ) : (
                <span className="text-slate-600">Encrypted and managed securely by Stripe</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Invoice History Section */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase shrink-0">
            Invoice History
          </h3>

          {/* 🚀 UPGRADED: Search & Date Filters Container */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-full"
              />
            </div>

            {/* 🚀 NEW: Date Dropdown Filter */}
            <div className="relative w-full sm:w-auto shrink-0">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-full appearance-none bg-white cursor-pointer text-slate-700"
              >
                <option value="all">All Time</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="year">This Year</option>
              </select>
              {/* Custom Chevron for select */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  className="size-3.5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {invoices.length > 0 ? (
          <div className="flex flex-col">
            {paginatedInvoices.length > 0 ? (
              paginatedInvoices.map((invoice: any, index: number) => {
                const date = invoice.created
                  ? formatStripeDate(invoice.created)
                  : formatDate(invoice.date);
                const amount =
                  invoice.total !== undefined
                    ? formatCurrency(invoice.total, invoice.currency)
                    : invoice.amount;
                const status = invoice.status || "paid";
                const description =
                  invoice.lines?.data?.[0]?.description ||
                  invoice.description ||
                  "Subscription update";
                const pdfUrl = invoice.invoice_pdf || invoice.hosted_invoice_url;

                return (
                  <div
                    key={invoice.id}
                    className={`flex items-center justify-between py-4 ${index !== paginatedInvoices.length - 1 ? "border-b border-slate-100" : ""}`}
                  >
                    <div className="flex items-center gap-4 sm:gap-8 w-full overflow-hidden">
                      <span className="text-sm font-medium text-slate-600 w-24 shrink-0">
                        {date}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 w-20 shrink-0">
                        {amount}
                      </span>

                      <span
                        className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          status === "paid"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200/50"
                            : status === "open"
                              ? "bg-orange-50 text-orange-600 border-orange-200/50"
                              : "bg-slate-50 text-slate-600 border-slate-200/50"
                        }`}
                      >
                        {status}
                      </span>

                      <span className="text-sm text-slate-600 truncate flex-1" title={description}>
                        {description}
                      </span>
                    </div>

                    {pdfUrl && (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-4 shrink-0"
                        title="Download Invoice PDF"
                      >
                        <Download className="size-4" />
                      </a>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-sm text-slate-500">
                No invoices match your search or date filter.
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {startIndex + 1} to{" "}
                  {Math.min(startIndex + itemsPerPage, filteredInvoices.length)} of{" "}
                  {filteredInvoices.length} invoices
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-3 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-3 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-100 rounded-2xl">
            <div className="size-12 bg-slate-50 flex items-center justify-center rounded-full mb-3">
              <FileText className="size-5 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-700">No invoices yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Your future billing statements and receipts will automatically appear here.
            </p>
          </div>
        )}
      </div>

      {billingSession && (
        <EmbeddedBillingDialog
          key={billingSession.sessionId}
          session={billingSession}
          onClose={closeEmbeddedBilling}
        />
      )}

      <PayrollPromo />
    </div>
  );
}
