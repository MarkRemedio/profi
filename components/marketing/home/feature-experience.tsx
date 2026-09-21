"use client";

import { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
}

// 1. Data Array
const features = [
  {
    num: "01",
    title: "Open Banking, natively built.",
    desc: "Every UK account connected in under sixty seconds.",
    bottomPrev: "OPEN BANKING, NATIVELY BUILT.",
    bottomNext: "NEXT ↓ RECEIPTS, READ BY MACHINE.",
    videoUrl: "", 
  },
  {
    num: "02",
    title: "Receipts, read by machine.",
    desc: "Drag, snap, or forward — matched to the right transaction in two seconds.",
    bottomPrev: "RECEIPTS, READ BY MACHINE.",
    bottomNext: "NEXT ↓ YOUR TAX BILL, ALWAYS LIVE.",
    videoUrl: "",
  },
  {
    num: "03",
    title: "Your tax bill, always live.",
    desc: "Every payment moves the number. The January panic is over.",
    bottomPrev: "YOUR TAX BILL, ALWAYS LIVE.",
    bottomNext: "NEXT ↓ CATEGORISATION THAT LEARNS YOU.",
    videoUrl: "",
  },
  {
    num: "04",
    title: "Categorisation that learns you.",
    desc: "Edit once. It remembers forever. 98%+ accuracy in two weeks.",
    bottomPrev: "CATEGORISATION THAT LEARNS YOU.",
    bottomNext: "NEXT ↓ CASHFLOW, PROJECTED FORWARD.",
    videoUrl: "",
  },
  {
    num: "05",
    title: "Cashflow, projected forward.",
    desc: "Ninety days of runway, modelled from your real numbers.",
    bottomPrev: "CASHFLOW, PROJECTED FORWARD.",
    bottomNext: "NEXT ↓ A PORTAL YOUR ACCOUNTANT WANTS.",
    videoUrl: "",
  },
  {
    num: "06",
    title: "A portal your accountant wants.",
    desc: "Built with UK practitioners. Granular permissions, full audit trail.",
    bottomPrev: "A PORTAL YOUR ACCOUNTANT WANTS.",
    bottomNext: "KEEP SCROLLING",
    videoUrl: "",
  },
];

