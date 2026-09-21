"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function FinalCta() {
  const containerRef = useRef<HTMLElement>(null);

  // State for the mouse-tracking spotlight
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Mouse move handler for the spotlight
  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  useGSAP(
    () => {
      // 1. Text & Button Entrance
      gsap.from(".animate-cta-item", {
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
        },
        y: 40,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: "power3.out",
        clearProps: "all",
      });

      // 2. The Light "Power Up" Entrance Animation
      gsap.fromTo(
        ".animate-light-bloom",
        { opacity: 0, scale: 0.5 },
        {
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 75%",
          },
          opacity: 1,
          scale: 1,
          duration: 2.5,
          ease: "power2.out",
        },
      );

      // 3. Infinite RGB Plasma Movement
      gsap.to(".glow-orb-1", {
        x: "random(-200, 250)",
        y: "random(-200, 200)",
        scale: "random(0.8, 1.4)",
        duration: 6,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      gsap.to(".glow-orb-2", {
        x: "random(-100, 100)",
        y: "random(-100, 100)",
        scale: "random(1, 1.5)",
        duration: 8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      gsap.to(".glow-orb-3", {
        x: "random(-250, 200)",
        y: "random(-200, 250)",
        scale: "random(0.8, 1.4)",
        duration: 7,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    },
    { scope: containerRef },
  );

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative overflow-hidden bg-[#0A0D14] py-40 md:py-52"
      style={{
        // The dynamic spotlight following your mouse!
        backgroundImage: `radial-gradient(800px circle at ${mousePos.x}px ${mousePos.y}px, rgba(37,99,235,0.15), transparent 100%)`,
      }}
    >
      {/* --- THE ANIMATED RGB LIGHT VORTEX --- */}
      {/* FIXED: Changed to z-0 so it sits ABOVE the background color but BELOW the text */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="animate-light-bloom relative h-full w-full">
          {/* We use mix-blend-screen to make the colors intensely glow together */}
          <div className="glow-orb-1 absolute -left-[10%] -top-[10%] h-[500px] w-[500px] rounded-full bg-cyan-600/30 blur-[130px] mix-blend-screen md:h-[600px] md:w-[600px]" />
          <div className="glow-orb-2 absolute left-[20%] top-[20%] h-[600px] w-[600px] rounded-full bg-blue-600/40 blur-[150px] mix-blend-screen md:h-[800px] md:w-[800px]" />
          <div className="glow-orb-3 absolute -bottom-[10%] -right-[10%] h-[500px] w-[500px] rounded-full bg-indigo-600/30 blur-[130px] mix-blend-screen md:h-[600px] md:w-[600px]" />
        </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      {/* Set to z-10 so it always stays readable on top of the lights */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center pointer-events-none">
        {/* Top Tag */}
        <p className="animate-cta-item mb-12 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          - 08 / FINAL -
        </p>

        {/* Hero Headline */}
        <h2 className="animate-cta-item text-5xl font-medium tracking-tight text-[#F8F7F4] md:text-7xl lg:text-[6.5rem] leading-[1.05]">
          Stop managing <br className="hidden md:block" />
          your business <br className="hidden md:block" />
          <span className="italic" style={{ color: '#ED6A2C' }}>on estimates.</span>
          <br />
          Start leading with facts.
        </h2>

        {/* Sub-tags / Trust markers */}
        <div className="animate-cta-item mt-12 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
          <span>NO CARD</span>
          <span className="hidden sm:block">&middot;</span>
          <span>NO COMMITMENT</span>
          <span className="hidden sm:block">&middot;</span>
          <span>UK BUSINESSES ONLY</span>
          <span className="hidden sm:block">&middot;</span>
          <span>GDPR COMPLIANT</span>
        </div>

       {/* Buttons (pointer-events-auto added back so you can click them) */}
        <div className="animate-cta-item pointer-events-auto mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link 
            href="/waitlist?tab=demo"
            className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.6)]"
          >
            Book a private demo &rarr;
          </Link>

          {/* ✅ Updated to match the orange theme, medium font, and safe arrow layout */}
          <Link 
            href="/waitlist?tab=waitlist"
            className="rounded-full bg-[#ED6A2C] px-8 py-4 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#d45d25] flex items-center justify-center gap-3"
          >
            <span>Join waitlist</span>
            <span>{"→"}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
