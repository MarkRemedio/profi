"use client";

import { CalendarClock, Calculator, CheckCircle, Landmark, ShieldCheck } from "lucide-react";

import { TiltCard } from "./tilt-card";
import { motion } from "framer-motion";

import { PanelFade, PanelReveal } from "./panel-fade";

/**
 * How often they file, said in returns rather than in a word.
 *
 * "Quarterly" is the answer the form collects; what somebody actually wants to
 * know is how many times a year this lands on them and when it is due. The
 * deadline for a monthly or quarterly return — one calendar month and seven
 * days after the period ends — covers both the submission and the payment.
 *
 * Annual gives no date here on purpose. That scheme runs on instalments through
 * the year with a balancing return afterwards, and reducing it to a single
 * deadline would describe something they are not doing.
 */
const FREQUENCIES: Record<string, { returns: string; detail: string }> = {
  quarterly: {
    returns: "Four returns a year",
    detail: "Each one is due a calendar month and seven days after the quarter ends.",
  },
  monthly: {
    returns: "Twelve returns a year",
    detail: "Each one is due a calendar month and seven days after the month ends.",
  },
  annual: {
    returns: "One return a year",
    detail: "You pay instalments across the year and settle the difference on the return.",
  },
};

export function StepThreeShowcase({
  vatRegistered,
  vatFrequency,
  hmrcConnected,
  currencySymbol,
}: {
  vatRegistered: string;
  vatFrequency: string;
  hmrcConnected: boolean;
  currencySymbol: string;
}) {
  const registered = vatRegistered === "yes";
  const frequency = FREQUENCIES[vatFrequency] ?? FREQUENCIES.quarterly;

  /*
   * The heading has to follow the answer.
   *
   * It read "Connected to HMRC — read your VAT deadlines straight from HMRC"
   * whatever was chosen, so a business that had just said it is not VAT
   * registered was promised deadlines it will never have, beside a card
   * reading DISABLED. Three states, three headings.
   */
  const heading = !registered
    ? { title: "No VAT on your documents", sub: "Invoices and bills are recorded at the price you charge and pay." }
    : hmrcConnected
      ? { title: "Connected to HMRC", sub: "Your VAT return periods and deadlines come straight from HMRC." }
      : { title: "VAT on your documents", sub: "Every invoice and bill carries VAT, and we total it for your return." };

  // `layout` so the panel's height eases when a card appears or a list changes
  // length, instead of the cards below jumping. Deliberately not on the
  // TiltCards themselves — those are driven by GSAP transforms, and two
  // libraries writing the same transform fight each other.
  return (
    <motion.div layout transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }} className="space-y-6">
      <PanelFade swapKey={heading.title}>
        <div>
          <h3 className="mb-2 text-2xl font-bold text-white">{heading.title}</h3>
          <p className="text-sm text-slate-400">{heading.sub}</p>
        </div>
      </PanelFade>

      <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3 text-emerald-400">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">What this turns on</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4">
          <span className="font-medium text-slate-300">VAT on invoices &amp; bills</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              registered
                ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                : "bg-slate-700 text-slate-400"
            }`}
          >
            {registered ? "ENABLED" : "DISABLED"}
          </span>
        </div>

        {/* What that actually means on a document, rather than leaving a
            switch labelled on or off to speak for itself. */}
        <PanelFade swapKey={registered ? "registered-lines" : "unregistered-lines"}>
        <div className="mt-3 space-y-2.5">
          {(registered
            ? [
                "Tax rates appear on every line you enter",
                "VAT is posted to its own control account",
                "Your return totals are built as you go",
              ]
            : [
                "Documents show one total, with no VAT lines",
                "Bills are recorded at the amount you pay",
                "Nothing to file, and no VAT return to prepare",
              ]
          ).map((line) => (
            <div key={line} className="flex items-start gap-3">
              <CheckCircle
                className={`mt-0.5 h-4 w-4 shrink-0 ${registered ? "text-emerald-500" : "text-slate-600"}`}
              />
              <span className="text-xs leading-relaxed text-slate-400">{line}</span>
            </div>
          ))}
        </div>
        </PanelFade>
      </TiltCard>

      {registered && (
        <>
          <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3 text-blue-400">
              <CalendarClock className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-widest">Your filing rhythm</span>
            </div>
            <PanelFade swapKey={frequency.returns}>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="m-0 text-sm font-semibold text-white">{frequency.returns}</p>
              <p className="m-0 mt-1.5 text-xs leading-relaxed text-slate-500">{frequency.detail}</p>
            </div>
            </PanelFade>
            <PanelFade swapKey={hmrcConnected ? "hmrc-on" : "hmrc-off"}>
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <Landmark
                className={`mt-0.5 h-4 w-4 shrink-0 ${hmrcConnected ? "text-emerald-400" : "text-slate-600"}`}
              />
              <div>
                <p className="m-0 text-xs font-semibold text-slate-300">
                  {hmrcConnected ? "Deadlines read from HMRC" : "Deadlines worked out here"}
                </p>
                <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
                  {hmrcConnected
                    ? "Your real return periods are used, so the dates match what HMRC holds."
                    : "Connect below and your actual periods replace these, including any that do not run to the calendar."}
                </p>
              </div>
            </div>
            </PanelFade>
          </TiltCard>

          <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3 text-emerald-400">
              <Calculator className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-widest">Worked out for you</span>
            </div>
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Net Amount</span>
                <span>{currencySymbol}1,000.00</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-400">
                <span>VAT (20%)</span>
                <span>{currencySymbol}200.00</span>
              </div>
            </div>
          </TiltCard>
        </>
      )}

      {/*
        Not registered is not the end of the subject.
        Registration is compulsory once turnover passes HMRC's threshold, and
        the person most likely to pick this option is the one who has not looked
        recently. The figure itself is not quoted — it moves, and a stale number
        printed inside the product is worse than none.
      */}
      {!registered && (
        <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3 text-blue-400">
            <CalendarClock className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">If that changes</span>
          </div>
          <p className="m-0 text-xs leading-relaxed text-slate-400">
            You have to register once your VAT-taxable turnover passes HMRC&apos;s threshold in any
            rolling 12 months — it is not judged on your financial year.
          </p>
          <p className="m-0 mt-3 text-xs leading-relaxed text-slate-500">
            Turn VAT on in Settings when that happens. Documents raised from that point carry VAT;
            the ones already issued stay exactly as they were.
          </p>
        </TiltCard>
      )}
    </motion.div>
  );
}
