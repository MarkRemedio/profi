"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const timelineData = [
  {
    date: "JAN 2024 · ORIGIN",
    title: "Two founders. One receipt drawer.",
    desc: "An accountant and an engineer compare weekends.",
    visual: (
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Abstract Receipts */}
        <div className="absolute w-24 h-16 bg-white border border-slate-200 rounded shadow-sm -rotate-6 -ml-12" />
        <div className="absolute w-24 h-16 bg-white border border-slate-200 rounded shadow-sm rotate-3 ml-4">
          <div className="w-8 h-1 bg-slate-100 rounded-full mt-3 ml-3" />
          <div className="w-12 h-1 bg-slate-100 rounded-full mt-2 ml-3" />
        </div>
        {/* Blue Counter Badge */}
        <div className="absolute right-12 size-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
          2
        </div>
      </div>
    ),
  },
  {
    date: "MAR 2024 · PARTNERS",
    title: "14 UK practices join as design partners.",
    desc: "Accountants shape the portal.",
    visual: (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <div className="flex gap-2.5">
          {[...Array(7)].map((_, i) => (
            <div key={`t-${i}`} className="size-5 rounded-full bg-blue-500" />
          ))}
        </div>
        <div className="flex gap-2.5">
          {[...Array(7)].map((_, i) => (
            <div key={`b-${i}`} className="size-5 rounded-full bg-blue-400" />
          ))}
        </div>
      </div>
    ),
  },
  {
    date: "AUG 2024 · AISP LIVE",
    title: "FCA Open Banking licence - first synced account.",
    desc: "First account synced. Sparkline works.",
    visual: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="bg-white px-6 py-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono">Cash Position</p>
            <p className="text-2xl font-medium tracking-tight text-slate-900">£284.42</p>
          </div>
          <svg width="60" height="24" viewBox="0 0 60 24" fill="none" className="overflow-visible">
            <path d="M2 20 L15 15 L25 18 L40 8 L58 4" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="58" cy="4" r="3" fill="#2563EB" />
          </svg>
        </div>
      </div>
    ),
  },
  {
    date: "FEB 2025 · ALPHA",
    title: "40 UK businesses on the live ledger.",
    desc: "Nobody asks for more charts.",
    visual: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="grid grid-cols-10 gap-1.5 opacity-80">
          {[...Array(40)].map((_, i) => {
            // Generate random blue opacities for the grid
            const opacities = ["bg-blue-200", "bg-blue-300", "bg-blue-400", "bg-blue-500", "bg-blue-600"];
            const color = opacities[i % 5 === 0 ? (i * 3) % 5 : (i * 7) % 5];
            return <div key={i} className={cn("size-3 rounded-sm", color)} />
          })}
        </div>
      </div>
    ),
  },
  {
    date: "NOV 2025 · HMRC",
    title: "Recognised by HMRC for MTD VAT & ITSA.",
    desc: "Filing happens inside. No bridge software.",
    visual: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="bg-[#111111] px-8 py-5 rounded-xl flex flex-col items-center justify-center relative shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-1.5 rounded-full bg-orange-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 font-mono">HMRC RECOGNISED</span>
          </div>
          <p className="text-2xl font-medium text-white tracking-tight">MTD VAT &middot; ITSA</p>
          <div className="absolute -top-2 -right-2 bg-blue-600 rounded-full text-white p-0.5 border-2 border-slate-100">
            <CheckCircle2 className="size-4" />
          </div>
        </div>
      </div>
    ),
  },
  {
    date: "APR 2026 · BETA",
    title: "Doors opening, region by region.",
    desc: "Waitlist crosses 12k.",
    visual: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="bg-white/80 w-[80%] max-w-[280px] rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-1">Waitlist &middot; Live</p>
              <p className="text-3xl font-medium text-slate-900 leading-none">12,480+</p>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">~47/Day</p>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="w-[75%] h-full bg-blue-600 rounded-full" />
          </div>
        </div>
      </div>
    ),
  },
];

