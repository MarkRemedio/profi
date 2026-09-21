"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client"; // 🚀 Import Client
import { signIn, verify2FACode, type SignInState } from "@/app/(public)/login/actions";
import { gsap } from "gsap"; 
import { useGSAP } from "@gsap/react"; 

import { LandingNav } from "@/components/marketing/landing-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { 
  AlertCircle, 
  Lock, 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  Eye, 
  EyeOff,
  Calculator,
  CheckCircle2, 
  Receipt, 
  Briefcase, 
  PieChart, 
  Coins, 
  Landmark,
  FileText,
  Smartphone,
  Loader2
} from "lucide-react"; 

const initialState: SignInState = null;

export function LoginView() {
  const searchParams = useSearchParams();
  const successMessage = searchParams.get("message");
  
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);
  
  // 🚀 New 2FA States
  const [otp, setOtp] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false); 
  const [force2FAView, setForce2FAView] = useState(false); // 🚀 Detect active session hook
  const [activeFactorId, setActiveFactorId] = useState(""); // 🚀 Fallback factor holder

  // 🚀 AUTO-DETECT PARTIAL SESSIONS: If they are redirected here but already entered their password,
  // instantly open the 6-digit challenge box so they don't have to type passwords twice!
  useEffect(() => {
    const supabase = createClient();
    async function checkExistingAAL() {
      const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mfaData?.currentLevel === 'aal1' && mfaData?.nextLevel === 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp.find(f => f.status === 'verified');
        if (totpFactor) {
          setActiveFactorId(totpFactor.id);
          setForce2FAView(true);
        }
      }
    }
    checkExistingAAL();
  }, []);
  
  const pageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null); 

  // GSAP Animations Engine
  useGSAP(() => {
    const page = pageRef.current;
    const card = cardRef.current;
    const container = containerRef.current;
    const rightPanel = rightPanelRef.current;

    if (!page || !card || !container || !rightPanel) return;

    // 1. Mobile-Safe Entrance
    gsap.fromTo(container, 
      { opacity: 0, y: 25 },
      { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", clearProps: "transform" }
    );

    let mm = gsap.matchMedia();

    // 🚀 ONLY run heavy effects on Desktop
    mm.add("(min-width: 1024px)", () => {
      gsap.fromTo(rightPanel, 
        { opacity: 0, y: 25 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.15, ease: "power3.out", clearProps: "transform" }
      );

      gsap.utils.toArray<HTMLElement>(".floating-office-item").forEach((item, index) => {
        gsap.to(item, {
          y: index % 2 === 0 ? -24 : -14,
          x: index % 3 === 0 ? 10 : -10,
          rotation: index % 2 === 0 ? 6 : -6,
          duration: 3 + index * 0.5,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      });

      const handleFormTilt = (e: MouseEvent) => {
        const centerX = card.offsetWidth / 2;
        const centerY = card.offsetHeight / 2;
        const offsetX = e.clientX - card.getBoundingClientRect().left - centerX;
        const offsetY = e.clientY - card.getBoundingClientRect().top - centerY;

        const rotationY = -(offsetX / 160); 
        const rotationX = (offsetY / 110); 

        gsap.to(card, {
          rotationY,
          rotationX,
          ease: "power2.out",
          duration: 0.3,
          transformPerspective: 1000,
        });
      };

      const resetTilt = () => {
        gsap.to(card, { rotationX: 0, rotationY: 0, ease: "elastic.out(1, 0.4)", duration: 1.2 });
      };

      card.addEventListener("mousemove", handleFormTilt);
      card.addEventListener("mouseleave", resetTilt);

      return () => {
        card.removeEventListener("mousemove", handleFormTilt);
        card.removeEventListener("mouseleave", resetTilt);
      };
    });

  }, { scope: pageRef });

  // 🚀 New submit handler for the 2FA form
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetFactorId = state?.factorId || activeFactorId;
    if (!targetFactorId || otp.length < 6) return;
    
    setIsVerifying2FA(true);
    setMfaError(null);
    
    const result = await verify2FACode(targetFactorId, otp, rememberMe);
    
    if (result?.error) {
      setMfaError(result.error);
      setIsVerifying2FA(false);
    }
  };

  return (
    <div 
      ref={pageRef}
      className="relative min-h-screen w-full bg-[#fcfbf7] flex flex-col font-sans overflow-hidden selection:bg-blue-500/10"
    >
      
      {/* 🚀 GPU FIX: Hidden massive ambient blurs on mobile phones using 'hidden md:block' */}
      <div className="hidden md:block absolute top-[-10%] right-[-10%] size-[500px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
      <div className="hidden md:block absolute bottom-[-10%] left-[-10%] size-[500px] rounded-full bg-[#ED6A2C]/5 blur-[120px] pointer-events-none" />

      <LandingNav />

      <main className="relative z-10 flex-1 w-full max-w-[1400px] mx-auto pt-24 pb-8 px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        
        <div className="w-full flex flex-col items-center justify-center py-8 z-10 md:[perspective:1000px]">
          
          <div ref={containerRef} className="w-full max-w-[380px] space-y-6 opacity-0">
            
            <div className="flex flex-col items-center text-center select-none w-full">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 font-black text-white text-xl shadow-lg shadow-blue-500/20 ring-4 ring-white mb-3">
                W
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">
                  Wawprofi Cloud Engine
                </p>
                <p className="text-xs text-slate-500 font-semibold tracking-wide">Secure Workspace Gateway</p>
              </div>
            </div>

            {/* 🚀 GPU FIX: Solid white background on mobile, turns back to blurred glass on Desktop */}
            <Card 
              ref={cardRef} 
              className="w-full border-slate-200/70 shadow-[0_25px_60px_-15px_rgba(148,163,184,0.18)] rounded-2xl bg-white backdrop-blur-none md:bg-white/95 md:backdrop-blur-md overflow-hidden origin-center"
            >
              
              {/* 🚀 CONDITIONAL RENDERING: Check if 2FA is required or session auto-detected */}
              {!(state?.requires2FA || force2FAView) ? (
                <>
                  <CardHeader className="space-y-2 pt-8 px-6 sm:px-10 text-center border-b border-slate-100/80 pb-6 bg-slate-50/50">
                    <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
                      Welcome back
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-sm font-medium leading-relaxed">
                      Provide your workspace credentials to open your ledger dashboard
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="pt-7 px-6 sm:px-10 pb-9">
                    <form action={formAction} className="space-y-5">
                      
                      <div className="space-y-4.5">
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Email address
                          </Label>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200">
                              <Mail className="size-4" />
                            </div>
                            <input
                              id="email"
                              name="email"
                              type="email"
                              required
                              autoComplete="email"
                              className="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 py-2 text-sm text-slate-800 transition-all placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50"
                              placeholder="you@company.com"
                              disabled={pending}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Password
                            </Label>
                            <Link href="/login/forgot-password" className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors duration-150">
                              Forgot password?
                            </Link>
                          </div>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200">
                              <Lock className="size-4" />
                            </div>
                            <input
                              id="password"
                              name="password"
                              type={showPassword ? "text" : "password"}
                              required
                              autoComplete="current-password"
                              className="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 py-2 text-sm text-slate-800 transition-all placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50"
                              placeholder="••••••••"
                              disabled={pending}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {successMessage && !state?.error && (
                        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                          <p aria-live="polite" className="text-xs font-bold leading-relaxed">
                            {successMessage}
                          </p>
                        </div>
                      )}

                      {state?.error && (
                        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-600">
                          <AlertCircle className="size-4 shrink-0 mt-0.5" />
                          <p aria-live="polite" className="text-xs font-bold leading-relaxed">
                            {state.error}
                          </p>
                        </div>
                      )}

                      <Button 
                        type="submit" 
                        disabled={pending}
                        className="w-full h-11 rounded-xl bg-[#ED6A2C] hover:bg-[#d45d25] text-white font-bold text-sm transition-all shadow-md shadow-orange-600/10 flex items-center justify-center gap-2 active:scale-[0.98] duration-150 group"
                      >
                        {pending ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="animate-spin h-4 w-4 text-white" />
                            Authenticating profile...
                          </span>
                        ) : (
                          <>
                            <span>Sign in to Workspace</span>
                            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                          </>
                        )}
                      </Button>
                    </form>

                    <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                      <p className="text-xs text-slate-400 font-medium">
                        New to Wawprofi?{" "}
                        <Link href="/waitlist?tab=waitlist" className="font-extrabold text-[#ED6A2C] hover:text-[#d45d25] transition-all">
                          Join our priority waitlist
                        </Link>
                      </p>
                    </div>
                  </CardContent>
                </>
              ) : (
                /* 🚀 NEW 2FA STATE UI */
                <>
                  <CardHeader className="space-y-2 pt-8 px-6 sm:px-10 text-center border-b border-slate-100/80 pb-6 bg-slate-50/50">
                    <div className="mx-auto size-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                      <Smartphone className="size-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
                      Two-Step Verification
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-sm font-medium leading-relaxed">
                      Open your authenticator app and enter the 6-digit security code.
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="pt-7 px-6 sm:px-10 pb-9">
                    <form onSubmit={handle2FASubmit} className="space-y-5">
                      <div className="space-y-2 text-center">
                        <Label htmlFor="otp" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Authentication Code
                        </Label>
                        <input
                          id="otp"
                          name="otp"
                          type="text"
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                          required
                          autoFocus
                          className="flex h-14 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-center text-2xl tracking-[0.5em] font-mono font-bold text-slate-800 transition-all placeholder:text-slate-300 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                          placeholder="000000"
                          disabled={isVerifying2FA}
                        />
                      </div>

                      {/* 🚀 Sage-Style Remember Device Checkbox */}
                      <div className="flex items-center gap-2.5 pt-1 pb-2 select-none justify-start px-1">
                        <input
                          id="rememberMe"
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer accent-blue-600"
                        />
                        <label htmlFor="rememberMe" className="text-xs font-bold text-slate-500 cursor-pointer">
                          Remember this device for 7 days
                        </label>
                      </div>

                      {mfaError && (
                        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-600">
                          <AlertCircle className="size-4 shrink-0 mt-0.5" />
                          <p aria-live="polite" className="text-xs font-bold leading-relaxed">
                            {mfaError}
                          </p>
                        </div>
                      )}

                      <Button 
                        type="submit" 
                        disabled={isVerifying2FA || otp.length < 6}
                        className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-600/10 flex items-center justify-center gap-2 active:scale-[0.98] duration-150"
                      >
                        {isVerifying2FA ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="animate-spin h-4 w-4 text-white" />
                            Verifying code...
                          </span>
                        ) : (
                          <>
                            <ShieldCheck className="size-4" />
                            <span>Verify & Continue</span>
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        </div>

        <div ref={rightPanelRef} className="hidden lg:flex flex-col w-full h-full min-h-[600px] p-2 xl:p-6 opacity-0">
          <div className="w-full h-full flex-1 bg-slate-950 rounded-[2.5rem] relative overflow-hidden shadow-2xl border border-slate-800">
            
            <div className="absolute -top-32 -right-32 size-[400px] rounded-full bg-blue-600/20 blur-[100px]" />
            <div className="absolute -bottom-32 -left-32 size-[400px] rounded-full bg-[#ED6A2C]/10 blur-[100px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
            
            <div className="relative w-full h-full flex flex-col items-center justify-center p-12">
              <div className="text-center mb-16 z-10 select-none">
                <h2 className="text-3xl font-black text-white tracking-tight mb-4">
                  Financial clarity, <span className="text-blue-500">finally.</span>
                </h2>
                <p className="text-slate-400 font-medium max-w-xs mx-auto text-sm leading-relaxed">
                  Seamless ledger calculations, office auditing pipelines, and secure real-time bookkeeping infrastructure.
                </p>
              </div>

              <div className="absolute inset-0 w-full h-full pointer-events-none z-10">
                <div className="floating-office-item absolute top-[20%] left-[10%] flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md">
                  <Calculator className="size-5 text-blue-500" />
                  <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">CALC.ENGINE</span>
                </div>
                <div className="floating-office-item absolute top-[25%] right-[10%] flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md">
                  <Receipt className="size-5 text-emerald-400" />
                  <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">MTD_INVOICE</span>
                </div>
                <div className="floating-office-item absolute top-[48%] left-[8%] flex items-center justify-center size-11 bg-white/[0.04] border border-white/10 rounded-xl shadow-2xl backdrop-blur-md">
                  <Briefcase className="size-5 text-amber-500" />
                </div>
                <div className="floating-office-item absolute top-[52%] right-[12%] flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md">
                  <PieChart className="size-5 text-cyan-400" />
                  <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">LEDGER_VAT</span>
                </div>
                <div className="floating-office-item absolute bottom-[20%] left-[16%] flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md">
                  <Coins className="size-5 text-yellow-500" />
                  <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">GBP_BALANCE</span>
                </div>
                <div className="floating-office-item absolute bottom-[26%] right-[18%] flex items-center justify-center size-11 bg-white/[0.04] border border-white/10 rounded-xl shadow-2xl backdrop-blur-md">
                  <Landmark className="size-5 text-purple-400" />
                </div>
                <div className="floating-office-item absolute top-[10%] left-[44%] flex items-center justify-center size-11 bg-white/[0.04] border border-white/10 rounded-xl shadow-2xl backdrop-blur-md">
                  <FileText className="size-5 text-rose-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      <footer className="relative z-10 w-full shrink-0 border-t border-slate-200/60 bg-white/60 backdrop-blur-md py-4 px-6 text-center sm:flex sm:items-center sm:justify-between max-w-7xl mx-auto rounded-t-2xl">
        <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px] font-semibold tracking-wide">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          <span className="uppercase tracking-wider">HMRC MTD Secured Connection Gateway</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 sm:mt-0 font-semibold tracking-wide">
          &copy; {new Date().getFullYear()} Wawprofi Ltd. All rights reserved. &middot; Privacy &middot; Terms
        </p>
      </footer>

    </div>
  );
}