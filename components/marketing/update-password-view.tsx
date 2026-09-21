"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, AlertCircle, ArrowRight, CheckCircle2, Loader2, Eye, EyeOff, ShieldCheck, Smartphone, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

// 🚀 IMPORT YOUR SERVER ACTIONS
import { fetchSecurityQuestions, verifyAnswersAndReset } from "@/app/(public)/login/forgot-password/actions";

// Maps the database keys back to readable text
const QUESTION_MAP: Record<string, string> = {
  "q1_1": "What was the name of your first pet?",
  "q1_2": "In what city were you born?",
  "q1_3": "What is your mother's maiden name?",
  "q2_1": "What was the make and model of your first car?",
  "q2_2": "What was the name of your first school?",
  "q2_3": "What is the name of the street you grew up on?",
};

export function UpdatePasswordView() {
  const supabase = createClient();

  // Core User & Password State
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // 2FA / MFA State
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [isMfaVerifying, setIsMfaVerifying] = useState(false);

  // 🛡️ Security Question State
  const [useSecurityQuestions, setUseSecurityQuestions] = useState(false);
  const [isFetchingQuestions, setIsFetchingQuestions] = useState(false);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");

  // 🛡️ SECURITY ASSURANCE CHECK & 2FA DETECTION
  useEffect(() => {
    async function checkSessionAndMfa() {
      // 1. Check if user has a valid session from the email link
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError("Access Denied: You need a valid, unexpired recovery link from your email to view this page.");
        return;
      }

      // Save user details for the server actions later
      setUserEmail(userData.user.email || "");
      setUserId(userData.user.id);

      // 2. Check their MFA level securely
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const totpFactor = factorsData?.totp?.[0];
        
        if (totpFactor) {
          setFactorId(totpFactor.id);
          setNeedsMfa(true); 
        }
      }
    }
    
    checkSessionAndMfa();
  }, [supabase.auth]);

  // Handler 1: Verify the 6-digit 2FA Code
  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }
    setIsMfaVerifying(true);
    setError(null);
    const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factorId,
      code: mfaCode,
    });
    setIsMfaVerifying(false);

    if (mfaError) {
      setError("Invalid 2FA code. Please try again.");
    } else {
      setNeedsMfa(false); 
      setMfaCode(""); 
    }
  };

  // Handler 2: Update the Password (For standard users / Verified 2FA users)
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setError(null);
    setIsPending(true);

    const { error: authError } = await supabase.auth.updateUser({ password });
    setIsPending(false);

    if (authError) {
      setError(authError.message); 
    } else {
      setIsSuccess(true);
    }
  };

  // Handler 3: Fetch Questions when "Lost Device" is clicked
  const handleStartSecurityQuestions = async () => {
    setNeedsMfa(false); // Hide 2FA screen
    setUseSecurityQuestions(true); // Show Q&A Screen
    setIsFetchingQuestions(true);
    setError(null);

    const result = await fetchSecurityQuestions(userEmail);
    
    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setQ1(QUESTION_MAP[result.q1!] || "Security Question 1");
      setQ2(QUESTION_MAP[result.q2!] || "Security Question 2");
    }
    setIsFetchingQuestions(false);
  };

  // Handler 4: Submit Answers and Reset via Server Action
  const handleResetWithQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setError(null);
    setIsPending(true);

    // Call the secure Server Action using Admin privileges!
    const result = await verifyAnswersAndReset(userId, a1, a2, password);

    setIsPending(false);

    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setIsSuccess(true);
    }
  };

  return (
    <div className="absolute inset-0 z-50 min-h-screen w-full bg-[#fcfbf7] flex flex-col selection:bg-blue-500/10 overflow-y-auto">
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          
          <div className="flex flex-col items-center text-center select-none w-full mb-8">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 font-black text-white text-xl shadow-lg shadow-blue-500/20 ring-4 ring-white mb-3">W</div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Security Gateway</p>
            </div>
          </div>

          <div className="w-full border border-slate-200/70 shadow-[0_25px_60px_-15px_rgba(148,163,184,0.18)] rounded-2xl bg-white overflow-hidden p-8 relative">
            <AnimatePresence mode="wait">
              
              {/* SCREEN 1: SUCCESS SCREEN */}
              {isSuccess ? (
                <motion.div key="success" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="text-center flex flex-col items-center">
                  <div className="size-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="size-8 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Password Updated!</h2>
                  <p className="text-sm text-slate-500 mb-8 leading-relaxed">Your secure credentials are updated. You can now use your new password to sign into your workspace dashboard.</p>
                  <Button asChild className="w-full h-11 rounded-xl bg-[#ED6A2C] hover:bg-[#d45d25] text-white font-bold transition-all shadow-md">
                    <Link href="/login">Go to Login <ArrowRight className="ml-2 size-4" /></Link>
                  </Button>
                </motion.div>

              /* SCREEN 2: 2FA CODE ENTRY (If 2FA is enabled) */
              ) : needsMfa ? (
                <motion.div key="2fa" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="mb-6 text-center">
                    <div className="mx-auto size-10 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                      <Smartphone className="size-5 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Two-Step Verification</h2>
                    <p className="text-sm text-slate-500 mt-2">Enter the 6-digit code from your authenticator app to authorize this password change.</p>
                  </div>

                  <form onSubmit={handleVerify2FA} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Authenticator Code</Label>
                      <input 
                        required 
                        type="text" 
                        maxLength={6}
                        value={mfaCode} 
                        onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))} 
                        className="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-center text-lg tracking-[0.25em] outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" 
                        placeholder="000000" 
                        disabled={isMfaVerifying} 
                      />
                    </div>

                    {error && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold">
                        <AlertCircle className="size-4 shrink-0 mt-0.5" />
                        <p>{error}</p>
                      </div>
                    )}

                    <Button type="submit" disabled={isMfaVerifying || mfaCode.length !== 6} className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all shadow-md mt-2">
                      {isMfaVerifying ? <Loader2 className="size-4 animate-spin" /> : "Verify Code"}
                    </Button>

                    <div className="pt-4 text-center">
                      <p className="text-xs text-slate-500">Lost access to your device?</p>
                      <button type="button" onClick={handleStartSecurityQuestions} className="text-xs font-bold text-blue-600 hover:text-blue-700 mt-1 inline-block bg-transparent border-none cursor-pointer">
                        Use Security Questions instead &rarr;
                      </button>
                    </div>
                  </form>
                </motion.div>

              /* SCREEN 3: SECURITY QUESTIONS FALLBACK */
              ) : useSecurityQuestions ? (
                <motion.div key="questions" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="mb-6 text-center">
                    <div className="mx-auto size-10 bg-orange-100 rounded-full flex items-center justify-center mb-3">
                      <KeyRound className="size-5 text-orange-600" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Verify Identity</h2>
                    <p className="text-sm text-slate-500 mt-2">Answer your security questions to authorize this password change.</p>
                  </div>

                  {isFetchingQuestions ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="size-8 animate-spin text-slate-300" />
                    </div>
                  ) : (
                    <form onSubmit={handleResetWithQuestions} className="space-y-4">
                      <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Question 1</Label>
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{q1}</p>
                        <Input required placeholder="Your answer..." value={a1} onChange={(e) => setA1(e.target.value)} className="h-10 bg-white mt-2" disabled={isPending} />
                      </div>

                      <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Question 2</Label>
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{q2}</p>
                        <Input required placeholder="Your answer..." value={a2} onChange={(e) => setA2(e.target.value)} className="h-10 bg-white mt-2" disabled={isPending} />
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">New Password</Label>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                            <Lock className="size-4" />
                          </div>
                          <input required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" placeholder="••••••••" disabled={isPending} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors" tabIndex={-1}>
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>

                      {error && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold">
                          <AlertCircle className="size-4 shrink-0 mt-0.5" />
                          <p>{error}</p>
                        </div>
                      )}

                      <Button type="submit" disabled={isPending || !a1 || !a2 || !password} className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all shadow-md mt-4">
                        {isPending ? <Loader2 className="size-4 animate-spin" /> : "Verify & Reset Password"}
                      </Button>

                      <div className="pt-4 text-center">
                        <button 
                          type="button" 
                          onClick={() => {
                            setUseSecurityQuestions(false);
                            setNeedsMfa(true);
                          }} 
                          className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors bg-transparent border-none cursor-pointer"
                        >
                          &larr; Back to 2FA verification
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>

              /* SCREEN 4: DEFAULT PASSWORD ENTRY SCREEN (No 2FA Required) */
              ) : (
                <motion.div key="password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="mb-6 text-center">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Create New Password</h2>
                    <p className="text-sm text-slate-500 mt-2">Your identity has been verified. Type your new secure workspace access password below.</p>
                  </div>

                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">New Password</Label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                          <Lock className="size-4" />
                        </div>
                        <input required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" placeholder="••••••••" disabled={isPending || !!error?.includes("Denied")} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors" disabled={!!error?.includes("Denied")} tabIndex={-1}>
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold">
                        <AlertCircle className="size-4 shrink-0 mt-0.5" />
                        <p>{error}</p>
                      </div>
                    )}

                    <Button type="submit" disabled={isPending || !password || !!error?.includes("Denied")} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-md mt-2">
                      {isPending ? <Loader2 className="size-4 animate-spin" /> : "Update Password"}
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
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