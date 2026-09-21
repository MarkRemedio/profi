"use client";

import { useRef, useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother"; // 👈 IMPORT THE SMOOTHER
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  // 👈 REGISTER IT SO WE CAN TALK TO THE GLOBAL PROVIDER
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother); 
}

interface LivePlan {
  planCode: string;
  name: string;
  description?: string; 
  price: number;
  interval: string;
  buttonText: string;
  isPopular: boolean;
  features: any;
  seats: number; // 🚀 ADDED THIS
  trialDays: number; // 🚀 ADDED THIS
}

function CheckIcon({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
        isDark ? "bg-blue-600" : "bg-blue-100"
      }`}
    >
      <svg
        className={`size-2.5 ${isDark ? "text-white" : "text-blue-600"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

export function PricingSection({ dbPlans }: { dbPlans: LivePlan[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [showComparison, setShowComparison] = useState(false);

  const checkScrollProgress = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const executeScrollStep = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const { clientWidth } = scrollRef.current;
      const targetOffset = direction === "left" ? -clientWidth * 0.75 : clientWidth * 0.75;
      scrollRef.current.scrollBy({ left: targetOffset, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScrollProgress);
      checkScrollProgress();
    }
    return () => el?.removeEventListener("scroll", checkScrollProgress);
  }, [dbPlans]);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
          toggleActions: "play none none none"
        },
      });

      tl.from(".animate-pricing-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
      })
        .from(
          ".animate-pricing-card",
          {
            y: 50,
            opacity: 0,
            scale: 0.95,
            duration: 0.7,
            stagger: 0.12,
            ease: "back.out(1.1)",
            clearProps: "all",
          },
          "-=0.4",
        )
        .from(
          ".animate-pricing-footer",
          {
            y: 20,
            opacity: 0,
            duration: 0.6,
            ease: "power3.out",
          },
          "-=0.2",
        );
    },
    { scope: containerRef }
  );

  const pricingTiers = useMemo(() => {
    return dbPlans.map((plan, index) => {
      let parsedFeatures = [];
      try {
        parsedFeatures = typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features;
      } catch (e) {
        parsedFeatures = [];
      }

      const activeFeatures: string[] = Array.isArray(parsedFeatures)
        ? parsedFeatures.filter((f: any) => f.enabled).map((f: any) => f.label)
        : [];

      return {
        planCode: plan.planCode,
        name: plan.name,
        description: plan.description || "", 
        tag: `TIER ${String.fromCharCode(65 + index)}`,
        price: plan.price === 0 ? "Free" : `£${plan.price}`,
        period: `per ${plan.interval}`,
        isPopular: plan.isPopular || false,
        features: activeFeatures.length > 0 ? activeFeatures : ["Core modules included"],
        buttonText: plan.buttonText || "Get Started →",
        seats: plan.seats, // 🚀 ADDED THIS
        trialDays: plan.trialDays, // 🚀 ADDED THIS
      };
    });
  }, [dbPlans]);

  const categorizedFeatures = useMemo(() => {
    const allLabels = new Set<string>();
    dbPlans.forEach((plan) => {
      try {
        const parsed = typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features;
        if (Array.isArray(parsed)) {
          parsed.forEach((f: any) => {
            if (f && f.label) allLabels.add(f.label);
          });
        }
      } catch (e) {}
    });

    const items = Array.from(allLabels);

    const categories = [
      {
        title: "Invoicing & Core Ledger Operations",
        keywords: ["sales", "invoice", "quote", "credit", "customer", "billing"],
        features: [] as string[],
      },
      {
        title: "Banking, Purchases & Assets",
        keywords: ["bank", "purchase", "supplier", "feed", "transaction", "bill", "expense"],
        features: [] as string[],
      },
      {
        title: "Payroll, Taxes & Automation",
        keywords: ["payroll", "tax", "vat", "mtd", "employee", "pos", "accounting", "report"],
        features: [] as string[],
      },
    ];

    items.forEach((label) => {
      const lower = label.toLowerCase();
      const matchedCategory = categories.find((cat) =>
        cat.keywords.some((keyword) => lower.includes(keyword))
      );
      if (matchedCategory) {
        matchedCategory.features.push(label);
      } else {
        categories[0].features.push(label);
      }
    });

    return categories.filter((cat) => cat.features.length > 0);
  }, [dbPlans]);

  const checkPlanHasFeature = (plan: LivePlan, label: string): boolean => {
    try {
      const parsed = typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features;
      if (Array.isArray(parsed)) {
        const target = parsed.find((f: any) => f.label === label);
        return !!target?.enabled;
      }
    } catch (e) {}
    return false;
  };

  // 🚀 THE MAGIC FIX: GSAP-AWARE SCROLLING COMMAND
  const triggerSmartScroll = (delay: number) => {
    setTimeout(() => {
      if (!comparisonRef.current) return;
      
      // Grab the active global smoother instance from your GSAPScrollProvider
      const smoother = ScrollSmoother.get(); 
      
      if (smoother) {
        // Tell the GSAP engine to handle the scrolling smoothly! No fighting.
        smoother.scrollTo(comparisonRef.current, true, "top 120px");
      } else {
        // Fallback for native just in case
        comparisonRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, delay);
  };

  const toggleComparison = () => {
    if (!showComparison) {
      setShowComparison(true);
      triggerSmartScroll(550); // Wait for CSS Grid animation to expand first
    } else {
      setShowComparison(false); // Collapses upward smoothly natively
    }
  };

  const scrollToComparisonMatrix = () => {
    if (!showComparison) {
      setShowComparison(true);
      triggerSmartScroll(550); // Open and wait, then GSAP glide
    } else {
      triggerSmartScroll(50); // Already open, GSAP glide instantly
    }
  };

  return (
    <section id="pricing" ref={containerRef} className="bg-slate-50/40 py-32 overflow-hidden scroll-mt-20">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* Header Section */}
        <div className="mb-20 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="animate-pricing-header">
            <div className="mb-8 flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>06</span>
              <span className="h-[1px] w-12 bg-slate-300"></span>
              <span>Pricing</span>
            </div>
            <h2 className="text-5xl font-medium tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem] leading-[1.05]">
              One flat price. <br />
              <span className="text-blue-600">No seat creep.</span>
            </h2>
          </div>
          
          {dbPlans.length > 3 && (
            <div className="animate-pricing-header flex items-center gap-3 pb-4">
              <button
                onClick={() => executeScrollStep("left")}
                disabled={!canScrollLeft}
                className="flex size-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                onClick={() => executeScrollStep("right")}
                disabled={!canScrollRight}
                className="flex size-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </div>

        {/* Horizontal Slider Track Wrapper */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 -mx-4 pt-4 pb-8"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {pricingTiers.map((tier, i) => {
            const isDark = tier.isPopular;

            return (
              /* 🚀 GSAP Entry Shell Container (Handles Entry Animation Only) */
              <div
                key={tier.planCode || i}
                className="animate-pricing-card snap-center flex min-w-[85vw] sm:min-w-[360px] md:min-w-[390px] pt-4"
              >
                {/* 🚀 Interactive Tailwind Container (Handles Hover Animation Privately) */}
                <div
                  className={`w-full group relative flex flex-col justify-between rounded-[2rem] border p-8 shadow-sm transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl sm:p-10 ${
                    isDark
                      ? "border-slate-800 bg-[#0B0F19] text-white hover:border-slate-700 hover:shadow-[0_20px_60px_-15px_rgba(37,99,235,0.25)]"
                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                  }`}
                >
                <div>
                  <div className="mb-6 flex items-center justify-between">
                    <p
                      className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${
                        isDark ? "text-blue-500" : "text-slate-400"
                      }`}
                    >
                      <span
                        className={`size-1 rounded-full ${isDark ? "bg-blue-500" : "bg-slate-300"}`}
                      />
                      {tier.tag}
                    </p>
                    {isDark && (
                      <span className="flex items-center gap-1 rounded-full bg-[#ED6A2C] px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white shadow-sm">
                        <Star className="size-2.5 fill-white" /> Most Popular
                      </span>
                    )}
                  </div>

                  <h3 className={`text-xl font-medium ${isDark ? "text-white" : "text-slate-900"}`}>
                    {tier.name}
                  </h3>

                  <div className="my-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-6xl font-medium tracking-tight">{tier.price}</span>
                    </div>
                    <p className={`mt-2 text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {tier.period}
                    </p>
                  </div>

                  <div className={`my-6 h-[1px] w-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`} />

                  {/* Description Text */}
                  <div className="min-h-[100px]">
                    <p className={`text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                      isDark ? "text-slate-300" : "text-slate-600"
                    }`}>
                      {tier.description || "No description provided for this tier layout configuration."}
                    </p>
                  </div>
                </div>

                <div className="mt-8 space-y-4 text-center">
                  
                  {/* 🚀 REDESIGNED & MOVED: Professional border badges above the button */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pb-2">
                    
                    {/* 🚀 ONLY renders this badge if trialDays is greater than 0 */}
                    {tier.trialDays > 0 && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                        isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-400" : "border-blue-200/60 bg-blue-50/50 text-blue-700"
                      }`}>
                        {tier.trialDays}-Day Free Trial
                      </span>
                    )}

                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                      isDark ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-400" : "border-indigo-200/60 bg-indigo-50/50 text-indigo-700"
                    }`}>
                      {Number(tier.seats) === -1 ? "Unlimited Users" : `Up to ${tier.seats || 1} Users`}
                    </span>
                  </div>

                  <Link
                    href={`/signup?plan=${tier.planCode}`}
                    className={`w-full rounded-full py-4 text-sm font-bold text-center block transition-all duration-300 ${
                      isDark
                        ? "bg-blue-600 text-white hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                        : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    {tier.buttonText}
                  </Link>

                  <button
                    onClick={scrollToComparisonMatrix}
                    className={`inline-flex items-center gap-1 text-xs font-bold transition-all hover:gap-1.5 border-b border-transparent pb-0.5 hover:border-current ${
                      isDark ? "text-blue-400 hover:text-blue-300" : "text-slate-500 hover:text-blue-600"
                    }`}
                  >
                    <span>See full {tier.name} features</span>
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            </div> 
            );
          })}
        </div>

        {/* Global Action Link Trigger */}
        <div className="flex justify-center mt-6 mb-12">
          <button 
            onClick={toggleComparison}
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-600 hover:border-slate-300"
          >
            <span>{showComparison ? "Hide Detailed Breakdown ↑" : "See Complete Plan Comparison ↓"}</span>
          </button>
        </div>

        {/* 🛠️ CSS Grid Height Animation */}
        <div 
          ref={comparisonRef} 
          className={`grid transition-[grid-template-rows,opacity,margin] duration-500 ease-in-out scroll-mt-24 ${
            showComparison ? "grid-rows-[1fr] opacity-100 mt-8" : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden">
            <div className="border border-slate-200 rounded-[2rem] bg-white shadow-xl">
              <div className="p-6 sm:p-10 bg-[#0B0F19] text-white border-b border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Feature Matrix</span>
                <h3 className="text-2xl font-bold tracking-tight mt-1">Compare Platform Features</h3>
                <p className="text-sm text-slate-400 mt-1.5">A complete itemized map of operational components across service tiers.</p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] table-fixed text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <th className="p-6 text-xs font-bold uppercase tracking-wider text-slate-400 w-[35%]">Capability Modules</th>
                      {dbPlans.map((plan, idx) => (
                        <th key={plan.planCode || idx} className="p-6 text-center w-[21%]">
                          <span className="block text-base font-extrabold text-slate-900">{plan.name}</span>
                          <span className="block text-xs font-bold text-blue-600 mt-0.5">
                            {plan.price === 0 ? "Free Entry" : `£${plan.price} / mo`}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {categorizedFeatures.map((category, catIndex) => (
                      <Fragment key={catIndex}>
                        <tr className="bg-slate-50/50">
                          <td 
                            colSpan={dbPlans.length + 1} 
                            className="px-6 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-950 border-y border-slate-200/80 bg-slate-100/60"
                          >
                            {category.title}
                          </td>
                        </tr>
                        
                        {category.features.map((label, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-slate-50/60 transition-colors group">
                            <td className="p-6 text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                              {label}
                            </td>
                            {dbPlans.map((plan, planIdx) => {
                              const hasFeature = checkPlanHasFeature(plan, label);
                              return (
                                <td key={planIdx} className="p-6 text-center align-middle">
                                  {hasFeature ? (
                                    <div className="inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-blue-600 mx-auto transition-transform group-hover:scale-110">
                                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  ) : (
                                    <span className="text-xs font-bold text-slate-300 tracking-widest">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-6 bg-slate-50 text-center border-t border-slate-200">
                <p className="text-xs font-medium text-slate-500">
                  Need customized enterprise scaling or dedicated support? <Link href="/demo" className="text-blue-600 font-bold underline hover:text-blue-700">Contact our solutions group</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Tag */}
        <div className="animate-pricing-footer mt-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
          - ALL TIERS &middot; MTD FILING INCLUDED &middot; NO PER-USER FEES &middot; CANCEL ANY TIME -
        </div>
      </div>
      
      <style jsx global>{`
        div::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
    </section>
  );
}