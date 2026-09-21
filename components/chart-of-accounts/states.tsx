"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AlertCircle, BarChart3, Loader2, Plus, Sparkles, X, ChevronRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type EmptyAccountsStateProps = {
  canManage: boolean;
  hasAccounts: boolean;
  seeding: boolean;
  onSeed: () => void;
  onAdd: () => void;
};

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertCircle className="mt-0.5 size-4" />
      <p>{message}</p>
    </div>
  );
}

export function LoadingState() {
  return (
    <Card className="min-h-[420px] border-slate-200">
      <CardContent className="grid flex-1 place-items-center px-6">
        <div className="w-full max-w-3xl space-y-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
            <Loader2 className="size-5 animate-spin text-blue-600" />
            Loading chart of accounts
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

export function NoWorkspaceState({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50 text-amber-900">
      <CardContent className="px-6">
        <h2 className="text-lg font-bold">No organization membership found</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6">
          Your user is signed in, but it is not linked to an organization in
          user_roles yet. Create a workspace to link this login as the owner and
          load the Chart of Accounts.
        </p>
        <Button className="mt-4" onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus />}
          Create workspace
        </Button>
      </CardContent>
    </Card>
  );
}

export function EmptyAccountsState({
  canManage,
  hasAccounts,
  seeding,
  onSeed,
  onAdd,
}: EmptyAccountsStateProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const [tourStep, setTourStep] = useState<number | null>(null);
  
  const tourContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const isTourActive = searchParams.get("tour") === "true";
    if (isTourActive && !hasAccounts && !hasScrolledRef.current) {
      setTourStep(1);
      hasScrolledRef.current = true;
      
      setTimeout(() => {
        if (tourContainerRef.current) {
          const elementTop = tourContainerRef.current.getBoundingClientRect().top + window.scrollY;
          const targetY = elementTop - (window.innerHeight / 2) + (tourContainerRef.current.offsetHeight / 3);
          
          window.scrollTo({
            top: Math.max(0, targetY),
            behavior: "smooth"
          });
        }
      }, 350);
    }
  }, [searchParams, hasAccounts]);

  const closeTour = () => {
    setTourStep(null);
    hasScrolledRef.current = false;
    router.replace(pathname);
  };

  return (
    <div 
      ref={tourContainerRef}
      className="border-t border-slate-200 bg-white px-4 py-14 text-center relative rounded-xl"
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        <BarChart3 className="size-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-950">
        {hasAccounts ? "No accounts match this view" : "No accounts yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasAccounts
          ? "Adjust the search or account type filters to bring accounts back into view."
          : "Create a starter UK chart or add your first account manually."}
      </p>
      
      {canManage && !hasAccounts ? (
        <div className="mt-8 flex flex-col items-center w-full max-w-md mx-auto">
          
          {/* 🌟 FLEXIBLE TOUR CARD: Takes up natural space so it never overlaps the buttons! */}
          {tourStep !== null && (
            <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-2xl text-left mb-8 relative animate-in fade-in zoom-in-95 duration-300">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                    Ledger Setup Walkthrough ({tourStep} of 2)
                  </span>
                </div>
                <button onClick={closeTour} className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-900 outline-none">
                  <X className="size-4" />
                </button>
              </div>

              {/* 🚀 FIXED: Inner text box is height-locked to prevent bouncing during text swaps */}
              <div className="min-h-[90px] sm:min-h-[64px] flex items-start">
                {tourStep === 1 ? (
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Look below at <strong className="text-white">&quot;Create starter accounts&quot;</strong>: 
                    Click this button to instantly deploy a complete, standard <span className="text-blue-400 font-semibold">UK compliance ledger baseline</span>. It maps bank items, base tax keys, and assets automatically.
                  </p>
                ) : (
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Look below at <strong className="text-white">&quot;Add account&quot;</strong>: 
                    Prefer custom tracking? Use this option to build bespoke ledger accounts code-by-code to match a legacy account layout schema from past records.
                  </p>
                )}
              </div>

              <div className="mt-2 flex justify-end">
                {tourStep === 1 ? (
                  <Button 
                    size="sm"
                    onClick={() => setTourStep(2)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-4"
                  >
                    Next Step <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                ) : (
                  <Button 
                    size="sm"
                    onClick={closeTour}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-8 px-4"
                  >
                    Got It <Check className="size-3.5 ml-1" />
                  </Button>
                )}
              </div>

              {/* Dynamic Downward Arrow Pointer */}
              <div 
                className={cn(
                  "absolute -bottom-1.5 w-3 h-3 bg-slate-950 rotate-45 border-b border-r border-slate-800 transition-all duration-300 left-1/2 -translate-x-1/2 hidden sm:block",
                  tourStep === 1 && "sm:left-[28%]",
                  tourStep === 2 && "sm:left-[72%]"
                )}
              />
            </div>
          )}

          {/* Action Buttons Matrix */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 w-full max-w-[280px] sm:max-w-none">
            
            <Button 
              variant="outline" 
              onClick={onSeed} 
              disabled={seeding}
              className={cn(
                "w-full sm:w-auto transition-all duration-300 font-semibold bg-white text-sm h-11 px-5 touch-manipulation",
                tourStep === 1 && "ring-4 ring-blue-600 ring-offset-4 shadow-xl scale-105 border-blue-400 text-blue-700 font-bold"
              )}
            >
              {seeding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              Create starter accounts
            </Button>

            <Button 
              onClick={onAdd}
              className={cn(
                "w-full sm:w-auto transition-all duration-300 font-semibold text-sm h-11 px-5 touch-manipulation",
                tourStep === 2 && "ring-4 ring-blue-600 ring-offset-4 shadow-xl scale-105 bg-blue-600 text-white font-bold"
              )}
            >
              <Plus className="mr-2 size-4" />
              Add account
            </Button>

          </div>

        </div>
      ) : null}
    </div>
  );
}