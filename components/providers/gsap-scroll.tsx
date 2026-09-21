"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

export function GSAPScrollProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const smootherRef = useRef<ScrollSmoother | null>(null);

  // 1. START THE ENGINE ONLY ONCE
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    smootherRef.current = ScrollSmoother.create({
      wrapper: "#smooth-wrapper",
      content: "#smooth-content",
      smooth: 1.2,
      effects: true,
      // 🚀 THE MAGIC LINE: Tells GSAP to stop forcing focus scroll adjustments!
      onFocusIn: () => false, 
    });

    return () => {
      if (smootherRef.current) smootherRef.current.kill();
    };
  }, []); 

  // 2. HANDLE ROUTE CHANGES SAFELY
  useEffect(() => {
    // 🚀 FIXED: Check if the URL has a hash (like #pricing) before forcing it to the top!
    const timer = setTimeout(() => {
      const hash = window.location.hash;
      
      if (hash && smootherRef.current) {
        const target = document.querySelector(hash);
        if (target) {
          // Found a hash! Calculate distance and glide down slowly across pages.
          const targetOffset = smootherRef.current.offset(target, "top 80px");
          gsap.to(smootherRef.current, {
            scrollTop: targetOffset,
            duration: 2.2, // 🕰️ Changed to 2.2 seconds
            ease: "power3.inOut"
          });
        }
      } else {
        // No hash? Normal page load, so scroll to the very top.
        window.scrollTo(0, 0);
        if (smootherRef.current) {
          smootherRef.current.scrollTop(0);
        }
      }
      
      ScrollTrigger.refresh();
    }, 150); // Small delay lets Next.js render the new page before GSAP measures it

    return () => clearTimeout(timer);
  }, [pathname]); 

  return (
    <div id="smooth-wrapper" className="w-full h-full overflow-hidden">
      <div id="smooth-content" className="w-full min-h-full">
        {children}
      </div>
    </div>
  );
}