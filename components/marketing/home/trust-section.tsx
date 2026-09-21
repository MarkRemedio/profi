"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const trustCards = [
  {
    tag: "HMRC",
    title: "Recognised MTD software",
    desc: "Listed for VAT · ITSA · Income Tax filing",
  },
  {
    tag: "FCA",
    title: "AISP — Open Banking",
    desc: "Read-only access. Your money never moves through us.",
  },
  {
    tag: "ISO 27001",
    title: "In progress · Q3 2027",
    desc: "Independent security & data-handling audit underway",
  },
  { tag: "GDPR", title: "UK-resident data", desc: "AWS eu-west-2 · single-tenant encryption keys" },
];

const waitlistStats = [
  { label: "Freelancers & sole traders", percent: 62 },
  { label: "SMEs (2–50 employees)", percent: 24 },
  { label: "Accountants & practices", percent: 9 },
  { label: "Startups & operators", percent: 5 },
];

export function TrustSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const waitlistRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);

  // Tracks the mouse position for the hover glow!
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waitlistRef.current) return;
    const rect = waitlistRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  useGSAP(
    () => {
      // 1. Header & Cards Timeline (Safely triggered by the main container)
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
        },
      });

      tl.from(".animate-trust-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
        clearProps: "all", // Clears inline styles so hover works!
      }).from(
        ".animate-trust-card",
        {
          y: 30,
          opacity: 0,
          scale: 0.95,
          duration: 0.6,
          stagger: 0.1,
          ease: "back.out(1.2)",
          clearProps: "all", // Clears inline styles so hover works!
        },
        "-=0.4",
      );

      // 2. Waitlist Banner Entrance
      gsap.from(waitlistRef.current, {
        scrollTrigger: {
          trigger: waitlistRef.current,
          start: "top 85%",
        },
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        clearProps: "all", // Clears inline styles so hover works!
      });

      // 3. Numbers & Progress Bars (Triggered when banner enters)
      ScrollTrigger.create({
        trigger: waitlistRef.current,
        start: "top 85%",
        onEnter: () => {
          // Bars fill up
          gsap.to(".progress-fill", {
            width: (i, target) => `${target.dataset.width}%`,
            duration: 1.5,
            ease: "power3.out",
            stagger: 0.15,
            delay: 0.2,
          });

          // Number counts up
          const counter = { val: 0 };
          gsap.to(counter, {
            val: 12480,
            duration: 2,
            ease: "power3.out",
            delay: 0.2,
            onUpdate: () => {
              if (numberRef.current) {
                numberRef.current.innerText = Math.floor(counter.val).toLocaleString();
              }
            },
          });
        },
      });
    },
    { scope: containerRef },
  );

  return (
    <section ref={containerRef} className="bg-white py-32">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* Header Section */}
        <div className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="animate-trust-header">
            <div className="mb-8 flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>05</span>
              <span className="h-[1px] w-12 bg-slate-300"></span>
              <span>Trust</span>
            </div>
            <h2 className="text-5xl font-medium tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem] leading-[1.05]">
              Built like <br />
              financial <br />
              infrastructure.
            </h2>
          </div>
          <div className="animate-trust-header pb-4">
            <p className="text-lg font-medium leading-relaxed text-slate-700">
              Encrypted. Audited. Auditable.
            </p>
          </div>
        </div>

        {/* 4 Trust Cards Grid */}
        <div className="mb-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustCards.map((card, i) => (
            <div
              key={i}
              // Hover classes will now work perfectly because of clearProps!
              className="animate-trust-card group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-slate-300 hover:shadow-xl sm:p-8 cursor-default"
            >
              <div>
                <p className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-500">
                  <span className="size-1 rounded-full bg-blue-500" />
                  {card.tag}
                </p>
                <h4 className="text-base font-bold text-slate-900">{card.title}</h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                  {card.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Waitlist Momentum Banner */}
        <div
          ref={waitlistRef}
          onMouseMove={handleMouseMove}
          // ✅ FIX: Put bg-[#0B0F19] back in the classes so it loads instantly!
          className="group flex flex-col gap-12 rounded-3xl bg-[#0B0F19] p-8 text-white shadow-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_-15px_rgba(37,99,235,0.2)] md:p-12 lg:flex-row lg:items-center lg:gap-24 lg:p-16 cursor-default"
          style={{
            // ✅ FIX: Changed 'background' to 'backgroundImage' so it layers smoothly over the base color
            backgroundImage: `radial-gradient(800px circle at ${mousePos.x}px ${mousePos.y}px, rgba(37,99,235,0.15), transparent 100%)`,
          }}
        >
          {/* Left: Text & Counter */}
          <div className="flex-1">
            <p className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span className="size-1 rounded-full bg-slate-500" />
              Waitlist Momentum
            </p>
            <div className="text-5xl font-bold tracking-tight text-white md:text-7xl lg:text-[5.5rem]">
              <span ref={numberRef}>0</span>
              <span className="text-blue-500">+</span>
            </div>
            <p className="mt-6 max-w-sm text-sm font-medium leading-relaxed text-slate-400">
              UK founders, freelancers, and accountants who&apos;ve reserved their account ahead of
              public launch.
            </p>
          </div>

          {/* Right: Animated Progress Bars */}
          <div className="flex-1 space-y-6">
            {waitlistStats.map((stat, i) => (
              <div key={i}>
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>{stat.label}</span>
                  <span>{stat.percent}%</span>
                </div>
                {/* Track */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  {/* Fill - animates to data-width */}
                  <div
                    className="progress-fill h-full rounded-full bg-blue-600 w-0"
                    data-width={stat.percent}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
