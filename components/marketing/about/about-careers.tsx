"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const jobsData = [
  {
    title: "Senior Product Engineer · Open Banking",
    dept: "ENGINEERING",
    loc: "LONDON / REMOTE UK",
    type: "FULL-TIME",
  },
  {
    title: "Brand & Marketing Designer",
    dept: "DESIGN",
    loc: "LONDON",
    type: "FULL-TIME",
  },
  {
    title: "Accountant-in-Residence",
    dept: "PRACTICE",
    loc: "REMOTE UK",
    type: "PART-TIME · 3 DAYS",
  },
  {
    title: "Customer Engineer (Migrations)",
    dept: "CUSTOMER",
    loc: "LONDON / EDI",
    type: "FULL-TIME",
  },
  {
    title: "Compliance Analyst",
    dept: "COMPLIANCE",
    loc: "EDINBURGH",
    type: "FULL-TIME",
  },
];

export function AboutCareers() {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ⚡️ HIGH PERFORMANCE MOUSE GLOW ENGINE
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    const { left, top } = panelRef.current.getBoundingClientRect();
    
    // Calculate cursor positions exact to the panel boundaries
    const x = e.clientX - left;
    const y = e.clientY - top;

    // Inject raw position values directly into local CSS variables
    panelRef.current.style.setProperty("--mouse-x", `${x}px`);
    panelRef.current.style.setProperty("--mouse-y", `${y}px`);
  };

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
          toggleActions: "play none none reverse", // Reverses animation cleanly on scroll back up
        },
      });

      tl.fromTo(
        ".careers-header",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
      ).fromTo(
        ".careers-panel",
        { y: 50, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" },
        "-=0.4"
      );
    },
    { scope: containerRef }
  );

  return (
    // Rich deep dark section layout background wrapper
    <section ref={containerRef} className="w-full bg-[#111111] py-24 md:py-32 selection:bg-blue-500/30 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-16 items-center">
          
          {/* Left Column: Text Headlines */}
          <div className="space-y-6 careers-header opacity-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500 font-mono">
                07 &middot; CAREERS
              </span>
              <span className="h-[1px] w-12 bg-neutral-800" />
            </div>
            <h2 className="text-5xl md:text-6xl font-medium tracking-tight text-white leading-[1.05]">
              Build with us. <br />
              <span className="text-blue-500 italic">Quietly.</span>
            </h2>
            <p className="text-sm font-medium text-neutral-400 tracking-tight">
              Small team. Strong taste. Low ego.
            </p>
          </div>

          {/* Right Column: Interactive Card Container Layer */}
          <div
            ref={panelRef}
            onMouseMove={handleMouseMove}
            className="careers-panel opacity-0 relative w-full lg:w-[640px] bg-[#161616] border border-neutral-800/80 rounded-3xl p-6 md:p-10 lg:p-12 overflow-hidden group cursor-default"
          >
            {/* 🔍 Dynamic Mouse Glow overlay layout mask */}
            <div 
              className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-screen z-0"
              style={{
                background: `radial-gradient(450px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), rgba(37, 99, 235, 0.14), transparent 80%)`
              }}
            />

            {/* Roles Iteration Stack List */}
            <div className="relative z-10 divide-y divide-neutral-800/60">
              {jobsData.map((job, index) => (
                <div
                  key={index}
                  className="py-6 first:pt-0 last:pb-0 flex items-center justify-between gap-6 group/item cursor-pointer"
                >
                  <div className="space-y-2">
                    <h3 className="text-base md:text-lg font-medium text-white tracking-tight group-hover/item:text-blue-400 transition-colors">
                      {job.title}
                    </h3>
                    
                    {/* Role Specifications Tags */}
                    <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                      <span className="text-neutral-400">{job.dept}</span>
                      <span>&middot;</span>
                      <span>{job.loc}</span>
                      <span>&middot;</span>
                      <span>{job.type}</span>
                    </div>
                  </div>

                  {/* Action Circular Trigger Link Button */}
                  <div className="size-8 rounded-full border border-neutral-800 bg-neutral-900/40 text-neutral-400 flex items-center justify-center group-hover/item:text-white group-hover/item:border-neutral-600 group-hover/item:bg-neutral-800 transition-all shrink-0">
                    <ArrowUpRight className="size-4 transition-transform duration-300 group-hover/item:translate-x-0.5 group-hover/item:-translate-y-0.5" />
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}