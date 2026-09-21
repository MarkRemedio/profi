"use client";

import { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const locationData = [
  {
    city: "London",
    address: ["Tea Building", "56 Shoreditch High Street", "London, EC2A 3QR"],
    tags: ["HQ", "PRODUCT", "DESIGN"],
    // ✅ URL encoded Google Maps query for the Shoreditch Tea Building
    mapEmbedUrl: "https://maps.google.com/maps?q=Tea%20Building,%2056%20Shoreditch%20High%20Street,%20London,%20EC2A%203QR&t=&z=15&ie=UTF8&iwloc=&output=embed",
  },
  {
    city: "Edinburgh",
    address: ["Codebase, Argyle House", "3 Lady Lawson Street", "Edinburgh, EH3 9DR"],
    tags: ["COMPLIANCE", "INFRA"],
    // ✅ URL encoded Google Maps query for Edinburgh Codebase
    mapEmbedUrl: "https://maps.google.com/maps?q=Codebase,%20Argyle%20House,%203%20Lady%20Lawson%20Street,%20Edinburgh,%20EH3%209DR&t=&z=15&ie=UTF8&iwloc=&output=embed",
  },
];

export function AboutLocations() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeString, setTimeString] = useState<string>("");

  // ⏰ LIVE CLOCK ENGINE
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/London",
      };
      setTimeString(new Intl.DateTimeFormat("en-GB", options).format(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
          toggleActions: "play none none reverse",
        },
      });

      tl.fromTo(
        ".location-header",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
      ).fromTo(
        ".location-card",
        { y: 30, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.6,
          stagger: 0.15,
          ease: "power2.out",
        },
        "-=0.4"
      );
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="w-full bg-white py-24 md:py-32 border-t border-slate-100 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        
        {/* Header Block */}
        <div className="space-y-6 max-w-3xl mb-16 location-header opacity-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">
              06 &middot; WHERE WE BUILD
            </span>
            <span className="h-[1px] w-12 bg-slate-200" />
          </div>
          <h2 className="text-5xl md:text-6xl font-medium tracking-tight text-[#111111] leading-[1.05]">
            Two cities. One ledger.
          </h2>
        </div>

        {/* Cards Layout Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {locationData.map((loc, index) => (
            <div
              key={index}
              className="location-card opacity-0 border border-neutral-200/70 rounded-2xl overflow-hidden bg-[#F8F7F4] flex flex-col shadow-sm transition-all duration-300 hover:shadow-md hover:border-neutral-300 group"
            >
              {/* ✅ FIXED: Replaced mockup blueprint with a live Google Maps Embed iframe */}
              <div className="w-full h-[200px] bg-neutral-100 relative border-b border-neutral-200/60 overflow-hidden">
                <iframe
                  src={loc.mapEmbedUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Map of ${loc.city} office`}
                  // Uses Tailwind filters to keep the map clean and monochrome until hovered
                  className="w-full h-full grayscale contrast-[1.05] opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 ease-out"
                />
              </div>

              {/* Card Meta Content */}
              <div className="p-8 flex flex-col justify-between flex-1 min-h-[180px]">
                <div className="space-y-4">
                  <h3 className="text-2xl font-medium text-slate-900 tracking-tight transition-colors group-hover:text-blue-600">
                    {loc.city}
                  </h3>
                  <div className="space-y-0.5 text-xs font-medium text-slate-500 leading-relaxed">
                    {loc.address.map((line, lIdx) => (
                      <p key={lIdx}>{line}</p>
                    ))}
                  </div>
                </div>

                {/* Card Live Footer Block */}
                <div className="flex items-center justify-between pt-8 border-t border-neutral-200/40 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <span className="size-1 rounded-full bg-blue-600 animate-pulse" />
                    <span>{timeString || "00:00"} &middot; GMT</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-500">
                    {loc.tags.join(" \u00B7 ")}
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}