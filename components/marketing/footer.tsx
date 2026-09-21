"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const footerLinks = {
  product: [
    { name: "Bookkeeping", href: "#" },
    { name: "MTD & VAT", href: "#" },
    { name: "Open Banking", href: "#" },
    { name: "Accountant portal", href: "#" },
    { name: "Receipts", href: "#" },
  ],
  for: [
    { name: "Freelancers", href: "#" },
    { name: "Sole traders", href: "#" },
    { name: "SMEs", href: "#" },
    { name: "Accountants", href: "#" },
    { name: "Startups", href: "#" },
  ],
  resources: [
    { name: "MTD 2026 guide", href: "#" },
    { name: "Field notes", href: "#" },
    { name: "Changelog", href: "#" },
    { name: "System status", href: "#" },
    { name: "Trust centre", href: "#" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Careers", href: "#" },
    { name: "Press", href: "#" },
    { name: "Contact", href: "#" },
    { name: "Security", href: "#" },
  ],
};

export function Footer() {
  const containerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // ✅ DEFINE ROUTES WHERE THE FOOTER SHOULD BE HIDDEN
  const hiddenRoutes = ["/waitlist", "/about", "/login"]; // ✅ Added /login here
  const isHidden = hiddenRoutes.includes(pathname);

  useGSAP(
    () => {
      // Don't waste performance processing animations if the layout is hidden
      if (isHidden) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
        },
      });

      tl.from(".animate-footer-logo", {
        y: 100,
        opacity: 0,
        duration: 1.2,
        ease: "power4.out",
      })
        .from(
          ".animate-footer-col",
          {
            y: 30,
            opacity: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: "power3.out",
          },
          "-=0.8",
        )
        .from(
          ".animate-footer-bottom",
          {
            opacity: 0,
            duration: 1,
          },
          "-=0.4",
        );
    },
    { scope: containerRef, dependencies: [pathname, isHidden] },
  );

  // ─── ✅ THE FIX: CHOP OFF THE RENDERING PATH ON BOTH HIDDEN PAGES ───
  if (isHidden) return null;

  return (
    <footer ref={containerRef} className="bg-[#F8F7F4] pt-24 pb-12 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* Giant Typographic Logo */}
        <div className="animate-footer-logo mb-24 flex items-center justify-center text-[16vw] font-medium leading-none tracking-tighter text-slate-950 md:text-[14vw] lg:text-[15.5rem]">
          <span>WAW</span>
          <span className="mx-[2vw] inline-block size-[3.5vw] shrink-0 rounded-full bg-blue-600 md:size-[3vw] lg:mx-8 lg:size-14" />
          <span>PROFI</span>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-6 md:gap-8 lg:gap-12">
          {/* Brand Info Column */}
          <div className="animate-footer-col col-span-1 md:col-span-2">
            <p className="max-w-xs text-sm font-medium leading-relaxed text-slate-700">
              The financial operating system for modern UK businesses. Built in London & Edinburgh.
            </p>

            <div className="mt-8 flex items-center gap-3">
              <div className="relative flex size-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                - Ops Status &middot; All Systems Nominal
              </p>
            </div>
          </div>

          {/* Product Links */}
          <div className="animate-footer-col flex flex-col gap-5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">
              Product
            </h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-600 transition-colors hover:text-blue-600"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* For Links */}
          <div className="animate-footer-col flex flex-col gap-5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">For</h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.for.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-600 transition-colors hover:text-blue-600"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div className="animate-footer-col flex flex-col gap-5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">
              Resources
            </h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-600 transition-colors hover:text-blue-600"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div className="animate-footer-col flex flex-col gap-5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">
              Company
            </h4>
            <ul className="flex flex-col gap-4">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-600 transition-colors hover:text-blue-600"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="animate-footer-bottom mt-24 flex flex-col items-center justify-between gap-6 border-t border-slate-200/80 pt-8 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500 md:flex-row">
          <p>&copy; 2026 WAW GROUP GLOBAL LTD &middot; COMPANY NO. 15842074</p>

          <div className="flex gap-6">
            <Link href="#" className="transition-colors hover:text-slate-900">
              Privacy
            </Link>
            <Link href="#" className="transition-colors hover:text-slate-900">
              Terms
            </Link>
            <Link href="#" className="transition-colors hover:text-slate-900">
              DPA
            </Link>
            <Link href="#" className="transition-colors hover:text-slate-900">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}