"use client";

import { useState, useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Image from "next/image";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const tabs = [
  {
    id: "dashboard",
    num: "01",
    label: "Dashboard",
    desc: "Net profit, revenue, payables and ledger activity — at a glance.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/dashboard.png",
  },
  {
    id: "sales",
    num: "02",
    label: "Sales",
    desc: "Track outstanding invoices, automated reminders, and client billing.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/sales.png",
  },
  {
    id: "purchases",
    num: "03",
    label: "Purchases",
    desc: "Manage upcoming bills, supplier payments, and recurring expenses.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/purchases.png",
  },
  {
    id: "banking",
    num: "04",
    label: "Banking",
    desc: "Automatically match bank feed transactions and reconcile accounts effortlessly.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/banking.png",
  },
  {
    id: "payroll",
    num: "05",
    label: "Payroll",
    desc: "Handle employee payments, HMRC filings, and pensions end-to-end.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/payroll.png",
  },
  {
    id: "taxes",
    num: "06",
    label: "Taxes",
    desc: "Instant VAT estimates and automated filings to stay HMRC compliant.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/taxes.png",
  },
  {
    id: "accounting",
    num: "07",
    label: "Accounting",
    desc: "Standardized chart of accounts and automatic journal entries for your accountant.",
    image:
      "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/accounting.png",
  },
  {
    id: "reports",
    num: "08",
    label: "Reports",
    desc: "Gain visibility with live Profit & Loss, Balance Sheet, and Trial Balance reports.",
    image: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/reports.png",
  },
];

export function InsideProduct() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [isPlaying, setIsPlaying] = useState(true); 
const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0]; 

  useEffect(() => {
    if (!isPlaying) return; 

    const timer = setInterval(() => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
    }, 5000);

    return () => clearInterval(timer);
  }, [activeTab, isPlaying]); 

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
        },
      });

      tl.from(".animate-demo-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
      })
        .from(".animate-demo-tabs", { y: 20, opacity: 0, duration: 0.5 }, "-=0.4")
        .from(
          ".animate-demo-browser",
          { y: 60, opacity: 0, duration: 1, ease: "power4.out" },
          "-=0.2",
        )
        .from(".animate-demo-footer", { y: 20, opacity: 0, duration: 0.6, stagger: 0.1 }, "-=0.6");
    },
    { scope: containerRef },
  );

  const isFirstRender = useRef(true);
  useGSAP(
    () => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return; 
      }

      gsap.fromTo(
        ".animate-tab-content",
        { opacity: 0, y: 10, scale: 0.99, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.5,
          ease: "power2.out",
          clearProps: "all",
        },
      );
    },
    { dependencies: [activeTab], scope: containerRef },
  );

  return (
    <section ref={containerRef} className="bg-[#F8F7F4] py-32">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* Header */}
        <div className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="animate-demo-header">
            <div className="mb-8 flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>03</span>
              <span className="h-[1px] w-12 bg-slate-300"></span>
              <span>Inside Wawprofi</span>
            </div>
            <h2 className="text-5xl font-medium tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem] leading-[1.05]">
              A look <br />
              <span className="text-blue-600">
                inside the <br /> product.
              </span>
            </h2>
          </div>
          <div className="animate-demo-header pb-4">
            <p className="max-w-sm text-lg font-medium leading-relaxed text-slate-700">
              Real screens. Live data. Built for clarity at a glance.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="animate-demo-tabs mb-8 flex flex-wrap items-center justify-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsPlaying(false); 
                  }}
                  className={`flex h-12 items-center rounded-full px-6 text-sm font-bold transition-all duration-300 ${
                    isActive
                      ? "bg-[#0F172A] text-white shadow-lg scale-105"
                      : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`mr-2 text-[10px] ${isActive ? "text-slate-400" : "text-slate-400"}`}
                  >
                    {tab.num}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`hidden items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 md:flex ${
              isPlaying
                ? "text-blue-500 hover:text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <span
              className={`size-2 rounded-full ${isPlaying ? "bg-blue-500 animate-pulse" : "bg-slate-300"}`}
            />
            {isPlaying ? "Auto-playing" : "Paused"}
          </button>
        </div>

        {/* Browser Mockup */}
        <div className="animate-demo-browser relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-200/50">
          
          {/* Browser Header Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8F7F4]/50 px-4 py-3">
            <div className="flex gap-1.5">
              <div className="size-3 rounded-full bg-slate-200" />
              <div className="size-3 rounded-full bg-slate-200" />
              <div className="size-3 rounded-full bg-slate-200" />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium text-slate-400">
              <span className="size-2 rounded-sm bg-emerald-500/20" />
              app.wawprofi.co.uk / {activeTab}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600">
              <span className="size-2 rounded-full bg-blue-600 animate-pulse" /> LIVE
            </div>
          </div>

          <div className="relative flex flex-col w-full bg-slate-50 transition-all duration-500 rounded-b-2xl overflow-hidden">
            
            {/* 🚀 THE FIX: We lock the height using aspect-video so the page NEVER jumps! */}
            {/* 🚀 Changed bg-slate-100 to bg-white so it blends with the screenshots seamlessly */}
            <div className="animate-tab-content relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-video bg-white">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`absolute inset-0 ${activeTab === tab.id ? "block" : "hidden"}`}
                >
                  <Image
                    src={tab.image}
                    alt={`${tab.label} interface`}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
                    // 🚀 Changed object-cover to object-contain! This stops the cropping completely.
                    className="object-contain object-top"
                    priority={tab.id === "dashboard"} 
                  />
                </div>
              ))}
            </div>

            {/* Floating Description Card */}
            <div className="animate-tab-content relative w-full bg-[#0F172A] p-5 text-white shadow-2xl transition-all duration-300 md:absolute md:bottom-8 md:left-8 md:w-auto md:max-w-sm md:rounded-xl md:bg-[#0F172A]/95 md:p-6 md:backdrop-blur-sm lg:bottom-10 lg:left-10">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {currentTab.num} - {currentTab.label}
              </p>
              <p className="text-sm font-medium leading-relaxed text-slate-100">{currentTab.desc}</p>
            </div>
          </div>
        </div>

        {/* Bottom Grid Highlights */}
        <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 border-t border-slate-200/80 pt-12 md:grid-cols-4">
          <div className="animate-demo-footer">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600">
              <span className="size-1.5 rounded-full bg-blue-600" /> Main Menu
            </p>
            <p className="text-sm font-semibold text-slate-900">
              Dashboard &middot; Sales &middot; Purchases &middot; Banking
            </p>
          </div>
          <div className="animate-demo-footer">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600">
              <span className="size-1.5 rounded-full bg-blue-600" /> Professional
            </p>
            <p className="text-sm font-semibold text-slate-900">
              Payroll &middot; Taxes &middot; Accounting &middot; Reports
            </p>
          </div>
          <div className="animate-demo-footer">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600">
              <span className="size-1.5 rounded-full bg-blue-600" /> Real-time
            </p>
            <p className="text-sm font-semibold text-slate-900">
              Live MTD &middot; YTD &middot; Current balance
            </p>
          </div>
          <div className="animate-demo-footer">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600">
              <span className="size-1.5 rounded-full bg-blue-600" /> Accounting-ready
            </p>
            <p className="text-sm font-semibold text-slate-900">
              Approved invoices post automatically
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}