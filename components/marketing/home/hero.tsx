"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftTextRef = useRef<HTMLDivElement>(null);

  // SEPARATED REFS: One for scrolling, one for 3D mouse tilting!
  const rightScrollWrapperRef = useRef<HTMLDivElement>(null);
  const cardTiltRef = useRef<HTMLDivElement>(null);

  // Refs for the LIVE numbers
  const cashRef = useRef<HTMLParagraphElement>(null);
  const taxRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Setup the 3D perspective so it doesn't glitch on the first hover
      gsap.set(cardTiltRef.current, { transformPerspective: 1000 });

      mm.add("(min-width: 1024px)", () => {
        // 0. ENTRANCE ANIMATION (On Page Load)
        gsap.from(".hero-animate-in", {
          y: 40,
          opacity: 0,
          duration: 1.2,
          stagger: 0.15, // Creates the waterfall effect
          ease: "power3.out",
          delay: 0.1, // Just enough time for the page to render
        });

        // 1. SCROLL ANIMATION
        gsap.set(leftTextRef.current, { x: "50%" });
        gsap.set(rightScrollWrapperRef.current, { autoAlpha: 0, y: 150, scale: 0.95 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top top",
            end: "+=1000",
            pin: true,
            scrub: 1,
          },
        });

        tl.to(leftTextRef.current, { x: "0%", duration: 1, ease: "power2.inOut" }, 0).to(
          rightScrollWrapperRef.current,
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 1,
            ease: "back.out(1.2)",
          },
          0.1,
        );
      });

      mm.add("(max-width: 1023px)", () => {
        gsap.from(leftTextRef.current, { y: 30, opacity: 0, duration: 1, delay: 0.2 });
        gsap.from(rightScrollWrapperRef.current, { y: 50, opacity: 0, duration: 1, delay: 0.4 });
      });

      // 2. LIVE CRYPTO-STYLE NUMBER FLUCTUATION
      const liveData = { cash: 287353.73, tax: 18668.19 }; // Starting amounts

      function liveUpdates() {
        gsap.to(liveData, {
          // Randomly fluctuate cash by roughly -£200 to +£300
          cash: liveData.cash + (Math.random() * 500 - 200),
          // Randomly fluctuate tax by a smaller amount
          tax: liveData.tax + (Math.random() * 100 - 40),
          duration: gsap.utils.random(200, 206), // Much slower! Updates every 6 to 12 seconds
          ease: "sine.inOut",
          onUpdate: () => {
            if (cashRef.current) {
              cashRef.current.innerText = new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
              }).format(liveData.cash);
            }
            if (taxRef.current) {
              taxRef.current.innerText = new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
              }).format(liveData.tax);
            }
          },
          onComplete: liveUpdates, // Loop forever!
        });
      }

      // Start the live ticker
      liveUpdates();

      return () => {
        mm.revert();
        gsap.killTweensOf(liveData); // Stop the ticker when leaving the page
      };
    },
    { scope: containerRef },
  );

  // --- 3D TILT EFFECT FUNCTION ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardTiltRef.current) return;
    const rect = cardTiltRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -8; // Tilted slightly less for smoothness
    const rotateY = ((x - centerX) / centerX) * 8;

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

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-white pt-32 pb-20 lg:pt-0 lg:pb-0"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-16 px-6 lg:flex-row lg:px-8">
        {/* LEFT SIDE: Typography & Buttons */}
        <div ref={leftTextRef} className="w-full max-w-2xl lg:w-[55%]">
          <div className="hero-animate-in mb-8 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="size-2 rounded-full bg-blue-600" />
              New
            </span>
            <span>&middot;</span>
            <span>Private Beta</span>
            <span>&middot;</span>
            <span>UK</span>
          </div>

          <h1 className="hero-animate-in text-6xl font-extrabold leading-[1.05] tracking-tight text-slate-950 md:text-7xl lg:text-[5.5rem]">
            Accounting <br />
            <span className="text-blue-600">
              Without <br /> the Anxiety.
            </span>
          </h1>

          <p className="hero-animate-in mt-6 max-w-lg text-lg font-medium leading-relaxed text-slate-600 md:text-xl">
            Automated bookkeeping. Live cash. MTD-filed. <br />
            The financial operating system for modern UK businesses.
          </p>

          <div className="hero-animate-in mt-8 flex flex-wrap items-center gap-4">
            <Button
              className="group h-12 rounded-full bg-[#ED6A2C] px-8 text-sm font-bold text-white hover:bg-[#d45d25]"
              asChild
            >
              {/* ✅ ROUTED TO WAITLIST PAGE WITH ?tab=waitlist PARAM */}
              <Link href="/waitlist?tab=waitlist">
                Join the waitlist
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-full border-slate-300 bg-transparent px-8 text-sm font-bold text-slate-900 hover:bg-slate-100 transition-colors"
              asChild
            >
              {/* ✅ ROUTED TO WAITLIST PAGE WITH ?tab=demo PARAM */}
              <Link href="/waitlist?tab=demo">
                Book a demo
              </Link>
            </Button>
          </div>

          <div className="hero-animate-in mt-12 flex flex-wrap items-center gap-3 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
            <span>Free Forever</span>
            <span className="size-1 rounded-full bg-slate-300" />
            <span>Under £30k Revenue</span>
            <span className="size-1 rounded-full bg-slate-300" />
            <span>No Card Required</span>
            <span className="size-1 rounded-full bg-slate-300" />
            <span>Migrate in ~12 Minutes</span>
          </div>
        </div>

        {/* RIGHT SIDE: Dashboard Mockup */}
        <div
          ref={rightScrollWrapperRef}
          className="relative mt-10 w-full max-w-[550px] lg:mt-0 lg:w-[45%]"
        >
          {/* INNER CARD: Handles the 3D Mouse Tilt safely without fighting the scroll! */}
          <div
            ref={cardTiltRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="relative z-10 w-full rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] transition-shadow duration-500 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] cursor-crosshair"
          >
            {/* Top Bar Fake Browser */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-slate-200" />
                <div className="size-2.5 rounded-full bg-slate-200" />
                <div className="size-2.5 rounded-full bg-slate-200" />
              </div>
              <div className="rounded-full bg-slate-50 px-6 py-1 text-[10px] font-bold text-slate-400">
                app.wawprofi.co.uk / overview
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 flex-pulse">
                <span className="size-2 rounded-full bg-blue-600 animate-pulse" /> LIVE
              </div>
            </div>

            {/* Inner Dashboard Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Cash Position Widget */}
              <div className="col-span-2 rounded-xl bg-[#0B0F19] p-6 text-white shadow-inner md:col-span-1 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Cash Position - 28 Nov
                </p>
                {/* 🔴 LIVE NUMBER REF HERE */}
                <p ref={cashRef} className="mt-2 text-3xl font-bold tracking-tight">
                  £287,353.73
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-400">↑ 12.4% MoM</p>
              </div>

              {/* Tax Est Widget */}
              <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    MTD Tax Est.
                  </p>
                  <span className="text-[10px] font-bold text-orange-500">Q3</span>
                </div>
                {/* 🔴 LIVE NUMBER REF HERE */}
                <p ref={taxRef} className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                  £18,668.19
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">due 31 Jan 2027</p>
              </div>

              {/* Open Banking Mockup */}
              <div className="col-span-2 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Open Banking
                  </p>
                  <span className="text-[10px] font-bold text-emerald-500">4 / 4</span>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">
                    HSBC
                  </span>
                  <span className="px-3 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">
                    Stripe
                  </span>
                  <span className="px-3 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">
                    Wise
                  </span>
                  <span className="px-3 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">
                    PayPal
                  </span>
                </div>
                <p className="mt-3 text-[10px] text-slate-400">Last sync &middot; Just now</p>
              </div>

              {/* Recent Movements List */}
              <div className="col-span-2 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Recent Movements
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Auto-Categorised
                  </p>
                </div>

                <div className="space-y-3 text-xs font-medium">
                  <div className="flex justify-between border-b border-slate-100 pb-2 transition-colors hover:bg-slate-50 cursor-pointer">
                    <span className="text-slate-600">22:25 &middot; GoCardless - EU</span>
                    <span className="text-emerald-600 font-semibold">+£940.00</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2 transition-colors hover:bg-slate-50 cursor-pointer">
                    <span className="text-slate-600">22:25 &middot; Wise - FX In</span>
                    <span className="text-emerald-600 font-semibold">+£2,810.00</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2 transition-colors hover:bg-slate-50 cursor-pointer">
                    <span className="text-slate-600">22:25 &middot; Figma - seats</span>
                    <span className="text-slate-900 font-semibold">-£45.00</span>
                  </div>
                  <div className="flex justify-between transition-colors hover:bg-slate-50 cursor-pointer">
                    <span className="text-slate-600">22:25 &middot; Stripe - payout</span>
                    <span className="text-emerald-600 font-semibold">+£1,750.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute -bottom-6 -right-6 -z-10 h-full w-full rounded-2xl bg-slate-200/50 blur-3xl" />
        </div>
      </div>
    </section>
  );
}