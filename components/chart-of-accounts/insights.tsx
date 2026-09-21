"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getStarterAccountTemplates,
  type StarterAccountGroup,
} from "@/app/(dashboard)/accounting/chart-of-accounts/actions";

import type { ChartAccount } from "./types";

type InsightsProps = {
  accounts: ChartAccount[];
  canManage: boolean;
  seeding: boolean;
  onSeedAccounts: () => void;
};

type CheckResult = {
  id: string;
  label: string;
  /** What to do about it. Only shown when the check has not passed. */
  detail: string;
  passed: boolean;
};

/**
 * The two panels under the accounts table.
 *
 * Both used to be decoration: a stock photograph with a "Review structure"
 * button that did nothing, and a "Learn more" beside it that did nothing
 * either. A button that does not respond reads as broken software, and on a
 * page about audit readiness that is a poor first impression.
 *
 * They now do what they say. The left panel runs real checks against this
 * workspace's accounts; the right lists exactly what the starter chart would
 * add before anybody commits to adding it.
 */
export function Insights({
  accounts,
  canManage,
  seeding,
  onSeedAccounts,
}: InsightsProps) {
  const [showChecks, setShowChecks] = useState(false);
  const [showStarter, setShowStarter] = useState(false);
  const [starterGroups, setStarterGroups] = useState<StarterAccountGroup[] | null>(null);
  const [starterFailed, setStarterFailed] = useState(false);
  const [loadingStarter, startLoadingStarter] = useTransition();
  const [confirming, setConfirming] = useState(false);

  /**
   * Which starter codes this chart does not already have.
   *
   * Null while the templates are still loading — the confirm panel says so
   * rather than claiming nothing is missing before it knows.
   */
  const missingCodes = starterGroups
    ? (() => {
        const existing = new Set(accounts.map((account) => account.code));
        return starterGroups
          .flatMap((group) => group.accounts)
          // Entries are "1000 Bank Current Account"; the code is the first word.
          .map((entry) => entry.split(" ")[0])
          .filter((code) => !existing.has(code));
      })()
    : null;

  /**
   * Seeding is safe — existing codes are skipped, never overwritten — but that
   * is invisible from the outside. On a chart that already has accounts, show
   * exactly what would be added and ask first.
   */
  function handleSeedClick() {
    if (accounts.length === 0) {
      onSeedAccounts();
      return;
    }

    setConfirming(true);
    if (starterGroups || loadingStarter) return;

    startLoadingStarter(async () => {
      try {
        setStarterGroups(await getStarterAccountTemplates());
        setStarterFailed(false);
      } catch {
        setStarterFailed(true);
      }
    });
  }

  // Fetched the first time somebody opens the list, then kept. The panel is
  // disclosure, not something every visit to this page should pay for.
  function toggleStarter() {
    setShowStarter((open) => !open);
    if (starterGroups || showStarter) return;

    startLoadingStarter(async () => {
      // A failure and an empty list are tracked apart. Treating empty as a
      // failure is what made a grouping bug look like the server being down,
      // and sent me looking in the wrong place.
      try {
        setStarterGroups(await getStarterAccountTemplates());
        setStarterFailed(false);
      } catch {
        setStarterFailed(true);
      }
    });
  }

  const checks = runStructureChecks(accounts);
  const failing = checks.filter((check) => !check.passed);
  const allPassed = failing.length === 0;

  return (
    <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      {/* Structure health */}
      <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex h-full flex-col p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  allPassed ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                )}
              >
                {allPassed ? (
                  <ClipboardCheck className="size-5" />
                ) : (
                  <AlertTriangle className="size-5" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="m-0 text-base font-bold text-slate-900">Audit readiness</h2>
                <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">
                  {allPassed
                    ? "Every control account a UK ledger needs is present and active. Your reports will balance to something meaningful."
                    : `${failing.length} thing${failing.length === 1 ? "" : "s"} to look at before this chart is ready to report from.`}
                </p>
              </div>
            </div>

            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                allPassed
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              )}
            >
              {checks.length - failing.length}/{checks.length}
            </span>
          </div>

          <div className="mt-4 flex-1">
            {/* Failures first and always visible — the passes are the part
                worth collapsing, not the problems. */}
            {failing.length > 0 && (
              <ul className="m-0 space-y-2.5 p-0">
                {failing.map((check) => (
                  <li key={check.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <AlertTriangle className="size-2.5 text-amber-700" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">
                        {check.label}
                      </span>
                      <span className="block text-xs leading-relaxed text-slate-500">
                        {check.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Expands by animating a grid track from 0fr to 1fr rather than
                mounting and unmounting. Height cannot be transitioned to auto,
                and measuring it in JS means a resize observer and a value that
                goes stale — the same trick the reports drilldown column uses.
                The content stays mounted so there is something to collapse
                from, and is hidden from assistive tech while closed. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                showChecks ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
              aria-hidden={!showChecks}
            >
              <div className="overflow-hidden">
                <ul
                  className={cn(
                    "m-0 space-y-2 p-0",
                    failing.length > 0 && "mt-4 border-t border-slate-100 pt-4"
                  )}
                >
                  {checks
                    .filter((check) => check.passed)
                    .map((check) => (
                      <li key={check.id} className="flex items-center gap-2.5">
                        <Check className="size-3.5 shrink-0 text-emerald-600" />
                        <span className="text-sm text-slate-600">{check.label}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-5 w-fit"
            onClick={() => setShowChecks((open) => !open)}
          >
            {showChecks ? "Hide passing checks" : "Review structure"}
            <ChevronDown
              className={cn("ml-1.5 size-4 transition-transform", showChecks && "rotate-180")}
            />
          </Button>
        </CardContent>
      </Card>

      {/* Starter accounts */}
      <Card className="h-full rounded-2xl border-blue-100 bg-blue-50/40 shadow-sm">
        <CardContent className="flex h-full flex-col p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="m-0 text-base font-bold text-slate-900">Smart account setup</h2>
              <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">
                A UK-friendly baseline — the control accounts invoices, bills, VAT and banking
                post to. Add your own on top; nothing you already have is changed.
              </p>
            </div>
          </div>

          {/* Same expand as the audit panel. The list is fetched on demand, so
              until it has arrived there is nothing to reveal — mounting the
              wrapper only once the fetch has started keeps the transition from
              running against an empty box. */}
          <div
            className={cn(
              "mt-4 grid flex-1 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
              showStarter ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
            aria-hidden={!showStarter}
          >
            <div className="overflow-hidden">
              <div className="space-y-3 rounded-xl border border-blue-100 bg-white p-4">
                {loadingStarter && !starterGroups ? (
                  <p className="m-0 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading the list…
                  </p>
                ) : starterFailed ? (
                  <p className="m-0 text-xs text-slate-500">
                    Could not load the list just now. Creating the accounts still works.
                  </p>
                ) : starterGroups && starterGroups.length > 0 ? (
                  <>
                    {starterGroups.map((group) => (
                      <div key={group.label}>
                        <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-400">
                          {group.label}
                        </p>
                        <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600">
                          {group.accounts.join(" · ")}
                        </p>
                      </div>
                    ))}
                    <p className="m-0 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
                      {starterGroups.reduce((total, group) => total + group.accounts.length, 0)}{" "}
                      accounts in total. Codes already in your chart are skipped, so this is safe
                      to run on a workspace that has started trading.
                    </p>
                  </>
                ) : (
                  <p className="m-0 text-xs text-slate-500">
                    No starter template is configured on this platform.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Asked before anything is written, once the chart is no longer
              empty. Existing codes are skipped rather than overwritten, but
              somebody with 21 accounts pressing "Create starter accounts" has
              no way to know that, and the page reloading afterwards looks like
              something drastic happened. */}
          {confirming && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="m-0 text-sm font-semibold text-slate-900">
                This workspace already has {accounts.length} account
                {accounts.length === 1 ? "" : "s"}
              </p>
              {missingCodes === null ? (
                <p className="m-0 mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <Loader2 className="size-3.5 animate-spin" />
                  Checking what is missing…
                </p>
              ) : missingCodes.length === 0 ? (
                <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600">
                  Every starter account is already there. Nothing would be added.
                </p>
              ) : (
                <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600">
                  {missingCodes.length} would be added —{" "}
                  <span className="font-mono">{missingCodes.join(", ")}</span>. Your existing
                  accounts are left exactly as they are.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-blue-700 text-white hover:bg-blue-800"
                  disabled={seeding || missingCodes === null || missingCodes.length === 0}
                  onClick={() => {
                    setConfirming(false);
                    onSeedAccounts();
                  }}
                >
                  {missingCodes && missingCodes.length > 0
                    ? `Add ${missingCodes.length} account${missingCodes.length === 1 ? "" : "s"}`
                    : "Nothing to add"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              className="bg-blue-700 text-white hover:bg-blue-800"
              disabled={!canManage || seeding || confirming}
              onClick={handleSeedClick}
            >
              <Sparkles className="size-4" />
              {seeding
                ? "Adding accounts…"
                : accounts.length === 0
                  ? "Create starter accounts"
                  : "Add missing starter accounts"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-700 hover:bg-blue-100/60 hover:text-blue-800"
              onClick={toggleStarter}
            >
              {showStarter ? "Hide the list" : "See what's included"}
              <ChevronDown
                className={cn("ml-1.5 size-4 transition-transform", showStarter && "rotate-180")}
              />
            </Button>
          </div>

          {!canManage && (
            <p className="m-0 mt-3 text-xs text-slate-500">
              Only an owner or accountant can add accounts.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * What makes a chart of accounts fit to report from.
 *
 * Every check is answered from this workspace's own accounts — none of it is
 * advice in general, it is a statement about what is in front of you. A check
 * that cannot be answered from the data does not belong here.
 */
function runStructureChecks(accounts: ChartAccount[]): CheckResult[] {
  const active = accounts.filter((account) => account.is_active);
  const has = (code: string) => active.some((account) => account.code === code);
  const hasCategory = (category: string) =>
    active.some((account) => account.report_category === category);

  // An account switched off while it still holds a balance drops out of the
  // chart but not out of the trial balance, which is where a report stops
  // adding up.
  const inactiveWithBalance = accounts.filter(
    (account) => !account.is_active && account.balance_minor !== 0
  );

  const duplicateCodes = findDuplicateCodes(accounts);
  const uncategorised = active.filter((account) => !account.report_category);

  return [
    {
      id: "bank",
      label: "A bank account to reconcile against",
      detail: "Nothing is categorised as a bank account, so banking has nowhere to post.",
      passed: hasCategory("bank"),
    },
    {
      id: "receivable",
      label: "Accounts receivable (1100)",
      detail: "Invoices post the amount owed here. Without it, sales cannot be raised.",
      passed: has("1100"),
    },
    {
      id: "payable",
      label: "Accounts payable (2000)",
      detail: "Bills post what you owe here. Without it, purchases cannot be recorded.",
      passed: has("2000"),
    },
    {
      id: "vat",
      label: "VAT control accounts (1200 and 2100)",
      detail:
        "VAT on sales and purchases needs both. The VAT return reads its figures from them.",
      passed: has("1200") && has("2100"),
    },
    {
      id: "revenue",
      label: "At least one revenue account",
      detail: "Invoice lines need somewhere to post income.",
      passed: active.some((account) => account.account_type === "revenue"),
    },
    {
      id: "expense",
      label: "At least one expense account",
      detail: "Bill lines need somewhere to post costs.",
      passed: active.some((account) => account.account_type === "expense"),
    },
    {
      id: "duplicates",
      label: "No duplicate account codes",
      detail:
        duplicateCodes.length > 0
          ? `${duplicateCodes.join(", ")} appear${duplicateCodes.length === 1 ? "s" : ""} more than once, so reports may group the wrong lines together.`
          : "",
      passed: duplicateCodes.length === 0,
    },
    {
      id: "categorised",
      label: "Every account has a report category",
      detail:
        uncategorised.length > 0
          ? `${uncategorised.length} account${uncategorised.length === 1 ? "" : "s"} would be left out of the balance sheet and profit and loss.`
          : "",
      passed: uncategorised.length === 0,
    },
    {
      id: "inactive_balance",
      label: "No archived account is still holding a balance",
      detail:
        inactiveWithBalance.length > 0
          ? `${inactiveWithBalance.map((account) => account.code).join(", ")} ${inactiveWithBalance.length === 1 ? "is" : "are"} switched off but not empty. The balance stays in the trial balance.`
          : "",
      passed: inactiveWithBalance.length === 0,
    },
  ];
}

function findDuplicateCodes(accounts: ChartAccount[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const account of accounts) {
    if (seen.has(account.code)) duplicates.add(account.code);
    seen.add(account.code);
  }

  return [...duplicates].sort();
}
