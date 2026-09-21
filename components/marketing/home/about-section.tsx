"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const smallCards = [
  {
    tag: "BACKED BY",
    title: "UK fintech operators",
    desc: "Angels from Monzo, Wise, Stripe, ClearScore",
  },
  {
    tag: "BUILT WITH",
    title: "Practising accountants",
    desc: "14 design-partner firms across the UK",
  },
  {
    tag: "OUR PROMISE",
    title: "No dark patterns",
    desc: "Export your data any time. Always.",
  },
];

export function AboutSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
        },
      });

      // 1. Header fades and slides up
      tl.from(".animate-about-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
        clearProps: "all",
      })
        // 2. Large left card slides up
        .from(
          ".animate-about-main",
          {
            y: 40,
            opacity: 0,
            duration: 0.8,
            ease: "power3.out",
            clearProps: "all",
          },
          "-=0.4",
        )
        // 3. Small right cards slide in from the right slightly
        .from(
          ".animate-about-small",
          {
            x: 30,
            opacity: 0,
            duration: 0.6,
            stagger: 0.1,
            ease: "back.out(1.2)",
            clearProps: "all",
          },
          "-=0.6",
        );
    },
    { scope: containerRef },
  );

  return (
    // Cream background as requested!
    // 👇 Added id="about" here so the navbar can scroll right to it!
    <section id="about" ref={containerRef} className="bg-[#F8F7F4] py-32">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* Header Section */}
        <div className="mb-20 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="animate-about-header">
            <div className="mb-8 flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>07</span>
              <span className="h-[1px] w-12 bg-slate-300"></span>
              <span>About Us</span>
            </div>
            <h2 className="text-5xl font-medium tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem] leading-[1.05]">
              Built for <br />
              the next <br />
              <span className="text-blue-600">5 million</span> UK <br />
              businesses.
            </h2>
          </div>
          <div className="animate-about-header pb-4 max-w-sm">
            <p className="text-lg font-medium leading-relaxed text-slate-700">
              A small team in London & Edinburgh, on a single mission.
            </p>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Left Large Card (Spans 7 columns on desktop) */}
          <div className="animate-about-main group col-span-1 flex flex-col justify-between rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:border-slate-300 hover:shadow-xl md:p-12 lg:col-span-7">
            <div>
              <p className="mb-10 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <span className="size-1.5 rounded-full bg-slate-300 transition-colors group-hover:bg-blue-500" />
                Our Thesis
              </p>

              <h3 className="text-4xl font-medium tracking-tight text-slate-900 md:text-5xl lg:text-6xl leading-[1.1]">
                Accounting should <br className="hidden md:block" />
                feel like nothing. <br />
                <span className="text-blue-600">Then everything should be clear.</span>
              </h3>
            </div>

            {/* Bottom Stats Row */}
            <div className="mt-16 grid grid-cols-3 gap-4 border-t border-slate-100 pt-8">
              <div>
                <p className="text-lg font-bold text-slate-900 md:text-xl">2024</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Founded
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 md:text-xl">LON &middot; EDI</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Built In
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 md:text-xl">12,480+</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  On Waitlist
                </p>
              </div>
            </div>
          </div>

          {/* Right Stacked Cards (Spans 5 columns on desktop) */}
          <div className="col-span-1 flex flex-col gap-6 lg:col-span-5 lg:gap-6">
            {smallCards.map((card, i) => (
              <div
                key={i}
                className="animate-about-small group flex flex-1 flex-col justify-center rounded-[1.5rem] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md"
              >
                <p className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-500">
                  <span className="size-1 rounded-full bg-blue-500" />
                  {card.tag}
                </p>
                <h4 className="text-lg font-bold text-slate-900">{card.title}</h4>
                <p className="mt-1 text-sm font-medium text-slate-500">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
