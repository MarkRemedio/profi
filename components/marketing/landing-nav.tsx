"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom"; // 🚀 Portal is BACK to escape ScrollSmoother!
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation"; 
import { createClient } from "@/lib/supabase/client"; // 🚀 Import Client
import { ArrowRight, Menu, X, User, ChevronRight } from "lucide-react"; 
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import gsap from "gsap"; 
import { ScrollSmoother } from "gsap/ScrollSmoother"; 

function LandingNavImpl() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false); 
  const pathname = usePathname(); 
  const router = useRouter(); 
  const searchParams = useSearchParams(); 
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false); // 🚀 Restored mount state

  // 🚀 Let the component mount so it can safely teleport to the body
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        
        // 🔒 If they have verified their password (aal1) but still owe their 2FA code,
        // evaluate them as unsigned-in so the profile button routes straight to /login!
        if (mfaData?.currentLevel === 'aal1' && mfaData?.nextLevel === 'aal2') {
          setIsSignedIn(false);
        } else {
          setIsSignedIn(true);
        }
      } else {
        setIsSignedIn(false);
      }
    }

    checkAuth();
    window.addEventListener("focus", checkAuth);
    return () => window.removeEventListener("focus", checkAuth);
  }, [pathname]); 

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isMobileOpen]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setIsMobileOpen(false); 
    
    const targetPath = href.split("?")[0].split("#")[0];

    if (href === "/") {
      e.preventDefault();
      
      if (pathname === "/") {
        window.history.replaceState(null, "", "/");
        
        const smoother = ScrollSmoother.get();
        if (smoother) {
          gsap.to(smoother, { scrollTop: 0, duration: 2.2, ease: "power3.inOut" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        router.push("/"); 
      }
      return;
    }

    if (pathname === targetPath && !href.includes("#")) {
      e.preventDefault();
      
      const smoother = ScrollSmoother.get();
      
      if (smoother && smoother.scrollTop() > 100) {
        gsap.to(smoother, { 
          scrollTop: 0, 
          duration: 2.2, 
          ease: "power3.inOut",
          onComplete: () => {
            if (href.includes("?")) router.push(href, { scroll: false });
          }
        }); 
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (href.includes("?")) router.push(href, { scroll: false });
      }
      return;
    }

    if (href.includes("#")) {
      const [pathPart, hashPart] = href.split("#");
      
      if (pathname === pathPart) {
        e.preventDefault(); 
        const targetElement = document.getElementById(hashPart);
        
        if (targetElement) {
          const smoother = ScrollSmoother.get();
          
          if (smoother) {
            const targetOffset = smoother.offset(targetElement, "top 80px");
            gsap.to(smoother, {
              scrollTop: targetOffset,
              duration: 2.2, 
              ease: "power3.inOut"
            });
          } else {
            const headerOffset = 80;
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.scrollY - headerOffset;
            window.scrollTo({ top: offsetPosition, behavior: "smooth" });
          }
          window.history.pushState(null, "", href);
        }
      } else {
        return; 
      }
    }
  };

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Pricing", href: "/#pricing" },
    { label: "About us", href: "/about" }, 
    { label: "Demo", href: "/waitlist?tab=demo" }, 
  ];

  const navContent = (
    <nav
      className={cn(
        "fixed top-0 inset-x-0 z-[100] w-full transition-all duration-300",
        isScrolled || isMobileOpen
          ? "bg-white border-b border-neutral-200/60 shadow-sm"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 md:px-8 md:py-4">
        <Link href="/" onClick={(e) => handleNavClick(e, "/")} className="flex items-center gap-2 sm:gap-2.5 group shrink-0">
          <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 font-extrabold text-white text-sm sm:text-base shadow-sm">
            W
          </div>
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-sm font-black uppercase tracking-wider text-neutral-900">
              Wawprofi
            </span>
            <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              UK &middot; Beta
            </span>
          </div>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => {
            const isActive = 
              (pathname === "/" && link.href === "/") ||
              (pathname.startsWith("/about") && link.href === "/about") ||
              (pathname === "/" && link.href === "/#pricing") ||
              (pathname.startsWith("/waitlist") && link.href.includes("demo") && searchParams?.get("tab") !== "waitlist");

            return (
              <Link key={link.label} href={link.href} onClick={(e) => handleNavClick(e, link.href)} className={cn("text-sm transition-colors duration-200", isActive && link.href !== "/#pricing" ? "text-blue-600 font-semibold" : "text-neutral-500 font-medium hover:text-neutral-950")}>
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Button variant="outline" size="icon" className="rounded-full size-9 sm:size-10 shrink-0 border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-600 hover:text-blue-600 hover:bg-neutral-100 hover:border-neutral-300 transition-colors shadow-sm" asChild>
            {/* 🚀 THE FIX: Added onClick to force the mobile menu to close so you can actually see the page load! */}
            <Link 
              href={isSignedIn ? "/dashboard" : "/login"}
              onClick={() => setIsMobileOpen(false)}
            >
              <User className="size-4 sm:size-4.5" />
            </Link>
          </Button>

          <Button className="group h-9 sm:h-10 shrink-0 rounded-full bg-[#ED6A2C] px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-[#d45d25] transition-all flex items-center gap-1.5" asChild>
            <Link href="/waitlist?tab=waitlist" onClick={(e) => handleNavClick(e, "/waitlist?tab=waitlist")}>
              <span className="hidden sm:inline-block">Join waitlist</span>
              <span className="sm:hidden">Waitlist</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>

          <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="rounded-full p-1.5 sm:p-2 shrink-0 text-neutral-700 hover:bg-neutral-100 md:hidden transition-colors">
            {isMobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {isMobileOpen && (
        /* 🚀 SPEED FIX KEPT: bg-white instead of backdrop-blur for mobile GPU! */
        <div className="fixed inset-x-0 top-[65px] sm:top-[73px] bottom-0 h-[calc(100vh-65px)] sm:h-[calc(100vh-73px)] w-full bg-white px-6 py-8 md:hidden flex flex-col justify-between border-t border-neutral-100 animate-in fade-in slide-in-from-top-4 duration-200 z-[99]">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = 
                (pathname === "/" && link.href === "/") ||
                (pathname.startsWith("/about") && link.href === "/about") ||
                (pathname === "/" && link.href === "/#pricing") ||
                (pathname.startsWith("/waitlist") && link.href.includes("demo") && searchParams?.get("tab") !== "waitlist");

              return (
                <Link key={link.label} href={link.href} onClick={(e) => handleNavClick(e, link.href)} className={cn("text-lg font-semibold flex items-center justify-between rounded-xl py-3.5 px-4 transition-all active:bg-neutral-50/80", isActive && link.href !== "/#pricing" ? "text-blue-600 bg-blue-50/40" : "text-neutral-600 hover:text-neutral-950")}>
                  <span>{link.label}</span>
                  <ChevronRight className={cn("size-4 opacity-40", (isActive && link.href !== "/#pricing") && "text-blue-500 opacity-100")} />
                </Link>
              );
            })}
          </div>
          <div className="mb-8 opacity-40 font-mono text-[9px] tracking-widest text-center font-bold text-neutral-400 uppercase">
            WAWPROFI &middot; SECURED PROTOCOL
          </div>
        </div>
      )}
    </nav>
  );

  // 🚀 RESTORED: Teleport to body so ScrollSmoother doesn't steal the header!
  if (!isMounted) return navContent;
  return createPortal(navContent, document.body);
}

export function LandingNav() {
  return (
    <Suspense fallback={null}>
      <LandingNavImpl />
    </Suspense>
  );
}