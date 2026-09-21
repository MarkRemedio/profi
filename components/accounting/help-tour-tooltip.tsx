"use client";

import { useState, useEffect } from "react";
import { Sparkles, Check, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function HelpTourTooltip({ 
  children, 
  accounts = [] 
}: { 
  children: React.ReactNode; 
  accounts?: any[];
}) {
  const router = useRouter();
  const [showTour, setShowTour] = useState(false);

  // ⚡ Automatically pop open the tutorial tooltip on first login ONLY if chart is empty
  useEffect(() => {
    if (accounts.length === 0) {
      const timer = setTimeout(() => setShowTour(true), 1200); 
      return () => clearTimeout(timer);
    }
  }, [accounts.length]);

  const handleGoToConfigure = () => {
    setShowTour(false);
    router.push("/accounting/chart-of-accounts?tour=true"); // 🚀 FIXED: Passes the tour flag!
  };

  // 🚀 DYNAMIC & SIMPLIFIED CHECKLIST LOGIC
  const hasAccounts = accounts.length > 0;
  
  // Checking ONLY for the 5 main Account Types (Ignoring Report Categories entirely!)
  const hasAsset = accounts.some(a => a.accountType?.toUpperCase() === "ASSET" || a.account_type?.toUpperCase() === "ASSET");
  const hasLiability = accounts.some(a => a.accountType?.toUpperCase() === "LIABILITY" || a.account_type?.toUpperCase() === "LIABILITY");
  const hasEquity = accounts.some(a => a.accountType?.toUpperCase() === "EQUITY" || a.account_type?.toUpperCase() === "EQUITY");
  const hasRevenue = accounts.some(a => a.accountType?.toUpperCase() === "REVENUE" || a.account_type?.toUpperCase() === "REVENUE");
  const hasExpense = accounts.some(a => a.accountType?.toUpperCase() === "EXPENSE" || a.account_type?.toUpperCase() === "EXPENSE");

  // If they hit the "Create Starter Accounts" button, they'll have 14+ accounts automatically!
  const hasStarterPack = accounts.length >= 14;

  // Fully ready once they create at least one of every major type
  const isFullyReady = (hasAsset && hasLiability && hasEquity && hasRevenue && hasExpense) || hasStarterPack;

  // 🚀 OPTIMIZED BACKGROUND SYNC: Only poll the server if the tour popup is ACTUALLY open!
  useEffect(() => {
    if (!isFullyReady && showTour) { 
      const interval = setInterval(() => {
        router.refresh();
      }, 3000); 
      return () => clearInterval(interval);
    }
  }, [isFullyReady, showTour, router]);

  return (
    <Popover open={showTour} onOpenChange={setShowTour}>
      <PopoverTrigger asChild>
        <div className="relative inline-block cursor-pointer">
          {/* Blue pulsing dot if empty, Amber dot if in progress */}
          {!isFullyReady && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 z-10">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasAccounts ? 'bg-amber-400' : 'bg-blue-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hasAccounts ? 'bg-amber-500' : 'bg-blue-600'}`}></span>
            </span>
          )}
          {children}
        </div>
      </PopoverTrigger>
      
      <PopoverContent 
        align="end" 
        sideOffset={12}
        collisionPadding={16} // 🚀 THE MAGIC SHIELD: Forces Radix to keep this box 16px away from the screen edge!
        className="w-80 max-w-[calc(100vw-2rem)] p-5 shadow-2xl border-slate-200 bg-white rounded-xl z-50 animate-in fade-in-50 zoom-in-95"
      >
        <div className="space-y-3 text-left">
          
          {/* CONDITION 1: 0 Accounts (Empty) */}
          {!hasAccounts ? (
            <>
              <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                <Sparkles className="size-4 text-blue-500" />
                Configure Your Ledgers
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed">
                Welcome to WAWPROFI! Let's build your ledger setup first. Go to your 
                <strong> Chart of Accounts</strong> manager to quickly generate your starter system accounts or manually create them to begin issuing invoices and tracking payments right away.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowTour(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition px-2 py-1.5 font-medium"
                >
                  Dismiss
                </button>
                
                <Button
                  onClick={handleGoToConfigure}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 h-8 rounded-lg transition-all font-bold shadow-sm"
                >
                  Configure Now
                </Button>
              </div>
            </>
          ) : !isFullyReady ? (
            /* CONDITION 2: Setup in Progress (Dynamic Task Checklist) */
            <>
              <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
                <Sparkles className="size-4 text-amber-500" />
                Setup in Progress
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed">
                You have {accounts.length} account{accounts.length > 1 ? 's' : ''}, but you need specific core categories to unlock all system features.
              </p>

              <div className="mt-2 border-t border-slate-100 pt-3 space-y-2.5">
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  {hasAsset ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> : <Circle className="size-4 text-slate-300 shrink-0" />}
                  <span className={hasAsset ? "font-medium text-slate-900 line-through opacity-70" : "font-medium text-slate-900"}>Add an Asset Account</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  {hasLiability ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> : <Circle className="size-4 text-slate-300 shrink-0" />}
                  <span className={hasLiability ? "font-medium text-slate-900 line-through opacity-70" : "font-medium text-slate-900"}>Add a Liability Account</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  {hasEquity ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> : <Circle className="size-4 text-slate-300 shrink-0" />}
                  <span className={hasEquity ? "font-medium text-slate-900 line-through opacity-70" : "font-medium text-slate-900"}>Add an Equity Account</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  {hasRevenue ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> : <Circle className="size-4 text-slate-300 shrink-0" />}
                  <span className={hasRevenue ? "font-medium text-slate-900 line-through opacity-70" : "font-medium text-slate-900"}>Add a Revenue Account</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  {hasExpense ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> : <Circle className="size-4 text-slate-300 shrink-0" />}
                  <span className={hasExpense ? "font-medium text-slate-900 line-through opacity-70" : "font-medium text-slate-900"}>Add an Expense Account</span>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <Button
                  onClick={handleGoToConfigure}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs px-4 h-8 rounded-lg font-bold shadow-sm transition-all"
                >
                  Complete Setup <ArrowRight className="ml-1.5 size-3" />
                </Button>
              </div>
            </>
          ) : (
            /* CONDITION 3: Fully Ready */
            <>
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Workspace is Ready
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed">
                Your standard system charts are successfully initialized. Your core accounts are primed to process transactions.
              </p>

              <div className="mt-2 border-t border-slate-100 pt-3 space-y-2">
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  <Check className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="font-medium">Invoicing enabled (Revenue mapped)</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  <Check className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="font-medium">Bank accounts mapped (Assets ready)</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  <Check className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="font-medium">Tax configurations ready</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={() => setShowTour(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs px-4 h-8 rounded-lg shadow-sm"
                >
                  Got it
                </Button>
              </div>
            </>
          )}

        </div>
      </PopoverContent>
    </Popover>
  );
}