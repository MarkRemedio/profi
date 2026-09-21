"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const teamData = [
  {
    initials: "AM",
    color: "bg-blue-600",
    city: "EDINBURGH",
    name: "Anya Murthi",
    role: "CO-FOUNDER &middot; CEO",
    bio: "Chartered accountant. 12 years across practice and fintech.",
  },
  {
    initials: "JC",
    color: "bg-[#222222]",
    city: "LONDON",
    name: "James Carlson",
    role: "CO-FOUNDER &middot; CTO",
    bio: "Ex-Monzo, ex-Wise. Open Banking. Loves a clean status page.",
  },
  {
    initials: "RL",
    color: "bg-emerald-600",
    city: "LONDON",
    name: "Rosa Lim",
    role: "HEAD OF PRODUCT",
    bio: 'Ex-Linear. Asks "do we really need this?" of every screen.',
  },
  {
    initials: "SP",
    color: "bg-orange-500",
    city: "LONDON",
    name: "Sam Patel",
    role: "HEAD OF DESIGN",
    bio: "Ex-Revolut, ex-Stripe Press. Refuses to design more charts.",
  },
  {
    initials: "MO",
    color: "bg-purple-600",
    city: "EDINBURGH",
    name: "Maya Okafor",
    role: "HEAD OF COMPLIANCE",
    bio: "Ex-FCA, ex-Big Four. Built the audit trail.",
  },
  {
    initials: "TR",
    color: "bg-amber-600",
    city: "EDINBURGH",
    name: "Tom Reid",
    role: "FOUNDING ENGINEER",
    bio: "Built the first Open Banking sync. Maintains 99.97% uptime.",
  },
  {
    initials: "HY",
    color: "bg-pink-600",
    city: "LONDON",
    name: "Hana Yusof",
    role: "HEAD OF PARTNERSHIPS",
    bio: "Five years as a practitioner. Now building the portal she wished existed.",
  },
  {
    initials: "BA",
    color: "bg-teal-700",
    city: "LONDON",
    name: "Ben Asher",
    role: "FOUNDING ENGINEER",
    bio: "Built the OCR engine. Has seen too many receipts.",
  },
];

export function AboutTeam() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
          toggleActions: "play none none reverse", // Plays down, cleanly reverses up!
        },
      });

      tl.fromTo(
        ".team-header",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
      ).fromTo(
        ".team-card",
        { y: 30, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.6,
          stagger: 0.08, // Rapid cascading entry grid effect
          ease: "power2.out",
        },
        "-=0.4"
      );
    },
    { scope: containerRef }
  );

  return (
    // Explicit white background matching layout requirements
    <section ref={containerRef} className="w-full bg-white py-24 md:py-32 selection:bg-blue-500/10 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        
        {/* Header Section */}
        <div className="space-y-6 max-w-3xl mb-20 team-header opacity-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">
              04 &middot; THE TEAM
            </span>
            <span className="h-[1px] w-12 bg-slate-200" />
          </div>
          <h2 className="text-5xl md:text-6xl font-medium tracking-tight text-[#111111] leading-[1.05]">
            Eight people. Two cities. <br />
            <span className="italic text-slate-500">One quiet mission.</span>
          </h2>
        </div>

        {/* Responsive Grid Core Node */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
          {teamData.map((member, index) => (
            <div 
              key={index} 
              className="team-card opacity-0 flex flex-col justify-between group cursor-default"
            >
              <div className="space-y-5">
                {/* Colored Initials Block container element */}
                <div className={cn(
                  "w-full aspect-square rounded-2xl flex items-center justify-center text-white text-5xl font-medium shadow-inner relative overflow-hidden transition-all duration-400 group-hover:-translate-y-1 group-hover:shadow-md",
                  member.color
                )}>
                  {member.initials}
                  
                  {/* Absolute city location pillar marker layout badge */}
                  <span className="absolute bottom-4 left-4 bg-black/90 border border-white/10 text-white font-mono text-[8px] font-bold tracking-widest uppercase px-2 py-1 rounded-md shadow-sm">
                    {member.city}
                  </span>
                </div>

                {/* Typography Metadata Structure */}
                <div className="space-y-1.5 px-1">
                  <h3 className="text-base font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                    {member.name}
                  </h3>
                  <p 
                    className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400"
                    dangerouslySetInnerHTML={{ __html: member.role }}
                  />
                  <p className="text-xs font-medium text-slate-600 leading-relaxed pt-1">
                    {member.bio}
                  </p>
                </div>
              </div>

              {/* Individual Card Context Link Footer */}
              <div className="flex items-center gap-4 pt-5 px-1 font-mono text-[9px] font-bold uppercase tracking-widest text-blue-500">
                <a href="#" className="hover:underline hover:text-blue-700 transition-colors">LINKEDIN</a>
                <span className="text-slate-200 font-sans">&middot;</span>
                <a href="#" className="hover:underline hover:text-blue-700 transition-colors">BIO</a>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}