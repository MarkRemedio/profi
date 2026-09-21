"use client";

import { ArrowRight, FileUp, Sparkles } from "lucide-react";

import { TiltCard } from "./tilt-card";
import { motion } from "framer-motion";

import { PanelFade } from "./panel-fade";

/**
 * The first few moves, named as real places in the application.
 *
 * The panel used to say the dashboard would be arranged around this answer.
 * Nothing does that — both answers on this step are recorded and never read —
 * so it promised something that never arrived. What is true, and more useful on
 * an empty workspace, is where to go first, so that is what it says now.
 */
const FIRST_STEPS: Record<string, { heading: string; steps: string[] }> = {
  invoices: {
    heading: "Getting your first invoice out",
    steps: [
      "Add a customer under Sales → Customers",
      "Raise the invoice and send it by email",
      "Match the payment when it reaches your bank",
    ],
  },
  expenses: {
    heading: "Getting your costs recorded",
    steps: [
      "Add a supplier under Purchases → Suppliers",
      "Record a bill, or claim it back as an expense",
      "Import a bank statement to match what you paid",
    ],
  },
};

export function StepFourShowcase({
  migrationSource,
  topPriority,
}: {
  migrationSource: string;
  topPriority: string;
}) {
  /* topPriority is a comma-joined set now, so the panel follows whichever was
     picked first and has a route written for it. Areas without one — profit,
     accuracy — fall through to invoicing, which is the first move regardless. */
  const first =
    String(topPriority)
      .split(",")
      .map((entry) => entry.trim())
      .map((entry) => FIRST_STEPS[entry])
      .find(Boolean) ?? FIRST_STEPS.invoices;

  /* Anything that is not a live system has figures on paper or in a sheet,
     and the same "bring it across" guidance applies to all of them. */
  const fromSpreadsheets = ["sheets", "paper", "xero", "quickbooks", "sage", "freeagent"].includes(migrationSource);

  // `layout` so the panel's height eases when a card appears or a list changes
  // length, instead of the cards below jumping. Deliberately not on the
  // TiltCards themselves — those are driven by GSAP transforms, and two
  // libraries writing the same transform fight each other.
  return (
    <motion.div layout transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }} className="space-y-6">
      <div>
        <h3 className="mb-2 text-2xl font-bold text-white">Where you&apos;ll start</h3>
        <p className="text-sm text-slate-400">
          Your workspace opens empty. This is the shortest route to something in it.
        </p>
      </div>

      <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3 text-blue-400">
          <ArrowRight className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">First three moves</span>
        </div>
        <PanelFade swapKey={topPriority}>
        <p className="m-0 mb-4 text-sm font-semibold text-white">{first.heading}</p>
        <div className="space-y-2.5">
          {first.steps.map((step, position) => (
            <div
              key={step}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[11px] font-bold text-blue-400">
                {position + 1}
              </span>
              <span className="text-xs leading-relaxed text-slate-400">{step}</span>
            </div>
          ))}
        </div>
        </PanelFade>
      </TiltCard>

      {/*
        What can and cannot come across from a file.
        This card previously said import templates would be prepared. None are,
        and only two things in the application read a file at all — the chart of
        accounts and bank statements — so naming those two is both honest and
        more use than a template that never arrives.
      */}
      <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3 text-purple-400">
          {fromSpreadsheets ? <FileUp className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          <span className="text-xs font-bold uppercase tracking-widest">
            {fromSpreadsheets ? "Bringing figures across" : "Starting fresh"}
          </span>
        </div>

        <PanelFade swapKey={fromSpreadsheets ? "sheets" : "fresh"}>
        {fromSpreadsheets ? (
          <>
            <div className="space-y-2.5">
              {["Chart of accounts, from a spreadsheet", "Bank statements, from your bank's export"].map(
                (item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
                  >
                    <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                    <span className="text-xs leading-relaxed text-slate-300">{item}</span>
                  </div>
                ),
              )}
            </div>
            <p className="m-0 mt-4 text-xs leading-relaxed text-slate-500">
              Customers, suppliers and opening balances are entered directly — there is no file
              import for those yet, so it is worth having last year&apos;s closing figures to hand.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Nothing to bring across
              </span>
              <span className="text-sm font-medium text-white">
                A standard chart of accounts is created for you
              </span>
            </div>
            <p className="m-0 mt-4 text-xs leading-relaxed text-slate-500">
              Assets, liabilities, income and expenses are all set up, so you can raise your first
              document without building a ledger first.
            </p>
          </>
        )}
        </PanelFade>
      </TiltCard>
    </motion.div>
  );
}
