"use client";

import { Check, CheckCircle, Sliders } from "lucide-react";

import { TiltCard } from "./tilt-card";

/**
 * The two ways to finish, described as they actually behave.
 *
 * This panel used to compare "Guided Customization" against a "Pure Blank
 * Slate" that promised "0 preset charts generated (100% clean)". No such option
 * exists any more: the second button calls finishSetup("starter"), which seeds
 * the standard chart of accounts, because a workspace with no accounts cannot
 * post anything at all. The panel was still selling the removed behaviour.
 *
 * The bullets also have to follow the administrator's chart-of-accounts switch.
 * With that step hidden, "choose your chart of accounts" describes a screen the
 * client never reaches — the same reason the button beside it is already
 * conditional.
 */
export function StepFiveShowcase({ showChartOfAccounts }: { showChartOfAccounts: boolean }) {
  const customiseBullets = [
    ...(showChartOfAccounts ? ["Choose your chart of accounts"] : []),
    "Logo, colours and fonts on your documents",
    "Document numbering and paper size",
    "Whether bills need approving before they post",
  ];

  const standardBullets = [
    "The standard chart of accounts, ready to post to",
    "Clean default layouts for every document",
    "Bills wait for approval before they post",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-2xl font-bold text-white">Two ways to finish</h3>
        <p className="text-sm text-slate-400">
          Both leave you with a working set of books. The difference is only how much you decide
          now rather than later.
        </p>
      </div>

      <TiltCard className="space-y-3 rounded-2xl border border-slate-800 bg-slate-800/30 p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400">
          <Sliders className="h-3.5 w-3.5" />
          <span>Customise it</span>
        </div>
        <p className="m-0 text-[11px] font-medium leading-relaxed text-slate-400">
          A few more screens before you start, where you set your own defaults instead of taking
          ours.
        </p>
        <div className="space-y-1.5 pt-1">
          {customiseBullets.map((bullet) => (
            <div key={bullet} className="flex items-center gap-2 text-[11px] text-slate-300">
              <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" /> {bullet}
            </div>
          ))}
        </div>
      </TiltCard>

      <TiltCard className="space-y-3 rounded-2xl border border-slate-700 bg-slate-800/50 p-5 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5" />
          <span>Use the standard setup</span>
        </div>
        <p className="m-0 text-[11px] font-medium leading-relaxed text-slate-400">
          Finish here and start working. Nothing is locked in — every one of these is in Settings
          afterwards.
        </p>
        <div className="space-y-1.5 pt-1">
          {standardBullets.map((bullet) => (
            <div key={bullet} className="flex items-center gap-2 text-[11px] text-slate-300">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> {bullet}
            </div>
          ))}
        </div>
      </TiltCard>

      {/* Said plainly, because with the step hidden the chart still gets built
          and neither the button nor the bullets above would mention it at all. */}
      {!showChartOfAccounts && (
        <p className="m-0 text-xs leading-relaxed text-slate-500">
          Either way, the standard chart of accounts is created for you — your administrator has
          turned off choosing it during setup.
        </p>
      )}
    </div>
  );
}
