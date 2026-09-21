"use client";

import Link from "next/link";

export function AboutLegal() {
  return (
    // Matches the exact cream tone and crisp thin top border from your design
    <div className="w-full bg-[#F8F7F4] py-8 border-t border-neutral-200/40">
      <div className="mx-auto max-w-7xl px-6 md:px-8 flex flex-col items-center justify-between gap-4 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500 md:flex-row">
        
        {/* Left Side: Company Registration */}
        <p>&copy; 2026 WAW GROUP GLOBAL LTD &middot; COMPANY NO. 15842074</p>

        {/* Right Side: Legal Directory Links */}
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
  );
}