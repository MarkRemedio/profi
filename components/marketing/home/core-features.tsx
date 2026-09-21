"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const marqueeItems = [
  "Cloud Native",
  "HMRC Recognised",
  "BACS + Faster Payments",
  "Auto VAT",
  "ISO 27001 (Q3)",
  "Real-time Reconciliation",
  "Accountant Portal",
  "Auditable by Design",
  "Zero Manual Entry",
];

export function CoreFeatures() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
        },
      });

      // 1. Text headers slide up
      tl.from(".animate-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
      })
        // 2. The Grid border fades in
        .from(
          ".animate-grid-wrapper",
          {
            opacity: 0,
            y: 20,
            duration: 0.5,
          },
          "-=0.4",
        )
        // 3. The 6 cards pop in one-by-one! (The Waterfall Effect)
        .from(
          ".animate-card",
          {
            y: 40,
            opacity: 0,
            scale: 0.9,
            duration: 0.6,
            stagger: 0.1, // This makes them load sequentially
            ease: "back.out(1.5)", // Gives it a subtle, premium bounce
          },
          "-=0.3",
        );
    },
    { scope: containerRef },
  );

  return (
    <section ref={containerRef} className="bg-white pt-8 pb-32">
      {/* 1. INFINITE SCROLLING MARQUEE */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 55s linear infinite;
        }
      `,
        }}
      />

      <div className="flex overflow-hidden border-y border-slate-200/70 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        <div className="animate-marquee flex min-w-full shrink-0 items-center gap-8 whitespace-nowrap px-4">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <React.Fragment key={i}>
              <span>{item}</span>
              <span className="size-1.5 rounded-full bg-blue-600" />
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-32 max-w-7xl px-6 md:px-8">
        {/* 2. SECTION HEADER */}
        <div className="mb-20 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="animate-header">
            <div className="mb-8 flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>01</span>
              <span className="h-[1px] w-12 bg-slate-300"></span>
              <span>The Problem</span>
            </div>
            <h2 className="text-5xl font-medium tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem] leading-[1.1]">
              UK accounting <br />
              software <br />
              has a <span className="italic text-blue-600">feelings</span> <br />
              problem.
            </h2>
          </div>
          <div className="animate-header pb-4">
            <p className="text-lg font-medium text-slate-700">
              Competent technology. Exhausting experience.
            </p>
          </div>
        </div>

        {/* 3. THE INTERACTIVE GRID */}
        <div className="animate-grid-wrapper overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-200/80">
          <div className="grid grid-cols-1 gap-[1px] md:grid-cols-3">
            {/* Card 1: Accountant-first UX */}
            <GridCard
              number="01 / 06"
              title="Accountant-first UX"
              desc="You shouldn't need a bookkeeping degree to run your day."
            >
              <div className="grid grid-cols-3 gap-1.5 opacity-80 transition-all duration-500 group-hover:opacity-100">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-5 w-10 rounded-[3px] border border-slate-300 bg-transparent flex items-center justify-center transition-all duration-500 ${
                      i === 5
                        ? "bg-blue-600 border-blue-600 text-[4px] font-bold text-white tracking-wider group-hover:-translate-y-1 group-hover:scale-110 group-hover:shadow-lg"
                        : "group-hover:border-slate-400"
                    }`}
                  >
                    {i === 5 && "REQUIRED"}
                  </div>
                ))}
              </div>
            </GridCard>

            {/* Card 2: Subscription creep */}
            <GridCard
              number="02 / 06"
              title="Subscription creep"
              desc="You pay more every year for the same tired dashboard."
            >
              <div className="flex h-16 items-end gap-2 opacity-80 transition-all duration-500 group-hover:opacity-100">
                <div className="w-4 bg-red-300/40 h-3 origin-bottom transition-transform duration-500 group-hover:scale-y-[1.8]"></div>
                <div className="w-4 bg-red-300/60 h-5 origin-bottom transition-transform duration-500 group-hover:scale-y-[1.6]"></div>
                <div className="w-4 bg-red-400/80 h-8 origin-bottom transition-transform duration-500 group-hover:scale-y-[1.4]"></div>
                <div className="w-4 bg-red-400 h-11 origin-bottom transition-transform duration-500 group-hover:scale-y-[1.2]"></div>
                <div className="w-4 bg-red-500 h-16 origin-bottom transition-transform duration-500 group-hover:scale-y-[1.05]"></div>
              </div>
            </GridCard>

            {/* Card 3: Weekend reconciliation */}
            <GridCard
              number="03 / 06"
              title="Weekend reconciliation"
              desc="Categorise. Match. Split. Repeat."
            >
              <div className="flex w-32 flex-col gap-2 opacity-80 transition-all duration-500 group-hover:opacity-100">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex h-3 w-full overflow-hidden rounded-sm bg-slate-800">
                    <div
                      className={`bg-slate-800 transition-all duration-700 ease-out ${i % 2 === 0 ? "w-[85%] group-hover:w-[60%]" : "w-[85%] group-hover:w-[40%]"}`}
                    />
                    <div
                      className={`bg-red-500 transition-all duration-700 ease-out ${i % 2 === 0 ? "w-[15%] group-hover:w-[40%]" : "w-[15%] group-hover:w-[60%]"}`}
                    />
                  </div>
                ))}
              </div>
            </GridCard>

            {/* Card 4: Migration lock-in */}
            <GridCard
              number="04 / 06"
              title="Migration lock-in"
              desc="Years of history, trapped in a CSV."
            >
              <div className="flex flex-col items-center opacity-80 transition-all duration-500 group-hover:opacity-100">
                {/* The Handle pulls up */}
                <div className="h-3 w-8 rounded-t-lg border-2 border-b-0 border-slate-800 transition-transform duration-500 group-hover:-translate-y-1" />
                {/* The Lock turns */}
                <div className="relative flex h-16 w-24 items-center justify-center rounded-lg bg-slate-900 transition-shadow duration-500 group-hover:shadow-lg">
                  <div className="h-4 w-2.5 rounded-full bg-blue-600 transition-transform duration-500 group-hover:rotate-90 group-hover:scale-110" />
                </div>
              </div>
            </GridCard>

            {/* Card 5: Deadline panic */}
            <GridCard
              number="05 / 06"
              title="Deadline panic"
              desc="VAT. PAYE. CT600. Each one a small crisis."
            >
              <div className="rounded-md border border-slate-300 bg-white p-2 opacity-80 shadow-sm transition-all duration-500 group-hover:opacity-100 group-hover:shadow-md">
                <div className="mb-2 h-2 w-full rounded-sm bg-slate-900" />
                <div className="grid grid-cols-7 gap-1">
                  {[...Array(28)].map((_, i) => (
                    <div
                      key={i}
                      className={`size-2.5 rounded-sm transition-all duration-300 ${
                        i === 14 || i === 27
                          ? "bg-red-500 group-hover:scale-[1.6] group-hover:shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                          : "bg-slate-100 group-hover:bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </GridCard>

            {/* Card 6: Charts, no clarity */}
            <GridCard
              number="06 / 06"
              title="Charts, no clarity"
              desc="Twelve widgets. None of them answer the question."
            >
              <div className="grid grid-cols-4 gap-1 opacity-80 transition-all duration-500 group-hover:opacity-100">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="size-6 rounded-sm border border-slate-300 bg-transparent flex items-center justify-center p-1 transition-colors duration-500 group-hover:border-slate-400"
                  >
                    {/* The circle pulses */}
                    {i === 1 && (
                      <div className="size-full rounded-full border border-slate-300 transition-all duration-500 group-hover:scale-[1.3] group-hover:border-blue-600" />
                    )}
                    {/* The square shifts up */}
                    {i === 2 && (
                      <div className="size-full bg-slate-300 transition-all duration-500 group-hover:-translate-y-1 group-hover:bg-blue-600" />
                    )}
                    {/* The line spins */}
                    {i === 5 && (
                      <div className="h-[1px] w-full bg-slate-300 rotate-45 transition-all duration-500 group-hover:rotate-[225deg] group-hover:bg-blue-600" />
                    )}
                  </div>
                ))}
              </div>
            </GridCard>
          </div>
        </div>
      </div>
    </section>
  );
}

function GridCard({
  number,
  title,
  desc,
  children,
}: {
  number: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-card group relative flex aspect-square flex-col justify-between bg-[#F8F7F4] p-8 transition-colors duration-500 hover:bg-white md:p-10">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{number}</div>

      {/* Visual Graphic Container */}
      <div className="flex flex-1 items-center justify-center">{children}</div>

      {/* Text Content */}
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm font-medium text-slate-500">{desc}</p>
      </div>
    </div>
  );
}