export function FeatureExperience() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const cardTiltRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  
  const [scrollProgress, setScrollProgress] = useState(0);

  // 2. Track Scroll Progress
  useGSAP(
    () => {
      gsap.set(cardTiltRef.current, { transformPerspective: 1000 });

      const mm = gsap.matchMedia();

      // ✅ DESKTOP (Works perfectly)
      mm.add("(min-width: 768px)", () => {
        ScrollTrigger.create({
          trigger: wrapperRef.current,
          pin: containerRef.current,
          start: "top top",
          end: "+=500%",
          anticipatePin: 1, 
          onUpdate: (self) => {
            setScrollProgress(self.progress);
            const index = Math.min(
              features.length - 1,
              Math.floor(self.progress * features.length),
            );
            setActiveIndex((prev) => (prev !== index ? index : prev));
          },
        });
      });

      // ✅ MOBILE & TABLETS
      mm.add("(max-width: 767px)", () => {
        ScrollTrigger.create({
          trigger: wrapperRef.current,
          pin: containerRef.current,
          start: "top top",
          end: "+=500%",
          anticipatePin: 1,
          pinType: "fixed", // 🌟 THE MAGIC FIX: Forces GSAP to use native position: fixed on mobile, eliminating JS math shaking!
          onUpdate: (self) => {
            setScrollProgress(self.progress);
            const index = Math.min(
              features.length - 1,
              Math.floor(self.progress * features.length),
            );
            setActiveIndex((prev) => (prev !== index ? index : prev));
          },
        });
      });
    },
    { scope: wrapperRef, dependencies: [] },
  );

  const handleSectionMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!glowRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    gsap.to(glowRef.current, {
      x,
      y,
      duration: 0.7,
      ease: "power3.out",
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardTiltRef.current) return;
    const rect = cardTiltRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;

    gsap.to(cardTiltRef.current, {
      rotateX,
      rotateY,
      ease: "power2.out",
      duration: 0.4,
    });
  };

  const handleMouseLeave = () => {
    if (!cardTiltRef.current) return;
    gsap.to(cardTiltRef.current, {
      rotateX: 0,
      rotateY: 0,
      ease: "power3.out",
      duration: 0.7,
    });
  };

  const getFillPercentage = (index: number) => {
    const totalSteps = features.length;
    const stepSize = 1 / totalSteps;
    const start = index * stepSize;
    const end = (index + 1) * stepSize;

    if (scrollProgress >= end) return 100;
    if (scrollProgress <= start) return 0;
    return ((scrollProgress - start) / stepSize) * 100;
  };

  const currentFeature = features[activeIndex];

  return (
   
    // 🚀 Changed id="demo" to id="feature-experience" so the Sidebar link finds it!
    <div id="feature-experience" ref={wrapperRef} className="relative w-full bg-[#0A0D14]">
      
     
      <section
        ref={containerRef}
        onMouseMove={handleSectionMouseMove}
        className="relative h-[100svh] w-full overflow-hidden bg-[#0A0D14]"
      >
        <div
          ref={glowRef}
          className="pointer-events-none absolute left-0 top-0 z-0 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/15 blur-[120px]"
        />

        <div className="relative z-10 flex h-full w-full flex-col text-white pt-16 pb-6 md:pt-24 md:pb-12">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-6 md:px-8">
            
            {/* Top Header Row */}
            <div className="flex w-full items-start justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <div className="flex flex-col gap-2">
                <p>04 — Feature Experience</p>
                <p className="text-slate-600">
                  {currentFeature.num} of 06 &middot; Scroll to advance
                </p>
              </div>

              <div className="flex gap-2 sm:gap-4 md:gap-8">
                {features.map((f, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 md:gap-2">
                    <span className={`text-[9px] sm:text-[10px] ${activeIndex === i ? "text-blue-500" : "text-slate-700"}`}>
                      {f.num}
                    </span>
                    <div className="relative h-[2px] w-4 sm:w-6 md:w-8 overflow-hidden bg-slate-800">
                      <div
                        className="absolute left-0 top-0 h-full bg-blue-600"
                        style={{ width: `${getFillPercentage(i)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Middle Content */}
            <div className="flex flex-1 flex-col items-center justify-center lg:justify-between gap-4 sm:gap-8 lg:flex-row lg:gap-24 overflow-hidden">
              <div className="w-full max-w-md lg:w-1/2">
                <div
                  key={activeIndex}
                  className="animate-in fade-in slide-in-from-bottom-8 duration-700"
                >
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl md:text-4xl lg:text-5xl text-center lg:text-left">
                    {currentFeature.title}
                  </h2>
                  <p className="mt-2 text-xs text-slate-400 sm:text-base text-center lg:text-left">{currentFeature.desc}</p>
                </div>
              </div>

              <div className="relative flex w-full max-w-xs sm:max-w-md items-center justify-center lg:w-1/2">
                <div
                  ref={cardTiltRef}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className="relative z-10 w-full max-w-[240px] sm:max-w-[320px] lg:max-w-[420px] aspect-[4/5] rounded-[1.5rem] sm:rounded-[2rem] border border-slate-800 bg-[#121622] p-2 sm:p-4 shadow-2xl shadow-black/50 transition-shadow hover:shadow-blue-900/20"
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[1.2rem] bg-white text-slate-900">
                    <div className="flex items-center justify-center border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-4 sm:py-3 relative">
                      <div className="absolute left-3 sm:left-4 flex gap-1 sm:gap-1.5">
                        <div className="size-1.5 sm:size-2.5 rounded-full bg-red-400" />
                        <div className="size-1.5 sm:size-2.5 rounded-full bg-amber-400" />
                        <div className="size-1.5 sm:size-2.5 rounded-full bg-emerald-400" />
                      </div>
                      <div className="text-[8px] sm:text-[10px] font-bold text-slate-400 font-mono truncate max-w-[60%]">
                        app.wawprofi.co.uk /{" "}
                        {currentFeature.title.split(" ")[0].toLowerCase().replace(",", "")}
                      </div>
                    </div>

                    <div
                      key={activeIndex}
                      className="relative h-[calc(100%-24px)] sm:h-[calc(100%-40px)] w-full bg-slate-100 animate-in fade-in duration-500"
                    >
                      {currentFeature.videoUrl ? (
                        <video
                          src={currentFeature.videoUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-slate-400">
                          <div className="mb-4 rounded-full bg-slate-200 p-4">
                            <svg className="size-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Video Placeholder</p>
                          <p className="mt-2 text-xs">Waiting for MP4 URL for step {currentFeature.num}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="absolute top-1/2 left-1/2 -z-10 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[100px]" />
              </div>
            </div>

            {/* Bottom Footer Row */}
            <div className="flex w-full items-center gap-2 sm:gap-4 font-mono text-[8px] sm:text-[10px] font-bold tracking-widest text-slate-500 mt-auto pt-4">
              <span className="shrink-0">{currentFeature.bottomPrev}</span>
              <div className="h-[1px] flex-1 bg-slate-800" />
              <span className="shrink-0">{currentFeature.bottomNext}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}