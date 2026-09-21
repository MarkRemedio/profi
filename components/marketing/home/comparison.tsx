"use client";

import { useRef } from "react";
import { Check, X } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const traditionalFeatures = [
  "Designed first for the accountant",
  "Manual reconciliation as default",
  "Compliance pushed onto the user",
  "Charts that decorate",
  "Pricing that scales by usage and seats",
  "Migration as a project",
];

const wawprofiFeatures = [
  "Designed first for the founder — auditable for the accountant",
  "Bank-feed reconciliation by default. Manual is the exception.",
  "MTD, VAT and Self-Assessment fully automated end-to-end",
  "A single live cash position you can trust at a glance",
  "Transparent flat pricing. Free under £30k revenue.",
  "Migration in ~12 minutes. Years of history, intact.",
];

export function Comparison() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
        },
      });

      // 1. Header slides up
      tl.from(".animate-comp-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.2,
        ease: "power3.out",
      })
        // 2. The main comparison box rises
        .from(
          ".animate-comp-table",
          {
            y: 60,
            opacity: 0,
            duration: 1,
            ease: "power4.out",
          },
          "-=0.4",
        )
        // 3. All checkmarks and X's "pop" in one by one
        .from(
          ".animate-item",
          {
            scale: 0,
            opacity: 0,
            duration: 0.4,
            stagger: 0.05,
            ease: "back.out(2)",
          },
          "-=0.6",
        );
    },
    { scope: containerRef },
  );

  return (
    <section ref={containerRef} className="bg-[#F8F7F4] py-32">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* Top Header Section */}
        <div className="flex flex-col justify-between gap-16 lg:flex-row lg:gap-24">
          {/* Left: Titles */}
          <div className="animate-comp-header flex-1">
            <div className="mb-8 flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>02</span>
              <span className="h-[1px] w-12 bg-slate-300"></span>
              <span>The Difference</span>
            </div>
            <h2 className="text-5xl font-medium tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem] leading-[1.05]">
              We call it <br />
              <span className="text-blue-600">
                Auditable <br /> Simplicity.
              </span>
            </h2>
          </div>

          {/* Right: Intro & Mini Grid */}
          <div className="animate-comp-header flex-1 pt-2 lg:pt-16">
            <p className="max-w-md text-lg font-medium leading-relaxed text-slate-700">
              Invisible to operators. Transparent to auditors. One system. No translation.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-slate-200/80 pt-8">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Invisible accounting</h4>
                <p className="mt-1 text-xs font-medium text-slate-500">happens in the background</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Real-time clarity</h4>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  numbers update as money moves
                </p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Automated compliance</h4>
                <p className="mt-1 text-xs font-medium text-slate-500">MTD, VAT, Self-Assessment</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Calm UX</h4>
                <p className="mt-1 text-xs font-medium text-slate-500">less to learn, less to do</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Comparison Table */}
        <div className="animate-comp-table mt-24 flex flex-col overflow-hidden rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/20 lg:flex-row">
          {/* TRADITIONAL SOFTWARE (White Side) */}
          <div className="flex-1 bg-white p-8 md:p-12 lg:p-16">
            <div className="mb-10 flex items-center justify-between border-b border-slate-200 pb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Traditional Accounting Software
              </span>
              <span className="text-slate-300">—</span>
            </div>

            <ul className="flex flex-col">
              {traditionalFeatures.map((feature, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-4 py-5 ${
                    i !== traditionalFeatures.length - 1
                      ? "border-b border-dashed border-slate-200"
                      : ""
                  }`}
                >
                  <div className="animate-item flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200">
                    <X className="size-3 text-slate-400" strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium text-slate-500">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* WAWPROFI (Black Side) */}
          <div className="flex-1 bg-[#0B0F19] p-8 md:p-12 lg:p-16">
            <div className="mb-10 flex items-center justify-between border-b border-slate-800 pb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white">
                Wawprofi
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                V1.0
              </span>
            </div>

            <ul className="flex flex-col">
              {wawprofiFeatures.map((feature, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-4 py-5 ${
                    i !== wawprofiFeatures.length - 1
                      ? "border-b border-dashed border-slate-800"
                      : ""
                  }`}
                >
                  <div className="animate-item flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600">
                    <Check className="size-3 text-white" strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium text-white">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
