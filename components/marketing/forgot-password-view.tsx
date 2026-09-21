"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, AlertCircle, ShieldCheck, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordView() {
  const supabase = createClient();
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    
    setError(null);
    setIsEmailSending(true);

    // 🔒 Sends the secure reset link containing the un-guessable token
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login/update-password`,
    });

    setIsEmailSending(false);

    if (error) {
      setError(error.message);
    } else {
      // ✅ We always show success even if the email doesn't exist to prevent hacker enumeration
      setEmailSent(true); 
    }
  };

  return (
    <div className="absolute inset-0 z-50 min-h-screen w-full bg-[#fcfbf7] flex flex-col selection:bg-blue-500/10 overflow-y-auto">
      
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          
          {/* Header Logo */}
          <div className="flex flex-col items-center text-center select-none w-full mb-8">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 font-black text-white text-xl shadow-lg shadow-blue-500/20 ring-4 ring-white mb-3">W</div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Account Recovery</p>
            </div>
          </div>

          <div className="w-full border border-slate-200/70 shadow-[0_25px_60px_-15px_rgba(148,163,184,0.18)] rounded-2xl bg-white overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-8">
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Forgot Password</h2>
                  <p className="text-sm text-slate-500 mt-2">Enter your email to receive a secure password reset link.</p>
                </div>

                <form onSubmit={handleSendResetEmail} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Email address</Label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400"><Mail className="size-4" /></div>
                      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" placeholder="you@company.com" disabled={isEmailSending || emailSent} />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold"><AlertCircle className="size-4 shrink-0 mt-0.5" /><p>{error}</p></div>
                  )}
                  
                  {emailSent ? (
                    <div className="flex items-start gap-2.5 p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm font-semibold">
                      <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-emerald-600" />
                      <p>If an account exists for that email, a secure reset link has been sent to your inbox.</p>
                    </div>
                  ) : (
                    <Button type="submit" disabled={isEmailSending || !email} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-md mt-2">
                      {isEmailSending ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4 mr-2"/> Send Reset Link</>}
                    </Button>
                  )}
                </form>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">
              &larr; Back to sign in
            </Link>
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