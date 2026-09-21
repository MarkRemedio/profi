"use client";

import { useActionState, useState } from "react";
import { adminSignIn, type AdminSignInState } from "@/app/(admin)/admin/login/actions";
import { AlertCircle, Lock, Mail, Eye, EyeOff, ShieldCheck } from "lucide-react";

const initialState: AdminSignInState = null;

export default function AdminLoginView() {
  const [state, formAction, pending] = useActionState(
    adminSignIn as (state: AdminSignInState, formData: FormData) => Promise<AdminSignInState>, 
    initialState
  );

  // 🚀 NEW: State to track password visibility
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-50 font-sans text-slate-900 px-4 overflow-hidden">
      
      {/* Subtle Background Glows for a Premium Feel */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative w-full max-w-md p-8 sm:p-10 border border-slate-200/80 rounded-[2rem] bg-white/80 backdrop-blur-xl shadow-2xl shadow-blue-900/5 flex flex-col">
        
        {/* Top Decorative Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-b-full" />

        {/* --- HEADER --- */}
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="size-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-blue-100/50">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Admin Gateway</h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">Access the secure platform orchestrator terminal.</p>
        </div>

        {/* --- SECURITY ALERTS DISPLAY --- */}
        {state?.error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-xs font-semibold text-red-800 border border-red-100 animate-in fade-in-50 slide-in-from-top-2 duration-300 shadow-sm">
            <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
            <span className="leading-relaxed">{state.error}</span>
          </div>
        )}
        
        {/* --- SECURE FORM TRACKING --- */}
        <form action={formAction} className="space-y-5">
          
          {/* Email Input Box */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Administrative Email
            </label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                placeholder="admin@wawprofi.com"
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition-all shadow-sm disabled:opacity-60 font-medium"
              />
            </div>
          </div>

          {/* Password Input Box */}
          <div className="space-y-2">
            <label htmlFor="password" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Security Passcode
            </label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                id="password"
                name="password"
                // 🚀 Toggle between text and password
                type={showPassword ? "text" : "password"} 
                autoComplete="current-password"
                required
                disabled={pending}
                placeholder="••••••••"
                className="w-full h-12 pl-11 pr-12 rounded-xl border border-slate-200 bg-white/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition-all shadow-sm disabled:opacity-60 font-medium"
              />
              
              {/* 🚀 NEW: The Eye Icon Button */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={pending}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 focus:text-blue-500 outline-none rounded-lg transition-colors disabled:opacity-50"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            </div>
          </div>

          {/* Action Submit Button */}
          <button 
            type="submit"
            disabled={pending} 
            className="w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {pending ? "Verifying Token..." : "Authenticate Session"}
          </button>
        </form>
      </div>
    </div>
  );
}