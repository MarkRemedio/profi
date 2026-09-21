"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function AboutMission() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%", 
        },
      });

      tl.fromTo(
        ".mission-text",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
      ).fromTo(
        ".mission-item",
        { y: 30, opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.6, 
          stagger: 0.15, 
          ease: "power2.out" 
        },
        "-=0.4" 
      );
    },
    { scope: containerRef }
  );

  return (
    // ✅ Added overflow-hidden to the section wrapper to guarantee no horizontal bleeding
    <section ref={containerRef} className="mx-auto max-w-7xl px-6 py-16 md:px-8 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 lg:gap-16 items-center">
        
        {/* Left Side: Mission Text */}
        <div className="space-y-6 mission-text opacity-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">
              01 &middot; OUR MISSION
            </span>
            <span className="h-[1px] w-12 bg-slate-200" />
          </div>
          <h2 className="text-5xl md:text-6xl font-medium tracking-tight text-[#111111] leading-[1.05]">
            Born from <br className="hidden md:block" />
            frustration. <br className="hidden md:block" />
            <span className="italic text-slate-600">Built for relief.</span>
          </h2>
        </div>

        {/* ✅ FIXED Right Side: Removed overflow-x-auto, changed to flex-wrap with flex-1 cards */}
        <div className="flex flex-col sm:flex-row flex-wrap xl:flex-nowrap items-center justify-center lg:justify-start gap-4 w-full">
          
          {/* Card 1 */}
          <div className="mission-item opacity-0 w-full sm:flex-1 sm:min-w-[180px] max-w-[260px] h-[160px] bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div className="space-y-1">
              <div className="h-[2px] w-6 bg-[#ED6A2C]" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono">Legacy UX &middot; Data</p>
            </div>
            <div className="flex items-end justify-between gap-4">
              <p className="text-xs font-medium text-slate-500 leading-tight">Founders who say<br/>they enjoy it</p>
              <span className="text-3xl font-medium text-[#ED6A2C]">8%</span>
            </div>
          </div>

          <ArrowRight className="mission-item opacity-0 size-4 text-slate-300 hidden sm:block shrink-0" />

          {/* Card 2 */}
          <div className="mission-item opacity-0 w-full sm:flex-1 sm:min-w-[180px] max-w-[260px] h-[160px] bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono">What they want</p>
            </div>
            <div className="space-y-2">
              <p className="text-2xl font-medium text-slate-900 italic">"Am I OK?"</p>
              <p className="text-xs font-medium text-slate-400">That's the only question.</p>
            </div>
          </div>

          <ArrowRight className="mission-item opacity-0 size-4 text-slate-300 hidden sm:block shrink-0" />

          {/* Card 3 (Dark) */}
          <div className="mission-item opacity-0 w-full sm:flex-1 sm:min-w-[180px] max-w-[260px] h-[160px] bg-[#111111] rounded-2xl p-5 flex flex-col justify-between shadow-xl">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-blue-500 font-mono bg-blue-500/10 px-2 py-0.5 rounded">Wawprofi &middot; Answer</span>
            </div>
            <div>
              <p className="text-4xl font-medium text-blue-500 mb-3">Yes.</p>
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>£12,305 &middot; RUNWAY</span>
              </div>
              <p className="text-[9px] font-mono text-slate-500 mt-0.5 ml-3">5 MONTHS</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}