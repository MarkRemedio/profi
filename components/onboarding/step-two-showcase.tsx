"use client";

import { CheckCircle, HardHat, Landmark, Search } from "lucide-react";

import { TiltCard } from "./tilt-card";
import { motion } from "framer-motion";

import { PanelFade, PanelReveal } from "./panel-fade";

/** Which field on the form the person is currently in, if any. */
export type StepTwoField = "companyNumber" | "taxReference" | "payeReference" | null;

type Reference = {
  field: Exclude<StepTwoField, null>;
  label: string;
  format: string;
  where: string;
};

const COMPANY_REFERENCES: Reference[] = [
  {
    field: "companyNumber",
    label: "Company number",
    format: "8 characters",
    where: "On your certificate of incorporation, and on your public Companies House record.",
  },
  {
    field: "taxReference",
    label: "Company UTR",
    format: "10 digits",
    where: "On the letter HMRC posted to your registered office a few weeks after incorporation.",
  },
  {
    field: "payeReference",
    label: "Employer PAYE reference",
    format: "123/AB456",
    where: "In your employer registration letter, and on every P60 and P45 you issue.",
  },
];

const INDIVIDUAL_REFERENCES: Reference[] = [
  {
    field: "taxReference",
    label: "Your UTR",
    format: "10 digits",
    where: "On any self assessment letter, or under your details in your HMRC online account.",
  },
  {
    field: "payeReference",
    label: "Employer PAYE reference",
    format: "123/AB456",
    where: "Only if you employ anyone. It is in your employer registration letter.",
  },
];

export function StepTwoShowcase({
  businessStructure,
  hasCis,
  activeField,
}: {
  businessStructure: string;
  hasCis: string;
  activeField: StepTwoField;
}) {
  /*
   * A company pays corporation tax on its profits and its owners are paid by
   * it; a sole trader or partner is taxed on the profit directly and takes
   * drawings. That is the whole reason this step asks the question, so the
   * panel says which of the two it has just decided to build.
   */
  const isCompany = ["ltd", "plc", "cic"].includes(businessStructure);
  const references = isCompany ? COMPANY_REFERENCES : INDIVIDUAL_REFERENCES;

  const ledgers = [
    isCompany ? "Corporation Tax ledgers built" : "Self Assessment ledgers built",
    isCompany ? "Director loan accounts active" : "Owner drawings account active",
  ];

  // `layout` so the panel's height eases when a card appears or a list changes
  // length, instead of the cards below jumping. Deliberately not on the
  // TiltCards themselves — those are driven by GSAP transforms, and two
  // libraries writing the same transform fight each other.
  return (
    <motion.div layout transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }} className="space-y-6">
      <div>
        <h3 className="mb-2 text-2xl font-bold text-white">The accounts we create</h3>
        <p className="text-sm text-slate-400">
          Your business structure decides which tax accounts and ledgers we build.
        </p>
      </div>

      <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3 text-orange-400">
          <Landmark className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">What gets set up</span>
        </div>
        <div className="space-y-3">
          <PanelFade swapKey={isCompany ? "company" : "individual"}>
          <div className="space-y-3">
          {ledgers.map((ledger) => (
            <div
              key={ledger}
              className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
              <span className="text-sm text-slate-300">{ledger}</span>
            </div>
          ))}
          </div>
          </PanelFade>
          {/* CIS is the one answer on this step that adds a whole monthly
              filing obligation, so answering yes should visibly add something
              rather than quietly setting a flag. */}
          <PanelReveal show={hasCis === "yes"}>
            <div className="mt-3 flex items-center gap-4 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
              <HardHat className="h-5 w-5 shrink-0 text-orange-400" />
              <span className="text-sm text-slate-200">
                CIS deductions tracked — CIS300 due monthly by the 19th
              </span>
            </div>
          </PanelReveal>
        </div>
      </TiltCard>

      {/*
        Where each number comes from.
        Every field on this step is a reference somebody has to go and find, and
        the form can only say what it wants, not where it lives. The row for the
        field being filled in lifts, so the answer is already on screen at the
        moment it is needed rather than being something to go and look up.
      */}
      <TiltCard className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3 text-blue-400">
          <Search className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Where to find these</span>
        </div>
        <PanelFade swapKey={isCompany ? "company-refs" : "individual-refs"}>
        <div className="space-y-2.5">
          {references.map((reference) => {
            const active = activeField === reference.field;
            return (
              <div
                key={reference.field}
                className={`rounded-xl border p-4 transition-colors duration-300 ${
                  active
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`text-sm font-semibold transition-colors ${
                      active ? "text-white" : "text-slate-300"
                    }`}
                  >
                    {reference.label}
                  </span>
                  <span className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                    {reference.format}
                  </span>
                </div>
                <p className="m-0 mt-2 text-xs leading-relaxed text-slate-500">{reference.where}</p>
              </div>
            );
          })}
        </div>
        </PanelFade>
        <p className="m-0 mt-4 text-xs leading-relaxed text-slate-500">
          None of these are required to continue. You can add them later in Settings.
        </p>
      </TiltCard>
    </motion.div>
  );
}
