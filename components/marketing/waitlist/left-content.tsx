"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import gsap from "gsap";

type TabMode = "waitlist" | "demo";

interface LeftContentProps {
  activeTab: TabMode;
}

// 🌟 GSAP INTERACTIVE GLOW CARD COMPONENT WITH LIVE COUNTER
function MomentumCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  
  // ✅ Live Counter State
  const [count, setCount] = useState(12350); // Start slightly lower for the roll-up effect

  // ✅ GSAP Mouse Hover Effect
  useEffect(() => {
    const card = cardRef.current;
    const glow = glowRef.current;
    if (!card || !glow) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      gsap.to(glow, { x, y, duration: 0.35, ease: "power2.out" });
    };

    const handleMouseEnter = () => gsap.to(glow, { opacity: 1, duration: 0.3 });
    const handleMouseLeave = () => gsap.to(glow, { opacity: 0, duration: 0.5 });

    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseenter", handleMouseEnter);
    card.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseenter", handleMouseEnter);
      card.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // ✅ Live Number Counting Logic
  useEffect(() => {
    let currentCount = 12350;
    const targetCount = 12499;
    let liveInterval: NodeJS.Timeout;

    // 1. Fast initial roll-up on load
    const rollUpInterval = setInterval(() => {
      currentCount += Math.floor(Math.random() * 12) + 4; // Jump by random amounts
      
      if (currentCount >= targetCount) {
        setCount(targetCount);
        clearInterval(rollUpInterval);
        
        // 2. Slow "Live" trickle (simulating new real-time signups every 5-10 seconds)
        liveInterval = setInterval(() => {
          setCount((prev) => prev + 1);
        }, Math.floor(Math.random() * 5000) + 5000); 
      } else {
        setCount(currentCount);
      }
    }, 40);

    return () => {
      clearInterval(rollUpInterval);
      if (liveInterval) clearInterval(liveInterval);
    };
  }, []);

  return (
    <div 
      ref={cardRef}
      className="bg-[#0f1115] text-white rounded-2xl p-6 shadow-xl space-y-6 border border-neutral-800 relative overflow-hidden transition-all duration-300 hover:border-neutral-700 animate-in fade-in slide-in-from-bottom-4 duration-500 group cursor-default"
    >
      {/* Dynamic Mouse Spotlight Orb */}
      <div 
        ref={glowRef}
        className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-full size-[300px] bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-transparent blur-3xl opacity-0 transition-opacity duration-300 z-0 mix-blend-screen"
        style={{ top: 0, left: 0 }}
      />

      {/* Static Ambient Corner Glow */}
      <div className="absolute top-0 right-0 size-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none z-0" />
      
      {/* Content Block Wrapper */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 font-mono flex items-center gap-1">
          &middot; WAITLIST MOMENTUM
        </span>
        <span className="inline-flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md font-mono">
          <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" /> LIVE
        </span>
      </div>
      
      <div className="relative z-10 space-y-1">
        <h3 className="text-4xl font-black tracking-tight flex items-baseline gap-1 font-mono">
          {/* ✅ Formatted Live Output */}
          {count.toLocaleString()}<span className="text-blue-500 font-medium font-sans">+</span>
        </h3>
      </div>
      
      <div className="relative z-10 w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div className="w-[82%] h-full bg-blue-500 rounded-full transition-all duration-1000 premium-out" />
      </div>
      
      <div className="relative z-10 flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
        <span>UK &middot; BETA</span>
        <span>~ 47 / DAY</span>
      </div>
    </div>
  );
}

// ─── Left informational context pipeline ───
export function LeftContent({ activeTab }: LeftContentProps) {
  return (
    <div className="space-y-14 animate-in fade-in duration-500">
      <div className="space-y-10 pt-4 max-w-xl">
        
        {/* Expect text area context frame */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-600" /> What to expect
          </p>
          <h4 className="text-lg font-bold text-slate-950">Early access, in waves.</h4>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
            Email invite when your region opens. 12-min migration onboarding configuration. Free for businesses under £30k annual revenue.
          </p>
        </div>

        {/* Team Segment Avatar Cluster Interface Node */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-600" /> Who you'll meet
          </p>
          <h4 className="text-lg font-bold text-slate-950">The WAWPROFI team</h4>
          <p className="text-sm text-slate-600 font-medium">Founders, engineers, accountants. Not sales.</p>
          
          <div className="flex items-center -space-x-2.5 pt-1 pl-1">
            {[
              { initials: "AM", color: "bg-blue-600" },
              { initials: "JC", color: "bg-slate-950" },
              { initials: "RL", color: "bg-emerald-600" },
              { initials: "SP", color: "bg-amber-600" }
            ].map((avatar, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "relative size-9 rounded-full flex items-center justify-center text-[11px] font-black text-white ring-[3px] ring-slate-50 shadow-sm transition-all duration-300 hover:scale-110 hover:-translate-y-1 hover:z-10 cursor-default", 
                  avatar.color
                )}
              >
                {avatar.initials}
              </div>
            ))}
          </div>
        </div>

        {/* Office Grid Location Block Matrix */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-600" /> Offices
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-neutral-200 p-4 rounded-xl bg-white shadow-sm space-y-1 transition-all duration-300 hover:border-neutral-300 hover:-translate-y-0.5">
              <h5 className="font-bold text-sm text-slate-950">London</h5>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">Tea Building, Shoreditch</p>
              <p className="text-xs text-slate-400 font-medium">EC2A 3QR</p>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 pt-2">
                <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" /> 12:22 &middot; GMT
              </div>
            </div>
            <div className="border border-neutral-200 p-4 rounded-xl bg-white shadow-sm space-y-1 transition-all duration-300 hover:border-neutral-300 hover:-translate-y-0.5">
              <h5 className="font-bold text-sm text-slate-950">Edinburgh</h5>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">Codebase, Argyle House</p>
              <p className="text-xs text-slate-400 font-medium">EH3 9DR</p>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 pt-2">
                <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" /> 12:22 &middot; GMT
              </div>
            </div>
          </div>
        </div>

        {/* Support Connections Links */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-600" /> Other ways
          </p>
          <div className="flex flex-col gap-1 text-sm font-bold text-slate-800">
            <a href="mailto:hello@wawprofi.co.uk" className="hover:underline hover:text-blue-600 w-fit transition-colors">hello@wawprofi.co.uk</a>
            <a href="mailto:partners@wawprofi.co.uk" className="hover:underline hover:text-blue-600 w-fit transition-colors">partners@wawprofi.co.uk</a>
            <a href="mailto:press@wawprofi.co.uk" className="hover:underline hover:text-blue-600 w-fit transition-colors">press@wawprofi.co.uk</a>
          </div>
        </div>

        {/* Dynamic Momentum Card Logic pipeline insertion */}
        {activeTab === "waitlist" && <MomentumCard />}
        
      </div>
    </div>
  );
}