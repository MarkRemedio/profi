"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { LeftContent } from "@/components/marketing/waitlist/left-content";
import { FormWaitlist } from "@/components/marketing/waitlist/form-waitlist";
import { FormDemo } from "@/components/marketing/waitlist/form-demo";
import { cn } from "@/lib/utils";

// 🚀 1. Import GSAP
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother"; // 🚀 Added!
import { useRouter } from "next/navigation"; // 🚀 Added!

type TabMode = "waitlist" | "demo";

export function WaitlistShell() {
  const searchParams = useSearchParams(); // ✅ 2. Hook into Next.js URL params
  const [activeTab, setActiveTab] = useState<TabMode>("demo"); 
  const gridRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const router = useRouter(); // 🚀 Hook activated

  // 🚀 Custom function to swap forms and glide to the top safely
  const handleTabSwitch = (tab: TabMode) => {
    if (tab === activeTab) return; // Don't do anything if clicking the active tab

    const smoother = ScrollSmoother.get();
    
    // ✅ THE FIX: If we are scrolled down, glide to the top FIRST!
    if (smoother && smoother.scrollTop() > 100) {
      gsap.to(smoother, { 
        scrollTop: 0, 
        duration: 1.8, 
        ease: "power3.inOut",
        onComplete: () => {
          // Swap the form ONLY after we safely reach the top!
          setActiveTab(tab);
          router.push(`/waitlist?tab=${tab}`, { scroll: false });
        }
      });
    } else {
      // If we are already at the top, swap instantly
      window.scrollTo({ top: 0, behavior: "smooth" });
      setActiveTab(tab);
      router.push(`/waitlist?tab=${tab}`, { scroll: false });
    }
  };

  // ✅ 3. This now runs automatically and smoothly whenever the URL changes!
  useEffect(() => {
    if (searchParams.get("tab") === "waitlist") {
      setActiveTab("waitlist");
    } else {
      setActiveTab("demo");
    }
  }, [searchParams]);

  // 🚀 2. THE ULTIMATE FIX: Mathematical Transform Scrubbing
  // This achieves a perfect "Sticky" effect WITHOUT using GSAP's unstable "pin" DOM injection.
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const timer = setTimeout(() => {
      ScrollTrigger.refresh();

      let ctx = gsap.matchMedia();
      
      // Only run this sticky effect on Desktop sizes
      ctx.add("(min-width: 1024px)", () => {
        
        // Dynamically calculate how far down the form is allowed to slide
        const getSlideDistance = () => {
          if (!gridRef.current || !formRef.current) return 0;
          // Grid Height - Form Height = Total empty track space it can slide down
          return Math.max(0, gridRef.current.offsetHeight - formRef.current.offsetHeight);
        };

        // If there is room to slide, animate it exactly in sync with the scrollbar!
        if (getSlideDistance() > 0) {
          gsap.to(formRef.current, {
            y: getSlideDistance, // Slide down
            ease: "none",        // No easing, keep it strictly glued
            scrollTrigger: {
              trigger: gridRef.current,
              start: "top 120px",            // Start sliding when the top hits the navbar
              end: () => `+=${getSlideDistance()}`, // Stop when it hits the bottom of the left content
              scrub: true,                   // Lock the movement to the scrollbar (1px scroll = 1px slide)
              invalidateOnRefresh: true,     // Recalculate if the window is resized
            }
          });
        }
      });

      return () => ctx.revert();
    }, 500);

    return () => clearTimeout(timer);
  }, [activeTab]);

  return (
    <section id="waitlist" className="w-full bg-white py-20 relative">
      <div className="mx-auto max-w-7xl px-6 md:px-8">

        {/* ─── TOP HEADER GRID ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_510px] gap-8 lg:gap-12 items-end mb-16">
          <div className="space-y-10 animate-premium-zoom-in">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="h-[1px] w-6 bg-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">Talk To Us</span>
              </div>
              
              <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
                {activeTab === "waitlist" ? (
                  <h2 className="text-6xl md:text-[5.5rem] font-medium tracking-tight text-[#111111] leading-[1.05]">
                    Reserve <br/>
                    your <span className="text-blue-600 italic">spot.</span>
                  </h2>
                ) : (
                  <h2 className="text-6xl md:text-[5.5rem] font-medium tracking-tight text-[#111111] leading-[1.05]">
                    Let's give you <br/>
                    a <span className="text-blue-600 italic">private tour.</span>
                  </h2>
                )}
              </div>
            </div>

            <div className="inline-flex items-center gap-1 bg-white p-1.5 rounded-full border border-neutral-200/80 shadow-sm relative z-10">
              {/* ✅ FIXED: Now uses our new smooth scroll function */}
              <button 
                onClick={() => handleTabSwitch("demo")} 
                className={cn(
                  "px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300", 
                  activeTab === "demo" ? "bg-[#111111] text-white shadow-md" : "text-slate-700 hover:text-slate-950 hover:bg-slate-50"
                )}
              >
                Book a private demo
              </button>
              {/* ✅ FIXED: Now uses our new smooth scroll function */}
              <button 
                onClick={() => handleTabSwitch("waitlist")} 
                className={cn(
                  "px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2", 
                  activeTab === "waitlist" ? "bg-[#111111] text-white shadow-md" : "text-slate-700 hover:text-slate-950 hover:bg-slate-50"
                )}
              >
                <span>Join the waitlist</span>
                <span className="text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-md bg-[#ED6A2C] text-white shadow-sm">
                  FREE
                </span>
              </button>
            </div>
          </div>

          <div key={`subtext-${activeTab}`} className="pb-6 animate-in fade-in duration-500 fill-mode-both hidden lg:block">
             {activeTab === "waitlist" ? (
               <p className="text-slate-700 font-medium text-lg">
                 Be early. Free under £30k revenue.
               </p>
             ) : (
               <p className="text-slate-700 font-medium text-lg">
                 Pick a time. Bring your questions. 30 minutes with a founder.
               </p>
             )}
          </div>
        </div>

        {/* ─── BOTTOM CONTENT GRID ─── */}
        {/* We attach gridRef here so GSAP can measure the max height! */}
        <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-[1fr_510px] gap-12 items-start relative">
          
          {/* Left Side Tall Content */}
          <div className="space-y-14 animate-premium-zoom-in">
            <div key={`subtext-mobile-${activeTab}`} className="lg:hidden animate-in fade-in duration-500">
               {activeTab === "waitlist" ? (
                 <p className="text-slate-700 font-medium text-base">Be early. Free under £30k revenue.</p>
               ) : (
                 <p className="text-slate-700 font-medium text-base">Pick a time. Bring your questions. 30 minutes with a founder.</p>
               )}
            </div>
            <LeftContent activeTab={activeTab} />
          </div>

          {/* Right Side Form Track */}
          <div className="w-full h-full relative">
            {/* GSAP targets this exact DIV to slide it down mathematically */}
            <div ref={formRef} className="w-full z-20">
              
              <div key={`form-${activeTab}`} className="animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-4 duration-500 fill-mode-both">
                {activeTab === "waitlist" ? <FormWaitlist /> : <FormDemo />}
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}