export function AboutStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    // 1. Header Entrance
    gsap.fromTo(
      ".story-header",
      { y: 40, opacity: 0 },
      { 
        y: 0, 
        opacity: 1, 
        duration: 0.8, 
        ease: "power3.out", 
        scrollTrigger: { 
          trigger: containerRef.current, 
          start: "top 80%",
          toggleActions: "play none none reverse" 
        } 
      }
    );

    // 2. The Scrubbing Line
    gsap.fromTo(
      lineRef.current,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none", 
        transformOrigin: "top center",
        scrollTrigger: {
          trigger: ".timeline-container",
          start: "top center",   
          end: "bottom center",  
          scrub: true,           
        },
      }
    );

    // 3. The Items popping in
    const items = gsap.utils.toArray<HTMLElement>(".timeline-item");

    items.forEach((item) => {
      const node = item.querySelector(".timeline-node");
      const card = item.querySelector(".timeline-card");

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: item,
          start: "top 80%", 
          toggleActions: "play none none reverse", 
        },
      });

      // Node pops in
      tl.fromTo(node, 
        { scale: 0, opacity: 0 }, 
        { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" }
      )
      // Card fades and slides up slightly
      .fromTo(card,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" },
        "-=0.2" 
      );
    });

  }, { scope: containerRef });

  return (
    // ✅ FIXED: Changed background to bg-[#F8F7F4] to match the elegant cream theme!
    <section ref={containerRef} className="bg-[#F8F7F4] py-24 overflow-hidden">
      <div className="mx-auto max-w-5xl px-6 md:px-8">
        
        {/* Section Header */}
        <div className="story-header mb-24 opacity-0">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">
              03 &middot; OUR STORY
            </span>
            <span className="h-[1px] w-12 bg-slate-300" />
          </div>
          <h2 className="text-5xl md:text-6xl lg:text-[5rem] font-medium tracking-tight text-[#111111] leading-[1.05] max-w-2xl">
            A short history, in moments that mattered.
          </h2>
        </div>

        {/* Timeline Tracking Container */}
        <div className="timeline-container relative w-full pb-10">
          
          {/* Background Static Line (Light Gray) */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-slate-200 -translate-x-1/2" />
          
          {/* Active Progress Line (Blue - animated via GSAP) */}
          <div ref={lineRef} className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-blue-600 -translate-x-1/2 scale-y-0" />

          {/* Timeline Nodes & Cards */}
          <div className="flex flex-col gap-12 md:gap-24 relative">
            {timelineData.map((item, index) => {
              const isEven = index % 2 === 0;

              return (
                <div 
                  key={index} 
                  className={cn(
                    "timeline-item relative w-full flex flex-col md:flex-row items-start",
                    isEven ? "md:justify-start" : "md:justify-end"
                  )}
                >
                  
                  {/* The Node Dot */}
                  <div className="timeline-node opacity-0 absolute left-6 md:left-1/2 top-0 md:top-8 -translate-x-1/2 -translate-y-1/2 z-10 size-4 bg-[#F8F7F4] border-[3px] border-blue-600 rounded-full flex items-center justify-center">
                    <div className="size-1.5 bg-blue-600 rounded-full" />
                  </div>

                  {/* The Card Container */}
                  <div className={cn(
                    "timeline-card group cursor-default opacity-0 w-full md:w-[45%] pl-16 md:pl-0",
                    isEven ? "md:pr-12 md:text-left" : "md:pl-12 md:text-left"
                  )}>
                    
                    {/* Date Label */}
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-600 font-mono mb-4">
                      {item.date}
                    </p>
                    
                    {/* Visual Mockup Box */}
                    <div className="w-full aspect-[16/9] bg-[#F1F1F0] rounded-2xl border border-slate-200/60 mb-6 overflow-hidden transition-all duration-400 group-hover:-translate-y-1.5 group-hover:shadow-lg group-hover:border-slate-300">
                      {item.visual}
                    </div>
                    
                    {/* Text Details */}
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1.5 tracking-tight transition-colors group-hover:text-blue-600">{item.title}</h4>
                      <p className="text-sm font-medium text-slate-500">{item.desc}</p>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}