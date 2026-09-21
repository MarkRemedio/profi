"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const investorData = [
  { affiliation: "EX-MONZO", name: "Tom Blomfield" },
  { affiliation: "CO-FOUNDER WISE", name: "Taavet Hinrikus" },
  { affiliation: "CEO STRIPE", name: "Patrick Collison" },
  { affiliation: "CLEARSCORE", name: "Justine Roberts" },
  { affiliation: "PASSION CAPITAL", name: "Eileen Burbidge" },
  { affiliation: "EX-GOCARDLESS", name: "Matt Robinson" },
];

export function AboutInvestors() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
          toggleActions: "play none none reverse", // Reverses when scrolling back up
        },
      });

      tl.fromTo(
        ".investor-header",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
      ).fromTo(
        ".investor-card",
        { y: 25, opacity: 0, scale: 0.99 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.5,
          stagger: 0.08, // Rapid waterfall effect
          ease: "power2.out",
        },
        "-=0.4"
      );
    },
    { scope: containerRef }
  );

  return (
    // Cream color background applied here to frame the white elements neatly
    <section ref={containerRef} className="w-full bg-[#F8F7F4] py-24 md:py-32 border-t border-slate-200/40 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-12 lg:gap-16 items-start">
          
          {/* Left Column: Typography Block */}
          <div className="space-y-6 lg:sticky lg:top-32 investor-header opacity-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">
                05 &middot; BACKED BY
              </span>
              <span className="h-[1px] w-12 bg-slate-300" />
            </div>
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-[#111111] leading-[1.08]">
              Backed by the people who built UK fintech.
            </h2>
            <p className="text-sm font-medium text-slate-600 leading-relaxed max-w-sm">
              Angel-backed by the operators behind the UK&apos;s most-loved financial products.
            </p>
          </div>

          {/* Right Column: Cards Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
            {investorData.map((investor, index) => (
              <div
                key={index}
                className="investor-card opacity-0 bg-white border border-slate-200/70 rounded-2xl p-6 h-[150px] flex flex-col justify-between shadow-sm group cursor-default transition-all duration-300 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5"
              >
                {/* Meta Affiliation Tag */}
                <div className="flex items-center gap-1.5">
                  <span className="size-1 rounded-full bg-slate-300 group-hover:bg-blue-500 transition-colors" />
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-500 transition-colors">
                    {investor.affiliation}
                  </p>
                </div>

                {/* Investor Name */}
                <h3 className="text-base font-bold text-slate-900 pb-2 transition-colors group-hover:text-blue-600">
                  {investor.name}
                </h3>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}