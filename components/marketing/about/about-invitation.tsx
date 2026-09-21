"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function AboutInvitation() {
  const containerRef = useRef<HTMLDivElement>(null);

  // ⚡️ HIGH-PERFORMANCE MOUSE VECTOR ENGINE
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top } = containerRef.current.getBoundingClientRect();
    
    const x = e.clientX - left;
    const y = e.clientY - top;

    containerRef.current.style.setProperty("--invitation-mouse-x", `${x}px`);
    containerRef.current.style.setProperty("--invitation-mouse-y", `${y}px`);
  };

  useGSAP(
    () => {
      gsap.fromTo(
        ".invitation-content",
        { y: 50, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      );
    },
    { scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="w-full bg-[#070708] py-32 md:py-44 relative overflow-hidden group cursor-default"
    >
      {/* 🌌 LAYER 1: VIBRANT HIGH-OPACITY AMBIENT DRIFT (Matches Screenshot 1) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Left/Top Deep Blue Luminous Wash */}
        <div className="absolute top-[-20%] left-[-15%] w-[800px] h-[600px] rounded-full bg-blue-600/40 blur-[120px] animate-[pulse_6s_infinite_alternate]" />
        
        {/* Right Deep Blue Accent Wash */}
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[500px] rounded-full bg-blue-500/30 blur-[130px] animate-[pulse_9s_infinite_alternate-reverse]" />
        
        {/* Massive Bottom Amber/Orange Radiant Base Glow */}
        <div className="absolute bottom-[-25%] left-1/2 -translate-x-1/2 w-[1100px] h-[500px] rounded-full bg-[#ED6A2C]/25 blur-[120px] animate-[pulse_8s_infinite_alternate]" />
      </div>

      {/* 🕸 LAYER 2: HIGHLY VISIBLE STRUCTURAL MESH GRID (Crisp and clear now) */}
      <div 
        className="absolute inset-0 opacity-[0.35] pointer-events-none z-10 mix-blend-screen"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: "44px 44px",
        }}
      />

      {/* 🔦 LAYER 3: DYNAMIC INTERACTIVE MOUSE SPOTLIGHT */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 mix-blend-screen z-20"
        style={{
          background: `radial-gradient(600px circle at var(--invitation-mouse-x, 0px) var(--invitation-mouse-y, 0px), rgba(37, 99, 235, 0.18), rgba(237, 106, 44, 0.08) 40%, transparent 100%)`
        }}
      />

      {/* MAIN CONTENT CONTAINER */}
      <div className="mx-auto max-w-7xl px-6 md:px-8 relative z-30 text-center flex flex-col items-center">
        
        <div className="invitation-content opacity-0 space-y-8 max-w-4xl">
          {/* Header Tag */}
          <div className="flex items-center justify-center gap-3">
            <span className="h-[1px] w-8 bg-neutral-800" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 font-mono">
              THE INVITATION
            </span>
            <span className="h-[1px] w-8 bg-neutral-800" />
          </div>

          {/* Headline */}
          <h2 className="text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight text-white leading-[1.02]">
            Quietly built. <br />
            Loudly <span className="text-[#ED6A2C] italic font-serif">missed.</span>
          </h2>

          {/* Subtext */}
          <p className="text-sm md:text-base font-medium text-neutral-400 max-w-md mx-auto tracking-tight">
            Be among the first UK businesses on the next era of accounting.
          </p>

          {/* Action Buttons Framework Layout */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-6">
            
            {/* Join Waitlist Pill Button */}
            <Link
              href="/waitlist?tab=waitlist"
              className="h-12 px-6 bg-[#ED6A2C] text-sm font-medium text-white rounded-full flex items-center justify-center gap-2 shadow-lg shadow-orange-950/20 hover:bg-[#d45d25] transition-all group/btn"
            >
              Join the waitlist
              <ArrowRight className="size-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
            </Link>

            {/* Book Demo Link */}
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <Link
                href="/waitlist?tab=demo"
                className="h-12 px-6 rounded-full border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 text-sm font-medium text-white flex items-center justify-center transition-colors"
              >
                Book a private demo
              </Link>

              {/* Specifications tags */}
              <div className="flex items-center gap-2 font-mono text-[9px] font-bold tracking-wider text-neutral-500 whitespace-nowrap">
                <span className="text-neutral-400">FREE UNDER £30K</span>
                <span>&middot;</span>
                <span>NO CARD</span>
                <span>&middot;</span>
                <span>12-MIN MIGRATION</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}