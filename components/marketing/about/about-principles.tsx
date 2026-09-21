"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Waves, Columns, ArchiveRestore } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function AboutPrinciples() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
        },
      });

      tl.fromTo(
        ".principle-header",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
      ).fromTo(
        ".principle-card",
        { opacity: 0, scale: 0.98 },
        { opacity: 1, scale: 1, duration: 0.6, stagger: 0.1, ease: "power2.out" },
        "-=0.4"
      );
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="w-full bg-[#111111] py-24 md:py-32 selection:bg-blue-500/30">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        
        {/* Header Block */}
        <div className="space-y-6 max-w-3xl mb-16 principle-header opacity-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500 font-mono">
              02 &middot; WHAT WE BELIEVE
            </span>
            <span className="h-[1px] w-12 bg-neutral-700" />
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-white leading-[1.05]">
            Four principles, written down so we can hold ourselves to them.
          </h2>
        </div>

        {/* ✅ FIXED: Adjusted grid border and removed forced square heights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-neutral-800/80 border border-neutral-800/80 rounded-2xl overflow-hidden">
          
          {/* Card 1 */}
          <div className="principle-card opacity-0 bg-[#111111] p-8 lg:p-12 flex flex-col justify-between min-h-[280px] lg:min-h-[320px] group cursor-default transition-colors hover:bg-[#151515]">
            <div className="flex justify-between items-start">
              <div className="space-y-5">
                <span className="text-xs font-bold text-blue-500 font-mono">01</span>
                <h3 className="text-xl lg:text-2xl font-medium text-white tracking-tight pr-4">
                  Calm software is better software.
                </h3>
              </div>
              <div className="p-3 rounded-full border border-neutral-800 text-neutral-500 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all duration-500 shrink-0">
                <Waves className="size-5 transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1" />
              </div>
            </div>
            <p className="text-xs font-medium text-neutral-400 leading-relaxed max-w-sm pt-12">
              Almost zero notifications. Earn trust by being forgettable.
            </p>
          </div>

          {/* Card 2 */}
          <div className="principle-card opacity-0 bg-[#111111] p-8 lg:p-12 flex flex-col justify-between min-h-[280px] lg:min-h-[320px] group cursor-default transition-colors hover:bg-[#151515]">
            <div className="flex justify-between items-start">
              <div className="space-y-5">
                <span className="text-xs font-bold text-blue-500 font-mono">02</span>
                <h3 className="text-xl lg:text-2xl font-medium text-white tracking-tight pr-4">
                  Founder-facing. Accountant-auditable.
                </h3>
              </div>
              <div className="p-3 rounded-full border border-neutral-800 text-neutral-500 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all duration-500 shrink-0">
                <Columns className="size-5 transition-transform duration-500 group-hover:scale-110" />
              </div>
            </div>
            <p className="text-xs font-medium text-neutral-400 leading-relaxed max-w-sm pt-12">
              Two surfaces. One ledger. No translation.
            </p>
          </div>

          {/* Card 3 */}
          <div className="principle-card opacity-0 bg-[#111111] p-8 lg:p-12 flex flex-col justify-between min-h-[280px] lg:min-h-[320px] group cursor-default transition-colors hover:bg-[#151515]">
            <div className="flex justify-between items-start">
              <div className="space-y-5">
                <span className="text-xs font-bold text-blue-500 font-mono">03</span>
                <h3 className="text-xl lg:text-2xl font-medium text-white tracking-tight pr-4">
                  Pricing without resentment.
                </h3>
              </div>
              <div className="p-3 rounded-full border border-neutral-800 text-neutral-500 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all duration-500 shrink-0">
                <div className="size-5 flex items-center justify-center font-serif text-lg font-medium transition-transform duration-700 group-hover:[transform:rotateY(180deg)]">
                  £
                </div>
              </div>
            </div>
            <p className="text-xs font-medium text-neutral-400 leading-relaxed max-w-sm pt-12">
              Free under £30k. £30/mo above. No seat creep.
            </p>
          </div>

          {/* Card 4 */}
          <div className="principle-card opacity-0 bg-[#111111] p-8 lg:p-12 flex flex-col justify-between min-h-[280px] lg:min-h-[320px] group cursor-default transition-colors hover:bg-[#151515]">
            <div className="flex justify-between items-start">
              <div className="space-y-5">
                <span className="text-xs font-bold text-blue-500 font-mono">04</span>
                <h3 className="text-xl lg:text-2xl font-medium text-white tracking-tight pr-4">
                  Your data, your direction.
                </h3>
              </div>
              <div className="p-3 rounded-full border border-neutral-800 text-neutral-500 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all duration-500 shrink-0">
                <ArchiveRestore className="size-5 transition-transform duration-500 group-hover:-translate-y-1.5" />
              </div>
            </div>
            <p className="text-xs font-medium text-neutral-400 leading-relaxed max-w-sm pt-12">
              Full export, anytime. Out as easily as in.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}