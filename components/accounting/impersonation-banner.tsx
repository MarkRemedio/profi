"use client";

import { useState } from "react"; 
import { LogOut, Eye, ArrowRight, ChevronUp, ChevronDown } from "lucide-react"; 
import { Button } from "@/components/ui/button";
import { useImpersonation } from "@/components/admin/impersonation-context"; 
import { useRouter, usePathname } from "next/navigation"; 
import { toast } from "sonner";
import { clearImpersonationPass } from "@/app/(admin)/admin/(protected)/clients/actions"; 

type BannerData = { name: string; email: string; plan: string };

export function ImpersonationBanner({ serverData = null }: { serverData?: BannerData | null }) {
  const { impersonating, stopImpersonation, isImpersonating } = useImpersonation();
  const router = useRouter();
  const pathname = usePathname(); 
  
  const [isMinimized, setIsMinimized] = useState(false);

  const session = isImpersonating && impersonating ? impersonating : serverData;

  if (!session) return null;

  const isAdminPage = pathname?.startsWith("/admin");

  async function handleExit() {
    try {
      await clearImpersonationPass();
      if (typeof stopImpersonation === "function") stopImpersonation();
      
      toast.success("Exited view-as mode safely.");
      router.push("/admin/clients");
      router.refresh();
    } catch (e) {
      toast.error("Failed to clear admin session.");
    }
  }

  // 🤏 MINIMIZED STATE: Tiny floating tab indicator
  if (isMinimized) {
    return (
      <div className="fixed left-1/2 top-0 z-[100005] -translate-x-1/2">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-1.5 rounded-b-xl bg-amber-500 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-amber-950 shadow-md transition hover:bg-amber-400 hover:pt-2"
          title="Restore Admin Banner"
        >
          <Eye className="size-3" />
          {session.name}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </div>
    );
  }

  // 🚀 FIXED EXPANDED STATE: Floating sleek SaaS container capsule
  return (
    <div className="fixed top-3 left-1/2 z-[100005] flex w-[90%] max-w-4xl -translate-x-1/2 items-center justify-between gap-4 rounded-full border border-amber-400/40 bg-amber-500/95 px-5 py-2 text-amber-950 shadow-lg shadow-amber-900/10 backdrop-blur-sm transition-all animate-in fade-in slide-in-from-top-3 duration-300">
      
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-950/10">
          <Eye className="size-3.5 text-amber-950" />
        </div>
        <span className="text-xs font-bold truncate">
          Viewing as client:{" "}
          <span className="rounded-full bg-amber-950/10 px-2 py-0.5 font-extrabold">
            {session.name}
          </span>{" "}
          &middot; <span className="opacity-90 font-medium">{session.email}</span> &middot; Plan:{" "}
          <span className="font-extrabold">{session.plan}</span>
        </span>
        <span className="rounded-full bg-amber-950/10 px-2 py-0.5 text-[9px] font-black tracking-wider uppercase hidden lg:inline shrink-0">
          Impersonation Mode
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdminPage && (
          <Button
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="h-7 gap-1.5 rounded-full bg-blue-600 px-3.5 text-xs font-bold text-white hover:bg-blue-700 transition active:scale-95 shadow-sm border-none"
          >
            View now
            <ArrowRight className="size-3" />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsMinimized(true)} 
          className="h-7 gap-1 rounded-full bg-amber-950/5 px-3 text-xs font-bold text-amber-950 hover:bg-amber-950/10 transition border-none"
          title="Hide banner"
        >
          <ChevronUp className="size-3.5 opacity-70" />
          Hide
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleExit} 
          className="h-7 gap-1.5 rounded-full bg-amber-950/10 px-3.5 text-xs font-black text-amber-950 hover:bg-amber-950/20 transition border-none"
        >
          <LogOut className="size-3" />
          Exit
        </Button>
      </div>

    </div>
  );
}